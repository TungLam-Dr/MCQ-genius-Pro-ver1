import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, Flag, Pencil, Save, Search, Trash2, X } from 'lucide-react';
import { Category, Question, QuestionAttempt } from '../types/quiz';
import { isQuestionValid } from '../utils/quizEngine';
import { getStorageItem, setStorageItem } from '../utils/storage';
import { AnswerExplanation } from './AnswerExplanation';

type Status = 'all' | 'flagged' | 'mistaken' | 'unattempted' | 'attempted' | 'unanswered' | 'images';
type SavedView = { id: string; name: string; categoryId: string; status: Status; query: string; tag: string; sourceBlock?: string };

interface Props {
  questions: Question[];
  categories: Category[];
  attempts: QuestionAttempt[];
  flags: Record<string, boolean>;
  onToggleFlag: (questionId: string) => void;
  onSetFlags: (ids: string[], flagged: boolean) => void;
  onUpdateAnswer: (id: string, answer: number, explanation: string, options: string[]) => void;
  onReviewFlagged: () => void;
  onOpenBank: () => void;
  onBack: () => void;
}

const filters: { id: Status; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'flagged', label: 'Đã gắn cờ' },
  { id: 'mistaken', label: 'Từng làm sai' },
  { id: 'unattempted', label: 'Chưa làm' },
  { id: 'attempted', label: 'Đã làm' },
  { id: 'unanswered', label: 'Chưa có đáp án' },
  { id: 'images', label: 'Có hình ảnh' },
];

export const QuestionBrowser: React.FC<Props> = ({
  questions, categories, attempts, flags, onToggleFlag, onSetFlags,
  onUpdateAnswer, onReviewFlagged, onOpenBank, onBack,
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
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);
  const [editAnswer, setEditAnswer] = useState(-1);
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editExplanation, setEditExplanation] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewsReady, setViewsReady] = useState(false);
  const [viewName, setViewName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let mounted = true;
    void getStorageItem<SavedView[]>('mcq_genius_browser_views', [])
      .then((views) => { if (mounted) { setSavedViews(Array.isArray(views) ? views : []); setViewsReady(true); } })
      .catch((error) => console.warn('Không đọc được bộ lọc Browser:', error));
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!viewsReady) return;
    void setStorageItem('mcq_genius_browser_views', savedViews).catch((error) => console.warn('Không lưu được bộ lọc Browser:', error));
  }, [savedViews, viewsReady]);

  const stats = useMemo(() => {
    const byId = new Map<string, { answered: number; incorrect: number }>();
    for (const attempt of attempts) {
      const value = byId.get(attempt.questionId) || { answered: 0, incorrect: 0 };
      if (attempt.answered) value.answered++;
      if (attempt.answered && !attempt.correct) value.incorrect++;
      byId.set(attempt.questionId, value);
    }
    return byId;
  }, [attempts]);

  const tags = useMemo(() => Array.from(new Set(questions.flatMap((q) => q.tags || []))).sort(), [questions]);
  const blocks = useMemo(() => Array.from(new Set(questions.map((q) => q.sourceBlock).filter((value): value is number => typeof value === 'number'))).sort((a, b) => a - b), [questions]);
  const scoped = useMemo(() => questions.filter((q) =>
    (categoryId === 'all' || q.categoryId === categoryId) &&
    (sourceBlock === 'all' || q.sourceBlock === Number(sourceBlock))
  ), [questions, categoryId, sourceBlock]);
  const counts = useMemo(() => ({
    all: scoped.length,
    flagged: scoped.filter((q) => flags[q.id]).length,
    mistaken: scoped.filter((q) => (stats.get(q.id)?.incorrect || 0) > 0).length,
    unattempted: scoped.filter((q) => (stats.get(q.id)?.answered || 0) === 0).length,
    attempted: scoped.filter((q) => (stats.get(q.id)?.answered || 0) > 0).length,
    unanswered: scoped.filter((q) => !isQuestionValid(q)).length,
    images: scoped.filter((q) => !!(q.images?.length || q.imageUrl)).length,
  }), [scoped, flags, stats]);

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('vi-VN');
    return scoped.filter((q) => {
      if (tag !== 'all' && !(q.tags || []).includes(tag)) return false;
      if (status === 'flagged' && !flags[q.id]) return false;
      if (status === 'mistaken' && !(stats.get(q.id)?.incorrect || 0)) return false;
      if (status === 'unattempted' && (stats.get(q.id)?.answered || 0) > 0) return false;
      if (status === 'attempted' && !(stats.get(q.id)?.answered || 0)) return false;
      if (status === 'unanswered' && isQuestionValid(q)) return false;
      if (status === 'images' && !(q.images?.length || q.imageUrl)) return false;
      if (!search) return true;
      return [q.question, q.categoryName, q.sourceId || '', String(q.sourceNumber || ''), q.explanation || '', ...(q.options || [])]
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

  const changeFilter = (value: Status) => { setStatus(value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); setRevealAnswer(false); };
  const toggleFlag = (id: string) => {
    if (status === 'flagged' && flags[id]) { setSelectedId(null); setRevealAnswer(false); }
    onToggleFlag(id);
  };
  const openQuestion = (id: string) => {
    setSelectedId(id);
    setRevealAnswer(false);
    if (window.matchMedia('(max-width: 1023px)').matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const toggleSelection = (id: string) => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openEditor = (question: Question) => {
    setEditQuestion(question);
    setEditAnswer(isQuestionValid(question) ? question.correctAnswer : -1);
    setEditOptions(question.options.length >= 2 ? [...question.options] : [...question.options, ...Array(2 - question.options.length).fill('')]);
    setEditExplanation(question.explanation || '');
  };
  const saveEditor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editQuestion || editAnswer < 0 || editAnswer >= editOptions.length || editOptions.some((option) => !option.trim())) return;
    onUpdateAnswer(editQuestion.id, editAnswer, editExplanation.trim(), editOptions);
    setEditQuestion(null);
  };
  const saveView = (event: React.FormEvent) => {
    event.preventDefault();
    if (!viewName.trim()) return;
    setSavedViews((previous) => [...previous, { id: `view-${Date.now()}`, name: viewName.trim(), categoryId, status, query, tag, sourceBlock }]);
    setViewName(''); setShowSave(false);
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
            <select aria-label="Lọc theo mục" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); setRevealAnswer(false); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="all">Tất cả mục ({questions.length})</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({questions.filter((q) => q.categoryId === cat.id).length})</option>)}
            </select>
          </div>
          {blocks.length > 0 && <div>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Block nguồn</h2>
            <select aria-label="Lọc theo block nguồn" value={sourceBlock} onChange={(e) => { setSourceBlock(e.target.value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); setRevealAnswer(false); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900">
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
            <select aria-label="Lọc theo nhãn" value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); setSelectedIds(new Set()); setRevealAnswer(false); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="all">Tất cả nhãn</option>{tags.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>}
          <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Bộ lọc đã lưu</h2>
            {savedViews.map((view) => <div key={view.id} className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => { setCategoryId(view.categoryId); setSourceBlock(view.sourceBlock || 'all'); setStatus(view.status); setQuery(view.query); setTag(view.tag); setPage(1); setSelectedId(null); setSelectedIds(new Set()); setRevealAnswer(false); }} className="min-h-11 min-w-0 flex-1 truncate rounded-xl bg-slate-100 px-3 text-left text-xs dark:bg-slate-900" title={view.name}>{view.name}</button>
              <button type="button" onClick={() => setSavedViews((previous) => previous.filter((item) => item.id !== view.id))} aria-label={`Xóa bộ lọc ${view.name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-red-500"><Trash2 size={15} /></button>
            </div>)}
            {showSave ? <form onSubmit={saveView} className="space-y-2"><input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Tên bộ lọc" aria-label="Tên bộ lọc" className="min-h-11 w-full rounded-xl border border-slate-300 px-2 text-sm dark:bg-slate-900" /><button type="submit" className="min-h-11 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white">Lưu bộ lọc</button></form>
              : <button type="button" onClick={() => setShowSave(true)} className="min-h-11 text-xs font-bold text-indigo-600 dark:text-indigo-300"><Save size={15} className="mr-1 inline" /> Lưu bộ lọc hiện tại</button>}
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <label className="relative block"><Search size={17} className="absolute left-3 top-3.5 text-slate-400" /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); setSelectedId(null); setSelectedIds(new Set()); setRevealAnswer(false); }} placeholder="Tìm nội dung, mã câu, lời giải..." className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm dark:border-slate-600 dark:bg-slate-900" /></label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{visible.length} câu phù hợp</span>
            <select aria-label="Sắp xếp" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900">
              <option value="recent">Mới nhập trước</option><option value="wrong">Sai nhiều trước</option><option value="attempted">Làm nhiều trước</option>
            </select>
          </div>
          {selectedIds.size > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 p-2 text-xs dark:bg-slate-900">
            <span>Đã chọn {selectedIds.size}</span>
            <button type="button" onClick={() => { onSetFlags([...selectedIds], true); setSelectedIds(new Set()); }} className="min-h-11 rounded-lg bg-amber-500 px-3 font-bold text-white">Gắn cờ</button>
            <button type="button" onClick={() => { onSetFlags([...selectedIds], false); setSelectedIds(new Set()); setSelectedId(null); setRevealAnswer(false); }} className="min-h-11 rounded-lg border border-slate-300 px-3 font-bold">Bỏ cờ</button>
          </div>}
          <div className="mt-3 max-h-[650px] space-y-2 overflow-y-auto pr-1">
            {rows.length === 0 && <p className="py-12 text-center text-sm text-slate-500">Không có câu hỏi phù hợp.</p>}
            {rows.map((question) => <div key={question.id} className={`flex items-start gap-2 rounded-xl border p-2 ${selected?.id === question.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="checkbox" aria-label={`Chọn câu ${question.sourceNumber || question.id}`} checked={selectedIds.has(question.id)} onChange={() => toggleSelection(question.id)} className="mt-3 h-5 w-5 shrink-0" />
              <button type="button" onClick={() => openQuestion(question.id)} className="min-h-11 min-w-0 flex-1 rounded-lg p-1 text-left">
                <div className="flex flex-wrap gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300"><span>{question.categoryName || 'Mục chung'}</span><span>· Câu {question.sourceNumber || '—'}</span>{!isQuestionValid(question) && <span className="text-amber-600">· Thiếu đáp án</span>}</div>
                <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{question.question}</p>
                <p className="mt-1 text-[11px] text-slate-500">Đã làm {stats.get(question.id)?.answered || 0} · Sai {stats.get(question.id)?.incorrect || 0}</p>
              </button>
              <button type="button" onClick={() => toggleFlag(question.id)} aria-label={flags[question.id] ? 'Bỏ cờ học tập' : 'Gắn cờ học tập'} aria-pressed={!!flags[question.id]} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl ${flags[question.id] ? 'bg-amber-100 text-amber-600' : 'text-slate-400'}`}><Flag size={18} fill={flags[question.id] ? 'currentColor' : 'none'} /></button>
            </div>)}
          </div>
          {visible.length > 30 && <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><span>Trang {currentPage}/{totalPages}</span><div className="flex gap-2"><button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedId(null); setRevealAnswer(false); }} className="min-h-11 rounded-lg border px-3 disabled:opacity-40"><ChevronLeft size={15} /></button><button type="button" disabled={currentPage === totalPages} onClick={() => { setPage(currentPage + 1); setSelectedId(null); setRevealAnswer(false); }} className="min-h-11 rounded-lg border px-3 disabled:opacity-40"><ChevronRight size={15} /></button></div></div>}
        </section>

        <section ref={detailRef} className="min-w-0 scroll-mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          {!selected ? <div className="py-16 text-center text-sm text-slate-500">Chọn một câu hỏi để xem chi tiết.</div> : <>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-indigo-600">{selected.categoryName} · Câu {selected.sourceNumber || '—'}{selected.sourceId ? ` · ID ${selected.sourceId}` : ''}</p><h2 className="mt-2 text-base font-bold leading-relaxed">{selected.question}</h2></div><button type="button" onClick={() => toggleFlag(selected.id)} aria-pressed={!!flags[selected.id]} className={`flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-bold ${flags[selected.id] ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}><Flag size={16} />{flags[selected.id] ? 'Đã gắn cờ' : 'Gắn cờ'}</button></div>
            {(selected.images?.length ? selected.images : selected.imageUrl ? [selected.imageUrl] : []).map((src, index) => <button type="button" key={index} onClick={() => setZoom(src)} className="block w-full rounded-xl border border-slate-200 p-2 dark:border-slate-700"><img src={src} loading="lazy" alt={`Hình câu hỏi ${index + 1}`} className="max-h-64 w-full object-contain" /></button>)}
            <div className="space-y-2">{selected.options.map((option, index) => <div key={index} className={`rounded-xl border p-3 text-sm ${revealAnswer && index === selected.correctAnswer ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-200 dark:border-slate-700'}`}><strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>{option}</div>)}</div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setRevealAnswer(!revealAnswer)} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white"><BookOpen size={16} className="mr-1 inline" />{revealAnswer ? 'Ẩn đáp án' : 'Xem đáp án và lời giải'}</button><button type="button" onClick={() => openEditor(selected)} className="min-h-11 rounded-xl border border-indigo-300 px-4 text-sm font-bold text-indigo-700 dark:text-indigo-300"><Pencil size={15} className="mr-1 inline" />Sửa đáp án</button></div>
            {revealAnswer && (selected.explanation || selected.explanationHtml || selected.explanationPages?.length) && <AnswerExplanation key={selected.id} question={selected} onZoom={setZoom} />}
            {revealAnswer && !isQuestionValid(selected) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={15} className="mr-1 inline" />Câu này cần bổ sung đáp án trước khi ôn MCQ.</p>}
            {(selected.tags?.length || 0) > 0 && <p className="text-xs text-slate-500">Nhãn: {selected.tags!.join(' · ')}</p>}
            <div className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700">Đã làm {stats.get(selected.id)?.answered || 0} lần · Sai {stats.get(selected.id)?.incorrect || 0} lần</div>
          </>}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20"><p className="text-sm font-semibold text-amber-900 dark:text-amber-200"><Bookmark size={17} className="mr-1 inline" />Có {counts.flagged} câu gắn cờ trong mục đang chọn; {flaggedValidCount} câu có đáp án trên toàn ngân hàng.</p><button type="button" onClick={onReviewFlagged} disabled={flaggedValidCount === 0} className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-40">Ôn các câu đã gắn cờ</button></div>

      {editQuestion && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={saveEditor} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Sửa đáp án</h2><button type="button" onClick={() => setEditQuestion(null)} aria-label="Đóng" className="min-h-11 min-w-11"><X size={18} /></button></div><p className="text-sm font-semibold">{editQuestion.question}</p><fieldset className="space-y-2"><legend className="text-sm font-bold">Chọn đáp án đúng và sửa phương án nếu cần</legend>{editOptions.map((option, index) => <div key={index} className="flex min-h-11 items-center gap-2 rounded-xl border p-2"><input type="radio" name="correct-answer" checked={editAnswer === index} onChange={() => setEditAnswer(index)} aria-label={`Đáp án ${String.fromCharCode(65 + index)}`} /><span className="font-bold">{String.fromCharCode(65 + index)}.</span><input value={option} onChange={(e) => setEditOptions((old) => old.map((item, i) => i === index ? e.target.value : item))} className="min-h-11 min-w-0 flex-1 rounded-lg border px-2 text-sm dark:bg-slate-800" /></div>)}</fieldset><button type="button" onClick={() => setEditOptions((old) => [...old, ''])} className="min-h-11 text-xs font-bold text-indigo-700">+ Thêm phương án</button>{!(editQuestion.explanationHtml || editQuestion.explanationPages?.length) ? <label className="block text-sm font-bold">Lời giải (tùy chọn)<textarea value={editExplanation} onChange={(e) => setEditExplanation(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border p-3 font-normal dark:bg-slate-800" /></label> : <p className="text-xs text-slate-500">Lời giải gốc có bảng hoặc hình; phần này được giữ nguyên khi sửa đáp án.</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setEditQuestion(null)} className="min-h-11 px-3">Hủy</button><button type="submit" disabled={editAnswer < 0 || editOptions.some((option) => !option.trim())} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40"><Check size={15} className="mr-1 inline" />Lưu đáp án</button></div></form></div>}
      {zoom && <div role="dialog" aria-label="Xem ảnh lớn" onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"><button type="button" onClick={() => setZoom(null)} aria-label="Đóng ảnh" className="absolute right-4 top-4 min-h-11 min-w-11 text-white"><X size={22} /></button><img src={zoom} alt="Ảnh phóng to" className="max-h-[90vh] max-w-full object-contain" /></div>}
    </div>
  );
};
