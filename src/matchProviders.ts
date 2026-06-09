import { calculatePlayerScore } from './scoring';
import type { MatchStatus, MatchSyncResponse, PlayerStats } from './types';

export interface MatchSummary {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  league: string;
}

export interface MatchProvider {
  getUpcomingMatches(): Promise<MatchSummary[]>;
  getMatchSync(matchId: string): Promise<MatchSyncResponse>;
  startMatch(matchId: string): Promise<{ success: boolean; matchStatus: MatchStatus }>;
}

const initialPlayers: PlayerStats[] = [
  { id: 'p1', name: 'R. Keane', team: 'Millwall', position: 'MID', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p2', name: 'S. Ramos', team: 'Millwall', position: 'DEF', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p3', name: 'Pepe', team: 'Millwall', position: 'DEF', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p4', name: 'D. Costa', team: 'West Ham', position: 'FWD', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p5', name: 'M. Balotelli', team: 'West Ham', position: 'FWD', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p6', name: 'N. De Jong', team: 'West Ham', position: 'MID', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p7', name: 'G. Gattuso', team: 'Millwall', position: 'MID', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p8', name: 'E. Cantona', team: 'West Ham', position: 'FWD', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p9', name: 'V. Jones', team: 'Millwall', position: 'DEF', fouls: 0, yellowCards: [], redCards: [], score: 0 },
  { id: 'p10', name: 'L. Suarez', team: 'West Ham', position: 'FWD', fouls: 0, yellowCards: [], redCards: [], score: 0 },
];

const cloneInitialPlayers = () => JSON.parse(JSON.stringify(initialPlayers)) as PlayerStats[];

export class MockMatchProvider implements MatchProvider {
  private matchMinute = 0;
  private matchStatus: MatchStatus = 'PRE_MATCH';
  private currentPlayers = cloneInitialPlayers();
  private startsAt = minutesFromNow(10);

  constructor() {
    setInterval(() => this.tick(), 3000);
  }

  async getUpcomingMatches() {
    return [
      { id: 'mock', homeTeam: 'Millwall', awayTeam: 'West Ham', date: this.getCurrentStartsAt(), league: 'Premier League' },
      { id: 'mock2', homeTeam: 'Boca Juniors', awayTeam: 'River Plate', date: daysFromNow(1), league: 'Primera Division' },
      { id: 'mock3', homeTeam: 'Galatasaray', awayTeam: 'Fenerbahce', date: daysFromNow(2), league: 'Super Lig' },
    ];
  }

  async getMatchSync(matchId: string): Promise<MatchSyncResponse> {
    const startsAt = this.getCurrentStartsAt();
    return {
      matchId,
      matchStatus: this.matchStatus,
      matchMinute: Math.min(this.matchMinute, 90),
      homeTeam: 'Millwall',
      awayTeam: 'West Ham',
      startsAt,
      lockAt: startsAt,
      playerStats: this.currentPlayers,
    };
  }

  async startMatch() {
    if (this.matchStatus === 'PRE_MATCH' || this.matchStatus === 'FT') {
      this.matchStatus = 'IN_PLAY';
      this.matchMinute = 0;
      this.startsAt = new Date().toISOString();
      this.currentPlayers = cloneInitialPlayers();
    }
    return { success: true, matchStatus: this.matchStatus };
  }

  private getCurrentStartsAt() {
    if (this.matchStatus === 'PRE_MATCH' && Date.parse(this.startsAt) <= Date.now()) {
      this.startsAt = minutesFromNow(10);
    }
    return this.startsAt;
  }

  private tick() {
    if (this.matchStatus !== 'IN_PLAY') return;

    this.matchMinute += 2;

    if (Math.random() > 0.6) {
      const player = this.currentPlayers[Math.floor(Math.random() * this.currentPlayers.length)];

      if (player.redCards.length === 0) {
        const rand = Math.random();
        if (rand > 0.9 && player.yellowCards.length < 2) {
          player.yellowCards.push(this.matchMinute);
          if (player.yellowCards.length === 2) {
            player.redCards.push(this.matchMinute);
          }
        } else if (rand > 0.85 && player.yellowCards.length < 2) {
          player.redCards.push(this.matchMinute);
        } else {
          player.fouls += 1;
        }
      }
    }

    if (this.matchMinute >= 90) {
      this.matchStatus = 'FT';
    }

    this.currentPlayers.forEach((player) => {
      player.score = calculatePlayerScore(player, null, this.matchStatus === 'FT');
    });
  }
}

export class SportMonksMatchProvider implements MatchProvider {
  private readonly baseUrl = 'https://api.sportmonks.com/v3/football';
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(
    private apiToken: string,
    private fixtureIncludes = process.env.SPORTMONKS_FIXTURE_INCLUDE ?? 'scores;events;participants;lineups;state',
    private upcomingMode = process.env.SPORTMONKS_UPCOMING_MODE ?? 'date',
    private worldCupSeasonId = process.env.SPORTMONKS_WORLD_CUP_SEASON_ID,
    private worldCupLeagueId = process.env.SPORTMONKS_WORLD_CUP_LEAGUE_ID,
    private worldCupName = process.env.SPORTMONKS_WORLD_CUP_NAME ?? 'FIFA World Cup',
  ) {}

  async getUpcomingMatches() {
    if (this.upcomingMode === 'world-cup') {
      return this.getWorldCupFixtures();
    }

    if (this.upcomingMode === 'between') {
      return this.getFixturesBetween();
    }

    const today = formatDate(new Date());
    const data = await this.request(`/fixtures/date/${today}`, {
      include: 'participants;league;state',
      order: 'asc',
    });

    return asArray(data.data).slice(0, 20).map((fixture) => this.mapFixtureSummary(fixture));
  }

  async getMatchSync(matchId: string): Promise<MatchSyncResponse> {
    if (!isSportMonksFixtureId(matchId)) {
      throw new Error(`SportMonks fixture IDs must be numeric. Received "${matchId}"`);
    }

    const data = await this.request(`/fixtures/${encodeURIComponent(matchId)}`, {
      include: this.fixtureIncludes,
    });
    return this.mapFixtureSync(data.data, matchId);
  }

  async startMatch(matchId: string) {
    const match = await this.getMatchSync(matchId);
    return { success: true, matchStatus: match.matchStatus };
  }

  private async getFixturesBetween() {
    const startDate = formatDate(new Date());
    const end = new Date();
    end.setDate(end.getDate() + 7);
    const endDate = formatDate(end);
    const data = await this.request(`/fixtures/between/${startDate}/${endDate}`, {
      include: 'participants;league;state',
      order: 'asc',
    });

    return asArray(data.data).slice(0, 20).map((fixture) => this.mapFixtureSummary(fixture));
  }

  private async getWorldCupFixtures() {
    if (!this.worldCupSeasonId) {
      throw new Error('SPORTMONKS_WORLD_CUP_SEASON_ID is required when SPORTMONKS_UPCOMING_MODE=world-cup');
    }

    const data = await this.request(`/schedules/seasons/${encodeURIComponent(this.worldCupSeasonId)}`, {});
    const cutoff = Date.now() - 6 * 60 * 60_000;
    const fixtures = collectScheduleFixtures(data.data)
      .filter((fixture) => !this.worldCupLeagueId || String(fixture.league_id) === String(this.worldCupLeagueId))
      .filter((fixture) => {
        const startingAt = Date.parse(fixture.starting_at ?? '');
        return Number.isFinite(startingAt) && startingAt >= cutoff;
      })
      .sort((a, b) => Date.parse(a.starting_at ?? '') - Date.parse(b.starting_at ?? ''));

    return fixtures.slice(0, 20).map((fixture) => this.mapFixtureSummary(fixture, this.worldCupName));
  }

  private async request(endpoint: string, params: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('api_token', this.apiToken);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const cacheKey = url.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SportMonks request failed (${res.status}) ${body}`);
    }
    const value = await res.json();
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + 15_000 });
    return value;
  }

  private mapFixtureSummary(fixture: any, fallbackLeagueName = 'Football'): MatchSummary {
    const { home, away } = getParticipants(fixture);
    return {
      id: String(fixture.id),
      homeTeam: home?.name ?? 'Home',
      awayTeam: away?.name ?? 'Away',
      date: fixture.starting_at ?? new Date().toISOString(),
      league: fixture.league?.name ?? fallbackLeagueName,
    };
  }

  private mapFixtureSync(fixture: any, fallbackMatchId: string): MatchSyncResponse {
    const { home, away } = getParticipants(fixture);
    const status = normalizeStatus(fixture.state?.short_name ?? fixture.state?.name ?? fixture.state_id);
    const playerMap = new Map<string, PlayerStats>();

    for (const lineup of asArray(fixture.lineups)) {
      const team = resolveTeamName(lineup.team_id, home, away, lineup.team_name ?? lineup.team?.name);
      const playerId = String(lineup.player_id ?? lineup.id);
      const stats = getLineupStats(lineup);
      playerMap.set(playerId, {
        id: playerId,
        name: lineup.player_name ?? lineup.name ?? `Player ${playerId}`,
        team,
        position: lineup.position?.code ?? lineup.position?.name ?? lineup.type?.name ?? 'UNK',
        fouls: stats.fouls,
        yellowCards: stats.yellowCards,
        redCards: stats.redCards,
        score: 0,
      });
    }

    for (const event of asArray(fixture.events)) {
      const playerId = String(event.player_id ?? event.player?.id ?? '');
      if (!playerId) continue;
      const player =
        playerMap.get(playerId) ??
        createEventPlayer(playerId, event, resolveTeamName(event.team_id, home, away, event.team_name ?? event.team?.name));
      applyEvent(player, event);
      playerMap.set(playerId, player);
    }

    const playerStats = [...playerMap.values()].map((player) => ({
      ...player,
      score: calculatePlayerScore(player, null, status === 'FT'),
    }));

    return {
      matchId: String(fixture.id ?? fallbackMatchId),
      matchStatus: status,
      matchMinute: getFixtureMinute(fixture),
      homeTeam: home?.name ?? 'Home',
      awayTeam: away?.name ?? 'Away',
      startsAt: fixture.starting_at,
      lockAt: fixture.starting_at,
      playerStats,
    };
  }
}

export class HybridMatchProvider implements MatchProvider {
  private lastUpcomingError = '';

  constructor(
    private mockProvider: MatchProvider,
    private sportMonksProvider?: MatchProvider,
  ) {}

  async getUpcomingMatches() {
    if (!this.sportMonksProvider) {
      return this.mockProvider.getUpcomingMatches();
    }

    try {
      return await this.sportMonksProvider.getUpcomingMatches();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== this.lastUpcomingError) {
        console.error('Falling back to mock fixtures after SportMonks upcoming match failure:', err);
        this.lastUpcomingError = message;
      }
      return this.mockProvider.getUpcomingMatches();
    }
  }

  async getMatchSync(matchId: string) {
    return this.resolveProvider(matchId).getMatchSync(matchId);
  }

  async startMatch(matchId: string) {
    return this.resolveProvider(matchId).startMatch(matchId);
  }

  private resolveProvider(matchId: string) {
    if (this.sportMonksProvider && isSportMonksFixtureId(matchId)) {
      return this.sportMonksProvider;
    }
    return this.mockProvider;
  }
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

function isSportMonksFixtureId(matchId: string) {
  return /^\d+$/.test(matchId);
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function collectScheduleFixtures(scheduleData: unknown) {
  const fixtures: any[] = [];

  for (const stage of asArray(scheduleData)) {
    fixtures.push(...asArray(stage.fixtures));
    for (const round of asArray(stage.rounds)) {
      fixtures.push(...asArray(round.fixtures));
    }
  }

  return fixtures;
}

function getParticipants(fixture: any) {
  const participants = asArray(fixture.participants);
  const home =
    participants.find((team) => team.meta?.location === 'home') ??
    participants.find((team) => team.location === 'home') ??
    participants[0];
  const away =
    participants.find((team) => team.meta?.location === 'away') ??
    participants.find((team) => team.location === 'away') ??
    participants[1];
  return { home, away };
}

function resolveTeamName(teamId: unknown, home: any, away: any, fallback?: string) {
  const normalizedTeamId = String(teamId ?? '');
  if (normalizedTeamId && normalizedTeamId === String(home?.id)) return home?.name ?? fallback ?? 'Home';
  if (normalizedTeamId && normalizedTeamId === String(away?.id)) return away?.name ?? fallback ?? 'Away';
  return fallback ?? 'Unknown Team';
}

function normalizeStatus(value: unknown): MatchStatus {
  const status = String(value ?? '').toUpperCase();
  if (['FT', 'FULL_TIME', 'FINISHED', 'ENDED'].some((candidate) => status.includes(candidate))) return 'FT';
  if (['LIVE', 'INPLAY', 'IN_PLAY', '1ST_HALF', '2ND_HALF', 'HT', 'BREAK'].some((candidate) => status.includes(candidate))) {
    return 'IN_PLAY';
  }
  return 'PRE_MATCH';
}

function getFixtureMinute(fixture: any) {
  const minute = Number(fixture.time?.minute ?? fixture.minute ?? fixture.periods?.at(-1)?.minutes);
  return Number.isFinite(minute) ? Math.min(minute, 90) : 0;
}

function getLineupStats(lineup: any) {
  let fouls = 0;
  const yellowCards: number[] = [];
  const redCards: number[] = [];

  for (const detail of asArray(lineup.details)) {
    const name = String(detail.type?.name ?? detail.type?.code ?? detail.name ?? '').toLowerCase();
    const value = Number(detail.value?.total ?? detail.value ?? detail.data?.value ?? 0);
    if (name.includes('foul')) fouls += Number.isFinite(value) ? value : 0;
    if (name.includes('yellow')) yellowCards.push(...minutesFromValue(detail.value, value));
    if (name.includes('red')) redCards.push(...minutesFromValue(detail.value, value));
  }

  return { fouls, yellowCards, redCards };
}

function minutesFromValue(raw: unknown, count: number) {
  if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite);
  return Array.from({ length: Math.max(0, count) }, () => 0);
}

function createEventPlayer(playerId: string, event: any, team: string): PlayerStats {
  return {
    id: playerId,
    name: event.player_name ?? event.player?.display_name ?? event.player?.name ?? `Player ${playerId}`,
    team,
    position: 'UNK',
    fouls: 0,
    yellowCards: [],
    redCards: [],
    score: 0,
  };
}

function applyEvent(player: PlayerStats, event: any) {
  const type = String(event.type?.name ?? event.type_name ?? event.name ?? '').toLowerCase();
  const minute = Number(event.minute ?? event.period?.minute ?? 0);
  if (type.includes('foul')) player.fouls += 1;
  if (type.includes('yellow')) player.yellowCards.push(Number.isFinite(minute) ? minute : 0);
  if (type.includes('red')) player.redCards.push(Number.isFinite(minute) ? minute : 0);
}
