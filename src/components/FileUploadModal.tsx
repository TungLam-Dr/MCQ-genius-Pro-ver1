import React, { useState } from 'react';
import { Category, Question } from '../types/quiz';
import { parseUploadedFile, extractAnswerKeyDocument, applyAnswerKeysToQuestions, KeyMatchIssue, AnswerKeyDocument } from '../utils/fileParser';
import { parseFileWithGemini } from '../services/gemini';
import {
  UploadCloud,
  FileText,
  X,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Download,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  FileCheck,
  KeyRound,
  FileSpreadsheet,
  CheckCheck,
  Plus,
  Trash2,
  AlertTriangle,
  CheckSquare,
  Square,
  Maximize2,
} from 'lucide-react';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onImportQuestions: (questions: Partial<Question>[], targetCategoryId: string, newCatName?: string) => void;
}

interface UploadedKeyFile {
  id: string;
  name: string;
  text: string;
  richSections: AnswerKeyDocument['richSections'];
  enabled: boolean;
  matchedCount: number;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  onClose,
  categories,
  onImportQuestions,
}) => {
  // Main Question File states
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<Partial<Question>[]>([]);
  const [originalQuestionsBackup, setOriginalQuestionsBackup] = useState<Partial<Question>[]>([]);
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [detectedImages, setDetectedImages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedPageCount, setParsedPageCount] = useState<number | undefined>(undefined);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);

  // MULTIPLE Separate Answer Key Files states
  const [keyFiles, setKeyFiles] = useState<UploadedKeyFile[]>([]);
  const [isProcessingKeyFile, setIsProcessingKeyFile] = useState(false);
  const [totalMatchedKeysCount, setTotalMatchedKeysCount] = useState<number | null>(null);
  const [reviewMatches, setReviewMatches] = useState<KeyMatchIssue[]>([]);
  const [manualAnswers, setManualAnswers] = useState<Record<number, number>>({});

  // Category Target states
  const [selectedTargetCatId, setSelectedTargetCatId] = useState<string>(categories[0]?.id || 'new');
  const [customNewCatName, setCustomNewCatName] = useState('');

  if (!isOpen) return null;

  const handleMainFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrorMessage(null);
    setIsProcessing(true);
    setKeyFiles([]);
    setTotalMatchedKeysCount(null);
    setReviewMatches([]);
    setManualAnswers({});

    try {
      const parseRes = await parseUploadedFile(selectedFile);
      setDetectedImages(parseRes.detectedImages || []);
      setParsedPageCount(parseRes.pageCount);

      let finalQuestions: Partial<Question>[] = [];
      let defaultCatName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

      if (parseRes.rawQuestions && parseRes.rawQuestions.length >= 3) {
        finalQuestions = parseRes.rawQuestions;
        setSuggestedCategory(`Khối ${defaultCatName}`);
      } else {
        try {
          const aiResult = await parseFileWithGemini(
            parseRes.extractedText,
            selectedFile.name,
            parseRes.rawQuestions
          );
          finalQuestions = aiResult.questions || parseRes.rawQuestions || [];
          if (aiResult.suggestedCategoryName) {
            defaultCatName = aiResult.suggestedCategoryName;
          }
          setSuggestedCategory(defaultCatName);
        } catch (aiErr: any) {
          console.warn('Gemini API parse fallback:', aiErr);
          finalQuestions = parseRes.rawQuestions || [];
          setSuggestedCategory(`Mục ${defaultCatName}`);
        }
      }

      // Sanitize questions array
      const sanitized: Partial<Question>[] = (finalQuestions || []).map((q, idx) => ({
        question: typeof q?.question === 'string' ? q.question : (q?.question ? String(q.question) : `Câu hỏi ${idx + 1}`),
        options: Array.isArray(q?.options) ? q.options.map((o) => String(o || '')) : [],
        correctAnswer: typeof q?.correctAnswer === 'number' ? q.correctAnswer : -1,
        explanation: typeof q?.explanation === 'string' ? q.explanation : '',
        difficulty: q?.difficulty || 'medium',
        imageUrl: q?.imageUrl,
        images: q?.images,
        sourceId: q?.sourceId,
        sourceBlock: q?.sourceBlock,
        sourceNumber: q?.sourceNumber,
      }));

      setExtractedQuestions(sanitized);
      setOriginalQuestionsBackup(sanitized);
      setCustomNewCatName(defaultCatName || `Mục ${selectedFile.name.split('.')[0]}`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || 'Không thể đọc nội dung file. Vui lòng kiểm tra định dạng.');
      setExtractedQuestions([]);
      setOriginalQuestionsBackup([]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to re-apply active answer key files onto the base question backup
  const recalculateAnswerKeys = (
    currentKeyFiles: UploadedKeyFile[],
    baseQuestions: Partial<Question>[]
  ) => {
    try {
      const activeFiles = currentKeyFiles.filter((kf) => kf.enabled);

      if (activeFiles.length === 0) {
        setExtractedQuestions(baseQuestions.map((question, index) =>
          manualAnswers[index] === undefined ? question : { ...question, correctAnswer: manualAnswers[index] }
        ));
        setTotalMatchedKeysCount(0);
        setReviewMatches([]);
        return;
      }

      const activeTexts = activeFiles.map((kf) => ({text:kf.text,richSections:kf.richSections}));
      const { updatedQuestions, matchedCount, reviewMatches } = applyAnswerKeysToQuestions(baseQuestions, activeTexts);

      // Calculate per-file matched count for display
      const updatedKeyFiles = currentKeyFiles.map((kf) => {
        if (!kf.enabled) return { ...kf, matchedCount: 0 };
        const singleRes = applyAnswerKeysToQuestions(baseQuestions, [{text:kf.text,richSections:kf.richSections}]);
        return { ...kf, matchedCount: singleRes.matchedCount };
      });

      setKeyFiles(updatedKeyFiles);
      setExtractedQuestions(updatedQuestions.map((question, index) =>
        manualAnswers[index] === undefined ? question : { ...question, correctAnswer: manualAnswers[index] }
      ));
      setTotalMatchedKeysCount(matchedCount);
      setReviewMatches(reviewMatches);
    } catch (err: any) {
      console.error('Error recalculating answer keys:', err);
    }
  };

  // Multiple Answer Key File Upload Handler
  const handleAddAnswerKeyFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedKeyFiles = Array.from(e.target.files || []);
    if (selectedKeyFiles.length === 0 || originalQuestionsBackup.length === 0) return;

    setIsProcessingKeyFile(true);

    try {
      const newKeyFileEntries: UploadedKeyFile[] = [...keyFiles];

      for (const kFile of selectedKeyFiles) {
        const keyDocument = await extractAnswerKeyDocument(kFile);
        const singleMatchRes = applyAnswerKeysToQuestions(originalQuestionsBackup, [keyDocument]);

        newKeyFileEntries.push({
          id: `kf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: kFile.name,
          text: keyDocument.text,
          richSections: keyDocument.richSections,
          enabled: true,
          matchedCount: singleMatchRes.matchedCount,
        });
      }

      recalculateAnswerKeys(newKeyFileEntries, originalQuestionsBackup);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Không thể đọc file đáp án: ' + (err?.message || 'Lỗi định dạng'));
    } finally {
      setIsProcessingKeyFile(false);
    }
  };

  const handleToggleKeyFile = (kfId: string) => {
    const updatedKeyFiles = keyFiles.map((kf) =>
      kf.id === kfId ? { ...kf, enabled: !kf.enabled } : kf
    );
    recalculateAnswerKeys(updatedKeyFiles, originalQuestionsBackup);
  };

  const handleRemoveKeyFile = (kfId: string) => {
    const remainingKeyFiles = keyFiles.filter((kf) => kf.id !== kfId);
    recalculateAnswerKeys(remainingKeyFiles, originalQuestionsBackup);
  };

  const chooseAnswerManually = (questionIndex: number, answerIndex: number) => {
    setManualAnswers((previous) => ({ ...previous, [questionIndex]: answerIndex }));
    setExtractedQuestions((previous) => previous.map((question, index) =>
      index === questionIndex ? { ...question, correctAnswer: answerIndex } : question
    ));
  };

  const handleFinalImport = () => {
    if (extractedQuestions.length === 0) return;

    const isNew = selectedTargetCatId === 'new';
    onImportQuestions(
      extractedQuestions,
      isNew ? 'new' : selectedTargetCatId,
      isNew ? customNewCatName.trim() || 'Mục Nhập Mới' : undefined
    );

    setFile(null);
    setKeyFiles([]);
    setExtractedQuestions([]);
    setOriginalQuestionsBackup([]);
    setReviewMatches([]);
    setManualAnswers({});
    onClose();
  };

  const downloadSampleTemplate = () => {
    const sampleText = `BLOCK 1 NỘI TIM MẠCH MẪU (File Đề)

Câu 1 ID: 3096 Bệnh nhân nam 68 tuổi đến phòng khám do đánh trống ngực...
A. Đường dẫn truyền phụ
B. Xơ hóa tế bào cơ tim
C. Sẹo cơ tim
D. Giãn nhĩ trái
E. Tác dụng phụ của thuốc

Câu 2 ID: 2692 Bệnh nhân nam 56 tuổi đến phòng khám do khó thở...
A. Cai rượu
B. Bỏ hút thuốc lá
C. ACEi
D. Digoxin

--------------------------------------------------
BẢNG ĐÁP ÁN THAM KHẢO (Đề ở trên - Đáp án ở dưới):
1.E  2.A
`;

    const blob = new Blob([sampleText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau_de_va_dap_an.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Missing answers count calculation
  const missingAnswersCount = extractedQuestions.filter(
    (q) =>
      q.correctAnswer === undefined ||
      q.correctAnswer === null ||
      (q.options?.length || 0) < 2 ||
      q.correctAnswer < 0 ||
      q.correctAnswer >= (q.options?.length || 0)
  ).length;

  const validAnswersCount = extractedQuestions.length - missingAnswersCount;
  const missingByBlock = extractedQuestions.reduce<Record<string,number>>((acc,q) => {
    if ((q.options?.length || 0)<2 || q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer < 0 || q.correctAnswer >= (q.options?.length || 0)) {
      const name = q.sourceBlock !== undefined ? `Block ${q.sourceBlock}` : 'Chưa rõ block';
      acc[name]=(acc[name]||0)+1;
    }
    return acc;
  },{});

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Tải File Đề Thi &amp; Quản Lý Nhiều File Đáp Án
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn 1 hoặc nhiều file đáp án cùng lúc. Quản lý chọn/xóa từng file đáp án &amp; cảnh báo câu chưa có đáp án.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Question File Dropzone */}
        {!file && (
          <div className="space-y-4">
            <label className="border-2 border-dashed border-indigo-300 dark:border-indigo-800/80 hover:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.005]">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 mb-3">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Chọn File Đề Thi (PDF, DOCX, XLSX, TXT)
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Nhận diện toàn bộ câu hỏi (80+ câu) &amp; hình ảnh đi kèm
              </p>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.json"
                onChange={handleMainFileChange}
                className="hidden"
              />
            </label>

            <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <span>Tải file mẫu định dạng câu hỏi &amp; đáp án:</span>
              <button
                onClick={downloadSampleTemplate}
                className="flex items-center space-x-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải File Mẫu</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isProcessing && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Đang trích xuất toàn bộ câu hỏi &amp; tìm đáp án...
            </p>
            <p className="text-xs text-slate-500">Đang đọc 100% tài liệu và nhận diện danh sách câu hỏi.</p>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl flex items-center space-x-3 text-red-700 dark:text-red-300 text-xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* Preview Extracted Questions & Multiple Answer Key Upload Manager */}
        {!isProcessing && file && extractedQuestions.length > 0 && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Status Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 gap-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>
                  File đề: <strong className="text-indigo-600 dark:text-indigo-300 text-sm">"{file.name}"</strong> ({extractedQuestions.length} câu)
                </span>
              </div>

              {totalMatchedKeysCount !== null && totalMatchedKeysCount > 0 && (
                <span className="text-xs px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-300/50 flex items-center space-x-1">
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Đã ghép {totalMatchedKeysCount}/{extractedQuestions.length} đáp án</span>
                </span>
              )}
            </div>

            {/* UNANSWERED QUESTIONS NOTIFICATION BANNER */}
            {missingAnswersCount > 0 ? (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-2xl flex items-start space-x-3 text-amber-900 dark:text-amber-200 text-xs">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    ⚠️ Thông Báo: Có {missingAnswersCount}/{extractedQuestions.length} câu hỏi CHƯA CÓ ĐÁP ÁN
                  </p>
                  <p className="text-[11px]">{Object.entries(missingByBlock).map(([name,count])=>`${name}: ${count} câu`).join(' · ')}</p>
                  <p className="text-[11px] opacity-90">
                    Chọn đáp án trực tiếp trong bản xem trước hoặc tải thêm file đáp án. Sau khi nhập, mở mục "Câu hỏi chưa có đáp án" ở trang chủ để sửa tiếp.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/80 rounded-2xl flex items-center space-x-3 text-emerald-900 dark:text-emerald-200 text-xs font-bold">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Đã ghép {extractedQuestions.length}/{extractedQuestions.length} đáp án. {reviewMatches.length ? `${reviewMatches.length} câu ghép theo vị trí cần kiểm tra trước khi thi.` : 'Tất cả câu đều khả dụng để tạo đề thi.'}
                </span>
              </div>
            )}

            {reviewMatches.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold">Cần rà soát {reviewMatches.length} câu được ghép theo block và số câu do ID khác hoặc thiếu:</p>
                <p>{reviewMatches.map(m=>`Block ${m.sourceBlock}, câu ${m.questionNumber}: đề ID ${m.questionId || 'thiếu'} / đáp án ID ${m.answerId || 'thiếu'}`).join(' · ')}</p>
              </div>
            )}

            {/* MULTIPLE Answer Key Files Manager (Support selecting multiple files, toggling, deleting) */}
            <div className="p-4 bg-purple-50/60 dark:bg-purple-950/20 rounded-2xl border border-purple-200 dark:border-purple-800/60 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-bold text-purple-900 dark:text-purple-200 flex items-center space-x-1.5">
                  <KeyRound className="w-4 h-4 text-purple-500" />
                  <span>Tải File Đáp Án (Chọn 1 hoặc nhiều file đáp án cùng lúc)</span>
                </div>

                <label className="cursor-pointer px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-md flex items-center space-x-1 shrink-0 transition-all text-xs">
                  {isProcessingKeyFile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>+ Tải File Đáp Án (Nhiều file)</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.xlsx,.xls,.csv,.txt"
                    onChange={handleAddAnswerKeyFile}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Uploaded Key Files Badges & Selection List */}
              {keyFiles.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-purple-200/50 dark:border-purple-800/40">
                  <div className="text-[11px] font-semibold text-purple-800 dark:text-purple-300">
                    Danh sách các file đáp án đã tải lên (Tích chọn hoặc bấm thùng rác để xóa):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {keyFiles.map((kf, idx) => (
                      <div
                        key={kf.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          kf.enabled
                            ? 'bg-purple-100 dark:bg-purple-900/50 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-100'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 opacity-60'
                        }`}
                      >
                        <div
                          onClick={() => handleToggleKeyFile(kf.id)}
                          className="flex items-center space-x-2 cursor-pointer flex-1 min-w-0"
                          title={kf.enabled ? 'Nhấn để tạm tắt file đáp án này' : 'Nhấn để bật lại file đáp án này'}
                        >
                          {kf.enabled ? (
                            <CheckSquare className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-xs truncate">
                              File {idx + 1}: {kf.name}
                            </p>
                            <p className="text-[10px] opacity-80">
                              {kf.enabled ? `Đã ghép ${kf.matchedCount} câu · ${kf.richSections.length} lời giải có tư liệu` : 'Đang tắt'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveKeyFile(kf.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white transition-all shrink-0"
                          title="Xóa file đáp án này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Target Category Selection */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                Lưu vào Mục nào?
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={selectedTargetCatId}
                  onChange={(e) => setSelectedTargetCatId(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100"
                >
                  <option value="new">+ Tạo Mục mới ({customNewCatName || 'Theo tên file'})</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.questionCount} câu)
                    </option>
                  ))}
                </select>

                {selectedTargetCatId === 'new' && (
                  <input
                    type="text"
                    value={customNewCatName}
                    onChange={(e) => setCustomNewCatName(e.target.value)}
                    placeholder="Tên mục mới..."
                    className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100"
                  />
                )}
              </div>
            </div>

            {/* Questions Table Preview */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-slate-50/50 dark:bg-slate-900/40 max-h-56">
              {extractedQuestions.map((q, idx) => {
                if (!q) return null;
                const qText = typeof q.question === 'string' ? q.question : String(q.question || '');
                const qOpts = Array.isArray(q.options) ? q.options : [];
                const qAns = typeof q.correctAnswer === 'number' ? q.correctAnswer : -1;
                const isUnanswered = qOpts.length < 2 || qAns < 0 || qAns >= qOpts.length;

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      isUnanswered
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300/80 dark:border-amber-800/60'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between font-bold text-slate-900 dark:text-slate-100">
                      <p className="flex-1">
                        Câu {idx + 1}: {qText}
                      </p>

                      {isUnanswered ? (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 font-bold ml-2 shrink-0 border border-amber-300/60 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>Chưa có đáp án (Không khả dụng)</span>
                        </span>
                      ) : (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold ml-2 shrink-0">
                          Đáp án: {String.fromCharCode(65 + Math.min(25, Math.max(0, qAns)))}
                        </span>
                      )}
                    </div>

                    {/* Question Image if present */}
                    {(q.images?.length ? q.images : q.imageUrl ? [q.imageUrl] : []).map((imageUrl, imageIndex) => (
                      <div key={imageIndex} className="flex items-center space-x-3 p-2 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div
                          onClick={() => setPreviewZoomImage(imageUrl)}
                          className="relative group cursor-pointer shrink-0"
                          title="Bấm để phóng to hình ảnh"
                        >
                          <img
                            src={imageUrl}
                            alt="Hình vẽ câu hỏi"
                            className="w-16 h-14 object-cover rounded-lg border border-slate-300 dark:border-slate-600 shadow-sm transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Maximize2 className="w-4 h-4 text-white" />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center space-x-1">
                            <ImageIcon className="w-3 h-3" />
                            <span>Ảnh {imageIndex + 1} đính kèm câu hỏi</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewZoomImage(imageUrl)}
                            className="text-[10px] text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 underline block mt-0.5"
                          >
                            Xem ảnh phóng to
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                      {qOpts.map((opt, oIdx) => (
                        <button
                          type="button"
                          key={oIdx}
                          onClick={() => chooseAnswerManually(idx, oIdx)}
                          disabled={qOpts.length < 2}
                          aria-pressed={oIdx === qAns}
                          className={`min-h-11 rounded-lg border p-2 text-left transition-colors disabled:opacity-50 ${oIdx === qAns
                            ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'border-slate-200 bg-white hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800'}`}
                        >
                          {String.fromCharCode(65 + Math.min(25, Math.max(0, oIdx)))}. {typeof opt === 'string' ? opt : String(opt || '')}
                        </button>
                      ))}
                    </div>

                    {qOpts.length < 2 && <p className="text-[11px] text-amber-700 dark:text-amber-300">Thiếu phương án lựa chọn: nhập câu hỏi rồi bổ sung trong mục "Câu hỏi chưa có đáp án".</p>}

                    {q.explanation && (
                      <p className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-900 p-2 rounded-lg line-clamp-2">
                        <strong className="not-italic text-indigo-500">Lời giải từ file đáp án: </strong>
                        {typeof q.explanation === 'string' ? q.explanation : String(q.explanation)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            onClick={() => {
              setFile(null);
              setKeyFiles([]);
              setExtractedQuestions([]);
              setOriginalQuestionsBackup([]);
              setManualAnswers({});
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            {file ? 'Đổi File Khác' : ''}
          </button>

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Đóng
            </button>
            {extractedQuestions.length > 0 && (
              <button
                onClick={handleFinalImport}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5"
              >
                <FileCheck className="w-4 h-4" />
                <span>
                  Nhập Toàn Bộ {extractedQuestions.length} Câu Hỏi ({validAnswersCount} câu khả dụng)
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Full Image Zoom Lightbox Modal */}
        {previewZoomImage && (
          <div
            onClick={() => setPreviewZoomImage(null)}
            className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
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
    </div>
  );
};
