import express from "express";
import path from "path";
import { config as loadEnv } from "dotenv";
import { createServer as createViteServer } from "vite";
import { FileLobbyStore, type LobbyEntry } from "./src/lobbyStore";
import { HybridMatchProvider, MockMatchProvider, SportMonksMatchProvider, type MatchProvider } from "./src/matchProviders";
import { calculatePlayerScore } from "./src/scoring";
import type { LeaderboardEntry, LockedSelectedPlayers, PlayerStats, SlotRole } from "./src/types";

loadEnv({ path: ".env.local" });
loadEnv();

const slotRoles: SlotRole[] = ["Hitman", "HotHead", "LooseCannon"];

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);
  const lobbyStore = new FileLobbyStore(process.env.LOBBY_STORE_PATH);
  const matchProvider = createMatchProvider();

  await lobbyStore.load();
  app.use(express.json());

  const isLockedSelection = (value: unknown): value is LockedSelectedPlayers => {
    if (!value || typeof value !== "object") return false;
    const selection = value as Partial<LockedSelectedPlayers>;
    return slotRoles.every((role) => typeof selection[role] === "string");
  };

  const hasValidPlayers = (selection: LockedSelectedPlayers, players: PlayerStats[]) => {
    const playerIds = new Set(players.map((player) => player.id));
    const selectedIds = slotRoles.map((role) => selection[role]);
    return selectedIds.every((id) => playerIds.has(id)) && new Set(selectedIds).size === selectedIds.length;
  };

  const getLockDeadline = (match: Awaited<ReturnType<MatchProvider["getMatchSync"]>>) => {
    const deadline = match.lockAt ?? match.startsAt;
    return deadline ? Date.parse(deadline) : Number.NaN;
  };

  const isMatchLockClosed = (match: Awaited<ReturnType<MatchProvider["getMatchSync"]>>) => {
    const deadline = getLockDeadline(match);
    return match.matchStatus !== "PRE_MATCH" || (Number.isFinite(deadline) && Date.now() > deadline);
  };

  const calculateEntryScore = (entry: LobbyEntry, players: PlayerStats[], isFT: boolean) => {
    return slotRoles.reduce((total, role) => {
      const player = players.find((candidate) => candidate.id === entry.selectedPlayers[role]);
      return total + calculatePlayerScore(player, role, isFT);
    }, 0);
  };

  const buildRankedEntries = (
    entries: LobbyEntry[],
    players: PlayerStats[],
    isFT: boolean,
    currentUserId?: string,
  ) => {
    const sortedEntries: LeaderboardEntry[] = entries
      .map((entry) => ({
        rank: 0,
        entryId: entry.entryId,
        userId: entry.userId,
        displayName: entry.displayName,
        score: calculateEntryScore(entry, players, isFT),
        selectedPlayers: entry.selectedPlayers,
        lockedAt: entry.lockedAt,
        isCurrentUser: currentUserId === entry.userId,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (Date.parse(a.lockedAt) !== Date.parse(b.lockedAt)) {
          return Date.parse(a.lockedAt) - Date.parse(b.lockedAt);
        }
        return a.entryId.localeCompare(b.entryId);
      });

    let previousScore: number | null = null;
    let previousRank = 0;
    return sortedEntries.map((entry, index) => {
      const rank = previousScore !== null && entry.score === previousScore ? previousRank : index + 1;
      previousScore = entry.score;
      previousRank = rank;
      return { ...entry, rank };
    });
  };

  const getLobbyLeaderboard = async (lobbyId: string, matchId: string, currentUserId?: string) => {
    const match = await matchProvider.getMatchSync(matchId);
    const entries = lobbyStore.getEntries(lobbyId).filter((entry) => entry.matchId === matchId);
    const rankedEntries = buildRankedEntries(entries, match.playerStats, match.matchStatus === "FT", currentUserId);

    return { match, entries: rankedEntries };
  };

  const getGlobalMatchLeaderboard = async (matchId: string, currentUserId?: string) => {
    const match = await matchProvider.getMatchSync(matchId);
    const seenUserIds = new Set<string>();
    const entries = lobbyStore
      .getAllEntries()
      .filter((entry) => entry.matchId === matchId)
      .filter((entry) => {
        if (seenUserIds.has(entry.userId)) return false;
        seenUserIds.add(entry.userId);
        return true;
      });
    const rankedEntries = buildRankedEntries(entries, match.playerStats, match.matchStatus === "FT", currentUserId);

    return { match, entries: rankedEntries };
  };

  app.post("/api/match-control/start", async (req, res) => {
    try {
      const matchId = typeof req.body?.matchId === "string" ? req.body.matchId : "mock";
      res.json(await matchProvider.startMatch(matchId));
    } catch (err) {
      console.error("Failed to start match:", err);
      res.status(502).json({ error: "Unable to start match" });
    }
  });

  app.get("/api/matches/upcoming", async (req, res) => {
    try {
      res.json({ matches: await matchProvider.getUpcomingMatches() });
    } catch (err) {
      console.error("Failed to fetch upcoming matches:", err);
      res.status(502).json({ error: "Unable to fetch upcoming matches" });
    }
  });

  app.get("/api/match-sync", async (req, res) => {
    try {
      const matchId = typeof req.query.matchId === "string" ? req.query.matchId : "mock";
      res.json(await matchProvider.getMatchSync(matchId));
    } catch (err) {
      console.error("Failed to sync match:", err);
      res.status(502).json({ error: "Unable to sync match" });
    }
  });

  app.post("/api/lobbies/:lobbyId/entries", async (req, res) => {
    try {
      const { lobbyId } = req.params;
      const { userId, displayName, matchId = "mock", selectedPlayers } = req.body ?? {};

      if (typeof userId !== "string" || userId.trim().length === 0) {
        res.status(400).json({ error: "userId is required" });
        return;
      }

      if (typeof matchId !== "string" || matchId.trim().length === 0) {
        res.status(400).json({ error: "matchId is required" });
        return;
      }

      const match = await matchProvider.getMatchSync(matchId);
      if (isMatchLockClosed(match)) {
        res.status(403).json({
          error: "Entry lock is closed for this match",
          lockAt: match.lockAt ?? match.startsAt ?? null,
          matchStatus: match.matchStatus,
        });
        return;
      }

      if (!isLockedSelection(selectedPlayers) || !hasValidPlayers(selectedPlayers, match.playerStats)) {
        res.status(400).json({ error: "selectedPlayers must include three unique valid player IDs" });
        return;
      }

      const existing = lobbyStore.getEntries(lobbyId).find((entry) => entry.userId === userId && entry.matchId === matchId);
      const entry: LobbyEntry = {
        entryId: existing?.entryId ?? `${lobbyId}-${userId}-${matchId}`,
        userId,
        displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : "Player",
        matchId,
        selectedPlayers,
        lockedAt: existing?.lockedAt ?? new Date().toISOString(),
      };
      const { created } = await lobbyStore.upsertEntry(lobbyId, entry);
      const leaderboard = await getLobbyLeaderboard(lobbyId, matchId, userId);

      res.status(created ? 201 : 200).json({
        entry,
        leaderboard: leaderboard.entries,
      });
    } catch (err) {
      console.error("Failed to save lobby entry:", err);
      res.status(502).json({ error: "Unable to save lobby entry" });
    }
  });

  app.get("/api/lobbies/:lobbyId/leaderboard", async (req, res) => {
    try {
      const { lobbyId } = req.params;
      const currentUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const matchId = typeof req.query.matchId === "string" ? req.query.matchId : "mock";
      const leaderboard = await getLobbyLeaderboard(lobbyId, matchId, currentUserId);

      res.json({
        lobbyId,
        matchId,
        matchStatus: leaderboard.match.matchStatus,
        matchMinute: leaderboard.match.matchMinute,
        entries: leaderboard.entries,
      });
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      res.status(502).json({ error: "Unable to fetch leaderboard" });
    }
  });

  app.get("/api/matches/:matchId/leaderboard", async (req, res) => {
    try {
      const { matchId } = req.params;
      const currentUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const leaderboard = await getGlobalMatchLeaderboard(matchId, currentUserId);

      res.json({
        matchId,
        matchStatus: leaderboard.match.matchStatus,
        matchMinute: leaderboard.match.matchMinute,
        entries: leaderboard.entries,
      });
    } catch (err) {
      console.error("Failed to fetch global match leaderboard:", err);
      res.status(502).json({ error: "Unable to fetch global match leaderboard" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const providerName = process.env.SPORTMONKS_API_TOKEN ? "SportMonks" : "mock";
    console.log(`Server running on http://localhost:${PORT} (${providerName} match provider)`);
  });
}

function createMatchProvider(): MatchProvider {
  const mockProvider = new MockMatchProvider();
  if (process.env.SPORTMONKS_API_TOKEN) {
    return new HybridMatchProvider(mockProvider, new SportMonksMatchProvider(process.env.SPORTMONKS_API_TOKEN));
  }
  return new HybridMatchProvider(mockProvider);
}

startServer();
