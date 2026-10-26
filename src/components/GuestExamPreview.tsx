import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Send,
  X,
  XCircle,
  RotateCcw,
  Maximize2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type { SharedExamDraft } from '../types/quiz';
import { formatTimeMinutesSeconds } from '../utils/quizEngine';
import { OptionContent } from './OptionContent';

interface Props {
  draft: SharedExamDraft;
  onExitPreview: () => void;
}

interface Summary {
  correct: number;
  incorrect: number;
  skipped: number;
  elapsedSeconds: number;
}

/** Local owner preview. The public exam will later load questions and submit answers through a server API. */
export const GuestExamPreview: React.FC<Props> = ({ draft, onExitPreview }) => {
  const { questions, config } = draft;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const answersRef = useRef<Record<string, number | null>>({});
  const startedAt = useRef(Date.now());
  const deadline = useRef(config.timeLimitMinutes > 0 ? Date.now() + config.timeLimitMinutes * 60_000 : null);
  const finished = useRef(false);
  const [remaining, setRemaining] = useState(config.timeLimitMinutes * 60);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState(false);

  const submit = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    let correct = 0;
    let incorrect = 0;
    let skipped = 0;
    for (const q of questions) {
      const choice = answersRef.current[q.id];
      if (choice === null || choice === undefined) skipped += 1;
      else if (choice === q.correctAnswer) correct += 1;
      else incorrect += 1;
    }
    setSummary({
      correct,
      incorrect,
      skipped,
      elapsedSeconds: Math.floor((Date.now() - startedAt.current) / 1000),
    });
    setConfirmSubmit(false);
    setReviewMode(true);
  }, [questions]);

  useEffect(() => {
    const tick = () => {
      if (finished.current) return;
      const now = Date.now();
      setElapsed(Math.floor((now - startedAt.current) / 1000));
      if (deadline.current !== null) {
        const left = Math.max(0, Math.ceil((deadline.current - now) / 1000));
        setRemaining(left);
        if (left === 0) submit();
      }
    };
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [submit]);

  const choose = (questionId: string, optionIndex: number) => {
    if (summary) return; // Prevent changing after submission
    const next = { ...answersRef.current, [questionId]: optionIndex };
    answersRef.current = next;
    setAnswers(next);
  };

  const handleRetake = () => {
    answersRef.current = {};
    setAnswers({});
    startedAt.current = Date.now();
    deadline.current = config.timeLimitMinutes > 0 ? Date.now() + config.timeLimitMinutes * 60_000 : null;
    finished.current = false;
    setElapsed(0);
    setRemaining(config.timeLimitMinutes * 60);
    setSummary(null);
    setReviewMode(false);
    setIndex(0);
  };

  const answeredCount = Object.values(answers).filter((val) => val !== null && val !== undefined).length;
  const question = questions[index];
  const userChoice = question ? answers[question.id] : undefined;
  const hasAnswered = userChoice !== undefined && userChoice !== null;

  return (
    <div className="min-h-screen bg-slate-100 pb-28 text-slate-900 dark:bg-slate-950 dark:text-white sm:pb-12">
      {/* This banner belongs to the owner preview; it will not be in the public exam route. */}
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span>
            <strong>Bản xem thử trang thi trên máy bạn.</strong> (Chưa có link công khai gửi cho người khác)
          </span>
          <button
            type="button"
            onClick={onExitPreview}
            className="shrink-0 rounded-xl border border-amber-500 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
          >
            Thoát xem thử
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Header */}
        <header className="rounded-3xl bg-slate-900 p-5 text-white shadow-lg sm:p-7">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
            Xem Thử Giao Diện Thí Sinh Làm Bài
          </span>
          <h1 className="mt-2 break-words text-xl font-extrabold sm:text-2xl">{config.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <span>{questions.length} câu hỏi</span>
            {!summary && <span>Đã trả lời: {answeredCount}/{questions.length}</span>}
            {!summary && (
              <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-200">
                <Clock3 className="h-4 w-4" />
                {formatTimeMinutesSeconds(deadline.current === null ? elapsed : remaining)}
              </span>
            )}
          </div>
        </header>

        {/* Summary Screen */}
        {summary ? (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-slate-700 dark:bg-slate-800 sm:p-8">
              <h2 className="text-xl font-bold">Kết quả bài thi</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                Thời gian làm: {formatTimeMinutesSeconds(summary.elapsedSeconds)} · Tổng: {questions.length} câu
              </p>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-center">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Điểm số</span>
                  <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                    {Math.round((summary.correct / (questions.length || 1)) * 100)}%
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Trả lời đúng</span>
                  <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {summary.correct}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-center">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Trả lời sai</span>
                  <div className="text-3xl font-black text-red-600 dark:text-red-400 mt-1">
                    {summary.incorrect}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-center">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Bỏ trống</span>
                  <div className="text-3xl font-black text-amber-500 mt-1">
                    {summary.skipped}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-500 transition-all shadow-md"
                >
                  <RotateCcw className="h-4 w-4" /> Làm lại bài thi
                </button>
                <button
                  type="button"
                  onClick={onExitPreview}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Thoát xem thử
                </button>
              </div>
            </div>

            {/* Review questions detailed view */}
            {reviewMode && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xem lại toàn bộ {questions.length} câu hỏi
                </h3>
                {questions.map((q, qIdx) => {
                  const ans = answers[q.id];
                  const isCorrect = ans === q.correctAnswer;
                  const isSkipped = ans === null || ans === undefined;

                  return (
                    <article
                      key={q.id || qIdx}
                      className={`rounded-2xl border p-5 shadow-sm space-y-3 ${
                        isCorrect
                          ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20'
                          : isSkipped
                          ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
                          : 'border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          Câu {qIdx + 1} · {q.categoryName || 'Mục chung'}
                        </span>
                        <span
                          className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                            isCorrect
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                              : isSkipped
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}
                        >
                          {isCorrect ? 'Chính xác' : isSkipped ? 'Chưa trả lời' : 'Chưa đúng'}
                        </span>
                      </div>

                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{q.question}</p>

                      {/* Question image */}
                      {(q.images?.length ? q.images : q.imageUrl ? [q.imageUrl] : []).map((imgUrl, iIdx) => (
                        <div key={iIdx} className="my-2">
                          <img
                            src={imgUrl}
                            alt="Hình vẽ minh họa"
                            onClick={() => setZoomImage(imgUrl)}
                            className="max-h-48 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer object-contain"
                          />
                        </div>
                      ))}

                      {/* Options */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {q.options.map((opt, oIdx) => {
                          const isOptionCorrect = oIdx === q.correctAnswer;
                          const isOptionSelected = ans === oIdx;

                          return (
                            <div
                              key={oIdx}
                              className={`p-3 rounded-xl border flex items-center space-x-2 ${
                                isOptionCorrect
                                  ? 'border-emerald-500 bg-emerald-100/70 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-100 font-bold'
                                  : isOptionSelected
                                  ? 'border-red-500 bg-red-100/70 text-red-950 dark:bg-red-900/60 dark:text-red-100 font-medium'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span className="w-5 h-5 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center font-bold text-[10px] shrink-0">
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <OptionContent text={opt} images={q.optionImages?.[oIdx]} letter={String.fromCharCode(65 + oIdx)} onZoom={setZoomImage} />
                              {isOptionCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                              {!isOptionCorrect && isOptionSelected && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div className="mt-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                          <strong>Lời giải:</strong> {q.explanation}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          /* Question Taking View */
          question && (
            <div className="space-y-6">
              {/* Question card */}
              <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md dark:border-slate-700 dark:bg-slate-800 sm:p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    Câu hỏi {index + 1} / {questions.length} · {question.categoryName || 'Mục chung'}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {hasAnswered ? 'Đã chọn đáp án' : 'Chưa chọn'}
                  </span>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
                  {question.question}
                </h2>

                {/* Images */}
                {(question.images?.length ? question.images : question.imageUrl ? [question.imageUrl] : []).map(
                  (imgUrl, imgIdx) => (
                    <div key={imgIdx} className="my-3">
                      <div
                        onClick={() => setZoomImage(imgUrl)}
                        className="relative group cursor-pointer inline-block"
                        title="Bấm để phóng to hình ảnh"
                      >
                        <img
                          src={imgUrl}
                          alt="Hình ảnh minh họa"
                          className="max-h-60 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/30 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Maximize2 className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Options list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {question.options.map((opt, optIdx) => {
                    const isSelected = userChoice === optIdx;

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => choose(question.id, optIdx)}
                        className={`p-4 rounded-2xl border text-left flex items-center space-x-3 transition-all ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-950 dark:bg-indigo-950/60 dark:border-indigo-400 dark:text-indigo-100 font-bold ring-2 ring-indigo-500 shadow-md'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:border-indigo-300 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <OptionContent text={opt} images={question.optionImages?.[optIdx]} letter={String.fromCharCode(65 + optIdx)} onZoom={setZoomImage} />
                      </button>
                    );
                  })}
                </div>
              </article>

              {/* Question Navigation Matrix & Actions */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => setIndex((i) => Math.max(0, i - 1))}
                      className="min-h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold disabled:opacity-40 flex items-center space-x-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Câu trước</span>
                    </button>
                    <button
                      type="button"
                      disabled={index === questions.length - 1}
                      onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                      className="min-h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold disabled:opacity-40 flex items-center space-x-1"
                    >
                      <span>Câu tiếp</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setConfirmSubmit(true)}
                    className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center space-x-2 shadow-lg shadow-emerald-600/30"
                  >
                    <Send className="w-4 h-4" />
                    <span>Nộp bài thi</span>
                  </button>
                </div>

                {/* Quick Question Number Grid */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 block mb-2">Bảng câu hỏi nhanh:</span>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {questions.map((q, qIdx) => {
                      const isCurrent = qIdx === index;
                      const isFilled = answers[q.id] !== undefined && answers[q.id] !== null;

                      return (
                        <button
                          key={q.id || qIdx}
                          type="button"
                          onClick={() => setIndex(qIdx)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            isCurrent
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                              : isFilled
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {qIdx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </main>

      {/* Submit Confirmation Modal */}
      {confirmSubmit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setConfirmSubmit(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-indigo-600 dark:text-indigo-400">
              <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Xác nhận nộp bài?</h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Bạn đã hoàn thành <strong>{answeredCount}</strong> / <strong>{questions.length}</strong> câu hỏi.
              {answeredCount < questions.length && (
                <span className="text-amber-600 dark:text-amber-400 block mt-1">
                  (Còn {questions.length - answeredCount} câu chưa chọn đáp án)
                </span>
              )}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmit(false)}
                className="min-h-11 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                onClick={submit}
                className="min-h-11 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-600/30"
              >
                Xác nhận nộp ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Zoom Modal */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[85vh] bg-slate-900 rounded-3xl p-3 border border-slate-700 shadow-2xl flex flex-col items-center"
          >
            <button
              type="button"
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 shadow-md"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomImage}
              alt="Phóng to hình ảnh"
              className="max-h-[78vh] w-auto rounded-2xl object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
};