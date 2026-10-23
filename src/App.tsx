import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Category, Question, QuestionAttempt, SharedExamDraft, TestConfig, TestResult } from './types/quiz';
import { INITIAL_CATEGORIES, INITIAL_QUESTIONS } from './data/defaultQuestions';
import { selectQuestionsForBlock, calculateTestResult } from './utils/quizEngine';
import { buildQuestionAttempts } from './utils/analytics';
import { categorizeQuestionsWithGemini } from './services/gemini';
import { setStorageItem, getStorageItem } from './utils/storage';
import { Navbar } from './components/Navbar';
import { CategoryManager } from './components/CategoryManager';
import { TestHistoryView, type ReviewFilter } from './components/TestHistoryView';
import { GoatCountdownModal } from './components/GoatCountdownModal';
import { SharedExamDrafts } from './components/SharedExamDrafts';
import { publishExam } from './services/share';
import {
  FileUp,
  PlayCircle,
  FolderTree,
  Sparkles,
  BarChart3,
  ChevronRight,
  List,
  ArrowLeft,
  ClipboardList,
  Share2,
  Trash2,
} from 'lucide-react';

const FileUploadModal = lazy(() => import('./components/FileUploadModal').then(module => ({ default: module.FileUploadModal })));
const TestBlockCreator = lazy(() => import('./components/TestBlockCreator').then(module => ({ default: module.TestBlockCreator })));
const TestRunner = lazy(() => import('./components/TestRunner').then(module => ({ default: module.TestRunner })));
const TestResultView = lazy(() => import('./components/TestResultView').then(module => ({ default: module.TestResultView })));
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard').then(module => ({ default: module.AnalyticsDashboard })));
const GuestExamPreview = lazy(() => import('./components/GuestExamPreview').then(module => ({ default: module.GuestExamPreview })));

export default function App() {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [questions, setQuestions] = useState<Question[]>(INITIAL_QUESTIONS);
  const [testHistory, setTestHistory] = useState<TestResult[]>([]);
  const [questionAttempts, setQuestionAttempts] = useState<QuestionAttempt[]>([]);
  const [shareDrafts, setShareDrafts] = useState<SharedExamDraft[]>([]);
  const [activeShareDraft, setActiveShareDraft] = useState<SharedExamDraft | null>(null);
  const [pendingDeleteResult, setPendingDeleteResult] = useState<TestResult | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');

  // The question bank has its own page; the home page stays compact.
  const [activeTab, setActiveTab] = useState<'home' | 'questions' | 'history' | 'create-test' | 'runner' | 'result' | 'analyze' | 'share-drafts' | 'share-preview'>('home');
  const [questionListCategoryId, setQuestionListCategoryId] = useState<string | 'all'>('all');

  // Modals & Selection states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isGoatCountdownOpen, setIsGoatCountdownOpen] = useState(false);
  const [preselectedCatId, setPreselectedCatId] = useState<string | null>(null);
  const [isCategorizingAI, setIsCategorizingAI] = useState(false);

  // Active Test Run state
  const [currentTestConfig, setCurrentTestConfig] = useState<TestConfig | null>(null);
  const [currentTestQuestions, setCurrentTestQuestions] = useState<Question[]>([]);
  const [currentTestResult, setCurrentTestResult] = useState<TestResult | null>(null);
  const [resultFilter, setResultFilter] = useState<ReviewFilter>('all');
  const [viewingSavedResult, setViewingSavedResult] = useState(false);
  const [resultReturnTab, setResultReturnTab] = useState<'history' | 'analyze'>('history');

  // Hydrate full data from IndexedDB on initial mount
  useEffect(() => {
    let isMounted = true;
    async function hydrateFromStorage() {
      try {
        const [idbCats, idbQuestions, idbHistory, savedAttempts, idbShareDrafts] = await Promise.all([
          getStorageItem<Category[]>('mcq_genius_categories', INITIAL_CATEGORIES),
          getStorageItem<Question[]>('mcq_genius_questions', INITIAL_QUESTIONS),
          getStorageItem<TestResult[]>('mcq_genius_history', []),
          getStorageItem<QuestionAttempt[] | null>('mcq_genius_attempts', null),
          getStorageItem<SharedExamDraft[]>('mcq_genius_share_drafts', []),
        ]);
        // Upgrade old saved tests once. Reconcile any test saved just before an interrupted write.
        const recordedSessions = new Set((savedAttempts || []).map(attempt => attempt.sessionId));
        const missingTests = idbHistory.filter(result => !recordedSessions.has(result.sessionId));
        const attempts = [...(savedAttempts || []), ...buildQuestionAttempts(missingTests)];
        if (savedAttempts === null || missingTests.length) {
          await setStorageItem('mcq_genius_attempts', attempts);
        }
        if (isMounted) {
          setCategories(idbCats);
          setQuestions(idbQuestions);
          setTestHistory(idbHistory);
          setQuestionAttempts(attempts);
          setShareDrafts(idbShareDrafts);
          setStorageReady(true);
        }
      } catch (err) {
        console.warn('Error hydrating from storage:', err);
        if (isMounted) setStorageError('Không thể mở kho dữ liệu trên thiết bị. Vui lòng kiểm tra dung lượng bộ nhớ hoặc đóng các tab MCQ Genius khác rồi tải lại trang.');
      }
    }
    hydrateFromStorage();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    void setStorageItem('mcq_genius_categories', categories).catch(() => setStorageError('Không lưu được danh mục. Kiểm tra dung lượng thiết bị.'));
  }, [categories, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    void setStorageItem('mcq_genius_questions', questions).catch(() => setStorageError('Không lưu được câu hỏi và ảnh. Kiểm tra dung lượng thiết bị trước khi đóng trang.'));
  }, [questions, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    void setStorageItem('mcq_genius_history', testHistory).catch(() => setStorageError('Không lưu được lịch sử bài làm. Kiểm tra dung lượng thiết bị.'));
  }, [testHistory, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    void setStorageItem('mcq_genius_attempts', questionAttempts).catch(() => setStorageError('Không lưu được thống kê luyện tập. Kiểm tra dung lượng thiết bị.'));
  }, [questionAttempts, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    void setStorageItem('mcq_genius_share_drafts', shareDrafts).catch(() => setStorageError('Không lưu được bản nháp bài thi.'));
  }, [shareDrafts, storageReady]);

  // Handlers for Category & Questions
  const handleAddCategory = (name: string, description: string) => {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name,
      description,
      icon: 'FolderTree',
      color: 'from-purple-500 to-indigo-600',
      questionCount: 0,
      createdAt: new Date().toISOString(),
    };
    setCategories((prev) => [...prev, newCat]);
  };

  const handleDeleteCategory = (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    setQuestions((prev) => {
      const updated = prev.filter((q) => q.categoryId !== categoryId);
      updateCategoryCounts(updated);
      return updated;
    });
  };

  const handleDeleteQuestion = (questionId: string) => {
    setQuestions((prev) => {
      const updated = prev.filter((q) => q.id !== questionId);
      updateCategoryCounts(updated);
      return updated;
    });
  };

  const handleAddQuestion = (newQ: Partial<Question>) => {
    const targetCat = categories.find((c) => c.id === newQ.categoryId) || categories[0];
    const fullQuestion: Question = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      categoryId: targetCat.id,
      categoryName: targetCat.name,
      question: newQ.question || 'Câu hỏi chưa có tiêu đề',
      options: newQ.options && newQ.options.length >= 2 ? newQ.options : ['A', 'B', 'C', 'D'],
      correctAnswer: newQ.correctAnswer ?? 0,
      explanation: newQ.explanation || '',
      difficulty: newQ.difficulty || 'medium',
    };

    const updated = [fullQuestion, ...questions];
    setQuestions(updated);
    updateCategoryCounts(updated);
  };

  const handleImportQuestionsFromFile = (
    importedList: Partial<Question>[],
    targetCatId: string,
    newCatName?: string
  ) => {
    let finalCatId = targetCatId;
    let finalCatName = '';

    if (targetCatId === 'new') {
      const createdCat: Category = {
        id: `cat-${Date.now()}`,
        name: newCatName || 'Mục Mới Nhập',
        description: `Mục tự động trích xuất từ file (${importedList.length} câu)`,
        icon: 'FileText',
        color: 'from-blue-500 to-teal-600',
        questionCount: importedList.length,
        createdAt: new Date().toISOString(),
      };
      setCategories((prev) => [...prev, createdCat]);
      finalCatId = createdCat.id;
      finalCatName = createdCat.name;
    } else {
      const existingCat = categories.find((c) => c.id === targetCatId);
      finalCatName = existingCat ? existingCat.name : 'Mục Nhập';
    }

    const formatted: Question[] = importedList.map((item, idx) => ({
      id: `q-imp-${Date.now()}-${idx}`,
      categoryId: finalCatId,
      categoryName: finalCatName,
      question: item.question || `Câu hỏi ${idx + 1}`,
      options: item.options || [],
      correctAnswer: item.correctAnswer ?? -1,
      explanation: item.explanation || '',
      explanationHtml: item.explanationHtml,
      explanationPages: item.explanationPages,
      imageUrl: item.imageUrl,
      images: item.images,
      sourceId: item.sourceId,
      sourceBlock: item.sourceBlock,
      sourceNumber: item.sourceNumber,
      difficulty: item.difficulty || 'medium',
    }));

    const nextQuestions = [...formatted, ...questions];
    setQuestions(nextQuestions);
    updateCategoryCounts(nextQuestions);
  };

  const updateCategoryCounts = (currentQuestionsList: Question[]) => {
    setCategories((prev) =>
      prev.map((c) => ({
        ...c,
        questionCount: currentQuestionsList.filter((q) => q.categoryId === c.id).length,
      }))
    );
  };

  const handleAutoCategorizeAI = async () => {
    if (questions.length === 0) return;
    setIsCategorizingAI(true);
    try {
      const res = await categorizeQuestionsWithGemini(questions);
      if (res.categories && res.categories.length > 0) {
        const newCatList: Category[] = [];
        const updatedQuestions = [...questions];

        res.categories.forEach((catInfo) => {
          const catId = `cat-ai-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
          newCatList.push({
            id: catId,
            name: catInfo.name,
            description: catInfo.description || 'Mục do Gemini AI phân loại',
            icon: catInfo.icon || 'Sparkles',
            color: 'from-purple-500 to-indigo-600',
            questionCount: catInfo.questionIndices.length,
            createdAt: new Date().toISOString(),
          });

          catInfo.questionIndices.forEach((qIdx) => {
            if (updatedQuestions[qIdx]) {
              updatedQuestions[qIdx] = {
                ...updatedQuestions[qIdx],
                categoryId: catId,
                categoryName: catInfo.name,
              };
            }
          });
        });

        setCategories(newCatList);
        setQuestions(updatedQuestions);
      }
    } catch (err: any) {
      alert('Không thể chia mục bằng AI. ' + err.message);
    } finally {
      setIsCategorizingAI(false);
    }
  };

  const handleStartTestBlock = (config: TestConfig, generatedQuestions?: Question[]) => {
    const selectedBlockQuestions = generatedQuestions && generatedQuestions.length > 0
      ? generatedQuestions
      : selectQuestionsForBlock(questions, config);

    if (selectedBlockQuestions.length === 0) {
      alert('Không đủ câu hỏi trong ngân hàng dữ liệu để tạo khối bài thi này.');
      return;
    }

    setCurrentTestConfig(config);
    setCurrentTestQuestions(selectedBlockQuestions);
    setActiveTab('runner');
  };

  const handleSaveShareDraft = (config: TestConfig, generatedQuestions?: Question[]) => {
    const selectedDraftQuestions = generatedQuestions && generatedQuestions.length > 0
      ? generatedQuestions
      : selectQuestionsForBlock(questions, config);

    if (selectedDraftQuestions.length === 0) {
      alert('Không đủ câu hỏi để lưu bản đề nháp này.');
      return;
    }

    const newDraft: SharedExamDraft = {
      id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      config,
      questions: selectedDraftQuestions,
    };

    setShareDrafts((prev) => [newDraft, ...prev]);
    setActiveTab('share-drafts');
  };

  const handlePublishShareDraft = async (draft: SharedExamDraft, secret: string, onProgress: (message: string) => void) => {
    const url = await publishExam(draft, secret, onProgress);
    setShareDrafts(prev => prev.map(item => item.id === draft.id ? { ...item, shareUrl: url } : item));
    return url;
  };

  const handleDeleteShareDraft = (id: string) => {
    setShareDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handlePreviewShareDraft = (draft: SharedExamDraft) => {
    setActiveShareDraft(draft);
    setActiveTab('share-preview');
  };

  const handleStartMistakeReview = (mistakes: Question[]) => {
    if (!mistakes.length) return;
    const config: TestConfig = {
      title: `Ôn lại ${mistakes.length} câu từng làm sai`,
      presetType: 'custom',
      totalQuestions: mistakes.length,
      timeLimitMinutes: 0,
      selectionMode: 'random_mix',
      categorySelections: [],
      shuffleQuestions: false,
      shuffleOptions: false,
    };
    setCurrentTestConfig(config);
    setCurrentTestQuestions(mistakes.map(question => ({ ...question })));
    setActiveTab('runner');
  };

  const handleOpenSavedResult = (result: TestResult, filter: ReviewFilter, source: 'history' | 'analyze') => {
    setCurrentTestResult(result);
    setResultFilter(filter);
    setViewingSavedResult(true);
    setResultReturnTab(source);
    setActiveTab('result');
    window.scrollTo({ top: 0 });
  };

  const handleRetakeResult = (result: TestResult) => {
    if (!result.questions?.length) return;
    const config: TestConfig = result.testConfig ?? {
      title: `Thi lại: ${result.title}`,
      presetType: 'custom',
      totalQuestions: result.questions.length,
      timeLimitMinutes: 0,
      selectionMode: 'random_mix',
      categorySelections: [],
      shuffleQuestions: false,
      shuffleOptions: false,
    };
    setCurrentTestConfig(config);
    setCurrentTestQuestions(result.questions.map(question => ({ ...question })));
    setActiveTab('runner');
  };

  const handleSubmitTestBlock = (
    userAnswers: Record<string, number | null>,
    flaggedQuestions: Record<string, boolean>,
    durationSeconds: number
  ) => {
    if (!currentTestConfig || currentTestQuestions.length === 0) return;

    const result = calculateTestResult(
      currentTestQuestions,
      userAnswers,
      flaggedQuestions,
      durationSeconds,
      currentTestConfig.title
    );

    result.testConfig = currentTestConfig;
    setCurrentTestResult(result);
    setResultFilter('all');
    setViewingSavedResult(false);
    setResultReturnTab('history');
    setTestHistory((prev) => [result, ...prev]);
    setQuestionAttempts((prev) => [...prev, ...buildQuestionAttempts([result])]);
    setActiveTab('result');
  };

  const handleDeleteTestResult = (result: TestResult | null) => {
    if (!result) return;
    setPendingDeleteResult(result);
  };

  const confirmDeleteTest = (result: TestResult) => {
    setTestHistory((previous) => previous.filter((item) => item.sessionId !== result.sessionId));
    if (currentTestResult?.sessionId === result.sessionId) {
      setCurrentTestResult(null);
      if (activeTab === 'result') setActiveTab('history');
    }
  };

  const handleQuestionsGeneratedByAI = (newQList: any[], categoryName: string): Question[] => {
    const newCatId = `cat-ai-${Date.now()}`;
    const newCat: Category = {
      id: newCatId,
      name: categoryName,
      description: 'Mục câu hỏi do Gemini AI khởi tạo',
      icon: 'Sparkles',
      color: 'from-purple-500 to-pink-600',
      questionCount: newQList.length,
      createdAt: new Date().toISOString(),
    };

    const formattedQ: Question[] = newQList.map((item, idx) => ({
      id: `q-ai-${Date.now()}-${idx}`,
      categoryId: newCatId,
      categoryName,
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      difficulty: item.difficulty || 'medium',
    }));

    setCategories((prev) => [...prev, newCat]);
    setQuestions((prev) => [...formattedQ, ...prev]);
    return formattedQ;
  };

  const openQuestionList = (categoryId: string | 'all' = 'all') => {
    setQuestionListCategoryId(categoryId);
    setActiveTab('questions');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Navbar with Christmas theme, Snowfall animation, and Goat Icon */}
      <Navbar
        onOpenGoatCountdown={() => setIsGoatCountdownOpen(true)}
        onGoToHome={() => setActiveTab('home')}
      />

      {storageError && <div role="alert" className="mx-auto mt-4 max-w-4xl rounded-xl bg-red-100 p-4 text-sm font-semibold text-red-900">{storageError}</div>}
      {!storageReady && <div role="status" className="mx-auto mt-10 max-w-xl px-4 text-center text-sm text-slate-500">Đang tải câu hỏi và hình ảnh từ bộ nhớ thiết bị...</div>}

      {/* Main Container */}
      {storageReady && <Suspense fallback={<div role="status" className="p-6 text-center text-sm text-slate-500">Đang mở giao diện...</div>}><main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeTab === 'home' && (
          <>
            {/* HOME PAGE MAIN 3 ACTION CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Upload File */}
              <div
                onClick={() => setIsUploadModalOpen(true)}
                className="group cursor-pointer rounded-3xl p-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white border border-indigo-500/30 hover:border-indigo-400 shadow-xl transition-all transform hover:-translate-y-1 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shadow-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    CÔNG CỤ 1
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white group-hover:text-indigo-200 transition-colors">
                  Tải File Đề &amp; Đáp Án (Docs/Excel/PDF)
                </h2>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Trích xuất 100% câu hỏi (80+ câu), phương án A..G, hình ảnh &amp; ghép tự động nhiều file đáp án riêng.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-indigo-400 group-hover:text-indigo-300">
                  <span>Mở trình tải file</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Card 2: Create Test MCQ Block */}
              <div
                onClick={() => setActiveTab('create-test')}
                className="group cursor-pointer rounded-3xl p-6 bg-gradient-to-br from-purple-900 via-slate-900 to-purple-950 text-white border border-purple-500/30 hover:border-purple-400 shadow-xl transition-all transform hover:-translate-y-1 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center shadow-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <PlayCircle className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    CÔNG CỤ 2
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white group-hover:text-purple-200 transition-colors">
                  Tạo Đề Thi MCQ Trắc Nghiệm
                </h2>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Tạo khối thi 40 câu/30 phút, 50 câu/40 phút, tự chọn ngẫu nhiên theo từng mục chỉ định hoặc Gemini AI.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-purple-400 group-hover:text-purple-300">
                  <span>Thiết lập đề thi</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Card 3: Advanced Analyze & Study Diagnostics Hub */}
              <div
                onClick={() => setActiveTab('analyze')}
                className="group cursor-pointer rounded-3xl p-6 bg-gradient-to-br from-emerald-900 via-slate-900 to-emerald-950 text-white border border-emerald-500/30 hover:border-emerald-400 shadow-xl transition-all transform hover:-translate-y-1 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shadow-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    CÔNG CỤ 3 - ANALYZE
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white group-hover:text-emerald-200 transition-colors">
                  Analyze &amp; Phân Tích Chi Tiết
                </h2>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Xem số câu làm hôm nay, số câu sai, mục hay sai nhất, tạo đề ôn lại các câu từng sai &amp; nhận lời khuyên AI.
                </p>
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                  <span>Xem phân tích tiến độ</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>

            {/* Quick Links Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => openQuestionList()}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-indigo-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"><List className="h-5 w-5" /></span>
                  <span><span className="block text-sm font-bold text-slate-900 dark:text-white">Danh sách câu hỏi</span><span className="text-xs text-slate-500 dark:text-slate-400">{questions.length} câu</span></span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-indigo-500 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-indigo-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><ClipboardList className="h-5 w-5" /></span>
                  <span><span className="block text-sm font-bold text-slate-900 dark:text-white">Lịch sử bài thi</span><span className="text-xs text-slate-500 dark:text-slate-400">{testHistory.length} bài</span></span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-indigo-500 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('share-drafts')}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-amber-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="flex items-center gap-3">
                  <span className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"><Share2 className="h-5 w-5" /></span>
                  <span><span className="block text-sm font-bold text-slate-900 dark:text-white">Bài thi chuẩn bị chia sẻ</span><span className="text-xs text-slate-500 dark:text-slate-400">{shareDrafts.length} bản nháp</span></span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-amber-500 transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            {/* Category Manager Section */}
            <CategoryManager
              view="categories"
              categories={categories}
              questions={questions}
              onOpenQuestionList={openQuestionList}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              onDeleteQuestion={handleDeleteQuestion}
              onAddQuestion={handleAddQuestion}
              onOpenUpload={() => setIsUploadModalOpen(true)}
              onSelectCategoryForTest={(catId) => {
                setPreselectedCatId(catId);
                setActiveTab('create-test');
              }}
              onAutoCategorizeWithAI={handleAutoCategorizeAI}
              isCategorizingAI={isCategorizingAI}
            />
          </>
        )}

        {activeTab === 'questions' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <button type="button" onClick={() => setActiveTab('home')} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300"><ArrowLeft className="h-4 w-4" /> Trang chủ</button>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Danh sách câu hỏi</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{questions.length} câu hỏi trong {categories.length} mục</p>
              </div>
            </div>
            <CategoryManager
              key={questionListCategoryId}
              view="questions"
              initialCategoryId={questionListCategoryId}
              categories={categories}
              questions={questions}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              onDeleteQuestion={handleDeleteQuestion}
              onAddQuestion={handleAddQuestion}
              onOpenUpload={() => setIsUploadModalOpen(true)}
              onSelectCategoryForTest={(catId) => {
                setPreselectedCatId(catId);
                setActiveTab('create-test');
              }}
              onAutoCategorizeWithAI={handleAutoCategorizeAI}
              isCategorizingAI={isCategorizingAI}
            />
          </>
        )}

        {activeTab === 'history' && (
          <>
            <button type="button" onClick={() => setActiveTab('home')} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300"><ArrowLeft className="h-4 w-4" /> Trang chủ</button>
            <TestHistoryView testHistory={testHistory} onOpenResult={(result, filter) => handleOpenSavedResult(result, filter, 'history')} onDeleteResult={handleDeleteTestResult} />
          </>
        )}

        {activeTab === 'analyze' && (
          <AnalyticsDashboard
            testHistory={testHistory}
            questionAttempts={questionAttempts}
            allQuestions={questions}
            categories={categories}
            onStartMistakeReview={handleStartMistakeReview}
            onOpenResult={(result, filter) => handleOpenSavedResult(result, filter, 'analyze')}
            onShowHistory={() => setActiveTab('history')}
            onDeleteResult={handleDeleteTestResult}
          />
        )}

        {activeTab === 'create-test' && (
          <TestBlockCreator
            categories={categories}
            totalAvailableQuestions={questions.length}
            allQuestions={questions}
            onStartTest={handleStartTestBlock}
            onSaveShareDraft={handleSaveShareDraft}
            preselectedCategoryId={preselectedCatId}
            onQuestionsGeneratedByAI={handleQuestionsGeneratedByAI}
          />
        )}

        {activeTab === 'share-drafts' && (
          <>
            <button type="button" onClick={() => setActiveTab('home')} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-2"><ArrowLeft className="h-4 w-4" /> Trang chủ</button>
            <SharedExamDrafts
              drafts={shareDrafts}
              onCreate={() => setActiveTab('create-test')}
              onPreview={handlePreviewShareDraft}
              onDelete={handleDeleteShareDraft}
              onPublish={handlePublishShareDraft}
            />
          </>
        )}

        {activeTab === 'share-preview' && activeShareDraft && (
          <GuestExamPreview
            draft={activeShareDraft}
            onExitPreview={() => setActiveTab('share-drafts')}
          />
        )}

        {activeTab === 'runner' && currentTestConfig && currentTestQuestions.length > 0 && (
          <TestRunner
            config={currentTestConfig}
            questions={currentTestQuestions}
            onSubmitTest={handleSubmitTestBlock}
            onCancelTest={() => setActiveTab('home')}
          />
        )}

        {activeTab === 'result' && currentTestResult && (
          <TestResultView
            key={`${currentTestResult.sessionId}-${resultFilter}-${viewingSavedResult}`}
            result={currentTestResult}
            initialFilter={resultFilter}
            fromHistory={viewingSavedResult}
            backLabel={viewingSavedResult && resultReturnTab === 'analyze' ? 'Về Analyze' : undefined}
            onRetakeTest={() => handleRetakeResult(currentTestResult)}
            onBackToCategories={() => setActiveTab(viewingSavedResult ? resultReturnTab : 'history')}
            onOpenAnalyze={() => setActiveTab('analyze')}
            onDeleteResult={() => handleDeleteTestResult(currentTestResult)}
          />
        )}
      </main></Suspense>}

      {/* Upload Modal */}
      {storageReady && isUploadModalOpen && <Suspense fallback={<div role="status" className="p-6 text-center text-sm">Đang mở tệp...</div>}><FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        categories={categories}
        onImportQuestions={handleImportQuestionsFromFile}
      /></Suspense>}

      {/* Goat Countdown & Motivation Modal for August 1, 2027 */}
      <GoatCountdownModal
        isOpen={isGoatCountdownOpen}
        onClose={() => setIsGoatCountdownOpen(false)}
      />

      {/* Delete Test Confirmation Modal */}
      {pendingDeleteResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/60">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Xóa bài thi khỏi lịch sử?</h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Bạn có chắc muốn xóa bài thi <strong className="text-slate-900 dark:text-white">“{pendingDeleteResult.title}”</strong>?
            </p>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p>• Chi tiết từng câu và đáp án của bài thi này sẽ không thể xem lại.</p>
              <p>• Thống kê số lần làm và số lần sai từng câu vẫn được bảo lưu trong mục <strong>Analyze</strong>.</p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteResult(null)}
                className="min-h-11 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDeleteTest(pendingDeleteResult);
                  setPendingDeleteResult(null);
                }}
                className="min-h-11 px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xác nhận xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
