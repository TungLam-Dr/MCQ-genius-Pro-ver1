import type { Question, ReviewSchedule } from '../types/quiz';
import { isQuestionValid } from './quizEngine';

export interface TodayReviewSummary {
  overdue: number;
  dueToday: number;
  relearning: number;
  questionIds: string[];
  estimatedMinutes: number;
}

/** Daily reviews are scheduled questions only; new questions are added deliberately in Ôn tập. */
export function getTodayReview(
  questions: Question[],
  schedules: Record<string, ReviewSchedule>,
  suspended: Record<string, boolean>,
  buriedUntil: Record<string, string>,
  now = new Date(),
): TodayReviewSummary {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const currentTime = now.getTime();
  const due: { id: string; dueAt: number; priority: number }[] = [];
  let overdue = 0;
  let dueToday = 0;
  let relearning = 0;

  for (const question of questions) {
    const schedule = schedules[question.id];
    if (!schedule || !isQuestionValid(question) || suspended[question.id]) continue;
    const buriedEnd = Date.parse(buriedUntil[question.id] || '');
    if (Number.isFinite(buriedEnd) && buriedEnd > currentTime) continue;
    const dueAt = Date.parse(schedule.dueAt);
    if (!Number.isFinite(dueAt)) continue;

    if (dueAt < startOfDay) {
      overdue++;
      due.push({ id: question.id, dueAt, priority: 0 });
    } else if (schedule.repetitions === 0 || schedule.intervalDays < 1) {
      // Short learning steps become available only when their actual time arrives.
      if (dueAt <= currentTime) {
        relearning++;
        due.push({ id: question.id, dueAt, priority: 1 });
      }
    } else if (dueAt < nextDay) {
      // Day-based review is due for the local calendar day, even before its stored hour.
      dueToday++;
      due.push({ id: question.id, dueAt, priority: 2 });
    }
  }

  due.sort((a, b) => a.priority - b.priority || a.dueAt - b.dueAt);
  return {
    overdue,
    dueToday,
    relearning,
    questionIds: due.map(item => item.id),
    estimatedMinutes: due.length * 2,
  };
}
