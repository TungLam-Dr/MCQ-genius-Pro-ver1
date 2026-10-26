import React, { useState, useEffect, useRef } from 'react';
import { Question, TestConfig } from '../types/quiz';
import { OptionContent } from './OptionContent';
import { formatTimeMinutesSeconds } from '../utils/quizEngine';
import {
  Clock,
  Flag,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  Grid,
  Send,
  HelpCircle,
  Maximize2,
  X,
  Image as ImageIcon,
} from 'lucide-react';

interface TestRunnerProps {
  config: TestConfig;
  questions: Question[];
  studyFlags?: Record<string, boolean>;
  onToggleStudyFlag?: (questionId: string) => void;
  onSubmitTest: (
    userAnswers: Record<string, number | null>,
    flaggedQuestions: Record<string, boolean>,
    durationSeconds: number
  ) => void;
  onCancelTest: () => void;
}

export const TestRunner: React.FC<TestRunnerProps> = ({
  config,
  questions,
  studyFlags = {},
  onToggleStudyFlag,
  onSubmitTest,
  onCancelTest,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, number | null>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // Timer states
  const totalSecondsAllowed = config.timeLimitMinutes * 60;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(totalSecondsAllowed);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: React.TouchEvent) => {
    const target = event.target as HTMLElement;
    // Do not steal gestures from answer buttons, images, dialogs, or the question grid.
    if (target.closest('button, a, input, textarea, [role="dialog"], [data-no-swipe]')) {
      touchStart.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStart.current = touch.clientX < 24 || touch.clientX > window.innerWidth - 24
      ? null : { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || isPaused || showSubmitModal || zoomImage || event.changedTouches.length !== 1) return;
    const deltaX = event.changedTouches[0].clientX - start.x;
    const deltaY = event.changedTouches[0].clientY - start.y;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    setCurrentIndex(index => Math.max(0, Math.min(questions.length - 1, index + (deltaX < 0 ? 1 : -1))));
  };

  // Timer Effect
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);

      if (totalSecondsAllowed > 0) {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            // Auto-submit when time expires!
            handleFinalSubmit();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, totalSecondsAllowed]);

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const answeredCount = Object.values(userAnswers).filter((v) => v !== null && v !== undefined).length;
  const flaggedCount = Object.values(flaggedQuestions).filter(Boolean).length;

  const handleSelectOption = (optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: prev[currentQuestion.id] === optionIndex ? null : optionIndex,
    }));
  };

  const toggleFlag = (qId: string) => {
    setFlaggedQuestions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  const handleFinalSubmit = () => {
    onSubmitTest(userAnswers, flaggedQuestions, elapsedSeconds);
  };

  // Timer progress %
  const timerPercentage = totalSecondsAllowed > 0 ? Math.round((secondsRemaining / totalSecondsAllowed) * 100) : 100;
  const isTimeCritical = totalSecondsAllowed > 0 && secondsRemaining < 180; // less than 3 mins

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-32 md:pb-12">
      {/* Top Test Sticky Bar */}
      <div className="sticky top-16 z-20 bg-slate-900/95 backdrop-blur text-white p-4 rounded-2xl border border-slate-800 shadow-2xl flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2 rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 hidden sm:block">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold truncate">{config.title}</h2>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span>Đã làm: <strong className="text-indigo-400">{answeredCount}/{questions.length}</strong></span>
              <span>•</span>
              <span>Đã đánh dấu: <strong className="text-amber-400">{flaggedCount}</strong></span>
            </div>
          </div>
        </div>

        {/* Timer Display */}
        <div className="flex items-center space-x-3 shrink-0">
          {totalSecondsAllowed > 0 ? (
            <div
              className={`px-4 py-2 rounded-xl border flex items-center space-x-2 font-mono font-bold text-sm sm:text-base ${
                isTimeCritical
                  ? 'bg-red-950/80 border-red-500 text-red-300 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-indigo-300'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimeMinutesSeconds(secondsRemaining)}</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 bg-slate-800 rounded-xl border border-slate-700 text-xs font-mono text-slate-300">
              Thời gian: {formatTimeMinutesSeconds(elapsedSeconds)}
            </div>
          )}

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="min-w-11 min-h-11 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 border border-slate-700"
            title={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
          >
            {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="hidden sm:flex min-h-11 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 items-center space-x-1.5"
          >
            <Send className="w-4 h-4" />
            <span>Nộp Bài Thi</span>
          </button>
        </div>
      </div>

      {/* Paused Overlay Banner */}
      {isPaused && (
        <div className="p-6 bg-amber-950/60 border border-amber-800/80 rounded-2xl text-center text-amber-200 space-y-2">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="font-bold text-base">Bài thi đang được tạm dừng</h3>
          <p className="text-xs">Nhấn nút Play ở trên để tiếp tục tính thời gian và làm bài.</p>
        </div>
      )}

      {/* Main Runner Layout: Question Card + Grid Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Left Column: Current Question */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700 shadow-xl space-y-6">
            {/* Question Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-2">
                <span className="px-3 py-1 bg-indigo-600 text-white font-bold text-xs rounded-xl">
                  Câu {currentIndex + 1} / {questions.length}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {currentQuestion.categoryName || 'Mục chung'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleFlag(currentQuestion.id)}
                  className={`flex min-h-11 items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    flaggedQuestions[currentQuestion.id]
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/50'
                      : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{flaggedQuestions[currentQuestion.id] ? 'Đã đánh dấu bài thi' : 'Đánh dấu bài thi'}</span>
                </button>
                {onToggleStudyFlag && <button
                  type="button"
                  onClick={() => onToggleStudyFlag(currentQuestion.id)}
                  aria-pressed={!!studyFlags[currentQuestion.id]}
                  className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${studyFlags[currentQuestion.id] ? 'border-indigo-500 bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                >
                  <Flag className="h-3.5 w-3.5" fill={studyFlags[currentQuestion.id] ? 'currentColor' : 'none'} />
                  {studyFlags[currentQuestion.id] ? 'Đã lưu ôn lâu dài' : 'Lưu ôn lâu dài'}
                </button>}
              </div>
            </div>

            {/* Question Stem */}
            <div className="space-y-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-relaxed">
                {currentQuestion.question}
              </h3>

              {/* Question Image if present */}
              {(currentQuestion.images?.length ? currentQuestion.images : currentQuestion.imageUrl ? [currentQuestion.imageUrl] : []).map((imageUrl, imageIndex) => (
                <div key={imageIndex} data-no-swipe className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-xl mx-auto space-y-2">
                  <div
                    onClick={() => setZoomImage(imageUrl)}
                    className="relative group cursor-pointer"
                    title="Bấm để phóng to hình ảnh toàn màn hình"
                  >
                    <img
                      src={imageUrl}
                      alt="Hình vẽ câu hỏi"
                      className="max-h-64 object-contain rounded-xl mx-auto border border-slate-200 dark:border-slate-800 shadow-sm transition-transform group-hover:scale-[1.01]"
                    />
                    <div className="absolute inset-0 bg-black/25 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="px-3 py-1.5 bg-black/70 backdrop-blur text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-lg">
                        <Maximize2 className="w-4 h-4" />
                        <span>Bấm để phóng to</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <span className="flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Hình minh họa đề thi</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomImage(imageUrl)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1 font-semibold"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Phóng to toàn màn hình</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Choice Options */}
            <div className="space-y-3 pt-2">
              {currentQuestion.options.map((option, optIndex) => {
                const isSelected = userAnswers[currentQuestion.id] === optIndex;
                const letter = String.fromCharCode(65 + optIndex);

                return (
                  <button
                    type="button"
                    key={optIndex}
                    onClick={() => handleSelectOption(optIndex)}
                    aria-pressed={isSelected}
                    aria-label={`Đáp án ${letter}: ${option}`}
                    className={`w-full min-h-14 cursor-pointer p-4 text-left rounded-2xl border transition-all active:scale-[0.99] touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 flex items-start space-x-3.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {letter}
                    </span>
                    <OptionContent text={option} images={currentQuestion.optionImages?.[optIndex]} letter={letter} onZoom={setZoomImage} />
                  </button>
                );
              })}
            </div>

            {/* Clear choice button */}
            {userAnswers[currentQuestion.id] !== undefined && userAnswers[currentQuestion.id] !== null && (
              <div className="flex justify-end pt-1">
                <button
                  onClick={() =>
                    setUserAnswers((prev) => ({
                      ...prev,
                      [currentQuestion.id]: null,
                    }))
                  }
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
                >
                  Bỏ chọn đáp án này
                </button>
              </div>
            )}
          </div>

          {/* Bottom Navigation Buttons */}
          <div className="hidden md:flex items-center justify-between">
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="flex items-center space-x-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Câu trước</span>
            </button>

            <span className="text-xs text-slate-500 font-medium">
              Khối đề: {currentIndex + 1} / {questions.length}
            </span>

            <button
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex === questions.length - 1}
              className="flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-40"
            >
              <span>Câu tiếp</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Question Navigator Grid Sidebar */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-xl space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <Grid className="w-4 h-4 text-indigo-500" />
              <span>Danh Sách Câu Hỏi ({questions.length})</span>
            </h3>

            {/* Status Legend */}
            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-md bg-indigo-600" />
                <span>Đã trả lời</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-md bg-amber-500" />
                <span>Xem lại</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700" />
                <span>Chưa chọn</span>
              </div>
            </div>

            {/* Grid Buttons */}
            <div data-no-swipe className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = userAnswers[q.id] !== undefined && userAnswers[q.id] !== null;
                const isFlagged = flaggedQuestions[q.id];

                let colorClasses = 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300';
                if (isAnswered) {
                  colorClasses = 'bg-indigo-600 text-white font-bold';
                }
                if (isFlagged) {
                  colorClasses = 'bg-amber-500 text-white font-bold ring-2 ring-amber-300';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`min-h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center relative ${colorClasses} ${
                      isCurrent ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900' : ''
                    }`}
                  >
                    <span>{idx + 1}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowSubmitModal(true)}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Nộp Bài Ngay</span>
            </button>
          </div>
        </div>
      </div>

      {/* Thumb-reachable actions on phones, above the iOS home indicator. */}
      <nav aria-label="Điều hướng bài thi" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-950/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <button type="button" onClick={() => setCurrentIndex(index => Math.max(0, index - 1))} disabled={currentIndex === 0} className="min-h-12 flex-1 rounded-xl bg-slate-700 px-2 text-sm font-bold text-white disabled:opacity-40"><ChevronLeft className="inline size-4" /> Trước</button>
          <button type="button" onClick={() => setCurrentIndex(index => Math.min(questions.length - 1, index + 1))} disabled={currentIndex === questions.length - 1} className="min-h-12 flex-1 rounded-xl bg-indigo-600 px-2 text-sm font-bold text-white disabled:opacity-40">Tiếp <ChevronRight className="inline size-4" /></button>
          <button type="button" onClick={() => setShowSubmitModal(true)} className="min-h-12 flex-1 rounded-xl bg-emerald-600 px-2 text-sm font-bold text-white">Nộp bài</button>
        </div>
      </nav>

      {/* Modal: Submit Confirmation */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
              <HelpCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Xác Nhận Nộp Bài Thi MCQ</h3>

            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs space-y-2 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Tổng số câu:</span>
                <strong>{questions.length} câu</strong>
              </div>
              <div className="flex justify-between text-indigo-600 dark:text-indigo-400 font-bold">
                <span>Đã làm:</span>
                <span>{answeredCount} câu</span>
              </div>
              <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                <span>Bỏ trống chưa làm:</span>
                <span>{questions.length - answeredCount} câu</span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Bạn có chắc chắn muốn kết thúc bài thi và tính điểm số không?
            </p>

            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="px-5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                Tiếp tục làm
              </button>

              <button
                onClick={handleFinalSubmit}
                className="px-6 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30"
              >
                Nộp Bài Thi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Zoom Lightbox Modal */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl max-h-[90vh] bg-slate-900 rounded-3xl p-4 border border-slate-700 shadow-2xl flex flex-col items-center"
          >
            <button
              type="button"
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-800 text-white hover:bg-slate-700 shadow-lg"
              title="Đóng xem ảnh"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomImage}
              alt="Hình vẽ câu hỏi phóng to"
              className="max-h-[82vh] w-auto rounded-2xl object-contain mx-auto"
            />
            <p className="text-xs text-slate-400 mt-2">
              Câu {currentIndex + 1}: Hình minh họa đề thi
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
