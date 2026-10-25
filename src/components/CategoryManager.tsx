import React, { useMemo, useState } from 'react';
import { Category, Question, QuestionAttempt } from '../types/quiz';
import {
  FolderPlus,
  Search,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  HelpCircle,
  CheckCircle,
  FileText,
  Calculator,
  Languages,
  Atom,
  Landmark,
  Code,
  FolderTree,
  Image as ImageIcon,
  ChevronRight,
  Filter,
  AlertTriangle,
  Flag,
  Maximize2,
  X,
} from 'lucide-react';

interface CategoryManagerProps {
  categories: Category[];
  questions: Question[];
  questionAttempts?: QuestionAttempt[];
  studyFlags?: Record<string, boolean>;
  onToggleStudyFlag?: (questionId: string) => void;
  onAddCategory: (categoryName: string, description: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onDeleteQuestion: (questionId: string) => void;
  onAddQuestion: (question: Partial<Question>) => void;
  onUpdateQuestionAnswer: (questionId: string, correctAnswer: number, explanation: string, options: string[]) => void;
  onOpenUpload: () => void;
  onSelectCategoryForTest: (categoryId: string) => void;
  onAutoCategorizeWithAI: () => void;
  isCategorizingAI: boolean;
  view?: 'all' | 'categories' | 'questions';
  initialCategoryId?: string | 'all';
  onOpenQuestionList?: (categoryId: string | 'all') => void;
  unansweredOnly?: boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Calculator,
  Languages,
  Atom,
  Landmark,
  Code,
  FolderTree,
  FileText,
};

const needsAnswer = (question: Question) =>
  question.options.length < 2 || !Number.isInteger(question.correctAnswer) ||
  question.correctAnswer < 0 || question.correctAnswer >= question.options.length;

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  categories,
  questions,
  questionAttempts = [],
  studyFlags = {},
  onToggleStudyFlag,
  onAddCategory,
  onDeleteCategory,
  onDeleteQuestion,
  onAddQuestion,
  onUpdateQuestionAnswer,
  onOpenUpload,
  onSelectCategoryForTest,
  onAutoCategorizeWithAI,
  isCategorizingAI,
  view = 'all',
  initialCategoryId = 'all',
  onOpenQuestionList,
  unansweredOnly = false,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all'>(initialCategoryId);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [practiceFilter, setPracticeFilter] = useState<'all' | 'unanswered' | 'unattempted' | 'attempted' | 'mistaken' | 'flagged'>('all');
  const [sortMode, setSortMode] = useState<'recent' | 'most-wrong' | 'most-practiced'>('recent');
  const [page, setPage] = useState(1);
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Confirmation modal state for fast category deletion
  const [catToDelete, setCatToDelete] = useState<Category | null>(null);

  // Add question modal state
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [newQText, setNewQText] = useState('');
  const [newQOptions, setNewQOptions] = useState(['', '', '', '']);
  const [newQCorrect, setNewQCorrect] = useState(0);
  const [newQExpl, setNewQExpl] = useState('');
  const [newQCatId, setNewQCatId] = useState(categories[0]?.id || '');
  const [newQImageUrl, setNewQImageUrl] = useState('');
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingAnswer, setEditingAnswer] = useState(-1);
  const [editingExplanation, setEditingExplanation] = useState('');
  const [editingOptions, setEditingOptions] = useState<string[]>([]);

  const practiceStats = useMemo(() => {
    const stats = new Map<string, { answered: number; incorrect: number }>();
    questionAttempts.forEach((attempt) => {
      const previous = stats.get(attempt.questionId) || { answered: 0, incorrect: 0 };
      stats.set(attempt.questionId, {
        answered: previous.answered + (attempt.answered ? 1 : 0),
        incorrect: previous.incorrect + (attempt.answered && !attempt.correct ? 1 : 0),
      });
    });
    return stats;
  }, [questionAttempts]);

  const bankCounts = useMemo(() => {
    const scoped = selectedCategoryId === 'all' ? questions : questions.filter((question) => question.categoryId === selectedCategoryId);
    return {
      all: scoped.length,
      unanswered: scoped.filter(needsAnswer).length,
      unattempted: scoped.filter((question) => (practiceStats.get(question.id)?.answered || 0) === 0).length,
      attempted: scoped.filter((question) => (practiceStats.get(question.id)?.answered || 0) > 0).length,
      mistaken: scoped.filter((question) => (practiceStats.get(question.id)?.incorrect || 0) > 0).length,
      flagged: scoped.filter((question) => !!studyFlags[question.id]).length,
    };
  }, [questions, practiceStats, selectedCategoryId, studyFlags]);

  // Search and practice filters share the same question bank.
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredQuestions = questions.filter((q) => {
    const matchCat = selectedCategoryId === 'all' || q.categoryId === selectedCategoryId;
    const matchSearch =
      q.question.toLowerCase().includes(normalizedSearch) ||
      q.options.some((opt) => opt.toLowerCase().includes(normalizedSearch)) ||
      (q.explanation || '').toLowerCase().includes(normalizedSearch) ||
      (q.sourceId || '').toLowerCase().includes(normalizedSearch) ||
      String(q.sourceNumber ?? '').includes(normalizedSearch) ||
      (q.categoryName || '').toLowerCase().includes(normalizedSearch);
    const matchDiff = filterDifficulty === 'all' || q.difficulty === filterDifficulty;
    const stats = practiceStats.get(q.id);
    const matchAnswer = !unansweredOnly || needsAnswer(q);
    const matchPractice = unansweredOnly || practiceFilter === 'all' ||
      (practiceFilter === 'unanswered' && needsAnswer(q)) ||
      (practiceFilter === 'unattempted' && !stats?.answered) ||
      (practiceFilter === 'attempted' && !!stats?.answered) ||
      (practiceFilter === 'mistaken' && !!stats?.incorrect) ||
      (practiceFilter === 'flagged' && !!studyFlags[q.id]);

    return matchCat && matchSearch && matchDiff && matchAnswer && matchPractice;
  });
  const visibleQuestionCount = unansweredOnly ? questions.filter(needsAnswer).length : questions.length;
  const sortedQuestions = [...filteredQuestions].sort((a, b) => {
    if (sortMode === 'most-wrong') return (practiceStats.get(b.id)?.incorrect || 0) - (practiceStats.get(a.id)?.incorrect || 0);
    if (sortMode === 'most-practiced') return (practiceStats.get(b.id)?.answered || 0) - (practiceStats.get(a.id)?.answered || 0);
    return 0; // Preserve bank order for the default view.
  });
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(sortedQuestions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageQuestions = sortedQuestions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openAnswerEditor = (question: Question) => {
    setEditingQuestion(question);
    setEditingAnswer(question.correctAnswer >= 0 && question.correctAnswer < question.options.length ? question.correctAnswer : -1);
    setEditingExplanation(question.explanation || '');
    setEditingOptions(question.options.length >= 2 ? [...question.options] : [...question.options, ...Array(Math.max(0, 2 - question.options.length)).fill('')]);
  };

  const saveAnswer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingQuestion || editingOptions.length < 2 || editingOptions.some((option) => !option.trim()) || editingAnswer < 0 || editingAnswer >= editingOptions.length) return;
    onUpdateQuestionAnswer(editingQuestion.id, editingAnswer, editingExplanation.trim(), editingOptions);
    setEditingQuestion(null);
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    onAddCategory(newCatName.trim(), newCatDesc.trim());
    setNewCatName('');
    setNewCatDesc('');
    setShowAddCatModal(false);
  };

  const handleConfirmDeleteCategory = () => {
    if (!catToDelete) return;
    onDeleteCategory(catToDelete.id);
    if (selectedCategoryId === catToDelete.id) {
      setSelectedCategoryId('all');
    }
    setCatToDelete(null);
  };

  const handleCreateQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQText.trim() || newQOptions.some((o) => !o.trim())) return;

    const targetCat = categories.find((c) => c.id === newQCatId) || categories[0];

    onAddQuestion({
      question: newQText.trim(),
      options: newQOptions.map((o) => o.trim()),
      correctAnswer: newQCorrect,
      explanation: newQExpl.trim(),
      imageUrl: newQImageUrl.trim() || undefined,
      categoryId: targetCat.id,
      categoryName: targetCat.name,
      difficulty: 'medium',
    });

    setNewQText('');
    setNewQOptions(['', '', '', '']);
    setNewQCorrect(0);
    setNewQExpl('');
    setNewQImageUrl('');
    setShowAddQuestionModal(false);
  };

  const currentSelectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-8">
      {/* Category Cards Grid: visible when view !== 'questions' */}
      {view !== 'questions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
              <FolderTree className="w-5 h-5 text-indigo-500" />
              <span>Danh Sách Các Mục Đã Lưu ({categories.length})</span>
            </h2>

            <button
              onClick={() => setShowAddCatModal(true)}
              className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <FolderPlus className="w-4 h-4" />
              <span>+ Tạo Mục Mới</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* "All" Category Pill Card */}
            <div
              onClick={() => {
                setSelectedCategoryId('all');
                if (onOpenQuestionList) {
                  onOpenQuestionList('all');
                }
              }}
              className={`cursor-pointer rounded-2xl p-4 transition-all border ${
                selectedCategoryId === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-xl shadow-indigo-600/20 ring-2 ring-indigo-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`p-2 rounded-xl ${
                    selectedCategoryId === 'all' ? 'bg-indigo-500/30 text-white' : 'bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  <FolderTree className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                  {questions.length} câu
                </span>
              </div>
              <h3 className="font-bold text-sm">Tất Cả Các Mục</h3>
              <p className="text-xs opacity-75 mt-1">Toàn bộ ngân hàng câu hỏi hiện có</p>
              {onOpenQuestionList && (
                <div className="mt-3 pt-2 border-t border-slate-200/20 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1">
                    Xem danh sách câu hỏi <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              )}
            </div>

            {/* Individual Category Cards with PROMINENT Delete Icon Button */}
            {categories.map((cat) => {
              const IconComponent = (cat.icon && ICON_MAP[cat.icon]) || FolderTree;
              const catQuestionsCount = questions.filter((q) => q.categoryId === cat.id).length;
              const isSelected = selectedCategoryId === cat.id;

              return (
                <div
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    if (onOpenQuestionList) {
                      onOpenQuestionList(cat.id);
                    }
                  }}
                  className={`group relative cursor-pointer rounded-2xl p-4 transition-all border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-indigo-500 shadow-xl ring-2 ring-indigo-500'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={`p-2 rounded-xl bg-gradient-to-r ${cat.color || 'from-indigo-500 to-purple-600'} text-white shadow-md`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {catQuestionsCount} câu
                      </span>

                      {/* PROMINENT TRASH BUTTON ON CARD */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setCatToDelete(cat);
                        }}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 transition-all shrink-0"
                        title="Xóa mục này và toàn bộ câu hỏi bên trong"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-bold text-sm line-clamp-1">{cat.name}</h3>
                  <p className="text-xs opacity-70 mt-1 line-clamp-2">{cat.description || 'Không có mô tả'}</p>

                  <div className="mt-3 pt-2 border-t border-slate-200/20 flex items-center justify-between">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCategoryForTest(cat.id);
                      }}
                      className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                    >
                      <span>Thi mục này</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    {onOpenQuestionList && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenQuestionList(cat.id);
                        }}
                        className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-500"
                      >
                        Xem câu
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Questions List Table: visible when view !== 'categories' */}
      {view !== 'categories' && (
        <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-5 shadow-lg space-y-4">
          {/* Category Chips Filter Bar inside Questions view */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => { setSelectedCategoryId('all'); setPage(1); }}
              className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                selectedCategoryId === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <span>Tất Cả</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">{visibleQuestionCount}</span>
            </button>
            {categories.map((cat) => {
              const count = questions.filter((q) => q.categoryId === cat.id && (!unansweredOnly || needsAnswer(q))).length;
              const isSel = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => { setSelectedCategoryId(cat.id); setPage(1); }}
                  className={`min-h-11 px-3 py-1.5 rounded-xl text-xs transition-all shrink-0 flex items-center gap-1.5 ${
                    isSel
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium'
                  }`}
                >
                  <span className="line-clamp-1 max-w-[150px]">{cat.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">{count}</span>
                </button>
              );
            })}
          </div>
          {!unansweredOnly && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2" aria-label="Lọc theo tình trạng học tập">
              {([
                ['all', 'Tất cả'],
                ['unattempted', 'Chưa làm'],
                ['attempted', 'Đã làm'],
                ['mistaken', 'Từng làm sai'],
                ['flagged', 'Đã gắn cờ'],
                ['unanswered', 'Chưa có đáp án'],
              ] as const).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => { setPracticeFilter(filter); setPage(1); }}
                  aria-pressed={practiceFilter === filter}
                  className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs font-bold transition-colors ${practiceFilter === filter
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}
                >
                  {label} <span className="ml-1 opacity-75">{bankCounts[filter]}</span>
                </button>
              ))}
            </div>
          )}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {unansweredOnly ? 'Câu hỏi chưa có đáp án' : 'Ngân hàng câu hỏi'} ({filteredQuestions.length})
              </h3>
              {selectedCategoryId !== 'all' && currentSelectedCategoryObj && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold px-2.5 py-0.5 rounded-full">
                    Mục: {currentSelectedCategoryObj.name}
                  </span>

                  {/* DIRECT DELETE CATEGORY BUTTON IN QUESTION HEADER */}
                  <button
                    onClick={() => setCatToDelete(currentSelectedCategoryObj)}
                    className="px-2.5 py-1 bg-red-500/10 hover:bg-red-600 text-red-600 hover:text-white border border-red-500/30 rounded-lg text-xs font-bold transition-all flex items-center space-x-1"
                    title="Xóa nhanh toàn bộ mục này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa Mục Này</span>
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {unansweredOnly ? 'Chọn “Sửa đáp án” để bổ sung đáp án. Câu đã sửa sẽ tự rời danh sách này.' : 'Tìm kiếm, xem chi tiết câu hỏi, hình ảnh và đáp án chuẩn.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 min-w-[180px] sm:w-56">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="Tìm câu hỏi, mã câu, lời giải..."
                aria-label="Tìm câu hỏi"
                className="w-full min-h-11 pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200"
              />
            </div>

            <select
              value={sortMode}
              onChange={(event) => { setSortMode(event.target.value as typeof sortMode); setPage(1); }}
              aria-label="Sắp xếp câu hỏi"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="recent">Mới nhập trước</option>
              <option value="most-wrong">Sai nhiều trước</option>
              <option value="most-practiced">Làm nhiều trước</option>
            </select>

            <button
              onClick={() => setShowAddQuestionModal(true)}
              className="flex min-h-11 items-center space-x-1 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Thủ Công</span>
            </button>
          </div>
        </div>

        {/* Question Cards */}
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <HelpCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Không tìm thấy câu hỏi nào phù hợp.</p>
            <p className="text-xs text-slate-400">{unansweredOnly ? 'Không còn câu hỏi thiếu đáp án trong mục đang xem.' : 'Hãy nhấn "Tải Đề Từ Docs/Excel/PDF" hoặc thêm câu hỏi mới vào mục này.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pageQuestions.map((q, index) => {
              const isUnanswered =
                q.correctAnswer === undefined ||
                q.correctAnswer === null ||
                q.correctAnswer < 0 ||
                q.correctAnswer >= (q.options?.length || 0);

              return (
                <div
                  key={q.id || index}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isUnanswered
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700/60 hover:border-indigo-400/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400">Câu {q.sourceNumber ?? (currentPage - 1) * pageSize + index + 1}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {q.categoryName || 'Mục chung'}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Đã làm {practiceStats.get(q.id)?.answered || 0} lần · Sai {practiceStats.get(q.id)?.incorrect || 0} lần
                        </span>

                        {isUnanswered && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-bold border border-amber-300/60 flex items-center space-x-1">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            <span>Chưa có đáp án (Không khả dụng tạo đề)</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{q.question}</p>
                    </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {onToggleStudyFlag && <button
                      type="button"
                      onClick={() => onToggleStudyFlag(q.id)}
                      aria-label={studyFlags[q.id] ? 'Bỏ cờ học tập' : 'Gắn cờ học tập'}
                      aria-pressed={!!studyFlags[q.id]}
                      className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg ${studyFlags[q.id] ? 'bg-amber-100 text-amber-600' : 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'}`}
                    ><Flag size={16} fill={studyFlags[q.id] ? 'currentColor' : 'none'} /></button>}
                    <button
                      type="button"
                      onClick={() => openAnswerEditor(q)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="h-4 w-4" /> Sửa đáp án
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteQuestion(q.id)}
                      className="min-h-11 min-w-11 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Xóa câu hỏi này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Question Image if present */}
                {(q.images?.length ? q.images : q.imageUrl ? [q.imageUrl] : []).map((imageUrl, imageIndex) => (
                  <div key={imageIndex} className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-w-md space-y-1.5">
                    <div
                      onClick={() => setPreviewZoomImage(imageUrl)}
                      className="relative group cursor-pointer"
                      title="Bấm để phóng to xem chi tiết hình ảnh"
                    >
                      <img
                        src={imageUrl}
                        alt="Hình minh họa câu hỏi"
                        className="max-h-44 rounded-lg object-contain mx-auto transition-transform group-hover:scale-[1.01]"
                      />
                      <div className="absolute inset-0 bg-black/25 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
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
                        onClick={() => setPreviewZoomImage(imageUrl)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                      >
                        Xem ảnh lớn
                      </button>
                    </div>
                  </div>
                ))}

                {/* Choices Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {q.options.map((opt, optIdx) => {
                    const isCorrect = optIdx === q.correctAnswer;
                    return (
                      <div
                        key={optIdx}
                        className={`p-2.5 rounded-lg border flex items-center space-x-2 ${
                          isCorrect
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-200 font-medium'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                            isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {isCorrect && <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation if present */}
                {q.explanation && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 p-2.5 rounded-lg italic">
                    <strong className="not-italic text-indigo-500">Lời giải: </strong>
                    {q.explanation}
                  </p>
                )}
              </div>
            );
          })}
          </div>
        )}
        {filteredQuestions.length > pageSize && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <span>Trang {currentPage}/{totalPages} · {filteredQuestions.length} câu</span>
            <div className="flex gap-2">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded-xl border border-slate-300 px-3 disabled:opacity-40 dark:border-slate-600">Trước</button>
              <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded-xl border border-slate-300 px-3 disabled:opacity-40 dark:border-slate-600">Tiếp</button>
            </div>
          </div>
        )}
      </div>
      )}

      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={saveAnswer} className="w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl max-h-[90vh] dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold">Sửa đáp án câu hỏi</h3>
            <p className="text-sm font-semibold">{editingQuestion.question}</p>
            {(editingQuestion.images?.length ? editingQuestion.images : editingQuestion.imageUrl ? [editingQuestion.imageUrl] : []).map((src, index) => (
              <img key={index} src={src} alt={`Hình câu hỏi ${index + 1}`} className="max-h-44 w-full object-contain" />
            ))}
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-bold">Chọn một đáp án đúng</legend>
              {editingOptions.map((option, index) => (
                <div key={index} className={`flex min-h-11 items-center gap-3 rounded-xl border p-2 text-sm ${editingAnswer === index ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="radio" name="correct-answer" aria-label={`Chọn đáp án ${String.fromCharCode(65 + index)}`} checked={editingAnswer === index} onChange={() => setEditingAnswer(index)} />
                  <label className="flex min-w-0 flex-1 items-center gap-2 font-bold">{String.fromCharCode(65 + index)}.
                    <input type="text" value={option} onChange={(event) => setEditingOptions((previous) => previous.map((value, optionIndex) => optionIndex === index ? event.target.value : value))} placeholder={`Phương án ${String.fromCharCode(65 + index)}`} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 font-normal dark:border-slate-600 dark:bg-slate-800" />
                  </label>
                </div>
              ))}
              <button type="button" onClick={() => setEditingOptions((previous) => [...previous, ''])} className="min-h-11 rounded-xl border border-indigo-300 px-3 text-xs font-bold text-indigo-700 dark:text-indigo-300">+ Thêm phương án</button>
            </fieldset>
            <label className="block text-sm font-bold">Lời giải (tùy chọn)
              <textarea value={editingExplanation} onChange={(event) => setEditingExplanation(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal dark:border-slate-600 dark:bg-slate-800" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingQuestion(null)} className="min-h-11 rounded-xl px-4 text-sm font-semibold">Hủy</button>
              <button type="submit" disabled={editingAnswer < 0 || editingOptions.some((option) => !option.trim())} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Lưu đáp án</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: FAST CATEGORY DELETION CONFIRMATION */}
      {catToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Xác Nhận Xóa Mục</h3>
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                "{catToDelete.name}"
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa mục này cùng <strong className="text-red-500">{questions.filter((q) => q.categoryId === catToDelete.id).length} câu hỏi</strong> thuộc mục này không? Hành động này sẽ dọn dẹp danh sách ngay lập tức.
            </p>

            <div className="flex justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setCatToDelete(null)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteCategory}
                className="px-5 py-2.5 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-lg shadow-red-600/30 flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xóa Mục Ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Category */}
      {showAddCatModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Tạo Mục Câu Hỏi Mới</h3>
            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tên mục / Chủ đề *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="VD: Lập Trình React & TypeScript"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Mô tả ngắn</label>
                <textarea
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Mô tả phạm vi kiến thức của mục này..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCatModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md"
                >
                  Tạo Mục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Manual Question */}
      {showAddQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Thêm Câu Hỏi Trắc Nghiệm Mới</h3>
            <form onSubmit={handleCreateQuestionSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Mục lưu trữ</label>
                <select
                  value={newQCatId}
                  onChange={(e) => setNewQCatId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nội dung câu hỏi *</label>
                <textarea
                  required
                  value={newQText}
                  onChange={(e) => setNewQText(e.target.value)}
                  placeholder="Nhập đề bài câu hỏi..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Các phương án lựa chọn (A, B, C, D) *</label>
                {newQOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setNewQCorrect(idx)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                        newQCorrect === idx ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                      title={newQCorrect === idx ? 'Đáp án đúng' : 'Nhấn để chọn làm đáp án đúng'}
                    >
                      {String.fromCharCode(65 + idx)}
                    </button>
                    <input
                      type="text"
                      required
                      value={opt}
                      onChange={(e) => {
                        const updated = [...newQOptions];
                        updated[idx] = e.target.value;
                        setNewQOptions(updated);
                      }}
                      placeholder={`Lựa chọn ${String.fromCharCode(65 + idx)}`}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100"
                    />
                  </div>
                ))}
              </div>

              {/* Question Image Attachment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Hình ảnh / Sơ đồ minh họa cho câu hỏi (Tùy chọn)
                </label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newQImageUrl}
                      onChange={(e) => setNewQImageUrl(e.target.value)}
                      placeholder="Dán URL ảnh hoặc tải ảnh từ thiết bị..."
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100"
                    />
                    <label className="cursor-pointer px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-1 shrink-0">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Tải ảnh</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                setNewQImageUrl(reader.result);
                              }
                            };
                            reader.readAsDataURL(f);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {newQImageUrl && (
                    <div className="relative inline-block border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 bg-slate-50 dark:bg-slate-900">
                      <img src={newQImageUrl} alt="Xem trước ảnh đính kèm" className="max-h-24 rounded-lg object-contain" />
                      <button
                        type="button"
                        onClick={() => setNewQImageUrl('')}
                        className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow"
                        title="Xóa ảnh này"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Lời giải thích (Không bắt buộc)</label>
                <textarea
                  value={newQExpl}
                  onChange={(e) => setNewQExpl(e.target.value)}
                  placeholder="Giải thích vì sao chọn đáp án này..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddQuestionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md"
                >
                  Lưu Câu Hỏi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Zoom Modal for Images */}
      {previewZoomImage && (
        <div
          onClick={() => setPreviewZoomImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[85vh] bg-slate-900 rounded-3xl p-3 border border-slate-700 shadow-2xl flex flex-col items-center"
          >
            <button
              type="button"
              onClick={() => setPreviewZoomImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 text-white hover:bg-slate-700 shadow-md"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewZoomImage}
              alt="Phóng to hình ảnh"
              className="max-h-[78vh] w-auto rounded-2xl object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
};
