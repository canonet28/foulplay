export type MatchStatus = "PRE_MATCH" | "IN_PLAY" | "FT";

export interface PlayerStats {
  id: string;
  name: string;
  team: string;
  position: string;
  fouls: number;
  yellowCards: number[]; // Array of minutes
  redCards: number[];    // Array of minutes
  score: number;
}

export interface MatchSyncResponse {
  matchId: string;
  matchStatus: MatchStatus;
  matchMinute: number;
  homeTeam: string;
  awayTeam: string;
  startsAt?: string;
  lockAt?: string;
  playerStats: PlayerStats[];
}

export type SlotRole = "Hitman" | "HotHead" | "LooseCannon";

export interface SelectedPlayers {
  Hitman: string | null;
  HotHead: string | null;
  LooseCannon: string | null;
}

export interface LockedSelectedPlayers {
  Hitman: string;
  HotHead: string;
  LooseCannon: string;
}

export interface ScoreBreakdown {
  fouls: number;
  yellows: number;
  reds: number;
  polite: number;
  total: number;
}

export interface LeaderboardEntry {
  rank: number;
  entryId: string;
  userId: string;
  displayName: string;
  score: number;
  selectedPlayers: LockedSelectedPlayers;
  lockedAt: string;
  isCurrentUser?: boolean;
}

export interface LeaderboardResponse {
  lobbyId: string;
  matchId: string;
  matchStatus: MatchStatus;
  matchMinute: number;
  entries: LeaderboardEntry[];
}
