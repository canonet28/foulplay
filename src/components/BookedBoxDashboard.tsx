import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Shield, AlertTriangle, UserX, Check, Ghost, Share2, Trophy, HelpCircle, X, Users, ArrowLeft, LockKeyhole, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calculatePlayerScore, getScoreBreakdown } from '../scoring';
import { parseMatchDateTime, toMatchDate } from '../dateTime';
import { FinalEntrySnapshot, LeaderboardEntry, LeaderboardResponse, LockedSelectedPlayers, MatchSyncResponse, PlayerStats, SelectedPlayers, SlotRole } from '../types';

type LeaderboardScope = 'lobby' | 'global';
const LOCK_GRACE_AFTER_LIVE_MS = 2 * 60_000;
const LOCK_SCHEDULED_SAFETY_GRACE_MS = 300_000;

interface CurrentEntryResponse {
  entry: {
    displayName: string;
    selectedPlayers: LockedSelectedPlayers;
    finalSnapshot?: FinalEntrySnapshot;
  } | null;
}

function isEntryLockClosed(matchData: MatchSyncResponse | null) {
  if (!matchData) return false;
  const deadlineMs = getEntryLockDeadlineMs(matchData);
  return matchData.matchStatus === 'FT' || (Number.isFinite(deadlineMs) && Date.now() > deadlineMs);
}

function getLockLabel(matchData: MatchSyncResponse) {
  const deadlineMs = getEntryLockDeadlineMs(matchData);
  const deadlineDate = Number.isFinite(deadlineMs) ? new Date(deadlineMs) : null;
  if (matchData.matchStatus === 'FT') return 'PICKS LOCKED';
  if (!deadlineDate) return 'LOCK OPEN';
  const label = matchData.matchStatus === 'IN_PLAY' ? 'MATCH LIVE / LOCK CLOSES' : 'LOCKS AFTER LIVE KICKOFF / SAFETY CUTOFF';
  return `${label} ${deadlineDate.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })}`;
}

function getEntryLockDeadlineMs(matchData: MatchSyncResponse) {
  const scheduledStart = parseMatchDateTime(matchData.lockAt ?? matchData.startsAt);
  const scheduledSafetyDeadline = Number.isFinite(scheduledStart)
    ? scheduledStart + LOCK_SCHEDULED_SAFETY_GRACE_MS
    : Number.POSITIVE_INFINITY;

  if (matchData.matchStatus === 'IN_PLAY') {
    const currentMinute = Number.isFinite(matchData.matchMinute) ? Math.max(0, matchData.matchMinute) : 0;
    const estimatedLiveStartedAt = Date.now() - currentMinute * 60_000;
    return Math.min(estimatedLiveStartedAt + LOCK_GRACE_AFTER_LIVE_MS, scheduledSafetyDeadline);
  }

  return scheduledSafetyDeadline;
}

function createLocalUserId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDraftKey(matchId: string | undefined, lobbyId: string, userId: string) {
  return `foulcup:draft:${matchId || 'mock'}:${lobbyId}:${userId}`;
}

function isSelectedPlayers(value: unknown): value is SelectedPlayers {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Partial<SelectedPlayers>;
  return ['Hitman', 'HotHead', 'LooseCannon'].every((role) => {
    const selected = selection[role as SlotRole];
    return selected === null || typeof selected === 'string';
  });
}

async function copyTextToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path for LAN/http mobile testing.
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textArea);
  }
}

export default function BookedBoxDashboard() {
  const { matchId } = useParams<{ matchId: string }>();
  const [matchData, setMatchData] = useState<MatchSyncResponse | null>(null);
  const [lobbyId] = useState(() => new URLSearchParams(window.location.search).get('lobby') || `match-${matchId || 'mock'}`);
  const [userId] = useState(() => {
    const existing = window.localStorage.getItem('foulcup:userId');
    if (existing) return existing;
    const next = createLocalUserId();
    window.localStorage.setItem('foulcup:userId', next);
    return next;
  });
  const [displayName, setDisplayName] = useState(() => window.localStorage.getItem('foulcup:displayName') || '');
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [finalRanks, setFinalRanks] = useState<{ lobby?: number; global?: number }>({});
  const [leaderboardScope, setLeaderboardScope] = useState<LeaderboardScope>('lobby');
  const [activeRole, setActiveRole] = useState<SlotRole | null>(null);
  const [pickerTeam, setPickerTeam] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPosition, setPickerPosition] = useState('All');
  const [showRules, setShowRules] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<SelectedPlayers>({
    Hitman: null,
    HotHead: null,
    LooseCannon: null
  });
  const [hasRestoredEntry, setHasRestoredEntry] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lastStats, setLastStats] = useState<Record<string, PlayerStats>>({});
  const [flashEvents, setFlashEvents] = useState<Record<string, boolean>>({});
  const [copying, setCopying] = useState(false);
  const [resultCopied, setResultCopied] = useState(false);
  const [showFinalReport, setShowFinalReport] = useState(true);
  const [restoredFinalSnapshot, setRestoredFinalSnapshot] = useState<FinalEntrySnapshot | null>(null);
  const [localSeconds, setLocalSeconds] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (matchData?.matchStatus === 'IN_PLAY') {
      interval = setInterval(() => {
        setLocalSeconds(s => (s + 1) % 60);
      }, 1000);
    } else {
      setLocalSeconds(0);
    }
    return () => clearInterval(interval);
  }, [matchData?.matchStatus]);

  const fetchLiveMatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/match-sync?matchId=${matchId || 'mock'}`);
      const data: MatchSyncResponse = await res.json();
      setMatchData(data);
      
      // Check for flashes
      if (isLocked) {
        const newStatsMap: Record<string, PlayerStats> = {};
        const newFlash: Record<string, boolean> = {};
        
        data.playerStats.forEach(p => {
          newStatsMap[p.id] = p;
          const prev = lastStats[p.id];
          if (prev && (p.fouls > prev.fouls || p.yellowCards.length > prev.yellowCards.length || p.redCards.length > prev.redCards.length)) {
             newFlash[p.id] = true;
          }
        });
        
        // Remove old flashes, set new ones
        setFlashEvents(prev => ({...prev, ...newFlash}));
        setTimeout(() => setFlashEvents({}), 1500); // clear after animation
        
        setLastStats(newStatsMap);
      } else {
        const map: Record<string, PlayerStats> = {};
        data.playerStats.forEach(p => map[p.id] = p);
        setLastStats(map);
      }

    } catch (err) {
      console.error("Failed to fetch match:", err);
    }
  }, [isLocked, lastStats, matchId]);

  useEffect(() => {
    fetchLiveMatch();
    const interval = setInterval(fetchLiveMatch, 2000);
    return () => clearInterval(interval);
  }, [fetchLiveMatch]);

  useEffect(() => {
    let cancelled = false;

    const restoreEntry = async () => {
      try {
        const params = new URLSearchParams({
          userId,
          matchId: matchId || 'mock',
        });
        const res = await fetch(`/api/lobbies/${lobbyId}/entries/current?${params.toString()}`);
        if (res.ok) {
          const data: CurrentEntryResponse = await res.json();
          if (!cancelled && data.entry) {
            setSelectedPlayers(data.entry.selectedPlayers);
            setDisplayName(data.entry.displayName);
            setIsLocked(true);
            setHasRestoredEntry(true);
            if (data.entry.finalSnapshot) {
              setRestoredFinalSnapshot(data.entry.finalSnapshot);
              setMatchData({
                matchId: data.entry.finalSnapshot.match.matchId,
                matchStatus: 'FT',
                matchMinute: data.entry.finalSnapshot.matchMinute,
                homeTeam: data.entry.finalSnapshot.match.homeTeam,
                awayTeam: data.entry.finalSnapshot.match.awayTeam,
                startsAt: data.entry.finalSnapshot.match.startsAt,
                lockAt: data.entry.finalSnapshot.match.lockAt,
                playerStats: data.entry.finalSnapshot.selectedPlayers.map(player => player.player),
              });
            }
            window.localStorage.removeItem(getDraftKey(matchId, lobbyId, userId));
            return;
          }
        }
      } catch (err) {
        console.error("Failed to restore locked entry:", err);
      }

      if (!cancelled) {
        const rawDraft = window.localStorage.getItem(getDraftKey(matchId, lobbyId, userId));
        if (rawDraft) {
          try {
            const parsed = JSON.parse(rawDraft) as unknown;
            if (isSelectedPlayers(parsed)) {
              setSelectedPlayers(parsed);
            }
          } catch (err) {
            console.error("Failed to restore draft picks:", err);
          }
        }
        setHasRestoredEntry(true);
      }
    };

    restoreEntry();
    return () => {
      cancelled = true;
    };
  }, [lobbyId, matchId, userId]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        userId,
        matchId: matchId || 'mock',
      });
      const url =
        leaderboardScope === 'lobby'
          ? `/api/lobbies/${lobbyId}/leaderboard?${params.toString()}`
          : `/api/matches/${matchId || 'mock'}/leaderboard?${params.toString()}`;
      const res = await fetch(url);
      const data: LeaderboardResponse = await res.json();
      setLeaderboardEntries(data.entries);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    }
  }, [leaderboardScope, lobbyId, matchId, userId]);

  useEffect(() => {
    if (!isLocked) return;
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 2000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard, isLocked]);

  const fetchFinalRanks = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        userId,
        matchId: matchId || 'mock',
      });
      const [lobbyRes, globalRes] = await Promise.all([
        fetch(`/api/lobbies/${lobbyId}/leaderboard?${params.toString()}`),
        fetch(`/api/matches/${matchId || 'mock'}/leaderboard?${params.toString()}`),
      ]);
      const [lobbyData, globalData]: [LeaderboardResponse, LeaderboardResponse] = await Promise.all([
        lobbyRes.json(),
        globalRes.json(),
      ]);
      setFinalRanks({
        lobby: lobbyData.entries.find(entry => entry.isCurrentUser)?.rank,
        global: globalData.entries.find(entry => entry.isCurrentUser)?.rank,
      });
    } catch (err) {
      console.error("Failed to fetch final ranks:", err);
    }
  }, [lobbyId, matchId, userId]);

  useEffect(() => {
    if (!isLocked || matchData?.matchStatus !== 'FT') return;
    fetchFinalRanks();
  }, [fetchFinalRanks, isLocked, matchData?.matchStatus]);

  useEffect(() => {
    const name = displayName.trim();
    if (name) {
      window.localStorage.setItem('foulcup:displayName', name);
    }
  }, [displayName]);

  useEffect(() => {
    if (!hasRestoredEntry) return;
    const draftKey = getDraftKey(matchId, lobbyId, userId);
    if (isLocked) {
      window.localStorage.removeItem(draftKey);
      return;
    }

    if (Object.values(selectedPlayers).some(Boolean)) {
      window.localStorage.setItem(draftKey, JSON.stringify(selectedPlayers));
    } else {
      window.localStorage.removeItem(draftKey);
    }
  }, [hasRestoredEntry, isLocked, lobbyId, matchId, selectedPlayers, userId]);

  const openRolePicker = (role: SlotRole) => {
    if (isLocked || isEntryLockClosed(matchData)) return;
    const selectedPlayer = selectedPlayers[role]
      ? matchData?.playerStats.find(player => player.id === selectedPlayers[role])
      : null;
    setPickerTeam(selectedPlayer?.team ?? matchTeams[0] ?? '');
    setPickerSearch('');
    setPickerPosition('All');
    setActiveRole(role);
  };

  const assignPlayerToRole = (playerId: string, role: SlotRole) => {
    if (isLocked || isEntryLockClosed(matchData)) return;

    const newSelections = { ...selectedPlayers };
    Object.keys(newSelections).forEach((key) => {
      if (newSelections[key as SlotRole] === playerId) {
        newSelections[key as SlotRole] = null;
      }
    });
    newSelections[role] = playerId;
    setSelectedPlayers(newSelections);
    setActiveRole(null);
  };

  const handleLock = async () => {
    if (isEntryLockClosed(matchData)) {
      alert("Picks are locked for this match.");
      return;
    }

    if (Object.values(selectedPlayers).some(v => v === null)) {
      alert("Must select an enforcer for all 3 slots.");
      return;
    }

    const lockedDisplayName = displayName.trim();
    if (lockedDisplayName.length < 2) {
      alert("Add a display name before locking picks.");
      return;
    }

    const lockedSelection: LockedSelectedPlayers = {
      Hitman: selectedPlayers.Hitman!,
      HotHead: selectedPlayers.HotHead!,
      LooseCannon: selectedPlayers.LooseCannon!,
    };

    try {
      const entryRes = await fetch(`/api/lobbies/${lobbyId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          displayName: lockedDisplayName,
          matchId: matchId || 'mock',
          selectedPlayers: lockedSelection,
        }),
      });

      if (!entryRes.ok) {
        throw new Error(`Failed to lock entry: ${entryRes.status}`);
      }

      // Start simulation when locking
      const startRes = await fetch('/api/match-control/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: matchId || 'mock' }),
      });
      if (!startRes.ok) {
        throw new Error(`Failed to start match: ${startRes.status}`);
      }

      const entryData: { leaderboard: LeaderboardEntry[] } = await entryRes.json();
      setLeaderboardEntries(entryData.leaderboard);
      setIsLocked(true);
      window.localStorage.removeItem(getDraftKey(matchId, lobbyId, userId));
      fetchLeaderboard();
    } catch (err) {
      console.error("Failed to lock card:", err);
      alert("Could not lock your card. Please try again.");
    }
  };

  const shareLobbyLink = async () => {
    const url = `${window.location.origin}/match/${matchId || 'mock'}?lobby=${lobbyId}`;
    const text = `Join my foulPLAY lobby for ${matchData?.homeTeam ?? 'this match'} vs ${matchData?.awayTeam ?? 'this match'}.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'foulPLAY lobby',
          text,
          url,
        });
        return;
      }

      const copied = await copyTextToClipboard(url);
      if (!copied) throw new Error('Clipboard copy failed');
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
      const copied = await copyTextToClipboard(url);
      if (copied) {
        setCopying(true);
        setTimeout(() => setCopying(false), 2000);
      } else {
        alert('Could not share or copy the lobby link.');
      }
    }
  };

  const shareResultSummary = async () => {
    const picks = (Object.entries(selectedPlayers) as [SlotRole, string | null][])
      .map(([role, id]) => {
        const player = id ? matchData?.playerStats.find(candidate => candidate.id === id) : null;
        const points = calculateFrontendScore(player, role, true);
        return player ? `${role}: ${player.name} (${points > 0 ? '+' : ''}${points})` : null;
      })
      .filter(Boolean)
      .join(' / ');

    const url = `${window.location.origin}/match/${matchId || 'mock'}?lobby=${lobbyId}`;
    const shareText = `I scored ${totalScore > 0 ? '+' : ''}${totalScore} in foulPLAY: ${picks}.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'foulPLAY result',
          text: shareText,
          url,
        });
        return;
      }

      const copied = await copyTextToClipboard(`${shareText} ${url}`);
      if (!copied) throw new Error('Clipboard copy failed');
      setResultCopied(true);
      setTimeout(() => setResultCopied(false), 2000);
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
      const copied = await copyTextToClipboard(`${shareText} ${url}`);
      if (copied) {
        setResultCopied(true);
        setTimeout(() => setResultCopied(false), 2000);
      } else {
        alert('Could not share or copy the result.');
      }
    }
  };

  const calculateFrontendScore = (player: PlayerStats | undefined, role: SlotRole | null, isFT: boolean) => {
    return calculatePlayerScore(player, role, isFT);
  };

  const localTotalScore = matchData ? Object.entries(selectedPlayers)
    .filter(([_, id]) => id !== null)
    .map(([role, id]) => {
      const p = matchData.playerStats.find(p => p.id === id);
      return calculateFrontendScore(p, role as SlotRole, matchData.matchStatus === 'FT');
    })
    .reduce((val, acc) => val + acc, 0) : 0;
  const currentLeaderboardEntry = leaderboardEntries.find(entry => entry.isCurrentUser);
  const totalScore = currentLeaderboardEntry?.score ?? restoredFinalSnapshot?.totalScore ?? localTotalScore;
  const lobbyRank = finalRanks.lobby ?? (leaderboardScope === 'lobby' ? currentLeaderboardEntry?.rank : undefined);
  const globalRank = finalRanks.global ?? (leaderboardScope === 'global' ? currentLeaderboardEntry?.rank : undefined);
  const matchTeams = useMemo(
    () => Array.from(new Set((matchData?.playerStats ?? []).map(player => player.team).filter(Boolean))),
    [matchData?.playerStats]
  );
  const pickerPositions = useMemo(
    () => ['All', ...Array.from(new Set((matchData?.playerStats ?? []).map(player => player.position).filter(Boolean))).sort()],
    [matchData?.playerStats]
  );

  useEffect(() => {
    if (!activeRole || matchTeams.length === 0) return;
    if (!pickerTeam || !matchTeams.includes(pickerTeam)) {
      setPickerTeam(matchTeams[0]);
    }
  }, [activeRole, matchTeams, pickerTeam]);

  if (!matchData) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-mono">CONNECTING TO SPORTMONKS...</div>;

  const entryLockClosed = isEntryLockClosed(matchData);
  const lockLabel = getLockLabel(matchData);
  const selectedCount = Object.values(selectedPlayers).filter(Boolean).length;
  const hasDisplayName = displayName.trim().length >= 2;
  const lockDisabled = entryLockClosed || selectedCount < 3 || !hasDisplayName;
  const startsAtDate = toMatchDate(matchData.startsAt);
  const matchStatusLabel =
    matchData.matchStatus === 'FT'
      ? 'Full Time'
      : matchData.matchStatus === 'IN_PLAY'
        ? `Live${matchData.matchMinute ? ` / ${matchData.matchMinute}'` : ''}`
        : 'Pre-match';

  const getSlotDetails = (role: SlotRole) => {
    switch (role) {
      case "Hitman": return { title: "THE HITMAN", sub: "1.5x Multiplier on Fouls", icon: Shield, color: "text-slate-500" };
      case "HotHead": return { title: "THE HOT-HEAD", sub: "1.5x Multiplier on Yellows", icon: AlertTriangle, color: "text-yellow-500" };
      case "LooseCannon": return { title: "LOOSE CANNON", sub: "1.5x Multiplier on Reds", icon: UserX, color: "text-red-500" };
    }
  }

  const isPlayerAvailableForRole = (playerId: string, role: SlotRole) =>
    Object.entries(selectedPlayers).every(([selectedRole, selectedId]) => selectedRole === role || selectedId !== playerId);

  const activeRoleDetails = activeRole ? getSlotDetails(activeRole) : null;
  const ActiveRoleIcon = activeRoleDetails?.icon;
  const normalizedPickerSearch = pickerSearch.trim().toLowerCase();
  const pickerPlayers = activeRole
    ? matchData.playerStats
        .filter(player => isPlayerAvailableForRole(player.id, activeRole))
        .filter(player => !pickerTeam || player.team === pickerTeam)
        .filter(player => pickerPosition === 'All' || player.position === pickerPosition)
        .filter(player => {
          if (!normalizedPickerSearch) return true;
          return [player.name, player.position, player.team].some(value => value.toLowerCase().includes(normalizedPickerSearch));
        })
    : [];
  const currentFinalSnapshot = currentLeaderboardEntry?.finalSnapshot ?? restoredFinalSnapshot;
  const isCompletedMatch = isLocked && matchData.matchStatus === 'FT';
  const finalCardRows = (["Hitman", "HotHead", "LooseCannon"] as SlotRole[]).map(role => {
    const snapshotPlayer = currentFinalSnapshot?.selectedPlayers.find(player => player.role === role);
    if (snapshotPlayer) {
      return snapshotPlayer;
    }

    const id = selectedPlayers[role];
    const player = id ? matchData.playerStats.find(candidate => candidate.id === id) : undefined;
    const breakdown = getScoreBreakdown(player, role, true);
    return {
      role,
      player,
      score: breakdown.total,
      breakdown,
    };
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 font-sans selection:bg-yellow-200 selection:text-black pb-4">
      
      {/* HEADER */}
      <header className="sticky top-0 z-20 px-4 py-3 md:px-10 md:py-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white/80 backdrop-blur-2xl border-b border-black/[0.03]">
        <div className="flex items-center gap-3 md:gap-4 min-w-0 w-full md:w-auto">
          <Link to="/" className="w-9 h-9 md:w-10 md:h-10 bg-slate-100 hover:bg-slate-200 flex items-center justify-center rounded-xl text-slate-500 transition-colors active:bg-slate-300 shrink-0">
            <ArrowLeft size={18} />
          </Link>
          <div className="w-9 h-9 md:w-10 md:h-10 bg-slate-950 flex items-center justify-center rounded-xl font-black text-lg md:text-xl shadow-sm shrink-0 ring-1 ring-black/5">
            <span className="text-rose-500">f</span><span className="text-yellow-300">P</span>
          </div>
          <div className="inline-block shrink-0">
            <h1 className="text-lg md:text-xl font-black tracking-tight leading-none">
              <span className="text-rose-600">foul</span><span className="text-yellow-500">PLAY</span>
            </h1>
            <div className="mt-0.5 text-[7px] md:text-[8px] font-mono text-slate-500 uppercase font-black leading-[0.85] tracking-[0.08em]">
              THE UGLY FANTASY
            </div>
          </div>
        </div>

        <div className="flex gap-3 md:gap-8 items-center justify-between w-full md:w-auto">
          {isLocked && (
            <div className="flex items-center gap-3 md:gap-4">
              <div className="text-left md:text-right">
                <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase mb-1 font-semibold">Live Score</div>
                <div className="text-2xl font-black font-mono text-slate-900 leading-none">{totalScore}</div>
              </div>
              <div className="hidden md:block w-[1px] h-8 bg-slate-200 indent-[-9999px]">|</div>
            </div>
          )}
          <div className="flex items-center gap-2 md:gap-4 ml-auto">
          <button 
            onClick={() => setShowRules(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors focus:outline-none"
            aria-label="How to play"
          >
            <HelpCircle size={20} />
          </button>
          
          <button 
            onClick={shareLobbyLink}
            className="flex items-center gap-2 px-4 md:px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white transition-all rounded-full text-xs font-semibold focus:outline-none shadow-md shadow-slate-900/10"
          >
            {copying ? <Check size={16} /> : <Share2 size={16} />}
            <span className="tracking-wide uppercase font-mono">{copying ? 'LINK COPIED' : 'SHARE LOBBY'}</span>
          </button>
          </div>
        </div>
      </header>

      {/* MATRIX / DASHBOARD TOGGLE */}
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-12">
        <section className="mx-auto mb-6 max-w-3xl rounded-3xl border border-slate-100 bg-white px-4 py-4 shadow-sm md:mb-8 md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-base font-black tracking-tight text-slate-950 md:gap-4 md:text-xl">
              <span className="min-w-0 truncate text-right">{matchData.homeTeam}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-slate-400">vs</span>
              <span className="min-w-0 truncate text-left">{matchData.awayTeam}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              <span className={`rounded-full px-3 py-1 text-[10px] font-mono font-black uppercase tracking-widest ${
                matchData.matchStatus === 'IN_PLAY'
                  ? 'bg-rose-50 text-rose-600'
                  : matchData.matchStatus === 'FT'
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-500'
              }`}>
                {matchStatusLabel}
              </span>
              {startsAtDate && (
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">
                  {startsAtDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} / {startsAtDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </section>
        
        {!isLocked && (
          <div className="mb-8 md:mb-10 max-w-2xl">
            <div className="text-left">
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-500 mb-2">Pre-match setup</div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-slate-950">Build your dirty three</h2>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
                Tap a role card, choose an available player, then lock your picks before kickoff.
              </p>
            </div>
          </div>
        )}

        {isCompletedMatch && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mb-10 max-w-3xl overflow-hidden rounded-3xl bg-white shadow-[0_18px_55px_rgb(15,23,42,0.08)] ring-1 ring-slate-100 md:rounded-[2rem]"
          >
            <div className="bg-slate-950 px-6 py-7 text-white md:px-8 md:py-8">
              <div className="text-[10px] font-mono font-black uppercase tracking-widest text-rose-300">Completed Match</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
                {matchData.homeTeam} <span className="text-slate-500">vs</span> {matchData.awayTeam}
              </h2>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">Your Final Score</div>
                  <div className={`mt-1 text-6xl font-black tracking-tighter leading-none ${totalScore < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
                    {totalScore > 0 ? '+' : ''}{totalScore}
                  </div>
                </div>
                <FinalRankPair lobbyRank={lobbyRank} globalRank={globalRank} />
              </div>
            </div>

            <div className="p-6 md:p-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">Final Card</div>
                {currentFinalSnapshot && (
                  <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">
                    Saved {toMatchDate(currentFinalSnapshot.capturedAt)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-100">
                {finalCardRows.map(({ role, player, breakdown, score }) => (
                  <div key={role} className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white p-4 last:border-0">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">{role}</div>
                      <div className="mt-1 truncate text-sm font-black tracking-tight text-slate-950">{player?.name ?? 'Unknown player'}</div>
                      <div className="mt-0.5 text-[10px] font-mono uppercase tracking-widest text-slate-400">{player?.position ?? 'UNK'} / {player?.team ?? 'Unknown Team'}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 md:gap-3">
                      {breakdown.polite < 0 && (
                        <span className="hidden sm:inline whitespace-nowrap rounded-full border border-yellow-100 bg-yellow-50 px-2 py-0.5 text-[10px] font-mono text-yellow-600">Too Polite ({breakdown.polite})</span>
                      )}
                      <span className={`font-mono text-xl font-black ${score < 0 ? 'text-red-500' : 'text-slate-900'}`}>{score > 0 ? '+' : ''}{score}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={shareResultSummary}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800"
                >
                  {resultCopied ? <Check size={16} /> : <Share2 size={16} />}
                  {resultCopied ? 'Copied' : 'Share Result'}
                </button>
                <Link
                  to="/"
                  className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-widest text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  Fixtures
                </Link>
              </div>
            </div>
          </motion.section>
        )}

        {!isCompletedMatch && (
        <>
        {/* The Matrix Top Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] place-content-center gap-4 md:gap-6 lg:gap-12 mb-8 md:mb-12 max-w-6xl mx-auto">
          {(["Hitman", "HotHead", "LooseCannon"] as SlotRole[]).map((role) => {
            const details = getSlotDetails(role);
            const playerId = selectedPlayers[role];
            const player = playerId ? matchData.playerStats.find(p => p.id === playerId) : null;
            
            const isFlashing = playerId && flashEvents[playerId] && isLocked;

            return (
              <motion.button
                type="button"
                key={role}
                onClick={() => openRolePicker(role)}
                disabled={isLocked || entryLockClosed}
                animate={isFlashing ? {
                  y: [0, -8, 0],
                  scale: [1, 1.02, 1]
                } : {}}
                transition={{ duration: 0.5 }}
                className={`w-full text-left relative flex flex-col justify-between min-h-[260px] sm:min-h-[340px] md:min-h-[430px] p-5 sm:p-7 lg:p-10 rounded-3xl md:rounded-[2.5rem] transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 disabled:cursor-default
                    ${playerId 
                        ? 'bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:shadow-[0_20px_50px_-12px_rgb(0,0,0,0.12)]' 
                        : 'bg-white shadow-[0_10px_30px_rgb(15,23,42,0.05)] border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/40 hover:shadow-[0_18px_45px_rgb(15,23,42,0.09)]'}
                    ${!isLocked && !entryLockClosed ? 'cursor-pointer md:hover:-translate-y-2' : ''}
                  `}
              >
                {/* Red Card Celebratory Stamp */}
                {isLocked && player?.redCards && player.redCards.length > 0 && (
                   <div className="absolute top-4 right-4 md:top-6 md:right-6 transform rotate-[15deg] pointer-events-none z-20">
                       <div className="border-[3px] md:border-4 border-red-500 rounded-xl px-3 md:px-4 py-1.5 md:py-2 bg-red-500/10 backdrop-blur-sm shadow-xl flex flex-col items-center justify-center">
                         <span className="text-red-500 font-black text-base md:text-xl tracking-tighter leading-none">SENT</span>
                         <span className="text-red-500 font-black text-base md:text-xl tracking-tighter leading-none">OFF</span>
                       </div>
                   </div>
                )}
                
                <div className="flex flex-col items-start mb-auto z-10 relative">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 ${details.color}`}>
                      <details.icon size={20} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <h3 className={`text-xl sm:text-2xl font-black uppercase tracking-tight leading-none ${details.color}`}>{details.title}</h3>
                      <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-2 font-mono font-bold">{details.sub}</p>
                    </div>
                  </div>
                  {!isLocked && !entryLockClosed && (
                    <span className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-[9px] font-mono font-black uppercase tracking-widest text-slate-500">
                      {player ? 'Change Player' : 'Choose Player'}
                    </span>
                  )}
                </div>

                {player ? (
                  <div className="flex flex-1 flex-col z-10 relative mt-8 md:mt-10 w-full">
                    <div className="mb-6">
                      <div className="text-3xl sm:text-4xl lg:text-[2.65rem] font-black text-slate-900 tracking-tighter leading-[0.95] mb-3 md:mb-4 break-words">{player.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">{player.position} / {player.team}</div>
                    </div>

                    {isLocked && (
                      <div className="mt-auto flex flex-col gap-5">
                        <div className="flex gap-8 md:gap-10">
                           <div className="flex flex-col">
                             <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">Fouls</span>
                             <span className="text-3xl font-black text-slate-800 leading-none">{player.fouls}</span>
                           </div>
                           <div className="flex flex-col">
                             <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mb-2 mt-0.5">Cards</span>
                             <div className="flex gap-1.5 items-center h-8">
                               {player.yellowCards.length === 0 && player.redCards.length === 0 && <span className="text-slate-300 font-bold">-</span>}
                               {player.yellowCards.map((_, i) => <span key={`y-${i}`} className="w-3.5 h-6 bg-yellow-400 rounded-sm shadow-sm" />)}
                               {player.redCards.map((_, i) => <span key={`r-${i}`} className="w-3.5 h-6 bg-red-500 rounded-sm shadow-sm" />)}
                             </div>
                           </div>
                        </div>
                        
                        <div className="pt-5 border-t border-slate-100/80 flex items-end justify-between relative group/points cursor-help">
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pb-1.5 border-b border-dashed border-slate-300">Points</span>
                          <div className={`text-5xl md:text-[3.5rem] font-black tracking-tighter leading-none transition-colors ${calculateFrontendScore(player, role, matchData.matchStatus === 'FT') < 0 ? 'text-red-500' : 'text-slate-900 group-hover/points:text-slate-700'}`}>
                            {calculateFrontendScore(player, role, matchData.matchStatus === 'FT') > 0 ? '+' : ''}{calculateFrontendScore(player, role, matchData.matchStatus === 'FT')}
                          </div>
                          
                          {/* Hover Breakdown */}
                          <div className="absolute right-0 bottom-full mb-4 w-48 bg-slate-900 text-white p-4 rounded-2xl opacity-0 translate-y-2 pointer-events-none group-hover/points:opacity-100 group-hover/points:translate-y-0 transition-all z-50 shadow-xl">
                            <div className="text-[9px] font-mono uppercase tracking-widest text-slate-400 mb-3 pb-2 border-b border-white/10">Point Breakdown</div>
                            <div className="space-y-2 text-xs font-mono">
                              <div className="flex justify-between">
                                <span className="text-slate-300">Fouls:</span>
                                <span>+{getScoreBreakdown(player, role, matchData.matchStatus === 'FT').fouls}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-300">Yellows:</span>
                                <span>+{getScoreBreakdown(player, role, matchData.matchStatus === 'FT').yellows}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-300">Reds:</span>
                                <span className={getScoreBreakdown(player, role, matchData.matchStatus === 'FT').reds > 0 ? "text-red-400" : ""}>+{getScoreBreakdown(player, role, matchData.matchStatus === 'FT').reds}</span>
                              </div>
                              {getScoreBreakdown(player, role, matchData.matchStatus === 'FT').polite < 0 && (
                                <div className="flex justify-between text-yellow-400 pt-2 border-t border-white/10 mt-2">
                                  <span>Polite Penalty:</span>
                                  <span>{getScoreBreakdown(player, role, matchData.matchStatus === 'FT').polite}</span>
                                </div>
                              )}
                            </div>
                            <div className="absolute -bottom-1 right-8 w-3 h-3 bg-slate-900 transform rotate-45"></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-[10px] text-slate-400 font-mono uppercase tracking-widest z-10 relative opacity-60">
                    <div className="w-16 h-16 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center mb-6">
                      <Ghost size={24} className="text-slate-300" strokeWidth={1.5} />
                    </div>
                    <span className="text-slate-500 font-black">{entryLockClosed ? 'Picks Locked' : `Choose ${role}`}</span>
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Lock Picks Action */}
        {!isLocked && (
          <div className="mb-12 md:mb-16">
            <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_14px_35px_rgb(15,23,42,0.08)]">
              <label className="mb-3 flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 sm:flex-row sm:items-center">
                <span className="shrink-0 text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">
                  Playing as
                </span>
                <input
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value.slice(0, 24))}
                  placeholder="Add your name"
                  className="h-9 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm font-black tracking-tight text-slate-950 outline-none ring-1 ring-slate-200 transition-all placeholder:font-semibold placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </label>

              <button
                type="button"
                onClick={handleLock}
                disabled={lockDisabled}
                className="group flex w-full items-center justify-between gap-4 rounded-2xl bg-slate-950 p-4 text-left text-white transition-all hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white group-disabled:bg-white group-disabled:text-slate-300">
                    <LockKeyhole size={21} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-black tracking-tight">{entryLockClosed ? 'PICKS LOCKED' : 'LOCK PICKS'}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
                      <span className={selectedCount === 3 ? 'text-emerald-400' : ''}>{selectedCount}/3 selected</span>
                      <span className="text-slate-600">/</span>
                      <span className={hasDisplayName ? 'text-emerald-400' : ''}>{hasDisplayName ? displayName.trim() : 'Name needed'}</span>
                      <span className="text-slate-600">/</span>
                      <span>{lockLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="flex h-9 items-center justify-center rounded-full bg-rose-600 px-3 text-[10px] font-mono font-black uppercase tracking-widest text-white group-disabled:bg-white group-disabled:text-slate-300">
                  Commit
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard (When locked) */}
        {isLocked && matchData.matchStatus !== 'FT' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-10 md:mt-16 px-0 md:px-2 max-w-md mx-auto">
                <div>
                  <div className="flex flex-col gap-4 md:gap-5 mb-6 md:mb-8">
                      <h2 className="text-[10px] font-mono font-semibold text-slate-400 tracking-widest uppercase flex items-center gap-3 w-full justify-center">
                          <Users size={14} /> 
                          {leaderboardScope === 'lobby' ? 'Lobby Leaderboard' : 'Global Match Leaderboard'} 
                      </h2>
                      <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
                        {(['lobby', 'global'] as LeaderboardScope[]).map(scope => (
                          <button
                            key={scope}
                            onClick={() => setLeaderboardScope(scope)}
                            className={`h-9 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
                              leaderboardScope === scope
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-400 hover:text-slate-700'
                            }`}
                          >
                            {scope}
                          </button>
                        ))}
                      </div>
                  </div>
                  <div className="space-y-2.5 md:space-y-3">
                    {leaderboardEntries.map((user) => (
                      <div key={user.entryId} className={`flex items-center justify-between gap-3 p-3 rounded-2xl transition-all ${user.isCurrentUser ? 'bg-slate-900 shadow-md text-white' : 'bg-slate-50 border border-slate-100 text-slate-700'}`}>
                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                          <span className="text-[10px] font-mono font-bold w-4 text-center text-slate-400">{user.rank}</span>
                          <span className={`text-sm font-semibold tracking-tight truncate ${user.isCurrentUser ? 'text-white' : 'text-slate-900'}`}>{user.displayName}</span>
                        </div>
                        <span className={`text-xl font-black tracking-tighter shrink-0 ${user.isCurrentUser ? 'text-white' : user.score < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                          {user.score > 0 ? '+' : ''}{user.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
            </motion.div>
        )}
        </>
        )}

        {/* Role Picker */}
        <AnimatePresence>
          {activeRole && activeRoleDetails && ActiveRoleIcon && !isLocked && !entryLockClosed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
              onClick={() => setActiveRole(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.98 }}
                transition={{ duration: 0.22 }}
                className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-7">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <ActiveRoleIcon size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-[10px] font-mono font-black uppercase tracking-widest ${activeRoleDetails.color}`}>
                        {activeRoleDetails.title}
                      </div>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Choose a player</h2>
                      <p className="mt-1 text-xs font-mono uppercase tracking-widest text-slate-400">{activeRoleDetails.sub}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveRole(null)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                    aria-label="Close player picker"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="border-b border-slate-100 p-4 sm:p-5">
                  {matchTeams.length > 0 && (
                    <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
                      {matchTeams.map(team => (
                        <button
                          key={team}
                          type="button"
                          onClick={() => setPickerTeam(team)}
                          className={`min-h-10 rounded-full px-3 text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
                            pickerTeam === team
                              ? 'bg-white text-slate-950 shadow-sm'
                              : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          <span className="block truncate">{team}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={`${matchTeams.length > 0 ? 'mt-4' : ''} flex flex-col gap-3 sm:flex-row`}>
                    <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-slate-400 focus-within:border-rose-300 focus-within:ring-2 focus-within:ring-rose-100">
                      <Search size={17} />
                      <input
                        value={pickerSearch}
                        onChange={event => setPickerSearch(event.target.value)}
                        placeholder="Search players"
                        className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <div className="flex h-11 gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 sm:max-w-[260px]">
                      {pickerPositions.map(position => (
                        <button
                          key={position}
                          type="button"
                          onClick={() => setPickerPosition(position)}
                          className={`shrink-0 rounded-xl px-3 text-[10px] font-mono font-black uppercase tracking-widest transition-colors ${
                            pickerPosition === position
                              ? 'bg-white text-slate-950 shadow-sm'
                              : 'text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          {position}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-y-auto p-3 sm:p-4">
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
                    {pickerPlayers.map(player => {
                      const isSelectedForRole = selectedPlayers[activeRole] === player.id;

                      return (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => assignPlayerToRole(player.id, activeRole)}
                          className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-inset focus:ring-rose-400 ${
                            isSelectedForRole
                              ? 'bg-slate-950 text-white'
                              : 'bg-white text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black tracking-tight">{player.name}</div>
                            <div className={`mt-0.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest ${isSelectedForRole ? 'text-slate-400' : 'text-slate-400'}`}>
                              <span>{player.position}</span>
                              <span className="h-1 w-1 rounded-full bg-current opacity-50" />
                              <span className="truncate">{player.team}</span>
                            </div>
                          </div>
                          {isSelectedForRole ? (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-slate-950">
                              <Check size={15} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="h-7 w-7 shrink-0 rounded-full border border-slate-200" />
                          )}
                        </button>
                      );
                    })}

                    {pickerPlayers.length === 0 && (
                      <div className="flex min-h-28 items-center justify-center bg-white px-4 text-center text-xs font-mono font-bold uppercase tracking-widest text-slate-400">
                        {matchData.playerStats.length === 0 ? 'Player data is not available for this fixture yet' : 'No available players match your search'}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rules Modal */}
        <AnimatePresence>
          {showRules && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowRules(false)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-3xl md:rounded-[2rem] p-6 md:p-10 shadow-2xl max-w-md w-full relative overflow-hidden max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <button 
                  onClick={() => setShowRules(false)}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X size={24} />
                </button>
                
                <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">How to Play</h2>
                <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-8">Scoring & Multipliers</p>
                
                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                       <Shield size={16} className="text-slate-700" />
                       Base Points
                    </h3>
                    <ul className="text-sm text-slate-600 space-y-2 font-mono">
                      <li className="flex justify-between"><span>Foul Committed</span> <span className="font-bold text-slate-900">+5 pts</span></li>
                      <li className="flex justify-between"><span>Yellow Card</span> <span className="font-bold text-slate-900">+20 pts</span></li>
                      <li className="flex justify-between"><span>Red Card</span> <span className="font-bold text-slate-900">+50 pts</span></li>
                    </ul>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                       <Trophy size={16} className="text-slate-700" />
                       Role Multipliers
                    </h3>
                    <ul className="text-sm text-slate-600 space-y-2 font-mono">
                      <li className="flex justify-between"><span>Hitman (Fouls)</span> <span className="font-bold text-slate-900">1.5x</span></li>
                      <li className="flex justify-between"><span>Hot Head (Yellows)</span> <span className="font-bold text-slate-900">1.5x</span></li>
                      <li className="flex justify-between"><span>Loose Cannon (Reds)</span> <span className="font-bold text-slate-900">1.5x</span></li>
                    </ul>
                  </div>
                  
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                    <h3 className="text-sm font-bold text-red-900 mb-2 flex items-center gap-2">
                       <AlertTriangle size={16} className="text-red-600" />
                       Too Polite Penalty
                    </h3>
                    <p className="text-xs text-red-700 font-mono leading-relaxed">
                      If a selected player finishes the match with 0 fouls and 0 cards, they receive a <strong className="font-black">-15 pt</strong> penalty.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Match Complete Modal */}
        <AnimatePresence>
          {isLocked && matchData.matchStatus === 'FT' && showFinalReport && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-slate-950/45 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="bg-white rounded-3xl md:rounded-[2rem] shadow-2xl max-w-lg w-full relative overflow-hidden max-h-[90vh] overflow-y-auto"
              >
                <button
                  type="button"
                  onClick={() => setShowFinalReport(false)}
                  className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-400 shadow-sm ring-1 ring-slate-200 transition-colors hover:text-slate-900"
                  aria-label="Close full time report"
                >
                  <X size={20} />
                </button>

                <div className="border-b border-slate-100 bg-slate-950 px-6 py-7 text-white md:px-8 md:py-8">
                  <div className="mb-5 flex items-center justify-between gap-4 pr-10">
                    <div>
                      <div className="text-[10px] font-mono font-black uppercase tracking-widest text-rose-300">Full Time Report</div>
                      <h2 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
                        {matchData.homeTeam} <span className="text-slate-500">vs</span> {matchData.awayTeam}
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">Your Score</div>
                      <div className={`mt-1 text-6xl font-black tracking-tighter leading-none ${totalScore < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
                        {totalScore > 0 ? '+' : ''}{totalScore}
                      </div>
                    </div>
                    <FinalRankPair lobbyRank={lobbyRank} globalRank={globalRank} />
                  </div>
                </div>

                <div className="p-6 md:p-8">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">Final Card</div>
                    <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">foulPLAY</div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    {finalCardRows.map(({ role, player, breakdown, score }) => (
                      <div key={role} className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white p-4 last:border-0">
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">{role}</div>
                          <div className="mt-1 truncate text-sm font-black tracking-tight text-slate-950">{player?.name ?? 'Unknown player'}</div>
                          <div className="mt-0.5 text-[10px] font-mono uppercase tracking-widest text-slate-400">{player?.position ?? 'UNK'} / {player?.team ?? 'Unknown Team'}</div>
                        </div>
                         <div className="flex items-center gap-2 md:gap-3 shrink-0">
                           {breakdown.polite < 0 && (
                             <span className="hidden sm:inline text-[10px] font-mono text-yellow-600 bg-yellow-50 border border-yellow-100 px-2 py-0.5 rounded-full whitespace-nowrap">Too Polite ({breakdown.polite})</span>
                           )}
                           <span className={`font-mono text-xl font-black ${score < 0 ? 'text-red-500' : 'text-slate-900'}`}>{score > 0 ? '+' : ''}{score}</span>
                         </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button 
                      type="button"
                      onClick={shareResultSummary}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800"
                    >
                      {resultCopied ? <Check size={16} /> : <Share2 size={16} />}
                      {resultCopied ? 'Copied' : 'Share Result'}
                    </button>
                    <Link
                      to="/"
                      className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-widest text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
                    >
                      Fixtures
                    </Link>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

function FinalRankPair({ lobbyRank, globalRank }: { lobbyRank?: number; globalRank?: number }) {
  if (!lobbyRank && !globalRank) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {typeof lobbyRank === 'number' && (
        <div className="rounded-2xl bg-white/10 px-3 py-3 text-right">
          <div className="text-[9px] font-mono font-black uppercase tracking-widest text-slate-400">Lobby</div>
          <div className="mt-1 text-xl font-black leading-none">#{lobbyRank}</div>
        </div>
      )}
      {typeof globalRank === 'number' && (
        <div className="rounded-2xl bg-white/10 px-3 py-3 text-right">
          <div className="text-[9px] font-mono font-black uppercase tracking-widest text-slate-400">Global</div>
          <div className="mt-1 text-xl font-black leading-none">#{globalRank}</div>
        </div>
      )}
    </div>
  );
}
