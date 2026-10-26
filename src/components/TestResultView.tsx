import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Question, TestResult } from '../types/quiz';
import { GeminiDebateDrawer } from './GeminiDebateDrawer';
import { AnswerExplanation } from './AnswerExplanation';
import { OptionContent } from './OptionContent';
import type { ReviewFilter } from './TestHistoryView';
import { formatTimeMinutesSeconds } from '../utils/quizEngine';
import {
  Award,
  CheckCircle,
  XCircle,
  HelpCircle,
  Eye,
  EyeOff,
  Sparkles,
  MessageSquare,
  RotateCcw,
  Clock,
  BarChart2,
  ChevronRight,
  TrendingUp,
  Maximize2,
  X,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Trash2,
  Flag,
} from 'lucide-react';

interface TestResultViewProps {
  result: TestResult;
  initialFilter?: ReviewFilter;
  fromHistory?: boolean;
  backLabel?: string;
  onRetakeTest: () => void;
  onBackToCategories: () => void;
  onOpenAnalyze: () => void;
  onDeleteResult: () => void;
  studyFlags?: Record<string, boolean>;
  onToggleStudyFlag?: (questionId: string) => void;
  availableQuestionIds?: Set<string>;
}

export const TestResultView: React.FC<TestResultViewProps> = ({
  result,
  initialFilter = 'all',
  fromHistory = false,
  backLabel,
  onRetakeTest,
  onBackToCategories,
  onOpenAnalyze,
  onDeleteResult,
  studyFlags = {},
  onToggleStudyFlag,
  availableQuestionIds,
}) => {
  // CRITICAL REQUIREMENT: Default state is FALSE (hidden answers!)
  const [showAllAnswers, setShowAllAnswers] = useState(fromHistory);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(initialFilter);

  // Per-question reveal state: allows revealing answer for single specific question
  const [revealedQuestions, setRevealedQuestions] = useState<Record<string, boolean>>({});

  // Active debate question for Gemini Drawer
  const [activeDebateQuestion, setActiveDebateQuestion] = useState<Question | null>(null);

  // Full-screen image zoom state
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(()=>setZoomScale(1),[zoomImage]);

  useEffect(() => {
    // Trigger celebratory confetti if score is high (> 70%)
    if (result.scorePercentage >= 70) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Fallback if canvas confetti fails
      }
    }
  }, [result]);

  const toggleSingleQuestionAnswer = (qId: string) => {
    setRevealedQuestions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  const filteredQuestions = result.questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => {
      const answer = result.userAnswers[q.id];
      if (reviewFilter === 'incorrect') return answer !== null && answer !== undefined && answer !== q.correctAnswer;
      if (reviewFilter === 'skipped') return answer === null || answer === undefined;
      if (reviewFilter === 'correct') return answer === q.correctAnswer;
      return true;
    });

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32 sm:pb-16 px-3 sm:px-5">
      {/* Score Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-8 text-white shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 text-center md:text-left">
            <span className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <Award className="w-3.5 h-3.5 text-indigo-400" />
              <span>Kết Quả Bài Thi MCQ</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{result.title}</h1>
            <p className="text-xs text-slate-300">
              Thời gian hoàn thành: <strong>{formatTimeMinutesSeconds(result.durationSeconds)}</strong> • Ngày làm: {new Date(result.endTime).toLocaleDateString('vi-VN')}
            </p>
          </div>

          {/* Score Circle Badge */}
          <div className="flex items-center space-x-4 bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 shadow-inner shrink-0">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                {result.scorePercentage}%
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                Đúng {result.correctCount}/{result.totalQuestions} câu
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-slate-800 text-xs">
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-slate-400 font-medium">Đã trả lời</div>
            <div className="text-lg font-bold text-blue-300">{result.answeredCount}/{result.totalQuestions} câu</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-slate-400 font-medium">Số câu trả lời đúng</div>
            <div className="text-lg font-bold text-emerald-400">{result.correctCount} câu</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-slate-400 font-medium">Số câu chưa chính xác</div>
            <div className="text-lg font-bold text-red-400">{result.incorrectCount} câu</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-slate-400 font-medium">Bỏ trống chưa chọn</div>
            <div className="text-lg font-bold text-amber-400">{result.skippedCount} câu</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-slate-400 font-medium">Thời gian trung bình</div>
            <div className="text-lg font-bold text-indigo-300">
              {result.totalQuestions > 0 ? Math.round(result.durationSeconds / result.totalQuestions) : 0}s / câu
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={onRetakeTest}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Thi Lại Khối Này</span>
          </button>

          <button
            onClick={onBackToCategories}
            className="flex items-center space-x-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all"
          >
            <span>{backLabel || (fromHistory ? 'Về lịch sử bài thi' : 'Xem lịch sử bài thi')}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={onOpenAnalyze} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white">
            Xem Analyze
          </button>
          <button type="button" onClick={onDeleteResult} className="min-h-11 rounded-xl border border-red-500/60 px-4 text-xs font-bold text-red-200 hover:bg-red-950/60">
            <Trash2 className="mr-1 inline h-4 w-4" /> Xóa bài thi này
          </button>
        </div>
      </div>

      {/* Category Breakdown Progress */}
      {Object.keys(result.categoryBreakdown).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center space-x-2">
            <BarChart2 className="w-4 h-4 text-indigo-500" />
            <span>Thống Kê Tỷ Lệ Làm Đúng Theo Mục</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(result.categoryBreakdown).map((cat) => (
              <div key={cat.categoryId} className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                  <span className="truncate">{cat.categoryName}</span>
                  <span className="text-indigo-600 dark:text-indigo-400 shrink-0">
                    {cat.correct}/{cat.total} ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answer Key & Questions Review Header with TOGGLE BUTTON */}
      <div id="answer-review" className="scroll-mt-24 bg-white dark:bg-slate-800/90 rounded-3xl p-4 sm:p-7 border border-slate-200 dark:border-slate-700/80 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <span>Chi Tiết Lựa Chọn Của Bạn</span>
              {!showAllAnswers && (
                <span className="text-xs bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold px-2.5 py-0.5 rounded-full border border-amber-300/50">
                  Đáp án đang ẩn
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Để tự rà soát trước, đáp án chuẩn tạm thời ẩn. Nhấn "Hiện Tất Cả Đáp Án" để mở khóa đáp án &amp; lời giải!
            </p>
          </div>

          {/* EXPLICIT USER REQUIREMENT: Separate button to reveal all answers */}
          <button
            onClick={() => setShowAllAnswers(!showAllAnswers)}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md ${
              showAllAnswers
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30'
            }`}
          >
            {showAllAnswers ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-purple-300" />}
            <span>{showAllAnswers ? 'Ẩn Tất Cả Đáp Án' : 'Hiện Tất Cả Đáp Án'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc câu hỏi trong bài thi">
          {([
            ['all', `Tất cả (${result.totalQuestions})`],
            ['incorrect', `Sai (${result.incorrectCount})`],
            ['skipped', `Bỏ trống (${result.skippedCount})`],
            ['correct', `Đúng (${result.correctCount})`],
          ] as [ReviewFilter, string][]).map(([filter, label]) => (
            <button key={filter} type="button" onClick={() => setReviewFilter(filter)}
              aria-pressed={reviewFilter === filter}
              className={`min-h-11 rounded-xl px-3 text-xs font-bold transition-colors ${reviewFilter === filter
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Question Review List */}
        <div className="space-y-8">
          {filteredQuestions.map(({ q, index }) => {
            const userSelected = result.userAnswers[q.id];
            const isAnswered = userSelected !== undefined && userSelected !== null;
            const isCorrect = userSelected === q.correctAnswer;
            const isQuestionRevealed = showAllAnswers || !!revealedQuestions[q.id];

            return (
              <div
                key={q.id}
                className="p-4 sm:p-7 rounded-[28px] bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 space-y-5 shadow-sm"
              >
                {/* Header info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400">
                        Câu {index + 1}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {q.categoryName || 'Mục chung'}
                      </span>
                    </div>
                    <h3 className="max-w-4xl text-[15px] sm:text-base leading-7 font-semibold text-slate-900 dark:text-slate-100">{q.question}</h3>
                  </div>

                  {/* Status Indicator */}
                  {isQuestionRevealed ? (
                    <div className="shrink-0">
                      {isCorrect ? (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-300/50">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Chính xác</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-bold border border-red-300/50">
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                          <span>Chưa đúng</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800">
                      {isAnswered ? 'Đã làm' : 'Bỏ trống'}
                    </span>
                  )}
                </div>

                {/* Question Image if present */}
                {(q.images?.length ? q.images : q.imageUrl ? [q.imageUrl] : []).map((imageUrl, imageIndex) => (
                  <div key={imageIndex} className="p-2.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md space-y-1.5">
                    <div
                      onClick={() => setZoomImage(imageUrl)}
                      className="relative group cursor-pointer"
                      title="Bấm để phóng to xem hình ảnh"
                    >
                      <img
                        src={imageUrl}
                        alt="Hình minh họa"
                        className="max-h-48 object-contain rounded-xl mx-auto transition-transform group-hover:scale-[1.01]"
                      />
                      <div className="absolute inset-0 bg-black/25 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="px-2.5 py-1 bg-black/70 backdrop-blur text-white text-xs font-bold rounded-lg flex items-center space-x-1 shadow-md">
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Phóng to</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                      <span className="flex items-center space-x-1">
                        <ImageIcon className="w-3 h-3 text-indigo-500" />
                        <span>Hình minh họa</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setZoomImage(imageUrl)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                      >
                        Xem ảnh lớn
                      </button>
                    </div>
                  </div>
                ))}

                {/* Choices Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {q.options.map((opt, optIdx) => {
                    const isUserChoice = userSelected === optIdx;
                    const isCorrectChoice = optIdx === q.correctAnswer;

                    let choiceStyles = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';

                    if (isQuestionRevealed) {
                      if (isCorrectChoice) {
                        choiceStyles = 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold';
                      } else if (isUserChoice && !isCorrect) {
                        choiceStyles = 'bg-red-50 dark:bg-red-950/50 border-red-400 dark:border-red-700 text-red-900 dark:text-red-200 font-medium line-through';
                      }
                    } else if (isUserChoice) {
                      choiceStyles = 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 text-indigo-900 dark:text-indigo-200 font-bold';
                    }

                    return (
                      <div key={optIdx} className={`min-h-14 p-3.5 rounded-2xl border flex items-center space-x-3 ${choiceStyles}`}>
                        <span
                          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                            isQuestionRevealed && isCorrectChoice
                              ? 'bg-emerald-600 text-white'
                              : isUserChoice
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <OptionContent text={opt} images={q.optionImages?.[optIdx]} letter={String.fromCharCode(65 + optIdx)} onZoom={setZoomImage} />
                        {isUserChoice && <span className="text-[10px] italic text-indigo-500 font-normal">(Lựa chọn của bạn)</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Revealed Explanation */}
                {isQuestionRevealed && (q.explanation || q.explanationHtml || q.explanationPages?.length) &&
                  <AnswerExplanation question={q} onZoom={setZoomImage}/>}

                {/* ACTION BUTTONS FOR THIS QUESTION */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800/80">
                  {onToggleStudyFlag && availableQuestionIds?.has(q.id) && <button
                    type="button"
                    onClick={() => onToggleStudyFlag(q.id)}
                    aria-pressed={!!studyFlags[q.id]}
                    className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${studyFlags[q.id] ? 'border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                  ><Flag size={15} fill={studyFlags[q.id] ? 'currentColor' : 'none'} />{studyFlags[q.id] ? 'Đã gắn cờ học' : 'Gắn cờ học lại'}</button>}
                  <button
                    onClick={() => toggleSingleQuestionAnswer(q.id)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-all"
                  >
                    {isQuestionRevealed ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-indigo-500" />}
                    <span>{isQuestionRevealed ? 'Ẩn đáp án câu này' : 'Hiện đáp án câu này'}</span>
                  </button>

                  <button
                    onClick={() => setActiveDebateQuestion(q)}
                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-600/20 transition-all transform hover:-translate-y-0.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-200 animate-pulse" />
                    <span>Tranh Luận Cùng Gemini AI</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <nav aria-label="Xem đáp án" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-950/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <button type="button" onClick={() => {
          setShowAllAnswers(true);
          document.getElementById('answer-review')?.scrollIntoView({ behavior: 'smooth' });
        }} className="mx-auto block min-h-12 w-full max-w-lg rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white">
          Xem đáp án và lời giải
        </button>
      </nav>

      {/* Gemini Debate Drawer Modal */}
      {activeDebateQuestion && (
        <GeminiDebateDrawer
          isOpen={!!activeDebateQuestion}
          onClose={() => setActiveDebateQuestion(null)}
          question={activeDebateQuestion}
          userSelectedOption={result.userAnswers[activeDebateQuestion.id] ?? null}
        />
      )}

      {/* Lightbox Zoom Modal for Images */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 rounded-3xl p-3 border border-slate-700 shadow-2xl flex flex-col"
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-2 text-sm text-white"><span>Hình và bảng từ lời giải gốc</span><div className="flex items-center gap-2">
              <button type="button" aria-label="Thu nhỏ" onClick={()=>setZoomScale(v=>Math.max(0.75,v-0.25))} className="rounded-lg bg-slate-700 p-2 hover:bg-slate-600"><ZoomOut size={17}/></button>
              <span className="w-12 text-center text-xs">{Math.round(zoomScale*100)}%</span>
              <button type="button" aria-label="Phóng to" onClick={()=>setZoomScale(v=>Math.min(3,v+0.25))} className="rounded-lg bg-slate-700 p-2 hover:bg-slate-600"><ZoomIn size={17}/></button>
              <button type="button" aria-label="Đóng ảnh" onClick={()=>setZoomImage(null)} className="rounded-lg bg-slate-700 p-2 hover:bg-slate-600"><X size={17}/></button>
            </div></div>
            <div className="max-h-[80vh] overflow-auto rounded-xl bg-white text-center"><img src={zoomImage} alt="Phóng to hình ảnh" style={{width:`${zoomScale*100}%`,maxWidth:'none'}} className="mx-auto h-auto"/></div>
          </div>
        </div>
      )}
    </div>
  );
};
