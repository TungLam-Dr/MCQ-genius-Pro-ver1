import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { QuestionAttempt } from '../types/quiz';
import { buildReviewHeatmap, currentHeatmapStreak, heatmapThemes, localDayKey, type HeatmapTheme } from '../utils/reviewHeatmap';
import './ReviewHeatmap.css';

interface Props {
  attempts: QuestionAttempt[];
  theme: HeatmapTheme;
  onThemeChange: (theme: HeatmapTheme) => void;
}

export function ReviewHeatmap({ attempts, theme, onThemeChange }: Props) {
  const [today, setToday] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState(() => localDayKey(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setToday(previous => {
      const now = new Date();
      return localDayKey(now) === localDayKey(previous) ? previous : now;
    }), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const days = useMemo(() => buildReviewHeatmap(attempts, today), [attempts, today]);
  const offset = (days[0].date.getDay() + 6) % 7;
  const weeks = Math.ceil((offset + days.length) / 7);
  const chosen = days.find(day => day.key === selectedKey) || days.at(-1)!;
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const activeDays = days.filter(day => day.count > 0).length;
  const streak = currentHeatmapStreak(days);
  const months = days.flatMap((day, i) => i === 0 || day.date.getDate() === 1
    ? [{ label: new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(day.date), week: Math.floor((offset + i) / 7) }]
    : []);
  const chosenLabel = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(chosen.date);

  return <section className="review-heatmap rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6" data-theme={theme} aria-label="Lịch ôn tập 365 ngày">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white"><CalendarDays size={20} className="text-indigo-500" /> Lịch ôn tập</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">365 ngày gần nhất · Mỗi ô là số câu đã trả lời trong ngày.</p></div>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-200">Giao diện
        <select value={theme} onChange={event => onThemeChange(event.target.value as HeatmapTheme)} aria-label="Chọn giao diện heatmap" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
          {heatmapThemes.map(item => <option key={item.id} value={item.id}>{item.symbol} {item.label}</option>)}
        </select>
      </label>
    </div>

    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs sm:max-w-lg">
      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><strong className="block text-lg text-slate-900 dark:text-white">{total}</strong>Câu đã làm</div>
      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><strong className="block text-lg text-slate-900 dark:text-white">{activeDays}</strong>Ngày học</div>
      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><strong className="block text-lg text-slate-900 dark:text-white">{streak}</strong>Ngày liên tiếp</div>
    </div>

    <div className="mt-5 overflow-x-auto pb-3" aria-label="Bản đồ hoạt động học tập, cuộn ngang để xem các ngày trước">
      <div className="heatmap-table" style={{ '--weeks': weeks } as React.CSSProperties}>
        <div className="heatmap-months">{months.map(({label, week}, i) => <span key={`${week}-${i}`} style={{ gridColumn: week + 1 }}>{label}</span>)}</div>
        <div className="heatmap-weekdays"><span>T2</span><span /><span>T4</span><span /><span>T6</span><span /><span>CN</span></div>
        <div className="heatmap-cells">
          {Array.from({ length: offset }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
          {days.map(day => <button key={day.key} type="button" data-level={day.level} aria-pressed={chosen.key === day.key}
            aria-label={`${new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(day.date)}: ${day.review} câu ôn tập, ${day.mcq} câu MCQ`}
            title={`${day.key}: ${day.count} câu (${day.review} ôn, ${day.mcq} MCQ)`} onClick={() => setSelectedKey(day.key)} className="heat-cell" />)}
        </div>
      </div>
    </div>

    <div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-300">
      <p aria-live="polite" className="font-semibold text-slate-700 dark:text-slate-100">{chosenLabel}: {chosen.count ? `${chosen.review} câu ôn · ${chosen.mcq} câu MCQ` : 'Chưa học'}</p>
      <div className="flex items-center gap-1.5" aria-label="Chú giải mức độ hoạt động"><span>Ít</span>{[0, 1, 2, 3, 4].map(level => <span key={level} data-level={level} className="heat-cell" aria-hidden="true" />)}<span>Nhiều</span></div>
    </div>
    {total === 0 && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Hoàn thành một lượt ôn hoặc bài MCQ để bắt đầu ghi nhận hoạt động.</p>}
  </section>;
}
