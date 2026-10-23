import React, { useState, useEffect } from 'react';
import {
  X,
  Target,
  Trophy,
  Flame,
  Sparkles,
  Award,
  ChevronRight,
  TrendingUp,
  HeartPulse,
} from 'lucide-react';

interface GoatCountdownModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MOTIVATIONAL_QUOTES = [
  "🎯 'Mỗi câu trắc nghiệm bạn giải hôm nay là một viên gạch đắp nên thành công ngày 01/08/2027!'",
  "🏔️ 'Không có ngọn núi nào cao hơn sự kiên trì. Con Dê G.O.A.T sẽ cùng bạn leo tới đỉnh vinh quang!'",
  "💡 'Sự kỷ luật hôm nay sẽ đổi lấy sự tự tin tuyệt đối khi bước vào phòng thi ngày 01/08/2027!'",
  "🔥 'Đừng dừng lại khi mệt mỏi, hãy dừng lại khi đã hoàn thành mục tiêu!'",
  "✨ 'Mỗi sai lầm hôm nay được làm rõ qua Gemini AI là 1 điểm cộng chắc chắn cho ngày thi chính thức!'",
];

export const GoatCountdownModal: React.FC<GoatCountdownModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Target Exam Date: August 1, 2027 at 08:00 AM
  const targetDate = new Date('2027-08-01T08:00:00');

  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const calculateTimeLeft = () => {
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    // Rotate motivational quotes
    const quoteTimer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
    }, 6000);

    return () => {
      clearInterval(timer);
      clearInterval(quoteTimer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Total journey days estimated (e.g. 1000 days total journey)
  const totalDaysJourney = 1000;
  const daysPassed = Math.max(0, Math.min(totalDaysJourney, totalDaysJourney - timeLeft.days));
  const journeyPercentage = Math.min(100, Math.max(5, Math.round((daysPassed / totalDaysJourney) * 100)));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 text-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-amber-500/40 relative overflow-hidden space-y-6">
        {/* Decorative Gold Radial Glow */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Title with Goat Symbol */}
        <div className="flex items-center space-x-3.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 p-0.5 shadow-xl shadow-amber-500/30 flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-2xl">
              🐐
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                G.O.A.T EXAM COUNTDOWN
              </span>
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-amber-200 tracking-tight mt-0.5">
              Đếm Ngược Đến Ngày Thi 01/08/2027
            </h2>
          </div>
        </div>

        {/* Main Countdown Display Cards */}
        <div className="grid grid-cols-4 gap-2.5 sm:gap-4 text-center">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/80 border border-amber-500/30 shadow-lg">
            <div className="text-2xl sm:text-4xl font-black bg-gradient-to-b from-amber-200 to-amber-400 bg-clip-text text-transparent">
              {timeLeft.days}
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-amber-300 uppercase tracking-wider mt-1">
              NGÀY
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/80 border border-indigo-500/30 shadow-lg">
            <div className="text-2xl sm:text-4xl font-black text-indigo-300">
              {timeLeft.hours < 10 ? `0${timeLeft.hours}` : timeLeft.hours}
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-indigo-300 uppercase tracking-wider mt-1">
              GIỜ
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/80 border border-purple-500/30 shadow-lg">
            <div className="text-2xl sm:text-4xl font-black text-purple-300">
              {timeLeft.minutes < 10 ? `0${timeLeft.minutes}` : timeLeft.minutes}
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-purple-300 uppercase tracking-wider mt-1">
              PHÚT
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/80 border border-emerald-500/30 shadow-lg">
            <div className="text-2xl sm:text-4xl font-black text-emerald-400 animate-pulse">
              {timeLeft.seconds < 10 ? `0${timeLeft.seconds}` : timeLeft.seconds}
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-emerald-300 uppercase tracking-wider mt-1">
              GIÂY
            </div>
          </div>
        </div>

        {/* Mountain Peak Trail Visual Progress */}
        <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-300 flex items-center space-x-1.5">
              <span>🏔️ Hành Trình Chinh Phục Đỉnh Núi 01/08/2027</span>
            </span>
            <span className="text-amber-400 font-extrabold">{journeyPercentage}%</span>
          </div>

          {/* Progress Bar with Moving Goat Avatar */}
          <div className="relative w-full h-4 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${journeyPercentage}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-slate-400 font-medium">
            <span>Khởi động hôm nay</span>
            <span className="text-amber-300 font-bold">🏆 Đích đến: 01/08/2027</span>
          </div>
        </div>

        {/* Motivational Quotes Box */}
        <div className="p-4 bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-slate-900 rounded-2xl border border-amber-500/30 text-xs text-amber-100 italic leading-relaxed text-center shadow-inner">
          <p className="not-italic font-bold text-amber-300 text-[11px] mb-1 flex items-center justify-center space-x-1">
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>LỜI NHẮN TRUYỀN ĐỘNG LỰC TỪ DÊ VÀNG G.O.A.T</span>
          </p>
          "{MOTIVATIONAL_QUOTES[quoteIndex]}"
        </div>

        {/* Action button */}
        <button
          onClick={onClose}
          className="w-full py-3 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center space-x-2 transition-all transform hover:scale-[1.01]"
        >
          <span>TIẾP TỤC ÔN LUYỆN CHINH PHỤC ĐỈNH NÚI 01/08/2027</span>
          <ChevronRight className="w-4 h-4 stroke-[3]" />
        </button>
      </div>
    </div>
  );
};
