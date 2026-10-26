import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Question } from '../types/quiz';
import { canMoveCategory, categoryPath, countQuestions, subtreeIds } from './categoryTree';

const categories: Category[] = [
  { id: 'base', name: 'Cơ sở', description: '', kind: 'folder', questionCount: 0, createdAt: '' },
  { id: 'anatomy', name: 'Giải phẫu', description: '', kind: 'folder', parentId: 'base', questionCount: 0, createdAt: '' },
  { id: 'upper', name: 'GP chi trên', description: '', parentId: 'anatomy', questionCount: 2, createdAt: '' },
  { id: 'lower', name: 'GP chi dưới', description: '', parentId: 'anatomy', questionCount: 1, createdAt: '' },
  { id: 'legacy', name: 'Mục cũ', description: '', questionCount: 1, createdAt: '' },
];
const question = (id: string, categoryId: string): Question => ({ id, categoryId, categoryName: '', question: id, options: ['A', 'B'], correctAnswer: 0 });
const questions = [question('q1', 'upper'), question('q2', 'upper'), question('q3', 'lower'), question('q4', 'legacy')];

test('nested groups count descendants without touching legacy categories', () => {
  assert.equal(categoryPath(categories, 'upper'), 'Cơ sở / Giải phẫu / GP chi trên');
  assert.deepEqual([...subtreeIds(categories, 'anatomy')], ['anatomy', 'upper', 'lower']);
  assert.equal(countQuestions(categories, questions, 'base'), 3);
  assert.equal(countQuestions(categories, questions, 'legacy'), 1);
});

test('moving a group into itself, its child or a question category is rejected', () => {
  assert.equal(canMoveCategory(categories, 'base', 'anatomy'), false);
  assert.equal(canMoveCategory(categories, 'anatomy', 'anatomy'), false);
  assert.equal(canMoveCategory(categories, 'upper', 'legacy'), false);
  assert.equal(canMoveCategory(categories, 'upper', 'base'), true);
  assert.equal(canMoveCategory(categories, 'anatomy', null), true);
});
