import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Search, Trash2 } from 'lucide-react';
import type { Category, Question } from '../types/quiz';
import { canMoveCategory, categoryPath, countQuestions, isFolder } from '../utils/categoryTree';

interface Props {
  categories: Category[];
  questions: Question[];
  selectedId: string | 'all';
  onSelect: (id: string | 'all') => void;
  onCreateFolder: (name: string, description: string, parentId: string | null) => void;
  onUpdateCategory: (id: string, name: string, description: string, parentId: string | null) => void;
  onDeleteFolder: (id: string) => void;
  onCreateQuestionCategory: () => void;
}

export const CategoryTree: React.FC<Props> = ({
  categories, questions, selectedId, onSelect, onCreateFolder, onUpdateCategory, onDeleteFolder, onCreateQuestionCategory,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(categories.filter(isFolder).map(category => category.id)));
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories]);
  const children = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    for (const category of categories) {
      const parent = category.parentId && byId.get(category.parentId);
      const key = parent && isFolder(parent) ? parent.id : null;
      map.set(key, [...(map.get(key) || []), category]);
    }
    return map;
  }, [categories, byId]);
  const counts = useMemo(() => new Map(categories.map(category => [category.id, countQuestions(categories, questions, category.id)])), [categories, questions]);
  const needle = search.trim().toLocaleLowerCase('vi-VN');
  const matches = (category: Category, visited = new Set<string>()): boolean => {
    if (!needle) return true;
    if (category.name.toLocaleLowerCase('vi-VN').includes(needle)) return true;
    if (visited.has(category.id)) return false;
    visited.add(category.id);
    return (children.get(category.id) || []).some(child => matches(child, visited));
  };
  const startCreate = (parent: string | null = null) => {
    setEditing('new'); setName(''); setDescription(''); setParentId(parent);
    if (parent) setExpanded(previous => new Set(previous).add(parent));
  };
  const startEdit = (category: Category) => {
    setEditing(category); setName(category.name); setDescription(category.description || ''); setParentId(category.parentId || null);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (editing === 'new') onCreateFolder(name, description, parentId);
    else if (editing) onUpdateCategory(editing.id, name, description, parentId);
    setEditing(null);
  };
  const renderNode = (category: Category, depth: number, visited: Set<string>): React.ReactNode => {
    if (visited.has(category.id) || !matches(category)) return null;
    const nextVisited = new Set(visited).add(category.id);
    const folder = isFolder(category);
    const nested = children.get(category.id) || [];
    const opened = needle || expanded.has(category.id);
    return <li key={category.id}>
      <div className={`group flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm ${selectedId === category.id ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`} style={{ paddingLeft: `${Math.min(depth, 8) * 14 + 8}px` }}>
        {folder && nested.length > 0 ? <button type="button" aria-label={`${opened ? 'Thu gọn' : 'Mở rộng'} ${category.name}`} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })} className="flex h-9 w-8 shrink-0 items-center justify-center">{opened ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button> : <span className="w-8 shrink-0" />}
        <button type="button" onClick={() => onSelect(category.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" title={categoryPath(categories, category.id)}>
          {folder ? opened ? <FolderOpen size={17} className="shrink-0 text-amber-500" /> : <Folder size={17} className="shrink-0 text-amber-500" /> : <span className="shrink-0 text-indigo-500">▤</span>}
          <span className="truncate">{category.name}</span><span className="ml-auto shrink-0 text-xs tabular-nums opacity-65">{counts.get(category.id) || 0}</span>
        </button>
        <button type="button" onClick={() => startEdit(category)} aria-label={`Sửa ${category.name}`} title="Đổi tên hoặc chuyển vào thư mục" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600"><Pencil size={14} /></button>
        {folder && <button type="button" onClick={() => startCreate(category.id)} aria-label={`Tạo thư mục trong ${category.name}`} title="Tạo thư mục con" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600"><FolderPlus size={15} /></button>}
        {folder && !nested.length && !counts.get(category.id) && <button type="button" onClick={() => { if (window.confirm(`Xóa thư mục rỗng “${category.name}”?`)) { onDeleteFolder(category.id); if (selectedId === category.id) onSelect('all'); } }} aria-label={`Xóa thư mục ${category.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>}
      </div>
      {folder && opened && nested.length > 0 && <ul>{nested.map(child => renderNode(child, depth + 1, nextVisited))}</ul>}
    </li>;
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-label="Mạng lưới mục">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900 dark:text-white">Mạng lưới mục</h2><p className="text-xs text-slate-500 dark:text-slate-400">Chọn thư mục để xem câu hỏi ở mọi cấp bên trong.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => startCreate()} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white"><FolderPlus size={16} /> Tạo thư mục</button><button type="button" onClick={onCreateQuestionCategory} className="min-h-11 rounded-xl border px-3 text-xs font-bold">+ Mục chứa câu hỏi</button></div></div>
    <label className="relative mt-4 block"><Search size={17} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm thư mục hoặc mục đề thi…" className="min-h-11 w-full rounded-xl border bg-transparent pl-10 pr-3 text-sm dark:border-slate-600" /></label>
    <ul className="mt-2 max-h-96 overflow-y-auto"><li><button type="button" onClick={() => onSelect('all')} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${selectedId === 'all' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}><span>Tất cả câu hỏi</span><span>{questions.length}</span></button></li>{(children.get(null) || []).map(category => renderNode(category, 0, new Set()))}</ul>
    {selectedId !== 'all' && byId.has(selectedId) && <p className="mt-3 break-words border-t pt-3 text-xs text-slate-500 dark:border-slate-700">Đang xem: {categoryPath(categories, selectedId)} · {counts.get(selectedId) || 0} câu</p>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={save} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800"><h3 className="font-bold">{editing === 'new' ? 'Tạo thư mục mới' : `Sửa ${isFolder(editing) ? 'thư mục' : 'mục câu hỏi'}`}</h3><label className="block text-sm font-semibold">Tên<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-900" /></label><label className="block text-sm font-semibold">Mô tả<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} className="mt-1 w-full rounded-xl border p-3 dark:bg-slate-900" /></label><label className="block text-sm font-semibold">Nằm trong thư mục<select value={parentId || ''} onChange={event => setParentId(event.target.value || null)} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-900"><option value="">Ngoài cùng</option>{categories.filter(category => isFolder(category) && (editing === 'new' || canMoveCategory(categories, editing.id, category.id))).map(category => <option key={category.id} value={category.id}>{categoryPath(categories, category.id)}</option>)}</select></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl px-4 text-sm">Hủy</button><button type="submit" className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white">Lưu</button></div></form></div>}
  </section>;
};
