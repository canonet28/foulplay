import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import type { FinalEntrySnapshot, LockedSelectedPlayers, MatchMetadata } from './types';

export interface LobbyEntry {
  entryId: string;
  lobbyId?: string;
  userId: string;
  displayName: string;
  matchId: string;
  selectedPlayers: LockedSelectedPlayers;
  lockedAt: string;
  matchMetadata?: MatchMetadata;
  finalSnapshot?: FinalEntrySnapshot;
}

interface LobbyStoreData {
  lobbies: Record<string, LobbyEntry[]>;
}

export interface LobbyStore {
  load(): Promise<void>;
  getEntries(lobbyId: string): Promise<LobbyEntry[]>;
  getAllEntries(): Promise<LobbyEntry[]>;
  getEntriesForUser(userId: string): Promise<LobbyEntry[]>;
  upsertEntry(lobbyId: string, entry: LobbyEntry): Promise<{ entry: LobbyEntry; created: boolean }>;
}

export class FileLobbyStore implements LobbyStore {
  private data: LobbyStoreData = { lobbies: {} };

  constructor(private filePath = path.join(process.cwd(), '.data', 'lobbies.json')) {}

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.data = JSON.parse(raw) as LobbyStoreData;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      await this.save();
    }
  }

  async getEntries(lobbyId: string) {
    return (this.data.lobbies[lobbyId] ?? []).map((entry) => ({ ...entry, lobbyId }));
  }

  async getAllEntries() {
    return Object.entries(this.data.lobbies).flatMap(([lobbyId, entries]) =>
      entries.map((entry) => ({ ...entry, lobbyId })),
    );
  }

  async getEntriesForUser(userId: string) {
    return (await this.getAllEntries()).filter((entry) => entry.userId === userId);
  }

  async upsertEntry(lobbyId: string, entry: LobbyEntry) {
    const entries = await this.getEntries(lobbyId);
    const existingIndex = entries.findIndex(
      (candidate) => candidate.userId === entry.userId && candidate.matchId === entry.matchId,
    );

    if (existingIndex >= 0) {
      entries[existingIndex] = { ...entry, lobbyId };
    } else {
      entries.push({ ...entry, lobbyId });
    }

    this.data.lobbies[lobbyId] = entries;
    await this.save();
    return { entry, created: existingIndex < 0 };
  }

  private async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

export class PostgresLobbyStore implements LobbyStore {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }

  async load() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lobby_entries (
        entry_id TEXT PRIMARY KEY,
        lobby_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        match_id TEXT NOT NULL,
        selected_players JSONB NOT NULL,
        locked_at TIMESTAMPTZ NOT NULL,
        match_metadata JSONB,
        final_snapshot JSONB,
        UNIQUE (lobby_id, user_id, match_id)
      )
    `);
    await this.pool.query(`ALTER TABLE lobby_entries ADD COLUMN IF NOT EXISTS match_metadata JSONB`);
    await this.pool.query(`ALTER TABLE lobby_entries ADD COLUMN IF NOT EXISTS final_snapshot JSONB`);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS lobby_entries_lobby_match_idx
        ON lobby_entries (lobby_id, match_id)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS lobby_entries_match_idx
        ON lobby_entries (match_id)
    `);
  }

  async getEntries(lobbyId: string) {
    const result = await this.pool.query(
      `SELECT * FROM lobby_entries WHERE lobby_id = $1 ORDER BY locked_at ASC`,
      [lobbyId],
    );
    return result.rows.map(rowToLobbyEntry);
  }

  async getAllEntries() {
    const result = await this.pool.query(`SELECT * FROM lobby_entries ORDER BY locked_at ASC`);
    return result.rows.map(rowToLobbyEntry);
  }

  async getEntriesForUser(userId: string) {
    const result = await this.pool.query(
      `SELECT * FROM lobby_entries WHERE user_id = $1 ORDER BY locked_at DESC`,
      [userId],
    );
    return result.rows.map(rowToLobbyEntry);
  }

  async upsertEntry(lobbyId: string, entry: LobbyEntry) {
    const result = await this.pool.query(
      `
        INSERT INTO lobby_entries (
          entry_id,
          lobby_id,
          user_id,
          display_name,
          match_id,
          selected_players,
          locked_at,
          match_metadata,
          final_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb)
        ON CONFLICT (lobby_id, user_id, match_id)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          selected_players = EXCLUDED.selected_players,
          match_metadata = COALESCE(EXCLUDED.match_metadata, lobby_entries.match_metadata),
          final_snapshot = COALESCE(EXCLUDED.final_snapshot, lobby_entries.final_snapshot)
        RETURNING (xmax = 0) AS created
      `,
      [
        entry.entryId,
        lobbyId,
        entry.userId,
        entry.displayName,
        entry.matchId,
        JSON.stringify(entry.selectedPlayers),
        entry.lockedAt,
        entry.matchMetadata ? JSON.stringify(entry.matchMetadata) : null,
        entry.finalSnapshot ? JSON.stringify(entry.finalSnapshot) : null,
      ],
    );

    return { entry, created: Boolean(result.rows[0]?.created) };
  }
}

function rowToLobbyEntry(row: any): LobbyEntry {
  return {
    entryId: row.entry_id,
    lobbyId: row.lobby_id,
    userId: row.user_id,
    displayName: row.display_name,
    matchId: row.match_id,
    selectedPlayers: row.selected_players,
    lockedAt: new Date(row.locked_at).toISOString(),
    matchMetadata: row.match_metadata ?? undefined,
    finalSnapshot: row.final_snapshot ?? undefined,
  };
}
