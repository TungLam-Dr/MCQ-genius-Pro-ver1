import { Question, QuestionAttempt, TestResult } from '../types/quiz';

export interface CategoryWeaknessStat {
  categoryId: string;
  categoryName: string;
  totalAttempted: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPercentage: number;
  isWeakArea: boolean; // accuracy < 60% with >= 3 attempts
}

export interface TodayStats {
  totalSolvedToday: number;
  correctToday: number;
  incorrectToday: number;
  accuracyToday: number;
}

export function getTodayStats(testHistory: TestResult[]): TodayStats {
  const dayKey = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
  const todayStr = dayKey(new Date());

  let totalSolvedToday = 0;
  let correctToday = 0;
  let incorrectToday = 0;

  testHistory.forEach((session) => {
    const sessionDate = new Date(session.endTime || session.startTime);
    if (Number.isNaN(sessionDate.getTime())) return;
    const sessionDateStr = dayKey(sessionDate);
    if (sessionDateStr === todayStr) {
      totalSolvedToday += session.answeredCount;
      correctToday += session.correctCount;
      incorrectToday += session.incorrectCount;
    }
  });

  const accuracyToday = totalSolvedToday > 0 ? Math.round((correctToday / totalSolvedToday) * 100) : 0;

  return {
    totalSolvedToday,
    correctToday,
    incorrectToday,
    accuracyToday,
  };
}

export function getCategoryWeaknessStats(
  testHistory: TestResult[],
  allQuestions: Question[],
  categories: { id: string; name: string }[]
): CategoryWeaknessStat[] {
  const catMap: Record<string, { categoryId: string; categoryName: string; total: number; correct: number }> = {};

  // Initialize for all categories
  categories.forEach((cat) => {
    catMap[cat.id] = {
      categoryId: cat.id,
      categoryName: cat.name,
      total: 0,
      correct: 0,
    };
  });

  // Accumulate from test history
  testHistory.forEach((session) => {
    session.questions.forEach((q) => {
      const userAns = session.userAnswers[q.id];
      if (userAns !== undefined && userAns !== null) {
        if (!catMap[q.categoryId]) {
          catMap[q.categoryId] = {
            categoryId: q.categoryId,
            categoryName: q.categoryName || 'Mục chung',
            total: 0,
            correct: 0,
          };
        }

        catMap[q.categoryId].total += 1;
        if (userAns === q.correctAnswer) {
          catMap[q.categoryId].correct += 1;
        }
      }
    });
  });

  return Object.values(catMap).map((item) => {
    const incorrectCount = item.total - item.correct;
    const accuracyPercentage = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 100;
    const isWeakArea = item.total >= 3 && accuracyPercentage < 60;

    return {
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      totalAttempted: item.total,
      correctCount: item.correct,
      incorrectCount,
      accuracyPercentage,
      isWeakArea,
    };
  });
}

export function getMistakenQuestions(
  testHistory: TestResult[],
  allQuestions: Question[]
): Question[] {
  const mistakenQuestionIds = new Set<string>();

  testHistory.forEach((session) => {
    session.questions.forEach((q) => {
      const userAns = session.userAnswers[q.id];
      if (userAns !== undefined && userAns !== null && userAns !== q.correctAnswer) {
        mistakenQuestionIds.add(q.id);
      }
    });
  });

  return allQuestions.filter((q) => mistakenQuestionIds.has(q.id));
}

/** Recover compact attempts from old saved tests; use stable question IDs. */
export function buildQuestionAttempts(results: TestResult[]): QuestionAttempt[] {
  return results.flatMap(result => (result.questions || []).map(q => {
    const answer = result.userAnswers?.[q.id];
    const answered = answer !== undefined && answer !== null;
    return {
      sessionId: result.sessionId,
      questionId: q.id,
      categoryId: q.categoryId,
      categoryName: q.categoryName || 'Mục chung',
      endTime: result.endTime || result.startTime,
      answered,
      correct: answered && answer === q.correctAnswer,
    };
  }));
}

export interface QuestionPracticeStat {
  question: Question;
  presented: number;
  answered: number;
  correct: number;
  incorrect: number;
  skipped: number;
}

/** Includes all questions in the bank, even questions never seen in a test. */
export function getQuestionPracticeStats(allQuestions: Question[], attempts: QuestionAttempt[]): QuestionPracticeStat[] {
  const counts = new Map<string, Omit<QuestionPracticeStat, 'question'>>();
  for (const attempt of attempts) {
    const value = counts.get(attempt.questionId) || { presented: 0, answered: 0, correct: 0, incorrect: 0, skipped: 0 };
    value.presented += 1;
    if (!attempt.answered) value.skipped += 1;
    else {
      value.answered += 1;
      if (attempt.correct) value.correct += 1;
      else value.incorrect += 1;
    }
    counts.set(attempt.questionId, value);
  }
  return allQuestions.map(question => ({
    question,
    ...(counts.get(question.id) || { presented: 0, answered: 0, correct: 0, incorrect: 0, skipped: 0 }),
  }));
}

export function getTodayStatsFromAttempts(attempts: QuestionAttempt[]): TodayStats {
  const date = new Date();
  const today = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  let totalSolvedToday = 0, correctToday = 0, incorrectToday = 0;
  for (const attempt of attempts) {
    const time = new Date(attempt.endTime);
    if (Number.isNaN(time.getTime())) continue;
    if (`${time.getFullYear()}-${time.getMonth()}-${time.getDate()}` !== today || !attempt.answered) continue;
    totalSolvedToday += 1;
    if (attempt.correct) correctToday += 1;
    else incorrectToday += 1;
  }
  return {
    totalSolvedToday, correctToday, incorrectToday,
    accuracyToday: totalSolvedToday ? Math.round(correctToday / totalSolvedToday * 100) : 0,
  };
}

export function getCategoryWeaknessStatsFromAttempts(
  attempts: QuestionAttempt[],
  categories: { id: string; name: string }[]
): CategoryWeaknessStat[] {
  const counts = new Map<string, { categoryId: string; categoryName: string; total: number; correct: number }>();
  for (const category of categories) counts.set(category.id, { categoryId: category.id, categoryName: category.name, total: 0, correct: 0 });
  for (const attempt of attempts) {
    if (!attempt.answered) continue;
    const item = counts.get(attempt.categoryId) || {
      categoryId: attempt.categoryId,
      categoryName: attempt.categoryName,
      total: 0, correct: 0,
    };
    item.total += 1;
    if (attempt.correct) item.correct += 1;
    counts.set(attempt.categoryId, item);
  }
  return [...counts.values()].map(item => {
    const accuracyPercentage = item.total ? Math.round(item.correct / item.total * 100) : 100;
    return {
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      totalAttempted: item.total,
      correctCount: item.correct,
      incorrectCount: item.total - item.correct,
      accuracyPercentage,
      isWeakArea: item.total >= 3 && accuracyPercentage < 60,
    };
  });
}

export function getMistakenQuestionsFromAttempts(attempts: QuestionAttempt[], allQuestions: Question[]): Question[] {
  const wrongIds = new Set(attempts.filter(attempt => attempt.answered && !attempt.correct).map(attempt => attempt.questionId));
  return allQuestions.filter(question => wrongIds.has(question.id));
}
