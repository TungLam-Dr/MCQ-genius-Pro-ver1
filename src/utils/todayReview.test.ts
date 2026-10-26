import assert from 'node:assert/strict';
import test from 'node:test';
import type { Question, ReviewSchedule } from '../types/quiz';
import { getTodayReview } from './todayReview';

const question = (id: string): Question => ({ id, categoryId: 'c', categoryName: 'Mục', question: id,
  options: ['A', 'B'], correctAnswer: 0 });
const schedule = (dueAt: string, intervalDays = 3, repetitions = 1): ReviewSchedule => ({
  dueAt, intervalDays, repetitions, lastReviewedAt: '2026-10-20T00:00:00Z', lastGrade: 'good',
});

test('counts local overdue, day-based due and ready relearning without excluded questions', () => {
  const now = new Date(2026, 9, 26, 9, 0);
  const local = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
  const ids = ['old', 'today', 'ready', 'later', 'suspended', 'buried', 'invalid', 'new'];
  const questions = ids.map(question);
  questions[6].correctAnswer = -1;
  const schedules = {
    old: schedule(local(25, 23)), today: schedule(local(26, 22)),
    ready: schedule(local(26, 8), 10 / 1440, 0), later: schedule(local(26, 10), 10 / 1440, 0),
    suspended: schedule(local(25, 12)), buried: schedule(local(25, 12)), invalid: schedule(local(25, 12)),
  };
  const result = getTodayReview(questions, schedules, { suspended: true }, { buried: local(27, 0) }, now);
  assert.deepEqual(result, {
    overdue: 1, dueToday: 1, relearning: 1,
    questionIds: ['old', 'ready', 'today'], estimatedMinutes: 6,
  });
});

test('a short step yesterday is overdue; local midnight changes daily eligibility', () => {
  const morning = new Date(2026, 9, 27, 0, 1);
  const yesterday = new Date(2026, 9, 26, 23, 59).toISOString();
  const result = getTodayReview([question('forgot')], { forgot: schedule(yesterday, 10 / 1440, 0) }, {}, {}, morning);
  assert.equal(result.overdue, 1);
  assert.deepEqual(result.questionIds, ['forgot']);
});
