import React from 'react';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { TodayReviewSummary } from '../utils/todayReview';

interface Props {
  summary: TodayReviewSummary;
  onStart: () => void;
  onOpenReview: () => void;
}

export const TodayReviewCard: React.FC<Props> = ({ summary, onStart, onOpenReview }) => {
  const count = summary.questionIds.length;
  return <section aria-label="Ôn hôm nay" className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 p-5 text-white shadow-xl sm:p-6">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-3">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-indigo-200"><CalendarClock size={23} /></span><div><h2 className="text-xl font-bold">Ôn hôm nay</h2><p className="text-xs text-indigo-200">Lịch ôn theo tiến độ của bạn</p></div></div>
        <p className="text-sm text-slate-200">{count ? `${count} câu cần ôn · Khoảng ${summary.estimatedMinutes} phút (ước tính 2 phút/câu)` : 'Không có câu đến hạn. Bạn có thể chọn câu mới trong mục Ôn tập.'}</p>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-rose-400/15 px-3 py-2 text-rose-200">Quá hạn: {summary.overdue}</span>
          <span className="rounded-lg bg-sky-400/15 px-3 py-2 text-sky-200">Đến hạn hôm nay: {summary.dueToday}</span>
          <span className="rounded-lg bg-amber-400/15 px-3 py-2 text-amber-200">Đang học lại: {summary.relearning}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
        <button type="button" onClick={onStart} disabled={!count} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 font-bold text-slate-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">Bắt đầu ôn <ArrowRight size={17} /></button>
        <button type="button" onClick={onOpenReview} className="min-h-11 rounded-xl border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10">Chọn mục để ôn</button>
      </div>
    </div>
  </section>;
};
