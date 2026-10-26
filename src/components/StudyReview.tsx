import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Flag, Pencil, Search, X } from 'lucide-react';
import type { Category, Question, QuestionAttempt, ReviewGrade, ReviewSchedule, StudyFlagColor } from '../types/quiz';
import { isQuestionValid } from '../utils/quizEngine';
import { isReviewDue, isReviewOverdue, tomorrowStart } from '../utils/reviewScheduler';
import { categoryPath, isFolder, subtreeIds } from '../utils/categoryTree';
import { getStorageItem, setStorageItem } from '../utils/storage';
import { AnswerExplanation } from './AnswerExplanation';

type FilterStatus = 'all' | 'due' | 'overdue' | 'new' | 'learning' | 'review' | 'flagged' | 'mistaken' | 'today' | 'suspended' | 'buried';
type QuestionChanges = Pick<Question, 'question' | 'options' | 'correctAnswer' | 'explanation' | 'manualExplanation' | 'tags'>;
interface Filters {
  block: string;
  categoryIds: string[];
  status: FilterStatus;
  tag: string;
  color: StudyFlagColor | 'all';
  search: string;
}
interface SavedFilter { id: string; name: string; filters: Filters }
interface Props {
  questions: Question[];
  categories: Category[];
  attempts: QuestionAttempt[];
  flags: Record<string, boolean>;
  flagColors: Record<string, StudyFlagColor>;
  schedules: Record<string, ReviewSchedule>;
  suspended: Record<string, boolean>;
  buriedUntil: Record<string, string>;
  onFlagColor: (id: string, color: StudyFlagColor | null) => void;
  onSuspend: (id: string, value: boolean) => void;
  onBury: (id: string, until: string | null) => void;
  onGrade: (question: Question, grade: ReviewGrade, correct: boolean) => void;
  onSetTags: (id: string, tags: string[]) => void;
  onEdit: (id: string, changes: QuestionChanges) => void;
  onBack: () => void;
}

const initialFilters: Filters = { block: 'all', categoryIds: [], status: 'all', tag: 'all', color: 'all', search: '' };
const colors: { id: StudyFlagColor; label: string; swatch: string }[] = [
  { id: 'red', label: 'Đỏ', swatch: 'bg-red-500' }, { id: 'orange', label: 'Cam', swatch: 'bg-orange-500' },
  { id: 'green', label: 'Xanh lá', swatch: 'bg-green-500' }, { id: 'blue', label: 'Xanh dương', swatch: 'bg-blue-500' },
  { id: 'pink', label: 'Hồng', swatch: 'bg-pink-500' }, { id: 'teal', label: 'Xanh ngọc', swatch: 'bg-teal-500' },
  { id: 'purple', label: 'Tím', swatch: 'bg-purple-500' },
];
const grades: { id: ReviewGrade; label: string; caption: string; style: string }[] = [
  { id: 'again', label: 'Lại', caption: '10 phút', style: 'border-rose-300 text-rose-700 dark:text-rose-300' },
  { id: 'hard', label: 'Khó', caption: '≥1 ngày', style: 'border-orange-300 text-orange-700 dark:text-orange-300' },
  { id: 'good', label: 'Tốt', caption: '≥3 ngày', style: 'border-sky-300 text-sky-700 dark:text-sky-300' },
  { id: 'easy', label: 'Dễ', caption: '≥7 ngày', style: 'border-emerald-300 text-emerald-700 dark:text-emerald-300' },
];
const statusOptions: { id: FilterStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'due', label: 'Đến hạn ôn' }, { id: 'overdue', label: 'Quá hạn' },
  { id: 'new', label: 'Chưa làm' }, { id: 'learning', label: 'Đang học' }, { id: 'review', label: 'Đã lên lịch' },
  { id: 'flagged', label: 'Đã gắn cờ' }, { id: 'mistaken', label: 'Từng làm sai' },
  { id: 'today', label: 'Đã làm hôm nay' }, { id: 'suspended', label: 'Tạm ẩn' }, { id: 'buried', label: 'Ẩn đến ngày mai' },
];
const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900';
const panelClass = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const searchable = (value: unknown) => String(value ?? '').toLocaleLowerCase('vi-VN');

export const StudyReview: React.FC<Props> = ({
  questions, categories, attempts, flags, flagColors, schedules, suspended, buriedUntil,
  onFlagColor, onSuspend, onBury, onGrade, onSetTags, onEdit, onBack,
}) => {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [savedReady, setSavedReady] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [limit, setLimit] = useState(20);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [position, setPosition] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionStats, setSessionStats] = useState({ done: 0, right: 0 });
  const [zoom, setZoom] = useState<string | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);
  const [editStem, setEditStem] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editAnswer, setEditAnswer] = useState(-1);
  const [editExplanation, setEditExplanation] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    let active = true;
    void getStorageItem<SavedFilter[]>('mcq_genius_saved_review_filters', [])
      .then(value => { if (active) { setSavedFilters(Array.isArray(value) ? value : []); setSavedReady(true); } })
      .catch(() => { if (active) { setSavedReady(true); setSaveError('Không đọc được bộ lọc đã lưu.'); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!savedReady) return;
    void setStorageItem('mcq_genius_saved_review_filters', savedFilters)
      .catch(() => setSaveError('Không lưu được bộ lọc trên thiết bị.'));
  }, [savedFilters, savedReady]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const map = new Map<string, { total: number; wrong: number; today: boolean }>();
    const day = new Date(clock).toDateString();
    for (const a of attempts) {
      const item = map.get(a.questionId) || { total: 0, wrong: 0, today: false };
      if (a.answered) { item.total++; if (!a.correct) item.wrong++; }
      if (a.answered && new Date(a.endTime).toDateString() === day) item.today = true;
      map.set(a.questionId, item);
    }
    return map;
  }, [attempts, clock]);
  const blocks = useMemo(() => [...new Set(questions.map(q => q.sourceBlock).filter((v): v is number => typeof v === 'number'))].sort((a, b) => a - b), [questions]);
  const inBlock = useMemo(() => questions.filter(q => filters.block === 'all' || (filters.block === 'unassigned' ? q.sourceBlock == null : q.sourceBlock === Number(filters.block))), [questions, filters.block]);
  const availableCategories = useMemo(() => categories.filter(c => inBlock.some(q => subtreeIds(categories, c.id).has(q.categoryId))), [categories, inBlock]);
  const selectedCategoryIds = useMemo(() => filters.categoryIds.length ? new Set(filters.categoryIds.flatMap(id => [...subtreeIds(categories, id)])) : null, [categories, filters.categoryIds]);
  const tags = useMemo(() => [...new Set(inBlock.flatMap(q => q.tags || []))].sort(), [inBlock]);
  const activeBury = (id: string) => !!buriedUntil[id] && Date.parse(buriedUntil[id]) > clock;
  const matchesStatus = (q: Question) => {
    const schedule = schedules[q.id];
    switch (filters.status) {
      case 'due': return isReviewDue(schedule, clock);
      case 'overdue': return isReviewOverdue(schedule, clock);
      case 'new': return !(stats.get(q.id)?.total || 0) && !schedule;
      case 'learning': return !!schedule && (schedule.repetitions === 0 || schedule.intervalDays < 1);
      case 'review': return !!schedule && schedule.repetitions > 0 && schedule.intervalDays >= 1;
      case 'flagged': return !!flags[q.id];
      case 'mistaken': return !!stats.get(q.id)?.wrong;
      case 'today': return !!stats.get(q.id)?.today;
      case 'suspended': return !!suspended[q.id];
      case 'buried': return activeBury(q.id);
      default: return true;
    }
  };
  const visible = useMemo(() => inBlock.filter(q => {
    if (selectedCategoryIds && !selectedCategoryIds.has(q.categoryId)) return false;
    if (filters.tag !== 'all' && !(q.tags || []).includes(filters.tag)) return false;
    if (filters.color !== 'all' && (!flags[q.id] || (flagColors[q.id] || 'red') !== filters.color)) return false;
    if (!matchesStatus(q)) return false;
    const search = searchable(filters.search.trim());
    return !search || [q.question, q.sourceId, q.sourceNumber, q.categoryName, ...q.options, ...(q.tags || [])]
      .some(part => searchable(part).includes(search));
  }), [inBlock, filters, stats, flags, flagColors, schedules, suspended, buriedUntil, clock]);
  const studyable = visible.filter(q => isQuestionValid(q) && !suspended[q.id] && !activeBury(q.id));
  const scoped = inBlock.filter(q => !selectedCategoryIds || selectedCategoryIds.has(q.categoryId));
  const dueCount = scoped.filter(q => isQuestionValid(q) && !suspended[q.id] && !activeBury(q.id) && isReviewDue(schedules[q.id], clock)).length;
  const newCount = scoped.filter(q => isQuestionValid(q) && !suspended[q.id] && !activeBury(q.id) && !schedules[q.id] && !(stats.get(q.id)?.total || 0)).length;
  const currentId = queue?.[position];
  const current = questions.find(q => q.id === currentId);
  const completed = queue !== null && position >= queue.length;
  const updateFilter = (partial: Partial<Filters>) => setFilters(previous => ({ ...previous, ...partial }));
  const start = (ids: string[]) => {
    if (!ids.length) return;
    setQueue(ids); setPosition(0); setChoice(null); setRevealed(false); setSessionStats({ done: 0, right: 0 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = () => { setPosition(previous => previous + 1); setChoice(null); setRevealed(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const grade = (value: ReviewGrade) => {
    if (!current || !revealed) return;
    // In Anki-style self recall, no option is selected. The grade then records the user's assessment.
    const correct = choice === null ? value === 'good' || value === 'easy' : choice === current.correctAnswer;
    onGrade(current, value, correct);
    setSessionStats(previous => ({ done: previous.done + 1, right: previous.right + (correct ? 1 : 0) }));
    next();
  };
  const saveFilter = () => {
    const name = window.prompt('Tên bộ lọc ôn tập:', `Bộ lọc ${savedFilters.length + 1}`)?.trim();
    if (!name) return;
    setSavedFilters(previous => [...previous, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, filters: { ...filters, categoryIds: [...filters.categoryIds] } }]);
  };
  const openEditor = (q: Question) => {
    setEditing(q); setEditStem(q.question); setEditOptions([...q.options]);
    setEditAnswer(isQuestionValid(q) ? q.correctAnswer : -1);
    setEditExplanation(q.explanationHtml || q.explanationPages?.length ? q.manualExplanation || '' : q.explanation || '');
  };
  const saveEditor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editStem.trim() || editOptions.length < 2 || editOptions.some(o => !o.trim()) || editAnswer < 0 || editAnswer >= editOptions.length) return;
    const rich = !!(editing.explanationHtml || editing.explanationPages?.length);
    onEdit(editing.id, {
      question: editStem.trim(), options: editOptions, correctAnswer: editAnswer,
      explanation: rich ? editing.explanation || '' : editExplanation.trim(),
      manualExplanation: rich ? editExplanation.trim() : editing.manualExplanation || '', tags: editing.tags || [],
    });
    setEditing(null);
  };
  const setTag = (q: Question) => {
    const tag = tagDraft.trim();
    if (!tag || (q.tags || []).some(t => searchable(t) === searchable(tag))) return;
    onSetTags(q.id, [...(q.tags || []), tag]); setTagDraft('');
  };
  const flagTools = (q: Question) => <div className="flex flex-wrap items-center gap-1.5" aria-label="Cờ học tập">
    <Flag size={17} className="mr-1" />
    {colors.map(color => <button key={color.id} type="button" onClick={() => onFlagColor(q.id, flags[q.id] && (flagColors[q.id] || 'red') === color.id ? null : color.id)} aria-label={`${flags[q.id] && (flagColors[q.id] || 'red') === color.id ? 'Bỏ cờ' : 'Gắn cờ'} ${color.label}`} aria-pressed={!!flags[q.id] && (flagColors[q.id] || 'red') === color.id} className={`min-h-11 min-w-11 rounded-xl border-2 flex items-center justify-center ${flags[q.id] && (flagColors[q.id] || 'red') === color.id ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}><span className={`h-5 w-5 rounded-full ${color.swatch}`} /></button>)}
    {flags[q.id] && <button type="button" onClick={() => onFlagColor(q.id, null)} className="min-h-11 px-2 text-xs underline">Bỏ cờ</button>}
  </div>;
  const controls = (q: Question) => <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
    <button type="button" onClick={() => onSuspend(q.id, !suspended[q.id])} className="min-h-11 rounded-xl border px-3">{suspended[q.id] ? 'Bỏ tạm ẩn' : 'Tạm ẩn khỏi ôn tập'}</button>
    <button type="button" onClick={() => onBury(q.id, activeBury(q.id) ? null : tomorrowStart())} className="min-h-11 rounded-xl border px-3">{activeBury(q.id) ? 'Hiện lại hôm nay' : 'Ẩn đến ngày mai'}</button>
    <button type="button" onClick={() => openEditor(q)} className="min-h-11 rounded-xl border px-3"><Pencil size={14} className="mr-1 inline" />Sửa câu</button>
  </div>;
  const tagTools = (q: Question) => <div className="space-y-2">
    <div className="flex flex-wrap gap-1.5">{(q.tags || []).map(tag => <button key={tag} type="button" onClick={() => onSetTags(q.id, (q.tags || []).filter(t => t !== tag))} className="min-h-11 rounded-lg bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" aria-label={`Xóa nhãn ${tag}`}>{tag} ×</button>)}</div>
    <div className="flex gap-2"><input value={tagDraft} onChange={event => setTagDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setTag(q); } }} placeholder="Thêm nhãn học tập" aria-label="Nhãn học tập mới" className={`${inputClass} min-w-0 flex-1`} /><button type="button" onClick={() => setTag(q)} className="min-h-11 rounded-xl border px-3 text-sm font-bold">Thêm</button></div>
  </div>;

  return <div className="space-y-5 pb-24">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><button type="button" onClick={onBack} className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300"><ArrowLeft size={17} /> Trang chủ</button><h1 className="flex items-center gap-2 text-2xl font-bold"><BookOpen className="text-amber-500" />Ôn tập</h1><p className="text-sm text-slate-500 dark:text-slate-400">Chọn Block, mục và bộ lọc để học lại từng câu.</p></div>
      {queue && <button type="button" onClick={() => setQueue(null)} className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Đóng phiên ôn</button>}
    </div>
    {saveError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{saveError}</p>}

    {queue === null ? <>
      <div className="grid gap-3 sm:grid-cols-3"><div className={panelClass}><p className="text-xs text-slate-500">Câu trong mục chọn</p><p className="text-2xl font-bold">{scoped.length}</p></div><div className={panelClass}><p className="text-xs text-slate-500">Đến hạn ôn</p><p className="text-2xl font-bold text-orange-600">{dueCount}</p></div><div className={panelClass}><p className="text-xs text-slate-500">Chưa làm</p><p className="text-2xl font-bold text-indigo-600">{newCount}</p></div></div>
      <section className={`${panelClass} space-y-4`} aria-label="Chọn nội dung ôn tập">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">Block<select className={`${inputClass} mt-1`} value={filters.block} onChange={event => updateFilter({ block: event.target.value, categoryIds: [], tag: 'all' })}><option value="all">Tất cả Block</option>{blocks.map(block => <option key={block} value={String(block)}>Block {block}</option>)}{questions.some(q => q.sourceBlock == null) && <option value="unassigned">Chưa có Block nguồn</option>}</select></label>
          <label className="text-sm font-semibold">Trạng thái<select className={`${inputClass} mt-1`} value={filters.status} onChange={event => updateFilter({ status: event.target.value as FilterStatus })}>{statusOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="text-sm font-semibold">Nhãn<select className={`${inputClass} mt-1`} value={filters.tag} onChange={event => updateFilter({ tag: event.target.value })}><option value="all">Mọi nhãn</option>{tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></label>
          <label className="text-sm font-semibold">Màu cờ<select className={`${inputClass} mt-1`} value={filters.color} onChange={event => updateFilter({ color: event.target.value as Filters['color'] })}><option value="all">Mọi màu</option>{colors.map(color => <option key={color.id} value={color.id}>{color.label}</option>)}</select></label>
        </div>
        <fieldset><legend className="text-sm font-bold">Chọn mục trong Block (để trống là tất cả)</legend><div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">{availableCategories.map(category => <label key={category.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs"><input type="checkbox" checked={filters.categoryIds.includes(category.id)} onChange={event => updateFilter({ categoryIds: event.target.checked ? [...filters.categoryIds, category.id] : filters.categoryIds.filter(id => id !== category.id) })} />{isFolder(category) ? '📁 ' : ''}{categoryPath(categories, category.id)} ({inBlock.filter(q => subtreeIds(categories, category.id).has(q.categoryId)).length})</label>)}{!availableCategories.length && <p className="text-xs text-slate-500">Block này chưa có câu hỏi trong mục nào.</p>}</div></fieldset>
        <label className="relative block"><Search size={18} className="absolute left-3 top-3.5 text-slate-400" /><input className={`${inputClass} pl-10`} value={filters.search} onChange={event => updateFilter({ search: event.target.value })} placeholder="Tìm nội dung, mã câu, đáp án..." aria-label="Tìm câu hỏi" /></label>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => start(studyable.slice(0, limit).map(q => q.id))} disabled={!studyable.length} className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white disabled:opacity-40">Ôn {Math.min(studyable.length, limit)} câu theo bộ lọc</button><button type="button" onClick={() => start(scoped.filter(q => isQuestionValid(q) && !suspended[q.id] && !activeBury(q.id) && isReviewDue(schedules[q.id], clock)).slice(0, limit).map(q => q.id))} disabled={!dueCount} className="min-h-11 rounded-xl border px-4 text-sm font-bold disabled:opacity-40">Ôn câu đến hạn ({dueCount})</button><label className="inline-flex min-h-11 items-center gap-2 text-sm">Số câu<select className="min-h-11 rounded-xl border bg-white px-2 dark:bg-slate-900" value={limit} onChange={event => setLimit(Number(event.target.value))}><option value={20}>20</option><option value={40}>40</option><option value={100000}>Tất cả</option></select></label></div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 dark:border-slate-700"><button type="button" onClick={saveFilter} className="min-h-11 rounded-xl border px-3 text-sm font-semibold">Lưu bộ lọc</button>{savedFilters.map(saved => <span key={saved.id} className="inline-flex items-center rounded-xl border"><button type="button" onClick={() => setFilters({ ...saved.filters, categoryIds: [...saved.filters.categoryIds] })} className="min-h-11 px-3 text-xs font-semibold">{saved.name}</button><button type="button" onClick={() => setSavedFilters(old => old.filter(item => item.id !== saved.id))} aria-label={`Xóa bộ lọc ${saved.name}`} className="min-h-11 min-w-11 border-l dark:border-slate-700"><X size={15} className="mx-auto" /></button></span>)}</div>
      </section>
      <section className="space-y-3"><h2 className="text-lg font-bold">Danh sách câu hỏi ({visible.length})</h2>{visible.slice(0, 100).map(q => <article key={q.id} className={`${panelClass} space-y-3`}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">{q.sourceBlock != null ? `Block ${q.sourceBlock} · ` : ''}{q.categoryName} · Câu {q.sourceNumber || q.sourceId || '—'}</p><p className="mt-1 text-sm font-semibold line-clamp-3">{q.question}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700">{suspended[q.id] ? 'Tạm ẩn' : activeBury(q.id) ? 'Ẩn hôm nay' : isReviewDue(schedules[q.id], clock) ? 'Đến hạn' : schedules[q.id] ? 'Đã lên lịch' : 'Chưa lên lịch'}</span></div><p className="text-xs text-slate-500">Đã làm {stats.get(q.id)?.total || 0} lần · Sai {stats.get(q.id)?.wrong || 0} lần {q.images?.length || q.imageUrl ? ' · Có hình' : ''}{!isQuestionValid(q) ? ' · Chưa có đáp án' : ''}</p><button type="button" onClick={() => start([q.id])} disabled={!isQuestionValid(q) || !!suspended[q.id] || activeBury(q.id)} className="min-h-11 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-40">Ôn câu này</button>{flagTools(q)}{controls(q)}{tagTools(q)}</article>)}{visible.length > 100 && <p className="text-center text-sm text-slate-500">Đang hiển thị 100 câu đầu. Hãy chọn Block, mục hoặc dùng tìm kiếm để thu hẹp danh sách.</p>}{!visible.length && <p className={panelClass}>Không có câu hỏi phù hợp với bộ lọc.</p>}</section>
    </> : completed ? <section className={`${panelClass} space-y-4 text-center`}><h2 className="text-xl font-bold">Hoàn thành phiên ôn</h2><p>Đã ôn {sessionStats.done} câu · Chọn đúng {sessionStats.right} câu</p><p className="text-sm text-slate-500">Các câu sẽ trở lại khi đến hạn theo mức độ bạn đã chọn.</p><button type="button" onClick={() => setQueue(null)} className="min-h-11 rounded-xl bg-indigo-600 px-5 font-bold text-white">Trở về Ôn tập</button></section> : current ? <section className="space-y-4">
      <div className={panelClass}><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-indigo-600 dark:text-indigo-300">Câu {position + 1}/{queue.length} · {current.categoryName} · {current.sourceBlock != null ? `Block ${current.sourceBlock}` : 'Chưa có Block'}</p><button type="button" onClick={next} className="min-h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold">Bỏ qua</button></div><div className="mt-3 text-lg font-bold leading-relaxed">{current.question}</div>{(current.images?.length ? current.images : current.imageUrl ? [current.imageUrl] : []).map((src, index) => <button key={index} type="button" onClick={() => setZoom(src)} className="mt-3 block w-full rounded-xl border p-2 dark:border-slate-700"><img src={src} alt={`Hình minh họa ${index + 1}`} loading="lazy" className="max-h-80 w-full object-contain" /></button>)}</div>
      <div className={`${panelClass} space-y-2`}>{current.options.map((option, index) => <button type="button" key={index} disabled={revealed} aria-pressed={choice === index} onClick={() => setChoice(index)} className={`min-h-11 w-full rounded-xl border p-3 text-left text-sm transition-colors ${revealed && index === current.correctAnswer ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : choice === index ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700'}`}><strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>{option}</button>)}</div>
      {!revealed ? <div className="sticky bottom-2 z-10 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-slate-900/95"><button type="button" onClick={() => setRevealed(true)} className="min-h-12 w-full rounded-xl bg-amber-600 px-5 font-bold text-white">Xem đáp án và lời giải</button><p className="mt-1 text-center text-xs text-slate-500">Có thể tự nghĩ đáp án rồi xem lời giải, kể cả khi chưa chọn phương án.</p></div> : <><div className={`${panelClass} space-y-3`}><h2 className="font-bold text-emerald-700 dark:text-emerald-300">Đáp án: {String.fromCharCode(65 + current.correctAnswer)}. {current.options[current.correctAnswer]}</h2><p className="text-sm">{choice === null ? 'Bạn chưa chọn phương án.' : choice === current.correctAnswer ? 'Bạn đã chọn đúng.' : 'Bạn đã chọn sai.'}</p><AnswerExplanation key={current.id} question={current} onZoom={setZoom} /></div><div className={`${panelClass} space-y-3`}>{flagTools(current)}{controls(current)}{tagTools(current)}</div><div className="sticky bottom-2 z-10 rounded-2xl border bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><p className="mb-2 text-center text-xs font-bold">Mức độ nhớ câu này · Chọn để lưu lịch ôn và sang câu tiếp</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{grades.map(item => <button key={item.id} type="button" onClick={() => grade(item.id)} className={`min-h-12 rounded-xl border-2 px-2 text-sm font-bold ${item.style}`}>{item.label}<span className="ml-1 text-xs font-normal">{item.caption}</span></button>)}</div></div></>}
    </section> : <section className={panelClass}><p>Câu hỏi đã bị xóa khỏi ngân hàng.</p><button type="button" onClick={next} className="min-h-11 text-indigo-600 underline">Bỏ qua</button></section>}

    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={saveEditor} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Sửa câu hỏi</h2><button type="button" onClick={() => setEditing(null)} aria-label="Đóng" className="min-h-11 min-w-11"><X size={18} /></button></div><label className="block text-sm font-bold">Nội dung<textarea required value={editStem} onChange={event => setEditStem(event.target.value)} rows={4} className={`${inputClass} mt-1 p-3`} /></label><fieldset className="space-y-2"><legend className="text-sm font-bold">Chọn đáp án đúng và sửa lựa chọn</legend>{editOptions.map((option, index) => <label key={index} className="flex min-h-11 items-center gap-2 rounded-xl border p-2"><input type="radio" name="correct-review" checked={editAnswer === index} onChange={() => setEditAnswer(index)} /><span>{String.fromCharCode(65 + index)}.</span><input required className={`${inputClass} min-w-0 flex-1`} value={option} onChange={event => setEditOptions(previous => previous.map((value, i) => i === index ? event.target.value : value))} /></label>)}</fieldset><button type="button" onClick={() => setEditOptions(previous => [...previous, ''])} className="min-h-11 text-sm text-indigo-600">+ Thêm lựa chọn</button><label className="block text-sm font-bold">{editing.explanationHtml || editing.explanationPages?.length ? 'Ghi chú bổ sung (giữ nguyên ảnh và bảng gốc)' : 'Lời giải'}<textarea value={editExplanation} onChange={event => setEditExplanation(event.target.value)} rows={4} className={`${inputClass} mt-1 p-3`} /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="min-h-11 px-3">Hủy</button><button type="submit" disabled={!editStem.trim() || editAnswer < 0 || editOptions.length < 2 || editOptions.some(o => !o.trim())} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-40">Lưu</button></div></form></div>}
    {zoom && <div role="dialog" aria-label="Xem ảnh lớn" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3" onClick={() => setZoom(null)}><button type="button" onClick={() => setZoom(null)} aria-label="Đóng ảnh" className="absolute right-4 top-4 min-h-11 min-w-11 text-white"><X size={22} /></button><img src={zoom} alt="Ảnh phóng to" className="max-h-[90vh] max-w-full object-contain" /></div>}
  </div>;
};
