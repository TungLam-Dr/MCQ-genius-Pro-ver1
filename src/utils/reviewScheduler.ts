import type { ReviewGrade, ReviewSchedule } from '../types/quiz';

const DAY = 24 * 60 * 60 * 1000;

/** A small local spaced review schedule. A failed recall reappears in ten minutes. */
export function scheduleReview(previous: ReviewSchedule | undefined, grade: ReviewGrade, at = new Date()): ReviewSchedule {
  const oldDays = previous?.intervalDays || 0;
  const intervalDays = grade === 'again' ? 10 / 1440
    : grade === 'hard' ? (oldDays < 1 ? 1 : Math.max(1, Math.ceil(oldDays * 1.2)))
    : grade === 'good' ? (oldDays < 1 ? 3 : Math.ceil(oldDays * 2.5))
    : (oldDays < 1 ? 7 : Math.ceil(oldDays * 4));
  return {
    dueAt: new Date(at.getTime() + intervalDays * DAY).toISOString(),
    lastReviewedAt: at.toISOString(),
    intervalDays,
    repetitions: grade === 'again' ? 0 : (previous?.repetitions || 0) + 1,
    lastGrade: grade,
  };
}

export function isReviewDue(schedule: ReviewSchedule | undefined, now = Date.now()): boolean {
  return !!schedule && Date.parse(schedule.dueAt) <= now;
}

export function isReviewOverdue(schedule: ReviewSchedule | undefined, now = Date.now()): boolean {
  return !!schedule && Date.parse(schedule.dueAt) < new Date(now).setHours(0, 0, 0, 0);
}

export function tomorrowStart(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}
