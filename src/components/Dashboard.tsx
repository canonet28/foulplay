import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, Shield, Flame } from 'lucide-react';

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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:px-6 md:py-12">
        <div className="mb-8 md:mb-12 text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter mb-3 md:mb-4 flex items-center justify-center md:justify-start gap-3">
             <Flame className="text-red-500 shrink-0" size={26} />
             UPCOMING FIXTURES
          </h2>
          <p className="text-sm md:text-base text-slate-500 font-medium">Select a match below and assign your Roster for foulPlay.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 font-mono tracking-widest text-sm">LOADING MATCHES...</div>
        ) : (
          <div className="grid gap-4 md:gap-6">
            {matches.map((match, idx) => {
              const dateObj = new Date(match.date);
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
      </main>
    </div>
  );
}
