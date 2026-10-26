import test from 'node:test';
import assert from 'node:assert/strict';
import { isReviewDue, isReviewOverdue, scheduleReview, tomorrowStart } from './reviewScheduler';

test('review grading schedules a failed recall soon and extends a remembered card', () => {
  const now = new Date('2026-10-26T09:00:00.000Z');
  const first = scheduleReview(undefined, 'good', now);
  assert.equal(first.dueAt, '2026-10-29T09:00:00.000Z');
  assert.equal(first.repetitions, 1);
  const second = scheduleReview(first, 'good', now);
  assert.equal(second.intervalDays, 8);
  const failed = scheduleReview(second, 'again', now);
  assert.equal(failed.dueAt, '2026-10-26T09:10:00.000Z');
  assert.equal(failed.repetitions, 0);
  assert.equal(isReviewDue(failed, Date.parse('2026-10-26T09:09:00.000Z')), false);
  assert.equal(isReviewDue(failed, Date.parse('2026-10-26T09:10:00.000Z')), true);
});

test('overdue means a prior local calendar day; bury lasts until tomorrow', () => {
  const now = new Date(2026, 9, 26, 15, 0);
  const tomorrow = tomorrowStart(now);
  assert.equal(new Date(tomorrow).getDate(), 27);
  const yesterday = scheduleReview(undefined, 'again', new Date(2026, 9, 25, 9, 0));
  assert.equal(isReviewOverdue(yesterday, now.getTime()), true);
});
