import React, { useMemo, useState } from 'react';
import { Question, QuestionAttempt, TestResult } from '../types/quiz';
import { TestHistoryView, type ReviewFilter } from './TestHistoryView';
import {
  getTodayStatsFromAttempts,
  getCategoryWeaknessStatsFromAttempts,
  getMistakenQuestionsFromAttempts,
  getQuestionPracticeStats,
} from '../utils/analytics';
import { askGeminiDebate } from '../services/gemini';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Flame,
  Target,
  Brain,
  Award,
  Loader2,
  Search,
} from 'lucide-react';

interface AnalyticsDashboardProps {
  testHistory: TestResult[];
  questionAttempts: QuestionAttempt[];
  allQuestions: Question[];
  categories: { id: string; name: string }[];
  onStartMistakeReview: (questions: Question[]) => void;
  onOpenResult: (result: TestResult, filter: ReviewFilter) => void;
  onShowHistory: () => void;
  onDeleteResult: (result: TestResult) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  testHistory,
  questionAttempts,
  allQuestions,
  categories,
  onStartMistakeReview,
  onOpenResult,
  onShowHistory,
  onDeleteResult,
}) => {
  const todayStats = useMemo(() => getTodayStatsFromAttempts(questionAttempts), [questionAttempts]);
  const weaknessStats = useMemo(() => getCategoryWeaknessStatsFromAttempts(questionAttempts, categories), [questionAttempts, categories]);
  const mistakenQuestions = useMemo(() => getMistakenQuestionsFromAttempts(questionAttempts, allQuestions), [questionAttempts, allQuestions]);
  const questionStats = useMemo(() => getQuestionPracticeStats(allQuestions, questionAttempts), [allQuestions, questionAttempts]);

  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionCategory, setQuestionCategory] = useState('all');
  const [questionFilter, setQuestionFilter] = useState<'all' | 'unanswered' | 'wrong' | 'practiced'>('all');
  const [visibleCount, setVisibleCount] = useState(50);

  const filteredQuestionStats = questionStats
    .map((stat, index) => ({ ...stat, index }))
    .filter(stat => {
      if (questionCategory !== 'all' && stat.question.categoryId !== questionCategory) return false;
      if (questionFilter === 'unanswered' && stat.answered !== 0) return false;
      if (questionFilter === 'wrong' && stat.incorrect === 0) return false;
      if (questionFilter === 'practiced' && stat.answered === 0) return false;
      const search = questionSearch.trim().toLocaleLowerCase('vi-VN');
      return !search || `${stat.index + 1} ${stat.question.sourceNumber || ''} ${stat.question.question} ${stat.question.categoryName}`
        .toLocaleLowerCase('vi-VN').includes(search);
    });

  const handleStartReviewMistakes = () => {
    if (mistakenQuestions.length === 0) {
      alert('Bạn chưa có câu nào làm sai trong lịch sử làm bài!');
      return;
    }

    onStartMistakeReview(mistakenQuestions);
  };

  const handleGetAiAdvice = async () => {
    setIsLoadingAi(true);
    try {
      const summaryPrompt = `Dưới đây là thống kê kết quả ôn tập trắc nghiệm của học viên:
- Hôm nay đã làm: ${todayStats.totalSolvedToday} câu (Đúng: ${todayStats.correctToday}, Sai: ${todayStats.incorrectToday})
- Chi tiết tỷ lệ đúng theo Mục:
${weaknessStats
  .map(
    (s) =>
      `+ Mục "${s.categoryName}": Đã làm ${s.totalAttempted} câu, Đúng ${s.correctCount}, Sai ${s.incorrectCount} (Tỷ lệ: ${s.accuracyPercentage}%)`
  )
  .join('\n')}

Hãy đưa ra lời khuyên chiến lược ôn luyện chuyên sâu, ngắn gọn (3-4 điểm chính) giúp học viên khắc phục điểm yếu và bứt phá điểm số cho kỳ thi quan trọng!`;

      const responseText = await askGeminiDebate({
        question: 'Phân tích tiến độ học tập và tư vấn lộ trình ôn luyện tối ưu',
        options: ['A. Tối ưu điểm yếu', 'B. Luyện đề tốc độ', 'C. Củng cố lý thuyết', 'D. Tất cả các phương án'],
        correctAnswer: 3,
        userSelectedOption: 3,
        explanation: 'Phân tích tiến độ học tập',
        userMessage: summaryPrompt,
      });

      setAiAdvice(responseText);
    } catch (err: any) {
      alert('Chưa thể kết nối với Gemini AI. ' + err.message);
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 md:p-8 shadow-2xl text-white">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Analyze &amp; Chẩn Đoán Tiến Độ Học Tập</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Phân Tích Tiến Độ &amp; Điểm Yếu
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Theo dõi số câu đã giải hôm nay, phân tích mục nào bị sai nhiều nhất và tự động tạo đề ôn luyện lại các câu từng làm sai!
            </p>
          </div>

          {mistakenQuestions.length > 0 && (
            <button
              onClick={handleStartReviewMistakes}
              className="flex items-center space-x-2 px-5 py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-extrabold rounded-2xl shadow-xl shadow-red-600/30 transition-all transform hover:scale-105 shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Ôn Lại {mistakenQuestions.length} Câu Làm Sai</span>
            </button>
          )}
        </div>
      </div>

      <TestHistoryView
        compact
        testHistory={testHistory}
        onOpenResult={onOpenResult}
        onDeleteResult={onDeleteResult}
        onShowAll={onShowHistory}
      />

      {/* TODAY'S PERFORMANCE CARDS */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4 flex items-center space-x-2">
          <Flame className="w-4 h-4 text-amber-500" />
          <span>Thống Kê Kết Quả Làm Bài Hôm Nay</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Đã làm hôm nay</div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {todayStats.totalSolvedToday} <span className="text-xs font-normal">câu</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Trả lời đúng</div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {todayStats.correctToday} <span className="text-xs font-normal">câu</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Trả lời sai</div>
            <div className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400 mt-1">
              {todayStats.incorrectToday} <span className="text-xs font-normal">câu</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Tỷ lệ chính xác</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-500 mt-1">
              {todayStats.accuracyToday}%
            </div>
          </div>
        </div>
      </div>

      {/* Persistent per-question practice counts, including questions never answered. */}
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Thống kê từng câu hỏi</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {allQuestions.length} câu trong thư viện · Số lần trả lời và số lần sai vẫn được giữ khi bạn xóa bài thi khỏi lịch sử.
          </p>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <label className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input
              type="search"
              value={questionSearch}
              onChange={event => { setQuestionSearch(event.target.value); setVisibleCount(50); }}
              placeholder="Tìm số câu hoặc nội dung..."
              aria-label="Tìm câu hỏi"
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <select value={questionCategory} onChange={event => { setQuestionCategory(event.target.value); setVisibleCount(50); }}
            aria-label="Lọc theo mục" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
            <option value="all">Tất cả các mục</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={questionFilter} onChange={event => { setQuestionFilter(event.target.value as typeof questionFilter); setVisibleCount(50); }}
            aria-label="Lọc theo kết quả" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900">
            <option value="all">Tất cả câu hỏi</option>
            <option value="unanswered">Chưa từng trả lời</option>
            <option value="wrong">Đã từng trả lời sai</option>
            <option value="practiced">Đã từng trả lời</option>
          </select>
        </div>
        <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Hiển thị {filteredQuestionStats.length}/{allQuestions.length} câu</p>
        <div className="max-h-[680px] space-y-2 overflow-y-auto pr-1">
          {filteredQuestionStats.slice(0, visibleCount).map(stat => (
            <details key={stat.question.id} className="group rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
              <summary className="flex min-h-14 cursor-pointer list-none flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300">Câu {stat.index + 1} · {stat.question.categoryName || 'Mục chung'}</span>
                  <p className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">{stat.question.question}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 text-xs font-bold">
                  <span className="rounded-lg bg-blue-100 px-2 py-1 text-blue-800 dark:bg-blue-950 dark:text-blue-200">Đã làm {stat.answered} lần</span>
                  <span className="rounded-lg bg-red-100 px-2 py-1 text-red-800 dark:bg-red-950 dark:text-red-200">Sai {stat.incorrect} lần</span>
                </div>
              </summary>
              <div className="border-t border-slate-200 px-3 pb-4 pt-3 text-sm dark:border-slate-700">
                <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{stat.question.question}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Xuất hiện trong đề: {stat.presented} lần · Đúng: {stat.correct} · Sai: {stat.incorrect} · Bỏ trống: {stat.skipped}
                </p>
              </div>
            </details>
          ))}
          {filteredQuestionStats.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Không có câu hỏi phù hợp.</p>}
        </div>
        {filteredQuestionStats.length > visibleCount && (
          <button type="button" onClick={() => setVisibleCount(count => count + 50)}
            className="mt-4 min-h-11 w-full rounded-xl border border-indigo-300 text-sm font-bold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300">
            Xem thêm câu hỏi ({Math.min(visibleCount, filteredQuestionStats.length)}/{filteredQuestionStats.length})
          </button>
        )}
      </section>

      {/* CATEGORY WEAKNESS ANALYSIS */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center space-x-2">
            <Target className="w-4 h-4 text-indigo-500" />
            <span>Phân Tích Chi Tiết Tỷ Lệ Làm Đúng Theo Mục</span>
          </h2>

          <button
            onClick={handleGetAiAdvice}
            disabled={isLoadingAi || questionAttempts.length === 0}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
          >
            {isLoadingAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-purple-200" />
            )}
            <span>Gemini AI Phân Tích Lộ Trình</span>
          </button>
        </div>

        {/* AI Advice Box */}
        {aiAdvice && (
          <div className="p-5 bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950 text-purple-100 rounded-2xl border border-purple-500/40 text-xs space-y-2 whitespace-pre-wrap leading-relaxed shadow-lg">
            <div className="font-bold text-purple-300 flex items-center space-x-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span>Lời Khuyên Ôn Luyện Từ Gemini AI Buddy:</span>
            </div>
            <div>{aiAdvice}</div>
          </div>
        )}

        {/* Weakness Heatmap Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weaknessStats.map((item) => (
            <div
              key={item.categoryId}
              className={`p-4 rounded-2xl border transition-all ${
                item.isWeakArea
                  ? 'bg-red-50/80 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                  : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {item.categoryName}
                    </h3>
                    {item.isWeakArea && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-extrabold shrink-0 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Cần ôn gấp</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Đã làm: {item.totalAttempted} câu • Đúng: <strong className="text-emerald-600">{item.correctCount}</strong> • Sai: <strong className="text-red-500">{item.incorrectCount}</strong>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`text-base font-extrabold ${
                      item.accuracyPercentage >= 70
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.accuracyPercentage >= 50
                        ? 'text-amber-500'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {item.accuracyPercentage}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    item.accuracyPercentage >= 70
                      ? 'bg-emerald-500'
                      : item.accuracyPercentage >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${item.totalAttempted > 0 ? item.accuracyPercentage : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};