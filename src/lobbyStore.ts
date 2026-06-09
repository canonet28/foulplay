import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LockedSelectedPlayers } from './types';

export interface LobbyEntry {
  entryId: string;
  userId: string;
  displayName: string;
  matchId: string;
  selectedPlayers: LockedSelectedPlayers;
  lockedAt: string;
}

interface LobbyStoreData {
  lobbies: Record<string, LobbyEntry[]>;
}

export class FileLobbyStore {
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

  getEntries(lobbyId: string) {
    return this.data.lobbies[lobbyId] ?? [];
  }

  getAllEntries() {
    return Object.values(this.data.lobbies).flat();
  }

  async upsertEntry(lobbyId: string, entry: LobbyEntry) {
    const entries = this.getEntries(lobbyId);
    const existingIndex = entries.findIndex(
      (candidate) => candidate.userId === entry.userId && candidate.matchId === entry.matchId,
    );

    if (existingIndex >= 0) {
      entries[existingIndex] = entry;
    } else {
      entries.push(entry);
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
