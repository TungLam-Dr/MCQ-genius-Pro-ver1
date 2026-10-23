import React from 'react';
import { Sparkles, Calendar } from 'lucide-react';

interface NavbarProps {
  onOpenGoatCountdown: () => void;
  onGoToHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenGoatCountdown,
  onGoToHome,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-gradient-to-r from-red-950 via-slate-950 to-emerald-950 text-white border-b-2 border-amber-500/40 shadow-2xl relative overflow-hidden backdrop-blur">
      {/* Animated Snowflakes in Navbar */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-80">
        <span className="absolute top-1 left-[10%] text-xs text-white/70 animate-snow-1">❄</span>
        <span className="absolute top-0 left-[25%] text-xs text-white/60 animate-snow-2">❄</span>
        <span className="absolute top-2 left-[45%] text-sm text-white/80 animate-snow-3">❄</span>
        <span className="absolute top-1 left-[65%] text-xs text-white/70 animate-snow-1">❄</span>
        <span className="absolute top-0 left-[85%] text-xs text-white/60 animate-snow-2">❄</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding - Uses User Uploaded Image */}
          <div
            className="flex items-center space-x-3 cursor-pointer group"
            onClick={onGoToHome}
          >
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 p-0.5 shadow-lg shadow-amber-500/30 overflow-hidden transform group-hover:scale-105 transition-transform">
              <img
                src="/assets/aistudio/image_6399810c.png"
                alt="MCQ Genius Logo"
                className="w-full h-full object-cover rounded-[10px]"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
                  MCQ Genius AI
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600/60 text-amber-200 border border-amber-400/40 rounded-full flex items-center space-x-1">
                  <span>🎄 2027</span>
                </span>
              </div>
              <p className="text-[11px] text-emerald-300 hidden sm:block font-medium">
                🎄 Giáng Sinh Ấm Áp &amp; Chinh Phục Kỳ Thi 01/08/2027! ❄️
              </p>
            </div>
          </div>

          {/* Far Right: Goat Icon Button (Con Dê 🐐) for August 1, 2027 Exam Countdown */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenGoatCountdown}
              className="group relative flex items-center space-x-2 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black rounded-2xl shadow-xl shadow-amber-500/25 transition-all transform hover:scale-105 active:scale-95 border border-amber-300/80"
              title="Nhấn để xem Đếm Ngược Ngày Thi 01/08/2027 & Động Lực G.O.A.T!"
            >
              {/* Goat Emoji Avatar Icon */}
              <div className="w-6 h-6 rounded-full bg-slate-950 text-amber-300 flex items-center justify-center text-sm shadow-inner shrink-0">
                🐐
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[10px] uppercase tracking-wider text-slate-900 font-extrabold leading-none">
                  LỊCH THI 2027
                </div>
                <div className="text-xs font-black text-slate-950 leading-tight">
                  01/08/2027
                </div>
              </div>
              <Sparkles className="w-3.5 h-3.5 text-slate-900 animate-pulse hidden sm:block" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
