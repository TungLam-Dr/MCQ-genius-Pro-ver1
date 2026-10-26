import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen, Search, X } from 'lucide-react';
import type { Category, Question } from '../types/quiz';
import { categoryPath, isFolder, subtreeIds } from '../utils/categoryTree';
import { isQuestionValid } from '../utils/quizEngine';

interface Props {
  categories: Category[];
  questions: Question[];
  selectedIds: Set<string>;
  counts: Record<string, number>;
  onSelect: (ids: Set<string>) => void;
  onCount: (id: string, count: number) => void;
  onClose: () => void;
}

export function CategorySourcePicker({ categories, questions, selectedIds, counts, onSelect, onCount, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedOnly, setSelectedOnly] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const byId = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories]);
  const children = useMemo(() => {
    const result = new Map<string | null, Category[]>();
    for (const category of categories) {
      const parent = category.parentId ? byId.get(category.parentId) : undefined;
      const id = parent && isFolder(parent) ? parent.id : null;
      result.set(id, [...(result.get(id) || []), category]);
    }
    return result;
  }, [categories, byId]);
  const available = useMemo(() => {
    const result = new Map<string, number>();
    for (const question of questions) if (isQuestionValid(question)) result.set(question.categoryId, (result.get(question.categoryId) || 0) + 1);
    return result;
  }, [questions]);
  const leaves = useMemo(() => categories.filter(category => !isFolder(category)), [categories]);
  const descendants = useMemo(() => new Map(categories.filter(isFolder).map(folder => {
    const ids = subtreeIds(categories, folder.id);
    return [folder.id, leaves.filter(leaf => ids.has(leaf.id)).map(leaf => leaf.id)] as const;
  })), [categories, leaves]);
  const needle = query.trim().toLocaleLowerCase('vi-VN');
  const visible = useMemo(() => {
    const ids = new Set<string>();
    for (const category of categories) {
      const eligible = isFolder(category)
        ? (descendants.get(category.id) || []).some(id => selectedIds.has(id))
        : selectedIds.has(category.id);
      if (selectedOnly && !eligible) continue;
      if (needle && !categoryPath(categories, category.id).toLocaleLowerCase('vi-VN').includes(needle)) continue;
      let current: Category | undefined = category;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        ids.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
    return ids;
  }, [categories, descendants, selectedIds, selectedOnly, needle, byId]);

  const toggleFolder = (id: string) => {
    const leafIds = (descendants.get(id) || []).filter(leafId => (available.get(leafId) || 0) > 0);
    const next = new Set(selectedIds);
    const allSelected = leafIds.length > 0 && leafIds.every(leafId => next.has(leafId));
    for (const leafId of leafIds) allSelected ? next.delete(leafId) : next.add(leafId);
    onSelect(next);
  };
  const toggleLeaf = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };
  const render = (category: Category, depth: number, ancestors: Set<string>): ReactNode => {
    if (!visible.has(category.id) || ancestors.has(category.id)) return null;
    const folder = isFolder(category);
    const branch = folder ? descendants.get(category.id) || [] : [];
    const availableCount = folder ? branch.reduce((total, id) => total + (available.get(id) || 0), 0) : available.get(category.id) || 0;
    const eligible = branch.filter(id => (available.get(id) || 0) > 0);
    const selectedCount = eligible.filter(id => selectedIds.has(id)).length;
    const open = !!needle || selectedOnly || expanded.has(category.id);
    const sub = children.get(category.id) || [];
    const path = categoryPath(categories, category.id);
    return <li key={category.id}>
      <div className="flex min-h-14 items-center gap-2 border-b border-slate-100 py-2 pr-2 dark:border-slate-700" style={{ paddingLeft: `${Math.min(depth, 8) * 18 + 8}px` }}>
        {folder && sub.length ? <button type="button" onClick={() => setExpanded(old => { const next = new Set(old); next.has(category.id) ? next.delete(category.id) : next.add(category.id); return next; })} className="flex min-h-11 min-w-9 items-center justify-center" aria-label={`${open ? 'Thu gọn' : 'Mở'} ${path}`} aria-expanded={open}>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button> : <span className="w-9 shrink-0" />}
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1">
          <input type="checkbox" checked={folder ? eligible.length > 0 && selectedCount === eligible.length : selectedIds.has(category.id)}
            disabled={availableCount === 0} onChange={() => folder ? toggleFolder(category.id) : toggleLeaf(category.id)}
            className="h-5 w-5 shrink-0 accent-indigo-600" aria-label={`Chọn ${path}`} />
          {folder ? open ? <FolderOpen className="shrink-0 text-amber-500" size={18} /> : <Folder className="shrink-0 text-amber-500" size={18} /> : <span className="text-indigo-500">▤</span>}
          <span className="min-w-0"><span className="block truncate text-sm font-semibold" title={path}>{category.name}</span><span className="text-xs text-slate-500 dark:text-slate-400">{folder ? `${selectedCount}/${eligible.length} mục được chọn` : `${availableCount} câu có đáp án`}</span></span>
        </label>
        {!folder && selectedIds.has(category.id) && <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">Lấy <input type="number" min={1} max={availableCount} value={Math.min(counts[category.id] || 1, availableCount)}
          onChange={event => onCount(category.id, Math.max(1, Math.min(availableCount, Number(event.target.value) || 1)))}
          aria-label={`Số câu lấy từ ${path}`} className="min-h-11 w-16 rounded-lg border bg-white px-2 text-center font-bold text-indigo-700 dark:border-slate-600 dark:bg-slate-800 dark:text-indigo-300" /> câu</label>}
      </div>
      {folder && open && sub.length > 0 && <ul>{sub.map(child => render(child, depth + 1, new Set(ancestors).add(category.id)))}</ul>}
    </li>;
  };
  const selected = leaves.filter(category => selectedIds.has(category.id));
  const requested = selected.reduce((total, category) => total + Math.min(counts[category.id] || 1, available.get(category.id) || 0), 0);

  return <div className="fixed inset-0 z-50 bg-slate-950/70 p-0 sm:p-5" role="dialog" aria-modal="true" aria-label="Chọn mục cho bài thi">
    <div className="mx-auto flex h-full max-h-[960px] w-full max-w-4xl flex-col bg-white text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white sm:rounded-3xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-700 sm:px-6"><div><h2 className="text-lg font-bold">Chọn mục cho bài thi</h2><p className="text-xs text-slate-500 dark:text-slate-400">Mở nhóm lớn, chọn mục nhỏ và đặt số câu lấy từ mỗi mục.</p></div><button type="button" onClick={onClose} aria-label="Đóng trang chọn mục" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button></header>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-700 sm:px-6"><label className="relative min-w-[180px] flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mục hoặc nhóm…" className="min-h-11 w-full rounded-xl border border-slate-200 bg-transparent pl-10 pr-3 text-sm dark:border-slate-600" /></label><button type="button" aria-pressed={selectedOnly} onClick={() => setSelectedOnly(old => !old)} className={`min-h-11 rounded-xl px-3 text-xs font-bold ${selectedOnly ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>Đã chọn ({selected.length})</button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 sm:px-5">{visible.size ? <ul>{(children.get(null) || []).map(category => render(category, 0, new Set()))}</ul> : <p className="p-8 text-center text-sm text-slate-500">Không tìm thấy mục phù hợp.</p>}</div>
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:px-6"><span className="text-sm font-semibold">{selected.length} mục · {requested} câu đã chọn</span><button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white"><Check size={17} /> Xong</button></footer>
    </div>
  </div>;
}
