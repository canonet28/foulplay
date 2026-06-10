import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, ChevronRight, HelpCircle, Shield, Trophy, X } from 'lucide-react';
import { toMatchDate } from '../dateTime';

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  league: string;
}

export default function Dashboard() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRules, setShowRules] = useState(false);

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

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
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
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
          aria-label="How to play"
        >
          <HelpCircle size={20} />
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:px-6 md:py-12">
        <div className="mb-8 md:mb-12 text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter mb-3 md:mb-4">
             UPCOMING FIXTURES
          </h2>
          <p className="text-sm md:text-base text-slate-500 font-medium">Select a match below and assign your Roster for foulPlay.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 font-mono tracking-widest text-sm">LOADING MATCHES...</div>
        ) : (
          <div className="grid gap-4 md:gap-6">
            {matches.map((match, idx) => {
              const dateObj = toMatchDate(match.date) ?? new Date(match.date);
              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Link 
                    to={`/match/${match.id}`} 
                    className="group block bg-white rounded-3xl md:rounded-[2rem] p-4 md:p-6 shadow-sm border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all hover:-translate-y-1"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                      <div className="flex-1 space-y-2">
                         <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400">
                           <span className="px-2 py-1 bg-slate-100 rounded-md text-slate-600 max-w-full truncate">{match.league}</span>
                           <span className="flex items-center gap-1.5"><Calendar size={12}/> {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute:'2-digit' })}</span>
                         </div>
                         <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4 text-lg md:text-2xl font-black text-slate-900 tracking-tight">
                            <span className="text-right break-words leading-tight">{match.homeTeam}</span>
                            <span className="text-slate-300 font-mono text-xs md:text-sm px-1 md:px-2">VS</span>
                            <span className="text-left break-words leading-tight">{match.awayTeam}</span>
                         </div>
                      </div>
                      <div className="shrink-0 flex justify-center">
                         <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                           <ChevronRight size={24} strokeWidth={2.5}/>
                         </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="mt-10 text-center">
          <a
            href="https://buymeacoffee.com/dialupdecibels"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-mono font-black uppercase tracking-widest text-slate-400 transition-colors hover:border-yellow-300 hover:text-slate-900"
          >
            Enjoying foulPLAY? Buy me a coffee
          </a>
        </div>
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
