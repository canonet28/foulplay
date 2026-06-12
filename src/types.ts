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
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeTeamFlag?: string;
  awayTeamFlag?: string;
  startsAt?: string;
  lockAt?: string;
  playerStats: PlayerStats[];
}

export interface MatchMetadata {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeTeamFlag?: string;
  awayTeamFlag?: string;
  startsAt?: string;
  lockAt?: string;
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

export interface FinalPlayerSnapshot {
  role: SlotRole;
  player: PlayerStats;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface FinalEntrySnapshot {
  capturedAt: string;
  matchStatus: "FT";
  matchMinute: number;
  match: MatchMetadata;
  totalScore: number;
  selectedPlayers: FinalPlayerSnapshot[];
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
  finalSnapshot?: FinalEntrySnapshot;
}

export interface LeaderboardResponse {
  lobbyId: string;
  matchId: string;
  matchStatus: MatchStatus;
  matchMinute: number;
  entries: LeaderboardEntry[];
}

export interface RecentMatchEntry {
  entryId: string;
  lobbyId: string;
  matchId: string;
  displayName: string;
  selectedPlayers: LockedSelectedPlayers;
  lockedAt: string;
  match: MatchMetadata | null;
  finalSnapshot?: FinalEntrySnapshot;
}
