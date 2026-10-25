import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, Flag, Image as ImageIcon, Pencil, Search, X } from 'lucide-react';
import { Category, Question, QuestionAttempt } from '../types/quiz';
import { isQuestionValid } from '../utils/quizEngine';
import { AnswerExplanation } from './AnswerExplanation';

type Status = 'all' | 'flagged' | 'review' | 'mistaken' | 'unattempted' | 'attempted' | 'today' | 'unanswered' | 'images';
type QuestionChanges = Pick<Question, 'question' | 'options' | 'correctAnswer' | 'explanation' | 'manualExplanation' | 'tags'>;
type Stat = { answered: number; incorrect: number; lastCorrect?: boolean; today: boolean };

interface Props {
  questions: Question[];
  categories: Category[];
  attempts: QuestionAttempt[];
  flags: Record<string, boolean>;
  onToggleFlag: (questionId: string) => void;
  onSetFlags: (ids: string[], flagged: boolean) => void;
  onUpdateQuestion: (id: string, changes: QuestionChanges) => void;
  onReviewFlagged: () => void;
  onOpenBank: () => void;
  onBack: () => void;
}

const filters: { id: Status; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'flagged', label: 'Đã gắn cờ' },
  { id: 'review', label: 'Cần ôn' },
  { id: 'mistaken', label: 'Từng làm sai' },
  { id: 'unattempted', label: 'Chưa làm' },
  { id: 'attempted', label: 'Đã làm' },
  { id: 'today', label: 'Đã làm hôm nay' },
  { id: 'unanswered', label: 'Chưa có đáp án' },
  { id: 'images', label: 'Có hình ảnh' },
];

export const QuestionBrowser: React.FC<Props> = ({
  questions, categories, attempts, flags, onToggleFlag, onSetFlags,
  onUpdateQuestion, onReviewFlagged, onOpenBank, onBack,
}) => {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [sourceBlock, setSourceBlock] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState<'recent' | 'wrong' | 'attempted'>('recent');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewChoice, setPreviewChoice] = useState<number | null>(null);
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);
  const [editStem, setEditStem] = useState('');
  const [editAnswer, setEditAnswer] = useState(-1);
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editExplanation, setEditExplanation] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const stats = useMemo(() => {
    const byId = new Map<string, Stat>();
    const today = new Date().toDateString();
    const ordered = [...attempts].sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime));
    for (const attempt of ordered) {
      const value = byId.get(attempt.questionId) || { answered: 0, incorrect: 0, today: false };
      if (attempt.answered) { value.answered++; value.lastCorrect = attempt.correct; }
      if (attempt.answered && !attempt.correct) value.incorrect++;
      if (attempt.answered && new Date(attempt.endTime).toDateString() === today) value.today = true;
      byId.set(attempt.questionId, value);
    }
    return byId;
  }, [attempts]);
  const cardState = (question: Question) => {
    const stat = stats.get(question.id);
    if (flags[question.id]) return 'Cần ôn';
    if (!stat?.answered) return 'Chưa làm';
    return stat.lastCorrect === false ? 'Cần ôn' : 'Đã làm';
  };

  const tags = useMemo(() => Array.from(new Set(questions.flatMap((q) => q.tags || []))).sort(), [questions]);
  const blocks = useMemo(() => Array.from(new Set(questions.map((q) => q.sourceBlock).filter((value): value is number => typeof value === 'number'))).sort((a, b) => a - b), [questions]);
  const scoped = useMemo(() => questions.filter((q) =>
    (categoryId === 'all' || q.categoryId === categoryId) &&
    (sourceBlock === 'all' || q.sourceBlock === Number(sourceBlock))
  ), [questions, categoryId, sourceBlock]);
  const counts = useMemo(() => ({
    all: scoped.length,
    flagged: scoped.filter((q) => flags[q.id]).length,
    review: scoped.filter((q) => cardState(q) === 'Cần ôn').length,
    mistaken: scoped.filter((q) => (stats.get(q.id)?.incorrect || 0) > 0).length,
    unattempted: scoped.filter((q) => (stats.get(q.id)?.answered || 0) === 0).length,
    attempted: scoped.filter((q) => (stats.get(q.id)?.answered || 0) > 0).length,
    today: scoped.filter((q) => stats.get(q.id)?.today).length,
    unanswered: scoped.filter((q) => !isQuestionValid(q)).length,
    images: scoped.filter((q) => !!(q.images?.length || q.imageUrl)).length,
  }), [scoped, flags, stats]);

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('vi-VN');
    return scoped.filter((q) => {
      if (tag !== 'all' && !(q.tags || []).includes(tag)) return false;
      if (status === 'flagged' && !flags[q.id]) return false;
      if (status === 'review' && cardState(q) !== 'Cần ôn') return false;
      if (status === 'mistaken' && !(stats.get(q.id)?.incorrect || 0)) return false;
      if (status === 'unattempted' && (stats.get(q.id)?.answered || 0) > 0) return false;
      if (status === 'attempted' && !(stats.get(q.id)?.answered || 0)) return false;
      if (status === 'today' && !stats.get(q.id)?.today) return false;
      if (status === 'unanswered' && isQuestionValid(q)) return false;
      if (status === 'images' && !(q.images?.length || q.imageUrl)) return false;
      if (!search) return true;
      return [q.question, q.categoryName, q.sourceId || '', String(q.sourceNumber || ''), q.explanation || '', ...(q.options || []), ...(q.tags || [])]
        .join(' ').toLocaleLowerCase('vi-VN').includes(search);
    }).sort((a, b) => {
      if (sort === 'wrong') return (stats.get(b.id)?.incorrect || 0) - (stats.get(a.id)?.incorrect || 0);
      if (sort === 'attempted') return (stats.get(b.id)?.answered || 0) - (stats.get(a.id)?.answered || 0);
      return 0;
    });
  }, [scoped, status, tag, flags, stats, query, sort]);
  const totalPages = Math.max(1, Math.ceil(visible.length / 30));
  const currentPage = Math.min(page, totalPages);
  const rows = visible.slice((currentPage - 1) * 30, currentPage * 30);
  const selected = visible.find((q) => q.id === selectedId) || rows[0] || null;
  const flaggedValidCount = questions.filter((q) => flags[q.id] && isQuestionValid(q)).length;

  const resetPreview = () => { setPreviewMode(false); setPreviewChoice(null); setPreviewSubmitted(false); setRevealAnswer(false); };
  const changeFilter = (value: Status) => { setStatus(value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); resetPreview(); };
  const toggleFlag = (id: string) => {
    if (status === 'flagged' && flags[id]) { setSelectedId(null); resetPreview(); }
    onToggleFlag(id);
  };
  const openQuestion = (id: string) => {
    setSelectedId(id);
    resetPreview();
    if (window.matchMedia('(max-width: 1023px)').matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const toggleSelection = (id: string) => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openEditor = (question: Question) => {
    setEditQuestion(question);
    setEditStem(question.question);
    setEditAnswer(isQuestionValid(question) ? question.correctAnswer : -1);
    setEditOptions(question.options.length >= 2 ? [...question.options] : [...question.options, ...Array(2 - question.options.length).fill('')]);
    setEditExplanation(question.explanationHtml || question.explanationPages?.length ? question.manualExplanation || '' : question.explanation || '');
    setEditTags(question.tags || []);
    setNewTag('');
  };
  const saveEditor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editQuestion || !editStem.trim() || editAnswer < 0 || editAnswer >= editOptions.length || editOptions.some((option) => !option.trim())) return;
    const rich = !!(editQuestion.explanationHtml || editQuestion.explanationPages?.length);
    onUpdateQuestion(editQuestion.id, {
      question: editStem.trim(), options: editOptions, correctAnswer: editAnswer,
      explanation: rich ? editQuestion.explanation || '' : editExplanation.trim(),
      manualExplanation: rich ? editExplanation.trim() : editQuestion.manualExplanation || '',
      tags: editTags,
    });
    setEditQuestion(null);
  };
  const addTag = (label: string) => {
    const clean = label.trim();
    if (!clean || editTags.some((value) => value.toLocaleLowerCase('vi-VN') === clean.toLocaleLowerCase('vi-VN'))) return;
    setEditTags((previous) => [...previous, clean]);
    setNewTag('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300"><ArrowLeft size={16} /> Trang chủ</button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Browser câu hỏi</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Lọc, đánh dấu và xem tư liệu của từng câu hỏi.</p>
        </div>
        <button type="button" onClick={onOpenBank} className="min-h-11 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-semibold text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-300">Mở Ngân hàng câu hỏi</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(260px,1fr)_minmax(330px,1.2fr)] lg:items-start">
        <aside className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Mục học</h2>
            <select aria-label="Lọc theo mục" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); resetPreview(); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="all">Tất cả mục ({questions.length})</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({questions.filter((q) => q.categoryId === cat.id).length})</option>)}
            </select>
          </div>
          {blocks.length > 0 && <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Block nguồn</h2>
            <select aria-label="Lọc theo block nguồn" value={sourceBlock} onChange={(e) => { setSourceBlock(e.target.value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); resetPreview(); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="all">Tất cả block</option>{blocks.map((block) => <option key={block} value={String(block)}>Block {block}</option>)}
            </select>
          </div>}
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Tình trạng & cờ</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {filters.map((filter) => (
                <button key={filter.id} type="button" onClick={() => changeFilter(filter.id)} aria-pressed={status === filter.id} className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-xs font-semibold ${status === filter.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 dark:bg-slate-900 dark:text-slate-200'}`}>
                  <span>{filter.label}</span><span>{counts[filter.id]}</span>
                </button>
              ))}
            </div>
          </div>
          {tags.length > 0 && <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Nhãn</h2>
            <select aria-label="Lọc theo nhãn" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); setSelectedIds(new Set()); resetPreview(); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="all">Tất cả nhãn</option>{tags.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>}
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <label className="relative block"><Search size={17} className="absolute left-3 top-3.5 text-slate-400" /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); resetPreview(); }} placeholder="Tìm nội dung, mã câu, lời giải..." className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm dark:border-slate-600 dark:bg-slate-900" /></label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{visible.length} câu phù hợp</span>
            <select aria-label="Sắp xếp" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900">
              <option value="recent">Mới nhập trước</option><option value="wrong">Sai nhiều trước</option><option value="attempted">Làm nhiều trước</option>
            </select>
          </div>
          {selectedIds.size > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 p-2 text-xs dark:bg-slate-900">
            <span>Đã chọn {selectedIds.size}</span>
            <button type="button" onClick={() => { onSetFlags([...selectedIds], true); setSelectedIds(new Set()); }} className="min-h-11 rounded-lg bg-amber-500 px-3 font-bold text-white">Gắn cờ</button>
            <button type="button" onClick={() => { onSetFlags([...selectedIds], false); setSelectedIds(new Set()); setSelectedId(null); resetPreview(); }} className="min-h-11 rounded-lg border border-slate-300 px-3 font-bold">Bỏ cờ</button>
          </div>}
          <div className="mt-3 max-h-[650px] space-y-2 overflow-y-auto pr-1">
            {rows.length === 0 && <p className="py-12 text-center text-sm text-slate-500">Không có câu hỏi phù hợp.</p>}
            {rows.map((question) => <div key={question.id} className={`flex items-start gap-2 rounded-xl border p-2 ${selected?.id === question.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="checkbox" aria-label={`Chọn câu ${question.sourceNumber || question.id}`} checked={selectedIds.has(question.id)} onChange={() => toggleSelection(question.id)} className="mt-3 h-5 w-5 shrink-0" />
              <button type="button" onClick={() => openQuestion(question.id)} className="min-h-11 min-w-0 flex-1 rounded-lg p-1 text-left">
                <div className="flex flex-wrap gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300"><span>{question.categoryName || 'Mục chung'}</span><span>· Câu {question.sourceNumber || '—'}</span>{(question.images?.length || question.imageUrl) && <span className="inline-flex items-center gap-0.5"><ImageIcon size={12} /> Có hình</span>}{!isQuestionValid(question) && <span className="text-amber-600">· Thiếu đáp án</span>}</div>
                <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{question.question}</p>
                <p className="mt-1 text-[11px] text-slate-500">{cardState(question)} · Đã làm {stats.get(question.id)?.answered || 0} · Sai {stats.get(question.id)?.incorrect || 0}</p>
              </button>
              <button type="button" onClick={() => toggleFlag(question.id)} aria-label={flags[question.id] ? 'Bỏ cờ học tập' : 'Gắn cờ học tập'} aria-pressed={!!flags[question.id]} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl ${flags[question.id] ? 'bg-amber-100 text-amber-600' : 'text-slate-400'}`}><Flag size={18} fill={flags[question.id] ? 'currentColor' : 'none'} /></button>
            </div>)}
          </div>
          {visible.length > 30 && <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><span>Trang {currentPage}/{totalPages}</span><div className="flex gap-2"><button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedId(null); resetPreview(); }} className="min-h-11 rounded-lg border px-3 disabled:opacity-40"><ChevronLeft size={15} /></button><button type="button" disabled={currentPage === totalPages} onClick={() => { setPage(currentPage + 1); setSelectedId(null); resetPreview(); }} className="min-h-11 rounded-lg border px-3 disabled:opacity-40"><ChevronRight size={15} /></button></div></div>}
        </section>

        <section ref={detailRef} className="min-w-0 scroll-mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          {!selected ? <div className="py-16 text-center text-sm text-slate-500">Chọn một câu hỏi để xem chi tiết.</div> : <>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-indigo-600">{selected.categoryName} · Câu {selected.sourceNumber || '—'}</p><h2 className="mt-2 text-base font-bold leading-relaxed">{selected.question}</h2></div><button type="button" onClick={() => toggleFlag(selected.id)} aria-pressed={!!flags[selected.id]} className={`flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-bold ${flags[selected.id] ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}><Flag size={16} />{flags[selected.id] ? 'Cần ôn lại' : 'Gắn cờ cần ôn'}</button></div>
            <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700">{cardState(selected)}</span><button type="button" onClick={() => { setPreviewMode(true); setPreviewChoice(null); setPreviewSubmitted(false); setRevealAnswer(false); }} className="min-h-11 rounded-xl border border-indigo-300 px-3 font-semibold text-indigo-700 dark:text-indigo-300">Xem như khi làm bài</button>{previewMode && <button type="button" onClick={resetPreview} className="min-h-11 rounded-xl border px-3 font-semibold">Trở về chi tiết</button>}</div>
            {(selected.images?.length ? selected.images : selected.imageUrl ? [selected.imageUrl] : []).map((src, index) => <button type="button" key={index} onClick={() => setZoom(src)} className="block w-full rounded-xl border border-slate-200 p-2 dark:border-slate-700"><img src={src} loading="lazy" alt={`Hình câu hỏi ${index + 1}`} className="max-h-64 w-full object-contain" /></button>)}
            <div className="space-y-2">{selected.options.map((option, index) => {
              const shown = previewMode ? previewSubmitted : revealAnswer;
              const style = shown && index === selected.correctAnswer ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : previewMode && previewChoice === index ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100' : 'border-slate-200 dark:border-slate-700';
              return previewMode ? <button key={index} type="button" disabled={previewSubmitted || !isQuestionValid(selected)} onClick={() => setPreviewChoice(index)} aria-pressed={previewChoice === index} className={`min-h-11 w-full rounded-xl border p-3 text-left text-sm disabled:cursor-default ${style}`}><strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>{option}</button> : <div key={index} className={`rounded-xl border p-3 text-sm ${style}`}><strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>{option}</div>;
            })}</div>
            {previewMode ? <div className="space-y-2"><button type="button" disabled={previewChoice === null || previewSubmitted || !isQuestionValid(selected)} onClick={() => setPreviewSubmitted(true)} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40">Nộp thử</button>{previewSubmitted && <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm font-bold dark:bg-slate-700">{previewChoice === selected.correctAnswer ? 'Bạn đã chọn đúng.' : `Bạn chọn ${String.fromCharCode(65 + (previewChoice ?? 0))}. Đáp án đúng: ${String.fromCharCode(65 + selected.correctAnswer)}.`} Lần thử này không ghi vào Analyze.</p>}</div>
              : <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setRevealAnswer(!revealAnswer)} disabled={!isQuestionValid(selected)} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40"><BookOpen size={16} className="mr-1 inline" />{revealAnswer ? 'Ẩn đáp án' : 'Xem đáp án và lời giải'}</button><button type="button" onClick={() => openEditor(selected)} className="min-h-11 rounded-xl border border-indigo-300 px-4 text-sm font-bold text-indigo-700 dark:text-indigo-300"><Pencil size={15} className="mr-1 inline" />Sửa câu hỏi</button></div>}
            {(previewMode ? previewSubmitted : revealAnswer) && (selected.manualExplanation || selected.explanation || selected.explanationHtml || selected.explanationPages?.length) && <AnswerExplanation key={selected.id} question={selected} onZoom={setZoom} />}
            {!previewMode && !isQuestionValid(selected) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={15} className="mr-1 inline" />Câu này cần bổ sung đáp án trước khi ôn MCQ.</p>}
            {(selected.tags?.length || 0) > 0 && <p className="text-xs text-slate-500">Nhãn học tập: {selected.tags!.join(' · ')}</p>}
            <div className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700">Đã làm {stats.get(selected.id)?.answered || 0} lần · Sai {stats.get(selected.id)?.incorrect || 0} lần</div>
          </>}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-sm font-semibold text-amber-900 dark:text-amber-200"><Bookmark size={17} className="mr-1 inline" />Có {counts.flagged} câu gắn cờ trong mục đang chọn; {flaggedValidCount} câu có đáp án trên toàn ngân hàng.</p><button type="button" onClick={onReviewFlagged} disabled={flaggedValidCount === 0} className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-40">Ôn các câu đã gắn cờ</button></div>

      {editQuestion && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <form onSubmit={saveEditor} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Sửa câu hỏi</h2><button type="button" onClick={() => setEditQuestion(null)} aria-label="Đóng" className="min-h-11 min-w-11"><X size={18} /></button></div>
          <label className="block text-sm font-bold">Nội dung câu hỏi<textarea required value={editStem} onChange={(e) => setEditStem(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border p-3 font-normal dark:bg-slate-800" /></label>
          <fieldset className="space-y-2"><legend className="text-sm font-bold">Phương án và đáp án đúng</legend>{editOptions.map((option, index) => <div key={index} className="flex min-h-11 items-center gap-2 rounded-xl border p-2"><input type="radio" name="correct-answer" checked={editAnswer === index} onChange={() => setEditAnswer(index)} aria-label={`Đáp án ${String.fromCharCode(65 + index)}`} /><span className="font-bold">{String.fromCharCode(65 + index)}.</span><input required value={option} onChange={(e) => setEditOptions((old) => old.map((item, i) => i === index ? e.target.value : item))} className="min-h-11 min-w-0 flex-1 rounded-lg border px-2 text-sm dark:bg-slate-800" /></div>)}</fieldset>
          <button type="button" onClick={() => setEditOptions((old) => [...old, ''])} className="min-h-11 text-xs font-bold text-indigo-700">+ Thêm phương án</button>
          <label className="block text-sm font-bold">{editQuestion.explanationHtml || editQuestion.explanationPages?.length ? 'Ghi chú bổ sung (tư liệu gốc được giữ nguyên)' : 'Lời giải (tùy chọn)'}<textarea value={editExplanation} onChange={(e) => setEditExplanation(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border p-3 font-normal dark:bg-slate-800" /></label>
          <div className="space-y-2"><h3 className="text-sm font-bold">Nhãn học tập</h3><div className="flex flex-wrap gap-2">{editTags.map((label) => <button key={label} type="button" onClick={() => setEditTags((previous) => previous.filter((item) => item !== label))} aria-label={`Xóa nhãn ${label}`} className="min-h-11 rounded-xl bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{label} ×</button>)}</div><div className="flex flex-wrap gap-2">{['Hình ảnh', 'Ca lâm sàng', 'Cần kiểm tra nguồn'].filter((label) => !editTags.includes(label)).map((label) => <button key={label} type="button" onClick={() => addTag(label)} className="min-h-11 rounded-xl border px-3 text-xs">+ {label}</button>)}</div><div className="flex gap-2"><input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nhãn khác" aria-label="Nhãn mới" className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm dark:bg-slate-800" /><button type="button" onClick={() => addTag(newTag)} className="min-h-11 rounded-xl border px-3 text-xs font-bold">Thêm nhãn</button></div></div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditQuestion(null)} className="min-h-11 px-3">Hủy</button><button type="submit" disabled={!editStem.trim() || editAnswer < 0 || editOptions.some((option) => !option.trim())} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40"><Check size={15} className="mr-1 inline" />Lưu câu hỏi</button></div>
        </form>
      </div>}
      {zoom && <div role="dialog" aria-label="Xem ảnh lớn" onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"><button type="button" onClick={() => setZoom(null)} aria-label="Đóng ảnh" className="absolute right-4 top-4 min-h-11 min-w-11 text-white"><X size={22} /></button><img src={zoom} alt="Ảnh phóng to" className="max-h-[90vh] max-w-full object-contain" /></div>}
    </div>
  );
};
