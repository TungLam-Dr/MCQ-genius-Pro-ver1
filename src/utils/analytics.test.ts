import test from 'node:test';
import assert from 'node:assert/strict';
import { getTodayStats, getCategoryWeaknessStats, getMistakenQuestions } from './analytics';
import { Question, TestResult } from '../types/quiz';

const mockQuestions: Question[] = [
  { id: 'q1', categoryId: 'cat1', categoryName: 'Toán', question: '1+1=?', options: ['1','2'], correctAnswer: 1 },
  { id: 'q2', categoryId: 'cat1', categoryName: 'Toán', question: '2+2=?', options: ['2','4'], correctAnswer: 1 },
  { id: 'q3', categoryId: 'cat2', categoryName: 'Lý', question: 'Lực F=?', options: ['ma','mv'], correctAnswer: 0 },
];

const mockHistory: TestResult[] = [
  {
    sessionId: 's1',
    title: 'Test 1',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationSeconds: 60,
    totalQuestions: 3,
    answeredCount: 3,
    correctCount: 1,
    incorrectCount: 2,
    skippedCount: 0,
    scorePercentage: 33,
    userAnswers: { q1: 1, q2: 0, q3: 1 }, // q1 correct, q2 & q3 incorrect
    flaggedQuestions: {},
    categoryBreakdown: {},
    questions: mockQuestions,
  },
];

test('getTodayStats computes questions solved and accuracy today', () => {
  const stats = getTodayStats(mockHistory);
  assert.equal(stats.totalSolvedToday, 3);
  assert.equal(stats.correctToday, 1);
  assert.equal(stats.incorrectToday, 2);
  assert.equal(stats.accuracyToday, 33);
});

test('getCategoryWeaknessStats identifies weak areas accurately', () => {
  const stats = getCategoryWeaknessStats(mockHistory, mockQuestions, [
    { id: 'cat1', name: 'Toán' },
    { id: 'cat2', name: 'Lý' },
  ]);

  const cat1 = stats.find((s) => s.categoryId === 'cat1');
  const cat2 = stats.find((s) => s.categoryId === 'cat2');

  assert.equal(cat1?.totalAttempted, 2);
  assert.equal(cat1?.correctCount, 1);
  assert.equal(cat1?.accuracyPercentage, 50);

  assert.equal(cat2?.totalAttempted, 1);
  assert.equal(cat2?.correctCount, 0);
  assert.equal(cat2?.accuracyPercentage, 0);
});

test('getMistakenQuestions retrieves questions user answered incorrectly', () => {
  const mistaken = getMistakenQuestions(mockHistory, mockQuestions);
  assert.equal(mistaken.length, 2); // q2 and q3
  assert.ok(mistaken.some((q) => q.id === 'q2'));
  assert.ok(mistaken.some((q) => q.id === 'q3'));
});
