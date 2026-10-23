import React from 'react';
import type { TestResult } from '../types/quiz';
import { Clock3, ChevronRight, CircleAlert, ClipboardList, RotateCcw, Trash2 } from 'lucide-react';

export type ReviewFilter = 'all' | 'incorrect' | 'skipped' | 'correct';

interface TestHistoryViewProps {
  testHistory: TestResult[];
  onOpenResult: (result: TestResult, filter: ReviewFilter) => void;
  onDeleteResult: (result: TestResult) => void;
  compact?: boolean;
  onShowAll?: () => void;
}

export const TestHistoryView: React.FC<TestHistoryViewProps> = ({
  testHistory, onOpenResult, onDeleteResult, compact = false, onShowAll,
}) => {
  const sessions = [...testHistory].sort((a, b) =>
    (Date.parse(b.endTime || b.startTime) || 0) - (Date.parse(a.endTime || a.startTime) || 0)
  );
  const visibleSessions = compact ? sessions.slice(0, 3) : sessions;
  const dateLabel = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Không rõ thời gian' :
      date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <ClipboardList className="h-5 w-5 text-indigo-500" /> Lịch sử bài thi
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{testHistory.length} bài đã nộp được lưu trên thiết bị này</p>
        </div>
        {compact && onShowAll && testHistory.length > 0 && (
          <button type="button" onClick={onShowAll} className="min-h-11 rounded-xl px-3 text-sm font-bold text-indigo-600 dark:text-indigo-300">
            Xem tất cả <ChevronRight className="inline h-4 w-4" />
          </button>
        )}
      </div>

      {testHistory.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Chưa có bài thi nào. Sau khi nộp bài, kết quả sẽ xuất hiện tại đây và trong Analyze.
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleSessions.map((result) => (
            <article key={result.sessionId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-white">{result.title}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock3 className="h-3.5 w-3.5" /> {dateLabel(result.endTime || result.startTime)}
                  </p>
                </div>
                <span className="rounded-xl bg-indigo-50 px-3 py-1.5 text-sm font-extrabold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                  {result.scorePercentage}%
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <span className="rounded-lg bg-slate-100 p-2 dark:bg-slate-700">Tổng: <strong>{result.totalQuestions}</strong></span>
                <span className="rounded-lg bg-blue-50 p-2 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">Đã làm: <strong>{result.answeredCount}</strong></span>
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">Đúng: <strong>{result.correctCount}</strong></span>
                <span className="rounded-lg bg-red-50 p-2 text-red-800 dark:bg-red-950/40 dark:text-red-200">Sai: <strong>{result.incorrectCount}</strong> · Bỏ: <strong>{result.skippedCount}</strong></span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => onOpenResult(result, 'all')} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500">
                  Xem lại toàn bộ bài
                </button>
                <button type="button" onClick={() => onOpenResult(result, 'incorrect')} disabled={!result.incorrectCount} className="min-h-11 rounded-xl bg-red-50 px-4 text-xs font-bold text-red-700 disabled:opacity-40 dark:bg-red-950/40 dark:text-red-200">
                  <CircleAlert className="mr-1 inline h-4 w-4" /> Xem {result.incorrectCount} câu sai
                </button>
                {result.skippedCount > 0 && (
                  <button type="button" onClick={() => onOpenResult(result, 'skipped')} className="min-h-11 rounded-xl bg-amber-50 px-4 text-xs font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <RotateCcw className="mr-1 inline h-4 w-4" /> Xem {result.skippedCount} câu bỏ trống
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteResult(result)}
                  aria-label={`Xóa bài thi ${result.title}`}
                  className="min-h-11 rounded-xl border border-red-200 px-4 text-xs font-bold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 sm:ml-auto"
                >
                  <Trash2 className="mr-1 inline h-4 w-4" /> Xóa bài thi
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};