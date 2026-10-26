import type { QuestionAttempt } from '../types/quiz';

export type HeatmapTheme = 'classic' | 'fire' | 'ice' | 'christmas' | 'tet' | 'football' | 'badminton';
export const heatmapThemes: { id: HeatmapTheme; label: string; symbol: string }[] = [
  { id: 'classic', label: 'Cơ bản', symbol: '▦' },
  { id: 'fire', label: 'Lửa', symbol: '🔥' },
  { id: 'ice', label: 'Băng', symbol: '❄️' },
  { id: 'christmas', label: 'Giáng sinh', symbol: '🎄' },
  { id: 'tet', label: 'Tết', symbol: '🧧' },
  { id: 'football', label: 'Bóng đá', symbol: '⚽' },
  { id: 'badminton', label: 'Cầu lông', symbol: '🏸' },
];

export interface HeatmapDay {
  key: string;
  date: Date;
  count: number;
  review: number;
  mcq: number;
  level: number;
}

export const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Answered question events only; the per-question history survives deleting a test. */
export function buildReviewHeatmap(attempts: QuestionAttempt[], today = new Date(), length = 365): HeatmapDay[] {
  const daily = new Map<string, { review: number; mcq: number }>();
  for (const attempt of attempts) {
    if (!attempt.answered) continue;
    const date = new Date(attempt.endTime);
    if (!Number.isFinite(date.getTime())) continue;
    const key = localDayKey(date);
    const counts = daily.get(key) || { review: 0, mcq: 0 };
    if (attempt.sessionId?.startsWith('review-')) counts.review++;
    else counts.mcq++;
    daily.set(key, counts);
  }

  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  day.setDate(day.getDate() - (length - 1));
  const result: HeatmapDay[] = [];
  for (let i = 0; i < length; i++) {
    const key = localDayKey(day);
    const { review, mcq } = daily.get(key) || { review: 0, mcq: 0 };
    const count = review + mcq;
    result.push({ key, date: new Date(day), count, review, mcq,
      level: count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 7 ? 3 : 4 });
    day.setDate(day.getDate() + 1);
  }
  return result;
}

export function currentHeatmapStreak(days: HeatmapDay[]): number {
  let index = days.length - 1;
  // A streak remains active until the end of the current day.
  if (index >= 0 && days[index].count === 0) index--;
  let streak = 0;
  while (index >= 0 && days[index--].count > 0) streak++;
  return streak;
}
