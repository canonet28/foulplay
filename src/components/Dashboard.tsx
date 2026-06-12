import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, ChevronRight, HelpCircle, Shield, Trophy, X } from 'lucide-react';
import { toMatchDate } from '../dateTime';
import type { RecentMatchEntry } from '../types';

const SHOW_SUPPORT_LINK = false;

type DashboardTab = 'upcoming' | 'mine';

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeTeamFlag?: string;
  awayTeamFlag?: string;
  date: string;
  league: string;
}

interface FixtureCardProps {
  to: string;
  metaLabel: string;
  date?: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeTeamFlag?: string;
  awayTeamFlag?: string;
  scoreLabel?: string;
  delay?: number;
}

function createLocalUserId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Dashboard() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('upcoming');
  const [userId] = useState(() => {
    const existing = window.localStorage.getItem('foulcup:userId');
    if (existing) return existing;
    const next = createLocalUserId();
    window.localStorage.setItem('foulcup:userId', next);
    return next;
  });

  useEffect(() => {
    fetch('/api/matches/upcoming')
      .then(res => res.json())
      .then(data => {
        setMatches(data.matches);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch matches", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/users/${encodeURIComponent(userId)}/recent-matches`)
      .then(res => (res.ok ? res.json() : { entries: [] }))
      .then(data => setRecentMatches(Array.isArray(data.entries) ? data.entries : []))
      .catch(err => {
        console.error("Failed to fetch recent matches", err);
      });
  }, [userId]);

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-slate-50 font-sans">
      <header className="sticky top-0 z-20 px-4 py-4 md:px-10 md:py-6 flex items-center justify-between bg-white/70 backdrop-blur-2xl border-b border-black/[0.03]">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 bg-slate-950 flex items-center justify-center rounded-xl font-black text-lg md:text-xl shadow-sm shrink-0 ring-1 ring-black/5">
            <span className="text-rose-500">f</span><span className="text-yellow-300">P</span>
          </div>
          <div className="inline-block">
            <h1 className="text-lg md:text-xl font-black tracking-tight leading-none">
              <span className="text-rose-600">foul</span><span className="text-yellow-500">PLAY</span>
            </h1>
            <div className="mt-0.5 text-[7px] md:text-[8px] font-mono text-slate-500 uppercase font-black leading-[0.85] tracking-[0.08em]">
               THE UGLY FANTASY
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            aria-label="How to play"
          >
            <HelpCircle size={20} />
          </button>
          {SHOW_SUPPORT_LINK && (
            <a
              href="https://buymeacoffee.com/dialupdecibels"
              target="_blank"
              rel="noreferrer"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-yellow-300 shadow-sm ring-1 ring-black/5 transition-transform hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              aria-label="Support foulPLAY on Buy Me a Coffee"
            >
              <img src="/buy-me-a-coffee.svg" alt="" aria-hidden="true" className="h-full w-full object-cover" />
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
        <div className="mb-8 md:mb-10">
          <div className="mb-6 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter mb-3 md:mb-4">
              {activeTab === 'upcoming' ? 'UPCOMING FIXTURES' : 'MY MATCHES'}
            </h2>
            <p className="text-sm md:text-base text-slate-500 font-medium">
              {activeTab === 'upcoming'
                ? 'Select a match below and assign your Roster for foulPlay.'
                : 'Return to locked picks, live contests, and final results.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
            {([
              ['upcoming', 'Upcoming', matches.length],
              ['mine', 'My Matches', recentMatches.length],
            ] as const).map(([tab, label, count]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-11 rounded-full px-3 text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
                  activeTab === tab
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {label}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[9px] ${
                  activeTab === tab ? 'bg-slate-100 text-slate-500' : 'bg-white/70 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'upcoming' && loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 font-mono tracking-widest text-sm">LOADING MATCHES...</div>
        ) : activeTab === 'upcoming' ? (
          <div className="grid gap-4 md:gap-6">
            {matches.length > 0 ? (
              matches.map((match, idx) => (
                <FixtureCard
                  key={match.id}
                  to={`/match/${match.id}`}
                  metaLabel={match.league}
                  date={match.date}
                  homeTeam={match.homeTeam}
                  awayTeam={match.awayTeam}
                  homeTeamLogo={match.homeTeamLogo}
                  awayTeamLogo={match.awayTeamLogo}
                  homeTeamFlag={match.homeTeamFlag}
                  awayTeamFlag={match.awayTeamFlag}
                  delay={idx * 0.1}
                />
              ))
            ) : (
              <EmptyState
                title="No Fixtures Found"
                body="There are no playable fixtures in the current window. Check back closer to kickoff."
              />
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:gap-6">
            {recentMatches.length > 0 ? (
              recentMatches.map((entry, idx) => {
              const match = entry.match;
              const url = `/match/${entry.matchId}?lobby=${encodeURIComponent(entry.lobbyId)}`;
              const scoreLabel = entry.finalSnapshot
                ? `${entry.finalSnapshot.totalScore > 0 ? '+' : ''}${entry.finalSnapshot.totalScore} PTS`
                : undefined;
              return (
                <FixtureCard
                  key={entry.entryId}
                  to={url}
                  metaLabel={entry.finalSnapshot ? 'Final' : 'Locked'}
                  date={match?.startsAt ?? entry.lockedAt}
                  homeTeam={match?.homeTeam ?? `Match ${entry.matchId}`}
                  awayTeam={match?.awayTeam ?? 'Details'}
                  homeTeamLogo={match?.homeTeamLogo}
                  awayTeamLogo={match?.awayTeamLogo}
                  homeTeamFlag={match?.homeTeamFlag}
                  awayTeamFlag={match?.awayTeamFlag}
                  scoreLabel={scoreLabel}
                  delay={idx * 0.06}
                />
              );
            })
            ) : (
              <EmptyState
                title="No Matches Yet"
                body="Locked picks and final results will appear here after you enter a fixture."
              />
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm md:p-6"
            onClick={() => setShowRules(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25 }}
              className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl md:rounded-[2rem] md:p-10"
              onClick={event => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="absolute right-6 top-6 text-slate-400 transition-colors hover:text-slate-900"
                aria-label="Close how to play"
              >
                <X size={24} />
              </button>

              <h2 className="mb-2 text-xl font-black uppercase tracking-tight text-slate-900 md:text-2xl">How to Play</h2>
              <p className="mb-8 max-w-sm text-sm font-medium leading-6 text-slate-500">
                Pick three players for a match before kickoff. You score when they commit fouls or collect cards. Invite friends. Every fixture is a self-contained contest with lobby and global leaderboards.
              </p>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Shield size={16} className="text-slate-700" />
                    Base Points
                  </h3>
                  <ul className="space-y-2 font-mono text-sm text-slate-600">
                    <li className="flex justify-between"><span>Foul committed</span> <span className="font-bold text-slate-900">+5 pts</span></li>
                    <li className="flex justify-between"><span>Yellow card</span> <span className="font-bold text-slate-900">+20 pts</span></li>
                    <li className="flex justify-between"><span>Red card</span> <span className="font-bold text-slate-900">+50 pts</span></li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Trophy size={16} className="text-slate-700" />
                    Role Multipliers
                  </h3>
                  <ul className="space-y-2 font-mono text-sm text-slate-600">
                    <li className="flex justify-between"><span>Hitman fouls</span> <span className="font-bold text-slate-900">1.5x</span></li>
                    <li className="flex justify-between"><span>Hot-Head yellows</span> <span className="font-bold text-slate-900">1.5x</span></li>
                    <li className="flex justify-between"><span>Loose Cannon reds</span> <span className="font-bold text-slate-900">1.5x</span></li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-red-900">
                    <AlertTriangle size={16} className="text-red-600" />
                    Too Polite Penalty
                  </h3>
                  <p className="font-mono text-xs leading-relaxed text-red-700">
                    A picked player who finishes with 0 fouls and 0 cards gets a <strong className="font-black">-15 pt</strong> penalty.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FixtureCard({
  to,
  metaLabel,
  date,
  homeTeam,
  awayTeam,
  homeTeamLogo,
  awayTeamLogo,
  homeTeamFlag,
  awayTeamFlag,
  scoreLabel,
  delay = 0,
}: FixtureCardProps) {
  const dateObj = date ? toMatchDate(date) ?? new Date(date) : null;
  const homeFlag = homeTeamFlag ?? getFallbackFlag(homeTeam);
  const awayFlag = awayTeamFlag ?? getFallbackFlag(awayTeam);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Link
        to={to}
        className="group block rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-200 hover:shadow-xl md:rounded-[2rem] md:p-6"
      >
        <div className="flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-center md:gap-6">
          <div className="min-w-0 flex-1 space-y-2">
             <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
               <span className="max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-slate-600">{metaLabel}</span>
               {scoreLabel && (
                <span className="rounded-md bg-slate-950 px-2 py-1 text-white">{scoreLabel}</span>
               )}
               {dateObj && (
                 <span className="flex min-w-0 items-center gap-1.5 leading-tight">
                  <Calendar size={12} className="shrink-0"/>
                  <span className="min-w-0 break-words">
                    {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute:'2-digit' })}
                  </span>
                </span>
               )}
             </div>
             <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-lg font-black tracking-tight text-slate-900 md:gap-4 md:text-2xl">
                <span className="flex min-w-0 items-center justify-end gap-2 text-right leading-tight">
                  <span className="min-w-0 break-words">{homeTeam}</span>
                  <TeamMark logo={homeTeamLogo} flag={homeFlag} name={homeTeam} />
                </span>
                <span className="px-1 font-mono text-xs text-slate-300 md:px-2 md:text-sm">VS</span>
                <span className="flex min-w-0 items-center justify-start gap-2 text-left leading-tight">
                  <TeamMark logo={awayTeamLogo} flag={awayFlag} name={awayTeam} />
                  <span className="min-w-0 break-words">{awayTeam}</span>
                </span>
             </div>
          </div>
          <div className="flex shrink-0 justify-center">
             <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:bg-slate-900 group-hover:text-white">
               <ChevronRight size={24} strokeWidth={2.5}/>
             </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center md:rounded-[2rem]">
      <div className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">{title}</div>
      <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-slate-500">{body}</p>
    </div>
  );
}

function TeamMark({ logo, flag, name }: { logo?: string; flag?: string; name: string }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="h-5 w-5 shrink-0 rounded-full bg-slate-100 object-contain p-0.5 ring-1 ring-slate-200 md:h-6 md:w-6"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  if (flag) {
    return (
      <span className="shrink-0 text-base leading-none md:text-lg" aria-label={`${name} flag`} role="img">
        {flag}
      </span>
    );
  }

  return null;
}

function getFallbackFlag(teamName: string) {
  const code = COUNTRY_FLAG_CODES[normalizeTeamName(teamName)];
  return code ? countryCodeToFlag(code) : undefined;
}

function normalizeTeamName(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function countryCodeToFlag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

const COUNTRY_FLAG_CODES: Record<string, string> = {
  algeria: 'DZ',
  argentina: 'AR',
  australia: 'AU',
  austria: 'AT',
  belgium: 'BE',
  bolivia: 'BO',
  brazil: 'BR',
  cameroon: 'CM',
  canada: 'CA',
  chile: 'CL',
  colombia: 'CO',
  'costa rica': 'CR',
  croatia: 'HR',
  denmark: 'DK',
  ecuador: 'EC',
  egypt: 'EG',
  england: 'GB',
  france: 'FR',
  germany: 'DE',
  ghana: 'GH',
  iran: 'IR',
  italy: 'IT',
  'ivory coast': 'CI',
  jamaica: 'JM',
  japan: 'JP',
  jordan: 'JO',
  'korea republic': 'KR',
  mexico: 'MX',
  morocco: 'MA',
  netherlands: 'NL',
  'new zealand': 'NZ',
  nigeria: 'NG',
  panama: 'PA',
  paraguay: 'PY',
  peru: 'PE',
  poland: 'PL',
  portugal: 'PT',
  qatar: 'QA',
  'saudi arabia': 'SA',
  scotland: 'GB',
  senegal: 'SN',
  serbia: 'RS',
  'south africa': 'ZA',
  'south korea': 'KR',
  spain: 'ES',
  switzerland: 'CH',
  tunisia: 'TN',
  turkey: 'TR',
  ukraine: 'UA',
  'united arab emirates': 'AE',
  'united states': 'US',
  uruguay: 'UY',
  usa: 'US',
  uzbekistan: 'UZ',
  venezuela: 'VE',
  wales: 'GB',
};
