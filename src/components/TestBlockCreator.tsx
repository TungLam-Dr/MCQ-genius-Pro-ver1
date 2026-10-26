import React, { useState } from 'react';
import { OptionContent } from './OptionContent';
import { CategorySourcePicker } from './CategorySourcePicker';
import { categoryPath, isFolder } from '../utils/categoryTree';
import { Category, CategorySelection, Question, TestConfig } from '../types/quiz';
import { generateQuestionsWithGemini } from '../services/gemini';
import { isQuestionValid, selectQuestionsForBlock } from '../utils/quizEngine';
import {
  Clock,
  Sparkles,
  Play,
  Shuffle,
  FolderTree,
  Sliders,
  Award,
  Zap,
  Loader2,
  AlertTriangle,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Maximize2,
  X,
  FileEdit,
  Share2,
  ChevronRight,
} from 'lucide-react';

interface TestBlockCreatorProps {
  categories: Category[];
  totalAvailableQuestions: number;
  allQuestions?: Question[];
  onStartTest: (config: TestConfig, generatedQuestions?: Question[]) => void;
  onSaveShareDraft: (config: TestConfig, generatedQuestions?: Question[]) => void;
  preselectedCategoryId?: string | null;
  onQuestionsGeneratedByAI?: (newQuestions: any[], categoryName: string) => Question[];
}

export const TestBlockCreator: React.FC<TestBlockCreatorProps> = ({
  categories,
  totalAvailableQuestions,
  allQuestions = [],
  onStartTest,
  onSaveShareDraft,
  preselectedCategoryId,
  onQuestionsGeneratedByAI,
}) => {
  const questionCategories = categories.filter(category => !isFolder(category));
  const [testTitle, setTestTitle] = useState('');
  // Preset choice: '40q_30m' | '50q_40m' | 'custom'
  const [presetType, setPresetType] = useState<'40q_30m' | '50q_40m' | 'custom'>('40q_30m');
  const [customQuestionCount, setCustomQuestionCount] = useState<number>(20);
  const [customTimeMinutes, setCustomTimeMinutes] = useState<number>(20);

  // Selection Strategy: 'categories' | 'random_mix' | 'ai_generated'
  const [selectionMode, setSelectionMode] = useState<'categories' | 'random_mix' | 'ai_generated'>('categories');
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  // Per category selection setup
  const [categorySelections, setCategorySelections] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    questionCategories.forEach((c) => {
      if (preselectedCategoryId && c.id === preselectedCategoryId) {
        initial[c.id] = Math.min(10, c.questionCount);
      } else {
        initial[c.id] = Math.min(5, c.questionCount);
      }
    });
    return initial;
  });

  const [selectedCatIds, setSelectedCatIds] = useState<Set<string>>(() => {
    if (preselectedCategoryId) return new Set([preselectedCategoryId]);
    return new Set<string>();
  });

  // AI Block Generator Prompt
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGenerateError, setAiGenerateError] = useState<string | null>(null);

  // Shuffles
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);

  // Question & Image Preview States
  const [showQuestionPreview, setShowQuestionPreview] = useState(false);
  const [onlyWithImagesFilter, setOnlyWithImagesFilter] = useState(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);

  // Calculate total questions requested from selected categories
  const availableByCategory = new Map<string, number>();
  for (const question of allQuestions) if (isQuestionValid(question)) {
    availableByCategory.set(question.categoryId, (availableByCategory.get(question.categoryId) || 0) + 1);
  }
  const calculatedCategoryQuestions = questionCategories.filter(category => selectedCatIds.has(category.id)).reduce(
    (sum, category) => sum + Math.min(categorySelections[category.id] || 1, availableByCategory.get(category.id) || 0),
    0
  );
  const questionLimit = presetType === '40q_30m' ? 40 : presetType === '50q_40m' ? 50 : customQuestionCount;
  const tooManyFromCategories = selectionMode === 'categories' && calculatedCategoryQuestions > questionLimit;

  const getEffectiveTotalQuestions = () => {
    return selectionMode === 'categories' ? Math.min(questionLimit, calculatedCategoryQuestions) : questionLimit;
  };

  const getEffectiveTimeLimit = () => {
    if (presetType === '40q_30m') return 30;
    if (presetType === '50q_40m') return 40;
    return customTimeMinutes;
  };

  const buildCurrentConfig = (): TestConfig => {
    const totalQ = getEffectiveTotalQuestions();
    const timeM = getEffectiveTimeLimit();

    const formattedSelections: CategorySelection[] = questionCategories
      .filter((c) => selectedCatIds.has(c.id))
      .map((c) => ({
        categoryId: c.id,
        categoryName: c.name,
        availableCount: availableByCategory.get(c.id) || 0,
        requestedCount: Math.min(categorySelections[c.id] || 1, availableByCategory.get(c.id) || 0),
      }));

    return {
      title: testTitle.trim() || `Đề thi MCQ Block (${totalQ} câu / ${timeM > 0 ? `${timeM} phút` : 'Tự do'})`,
      presetType,
      totalQuestions: totalQ,
      timeLimitMinutes: timeM,
      selectionMode,
      categorySelections: formattedSelections,
      shuffleQuestions,
      shuffleOptions,
    };
  };

  const handleStart = (action: 'start' | 'share' = 'start') => {
    if (tooManyFromCategories) return;
    if (selectionMode === 'categories' && calculatedCategoryQuestions === 0) {
      setSourcePickerOpen(true);
      return;
    }
    const config = buildCurrentConfig();
    const selectedQuestions = selectQuestionsForBlock(allQuestions, config);

    if (action === 'share') {
      onSaveShareDraft(config, selectedQuestions);
    } else {
      onStartTest(config, selectedQuestions);
    }
  };

  const handleGenerateAITestBlock = async (action: 'start' | 'share' = 'start') => {
    if (!aiTopic.trim()) return;
    setIsGeneratingAI(true);
    setAiGenerateError(null);
    try {
      const result = await generateQuestionsWithGemini(aiTopic.trim(), aiCount, 'medium');
      if (result.questions && result.questions.length > 0) {
        let createdQuestions: Question[] = [];
        if (onQuestionsGeneratedByAI) {
          createdQuestions = onQuestionsGeneratedByAI(result.questions, result.categoryName || aiTopic);
        }

        const config: TestConfig = {
          title: testTitle.trim() || `Đề thi Gemini AI - ${result.categoryName || aiTopic}`,
          presetType: 'custom',
          totalQuestions: result.questions.length,
          timeLimitMinutes: Math.max(10, Math.round(result.questions.length * 1.2)),
          selectionMode: 'ai_generated',
          categorySelections: [],
          shuffleQuestions,
          shuffleOptions,
        };

        if (action === 'share') {
          onSaveShareDraft(config, createdQuestions);
        } else {
          onStartTest(config, createdQuestions);
        }
      }
    } catch (err: any) {
      setAiGenerateError('Không thể tạo đề thi bằng Gemini AI: ' + (err?.message || 'Vui lòng thử lại sau.'));
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const invalidCount = allQuestions.filter((q) => !isQuestionValid(q)).length;
  const validCount = allQuestions.length - invalidCount;

  // Filter candidate questions based on current configuration
  const candidateQuestions = allQuestions.filter((q) => {
    if (!isQuestionValid(q)) return false;
    if (selectionMode === 'categories') {
      return selectedCatIds.has(q.categoryId);
    }
    return true;
  });

  const candidateQuestionsWithImages = candidateQuestions.filter((q) => !!q.imageUrl || (q.images && q.images.length > 0));

  const displayedPreviewQuestions = onlyWithImagesFilter
    ? candidateQuestionsWithImages
    : candidateQuestions;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Title Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
          <Zap className="w-3.5 h-3.5" />
          <span>Thiết kế khối đề thi MCQ thông minh</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Tạo Đề Thi MCQ Trắc Nghiệm
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
          Chọn block thời gian chuẩn (40 câu/30 phút, 50 câu/40 phút) hoặc tùy chỉnh số lượng câu từ các mục cụ thể mà bạn chỉ định.
        </p>
      </div>

      {/* WARNING BANNER FOR UNANSWERED QUESTIONS */}
      {invalidCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-4 rounded-2xl flex items-start space-x-3 text-amber-900 dark:text-amber-200 text-xs shadow-md">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm">
              ⚠️ Thông Báo: Có {invalidCount} câu hỏi CHƯA CÓ ĐÁP ÁN trong ngân hàng dữ liệu
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Hệ thống đã tự động đánh dấu <strong className="underline">Không khả dụng</strong> và LOẠI TRỪ các câu chưa có đáp án này. Chỉ có <strong>{validCount} câu hỏi có đáp án chuẩn</strong> được sử dụng để làm bài thi MCQ.
            </p>
          </div>
        </div>
      )}

      {/* STEP 1: Choose Block Type (3 Choices) */}
      <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/80 shadow-xl space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center space-x-2">
          <Clock className="w-4 h-4 text-indigo-500" />
          <span>Bước 1: Chọn Khối Đề Thi (Block Preset)</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Preset A: 40 questions / 30 mins */}
          <div
            onClick={() => setPresetType('40q_30m')}
            className={`cursor-pointer rounded-2xl p-5 border transition-all ${
              presetType === '40q_30m'
                ? 'bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white border-indigo-500 shadow-xl ring-2 ring-indigo-500'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Lựa chọn 1
              </span>
              <Award className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="font-bold text-base">40 Câu / 30 Phút</h3>
            <p className="text-xs opacity-80 mt-1">Chuẩn thời gian luyện thi tốc độ cao (45 giây/câu)</p>
          </div>

          {/* Preset B: 50 questions / 40 mins */}
          <div
            onClick={() => setPresetType('50q_40m')}
            className={`cursor-pointer rounded-2xl p-5 border transition-all ${
              presetType === '50q_40m'
                ? 'bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white border-indigo-500 shadow-xl ring-2 ring-indigo-500'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Lựa chọn 2
              </span>
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="font-bold text-base">50 Câu / 40 Phút</h3>
            <p className="text-xs opacity-80 mt-1">Đề thi đầy đủ tổng hợp (48 giây/câu)</p>
          </div>

          {/* Preset C: Custom */}
          <div
            onClick={() => setPresetType('custom')}
            className={`cursor-pointer rounded-2xl p-5 border transition-all ${
              presetType === 'custom'
                ? 'bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white border-indigo-500 shadow-xl ring-2 ring-indigo-500'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-800 dark:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Lựa chọn 3
              </span>
              <Sliders className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="font-bold text-base">Tự Chọn Số Câu &amp; Thời Gian</h3>
            <p className="text-xs opacity-80 mt-1">Tự chọn thời gian và số câu hỏi theo nhu cầu</p>
          </div>
        </div>

        {/* Custom Controls when Preset C selected */}
        {presetType === 'custom' && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Số lượng câu hỏi làm bài:
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={customQuestionCount}
                onChange={(e) => setCustomQuestionCount(Math.max(1, parseInt(e.target.value) || 10))}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl font-bold text-indigo-600 dark:text-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Thời gian làm bài (Phút - 0 = Không giới hạn):
              </label>
              <input
                type="number"
                min={0}
                max={300}
                value={customTimeMinutes}
                onChange={(e) => setCustomTimeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl font-bold text-indigo-600 dark:text-indigo-400"
              />
            </div>
          </div>
        )}

        {/* Optional Custom Test Title */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center space-x-1.5">
            <FileEdit className="w-3.5 h-3.5 text-indigo-500" />
            <span>Tên đề thi (tùy chọn - nếu để trống sẽ tự đặt tên theo số câu &amp; thời gian):</span>
          </label>
          <input
            type="text"
            value={testTitle}
            onChange={(e) => setTestTitle(e.target.value)}
            placeholder={`VD: Đề thi thử đại học 2027 (${presetType === '40q_30m' ? '40 câu' : presetType === '50q_40m' ? '50 câu' : 'Tùy chỉnh'})`}
            className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* STEP 2: Choose Question Selection Source & Per-Category Random Counts */}
      <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/80 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center space-x-2">
            <FolderTree className="w-4 h-4 text-indigo-500" />
            <span>Bước 2: Lựa Chọn Nguồn Câu Hỏi Trong Các Mục</span>
          </h2>

          <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setSelectionMode('categories')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectionMode === 'categories' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Chọn Đích Danh Mục
            </button>
            <button
              onClick={() => setSelectionMode('random_mix')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectionMode === 'random_mix' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Ngẫu Nhiên Tất Cả
            </button>
            <button
              onClick={() => setSelectionMode('ai_generated')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 ${
                selectionMode === 'ai_generated' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-600 dark:text-purple-400 hover:text-purple-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tạo Mới Bằng Gemini</span>
            </button>
          </div>
        </div>

        {/* Selected sources stay compact even when the bank contains hundreds of folders. */}
        {selectionMode === 'categories' && (
          <div className="space-y-3">
            <button type="button" onClick={() => setSourcePickerOpen(true)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 text-left hover:border-indigo-500 dark:border-indigo-800 dark:bg-indigo-950/40">
              <span className="flex min-w-0 items-center gap-3"><FolderTree className="shrink-0 text-indigo-600" size={21} /><span><strong className="block text-sm text-slate-900 dark:text-white">Chọn mục câu hỏi</strong><span className="block text-xs text-slate-500 dark:text-slate-300">Mở cây mục lớn, mục nhỏ và tìm kiếm</span></span></span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">{selectedCatIds.size} mục <ChevronRight size={17} /></span>
            </button>
            {selectedCatIds.size > 0 ? <div className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700"><div className="flex flex-wrap gap-2">{questionCategories.filter(category => selectedCatIds.has(category.id)).slice(0, 4).map(category => <span key={category.id} title={categoryPath(categories, category.id)} className="max-w-full truncate rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700">{categoryPath(categories, category.id)} · {Math.min(categorySelections[category.id] || 1, availableByCategory.get(category.id) || 0)} câu</span>)}{selectedCatIds.size > 4 && <span className="px-2 py-1">+{selectedCatIds.size - 4} mục khác</span>}</div><p className="mt-2 text-indigo-700 dark:text-indigo-300">Nguồn đã chọn: {calculatedCategoryQuestions} câu khả dụng. Đề hiện lấy {getEffectiveTotalQuestions()} câu.</p>{tooManyFromCategories && <p role="alert" className="mt-2 font-semibold text-amber-700 dark:text-amber-300">Đang chọn {calculatedCategoryQuestions} câu, vượt mức {questionLimit} câu. Hãy giảm số câu trong các mục hoặc chọn đề tùy chỉnh.</p>}</div> : <p className="text-xs text-amber-700 dark:text-amber-300">Chưa chọn mục. Bấm “Chọn mục câu hỏi” để chọn nguồn cho đề thi.</p>}
          </div>
        )}

        {/* Mode B: Random Mix across all categories */}
        {selectionMode === 'random_mix' && (
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              Hệ thống sẽ trộn ngẫu nhiên từ toàn bộ <strong className="text-indigo-600 dark:text-indigo-400">{totalAvailableQuestions} câu hỏi</strong> thuộc {questionCategories.length} mục hiện có để đảm bảo tính khách quan toàn diện.
            </p>
          </div>
        )}

        {/* Mode C: AI Generator */}
        {selectionMode === 'ai_generated' && (
          <div className="p-5 bg-gradient-to-r from-purple-900/30 via-slate-900 to-indigo-900/30 rounded-2xl border border-purple-500/30 space-y-4">
            <div className="flex items-center space-x-2 text-purple-300 text-xs font-bold">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Dùng Gemini AI Sáng Tạo Khối Đề Thi Mới</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-300 mb-1">Chủ đề mong muốn *</label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="VD: Sinh học Di truyền & Tiến hóa"
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Số câu hỏi AI tạo</label>
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={aiCount}
                  onChange={(e) => setAiCount(Math.max(3, parseInt(e.target.value) || 5))}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleGenerateAITestBlock('start')}
                disabled={isGeneratingAI || !aiTopic.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isGeneratingAI ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gemini Đang Tạo Đề Thi...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Tạo Đề &amp; Thi Ngay</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleGenerateAITestBlock('share')}
                disabled={isGeneratingAI || !aiTopic.trim()}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-purple-500/40 text-purple-200 font-bold text-xs rounded-xl flex items-center justify-center space-x-2 disabled:opacity-50 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>Lưu bản chuẩn bị chia sẻ</span>
              </button>
            </div>

            {aiGenerateError && (
              <div className="p-3 bg-red-950/40 border border-red-500/40 text-red-200 rounded-xl text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{aiGenerateError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 2.5: Preview Questions & Diagrams / Images */}
      <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/80 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center space-x-2">
              <ImageIcon className="w-4 h-4 text-indigo-500" />
              <span>Xem Trước Danh Sách Câu Hỏi &amp; Hình Ảnh Trong Đề Thi</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rà soát các câu hỏi và các hình ảnh/sơ đồ/ECG trước khi bấm bắt đầu thi
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {candidateQuestionsWithImages.length > 0 && (
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300/60 flex items-center space-x-1">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{candidateQuestionsWithImages.length} câu có hình ảnh</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowQuestionPreview(!showQuestionPreview)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 transition-colors"
            >
              {showQuestionPreview ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-indigo-500" />}
              <span>{showQuestionPreview ? 'Thu gọn xem trước' : 'Xem trước câu hỏi & ảnh'}</span>
            </button>
          </div>
        </div>

        {showQuestionPreview && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                Hiển thị: <strong>{displayedPreviewQuestions.length}</strong> / {candidateQuestions.length} câu hỏi khả dụng
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setOnlyWithImagesFilter(false)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    !onlyWithImagesFilter
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Tất cả ({candidateQuestions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyWithImagesFilter(true)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all ${
                    onlyWithImagesFilter
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Chỉ câu có ảnh ({candidateQuestionsWithImages.length})</span>
                </button>
              </div>
            </div>

            {displayedPreviewQuestions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                Không tìm thấy câu hỏi phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {displayedPreviewQuestions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">Câu {idx + 1}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {q.categoryName}
                          </span>
                          {(q.imageUrl || (q.images && q.images.length > 0)) && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold flex items-center space-x-1 border border-emerald-300/50">
                              <ImageIcon className="w-3 h-3 text-emerald-600" />
                              <span>Có ảnh minh họa</span>
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-relaxed">{q.question}</p>
                      </div>
                    </div>

                    {/* Question Image Preview */}
                    {(q.images?.length ? q.images : q.imageUrl ? [q.imageUrl] : []).map((imageUrl, imageIndex) => (
                      <div key={imageIndex} className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center gap-3">
                        <div
                          onClick={() => setPreviewZoomImage(imageUrl)}
                          className="relative group cursor-pointer shrink-0"
                          title="Bấm để xem ảnh phóng to"
                        >
                          <img
                            src={imageUrl}
                            alt="Hình vẽ minh họa"
                            className="max-h-32 max-w-xs object-contain rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Maximize2 className="w-5 h-5 text-white" />
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-500 space-y-1 text-center sm:text-left">
                          <p className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center sm:justify-start space-x-1">
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Hình vẽ đính kèm trong đề thi</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setPreviewZoomImage(imageUrl)}
                            className="text-indigo-600 dark:text-indigo-400 underline font-semibold inline-flex items-center space-x-1"
                          >
                            <Maximize2 className="w-3 h-3" />
                            <span>Bấm để phóng to xem chi tiết hình ảnh</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Options list */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-center space-x-2"
                        >
                          <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <OptionContent text={opt} images={q.optionImages?.[oIdx]} letter={String.fromCharCode(65 + oIdx)} onZoom={setPreviewZoomImage} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 3: Toggles & Summary Launch */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-base flex items-center space-x-2">
              <Shuffle className="w-4 h-4 text-indigo-400" />
              <span>Cấu Hình Tùy Chọn Đề Thi</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Xáo trộn câu hỏi &amp; xáo trộn phương án để chống học vẹt</p>
          </div>

          <div className="flex items-center space-x-6 text-xs">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 text-indigo-500 rounded cursor-pointer"
              />
              <span>Xáo trộn câu hỏi</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="w-4 h-4 text-indigo-500 rounded cursor-pointer"
              />
              <span>Xáo trộn đáp án A/B/C/D</span>
            </label>
          </div>
        </div>

        {/* Final Launch Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">Tóm tắt khối bài thi:</div>
            <div className="text-lg font-bold text-indigo-300">
              {getEffectiveTotalQuestions()} Câu Hỏi — {getEffectiveTimeLimit() > 0 ? `${getEffectiveTimeLimit()} Phút` : 'Tự Do Thời Gian'}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={() => handleStart('share')}
              type="button"
              disabled={tooManyFromCategories}
              className="px-5 py-3.5 rounded-2xl border border-amber-400/40 hover:border-amber-400 text-amber-200 text-xs font-bold flex items-center justify-center space-x-2 transition-all hover:bg-amber-950/40 disabled:opacity-40"
            >
              <Share2 className="w-4 h-4 text-amber-400" />
              <span>Lưu bản đề để chuẩn bị chia sẻ</span>
            </button>

            <button
              onClick={() => handleStart('start')}
              type="button"
              disabled={tooManyFromCategories}
              className="px-8 py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-bold rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-40"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>VÀO LÀM BÀI THI MCQ NGAY</span>
            </button>
          </div>
        </div>
      </div>

      {sourcePickerOpen && <CategorySourcePicker
        categories={categories}
        questions={allQuestions}
        selectedIds={selectedCatIds}
        counts={categorySelections}
        onSelect={setSelectedCatIds}
        onCount={(id, count) => setCategorySelections(previous => ({ ...previous, [id]: count }))}
        onClose={() => setSourcePickerOpen(false)}
      />}

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
