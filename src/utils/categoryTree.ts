import type { Category, Question } from '../types/quiz';

export const isFolder = (category: Category) => category.kind === 'folder';

/** Includes the chosen node and all descendants. A visited set tolerates damaged legacy data. */
export function subtreeIds(categories: Category[], id: string): Set<string> {
  const result = new Set<string>();
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    children.set(category.parentId, [...(children.get(category.parentId) || []), category.id]);
  }
  const visit = (current: string) => {
    if (result.has(current)) return;
    result.add(current);
    for (const child of children.get(current) || []) visit(child);
  };
  visit(id);
  return result;
}

export function countQuestions(categories: Category[], questions: Question[], id: string): number {
  const ids = subtreeIds(categories, id);
  return questions.filter(question => ids.has(question.categoryId)).length;
}

export function canMoveCategory(categories: Category[], id: string, parentId: string | null): boolean {
  if (!categories.some(category => category.id === id)) return false;
  if (!parentId) return true;
  const parent = categories.find(category => category.id === parentId);
  return !!parent && isFolder(parent) && !subtreeIds(categories, id).has(parentId);
}

export function categoryPath(categories: Category[], id: string): string {
  const byId = new Map(categories.map(category => [category.id, category]));
  const parts: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(' / ');
}
