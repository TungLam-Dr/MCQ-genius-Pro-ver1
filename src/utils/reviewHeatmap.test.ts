import test from 'node:test';
import assert from 'node:assert/strict';
import type { QuestionAttempt } from '../types/quiz';
import { buildReviewHeatmap, currentHeatmapStreak, localDayKey } from './reviewHeatmap';

const attempt = (date: Date, sessionId: string, answered = true): QuestionAttempt => ({
  sessionId, endTime: date.toISOString(), answered, correct: true,
  questionId: `q-${sessionId}`, categoryId: 'cat', categoryName: 'Mục',
});

test('heatmap counts MCQ and review per local calendar day without counting skips or future dates', () => {
  const today = new Date(2026, 9, 26, 12);
  const yesterday = new Date(2026, 9, 25, 23, 30);
  const days = buildReviewHeatmap([
    attempt(yesterday, 'review-1'), attempt(yesterday, 'exam-1'),
    attempt(yesterday, 'exam-skipped', false), attempt(today, 'review-2'),
    attempt(new Date(2026, 9, 27, 12), 'future'),
    { ...attempt(today, 'invalid'), endTime: 'invalid' },
  ], today, 3);
  assert.equal(days.length, 3);
  assert.equal(days[1].key, localDayKey(yesterday));
  assert.deepEqual({ count: days[1].count, review: days[1].review, mcq: days[1].mcq, level: days[1].level },
    { count: 2, review: 1, mcq: 1, level: 2 });
  assert.equal(days[2].count, 1);
  assert.equal(currentHeatmapStreak(days), 2);
});

test('streak can continue from yesterday and crosses a month boundary', () => {
  const today = new Date(2026, 10, 1, 12);
  const days = buildReviewHeatmap([attempt(new Date(2026, 9, 31, 12), 'review-1'),
    attempt(new Date(2026, 9, 30, 12), 'exam-1')], today, 4);
  assert.equal(currentHeatmapStreak(days), 2);
});
