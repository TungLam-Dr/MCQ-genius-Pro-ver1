import { CategoryBreakdown, Question, TestConfig, TestResult } from '../types/quiz';

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function formatTimeMinutesSeconds(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.floor(Math.max(0, seconds) % 60);
  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mm}:${ss}`;
}

export function isQuestionValid(q: Partial<Question>): boolean {
  return (
    q !== null &&
    q !== undefined &&
    q.correctAnswer !== undefined &&
    q.correctAnswer !== null &&
    q.correctAnswer >= 0 &&
    Array.isArray(q.options) &&
    q.options.length >= 2 &&
    q.correctAnswer < q.options.length
  );
}

export function selectQuestionsForBlock(
  allQuestions: Question[],
  config: TestConfig
): Question[] {
  // STRICT FILTER: Only questions WITH VALID ANSWERS can enter test/exam mode
  const validQuestions = allQuestions.filter(isQuestionValid);
  if (validQuestions.length === 0) return [];

  let selected: Question[] = [];

  if (config.selectionMode === 'categories' && config.categorySelections.length > 0) {
    for (const sel of config.categorySelections) {
      if (sel.requestedCount <= 0) continue;
      const catQuestions = validQuestions.filter((q) => q.categoryId === sel.categoryId);
      const shuffledCat = shuffleArray(catQuestions);
      const picked = shuffledCat.slice(0, sel.requestedCount);
      selected.push(...picked);
    }

    // If requested total exceeds category picks or custom padding requested, pad from remaining valid
    if (selected.length < config.totalQuestions && validQuestions.length > selected.length) {
      const selectedIds = new Set(selected.map((q) => q.id));
      const remaining = validQuestions.filter((q) => !selectedIds.has(q.id));
      const needed = config.totalQuestions - selected.length;
      const extraPicked = shuffleArray(remaining).slice(0, needed);
      selected.push(...extraPicked);
    }
  } else {
    // Random selection across all available valid questions
    const shuffled = shuffleArray(validQuestions);
    selected = shuffled.slice(0, config.totalQuestions);
  }

  // Cap to totalQuestions if specified
  if (config.totalQuestions > 0 && selected.length > config.totalQuestions) {
    selected = selected.slice(0, config.totalQuestions);
  }

  // Apply shuffling
  if (config.shuffleQuestions) {
    selected = shuffleArray(selected);
  }

  // Clone & shuffle options if configured
  return selected.map((q) => {
    if (!config.shuffleOptions || q.options.length <= 1) return { ...q };

    const indexedOptions = q.options.map((opt, idx) => ({ opt, images: q.optionImages?.[idx] || [], isCorrect: idx === q.correctAnswer }));
    const shuffledIndexed = shuffleArray(indexedOptions);
    const newCorrectIndex = shuffledIndexed.findIndex((item) => item.isCorrect);

    return {
      ...q,
      options: shuffledIndexed.map((item) => item.opt),
      optionImages: shuffledIndexed.map((item) => item.images),
      correctAnswer: newCorrectIndex,
    };
  });
}

export function calculateTestResult(
  questions: Question[],
  userAnswers: Record<string, number | null>,
  flaggedQuestions: Record<string, boolean>,
  durationSeconds: number,
  title: string
): TestResult {
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;

  const categoryMap: Record<string, { categoryId: string; categoryName: string; total: number; correct: number }> = {};

  questions.forEach((q) => {
    const userSelected = userAnswers[q.id];
    const isAnswered = userSelected !== undefined && userSelected !== null;

    if (!categoryMap[q.categoryId]) {
      categoryMap[q.categoryId] = {
        categoryId: q.categoryId,
        categoryName: q.categoryName || 'Mục chung',
        total: 0,
        correct: 0,
      };
    }
    categoryMap[q.categoryId].total += 1;

    if (!isAnswered) {
      skippedCount += 1;
    } else if (userSelected === q.correctAnswer) {
      correctCount += 1;
      categoryMap[q.categoryId].correct += 1;
    } else {
      incorrectCount += 1;
    }
  });

  const totalQuestions = questions.length;
  const answeredCount = correctCount + incorrectCount;
  const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const categoryBreakdown: Record<string, CategoryBreakdown> = {};
  Object.keys(categoryMap).forEach((catId) => {
    const item = categoryMap[catId];
    categoryBreakdown[catId] = {
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      total: item.total,
      correct: item.correct,
      percentage: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
    };
  });

  return {
    sessionId: `session-${Date.now()}`,
    title,
    startTime: new Date(Date.now() - durationSeconds * 1000).toISOString(),
    endTime: new Date().toISOString(),
    durationSeconds,
    totalQuestions,
    answeredCount,
    correctCount,
    incorrectCount,
    skippedCount,
    scorePercentage,
    userAnswers,
    flaggedQuestions,
    categoryBreakdown,
    questions,
  };
}

export function parseRawTextToQuestions(text: string): Partial<Question>[] {
  const questions: Partial<Question>[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let currentQuestion: Partial<Question> | null = null;
  let options: string[] = [];
  let currentAnswer = 0;

  const questionRegex = /^(Câu\s*\d+|Question\s*\d+|\d+[\.\:\)])/i;
  const optionRegex = /^([A-D]|a-d)[\.\:\)]/i;
  const answerRegex = /^(Đáp án|Key|Correct Answer)[\:\s]*([A-D])/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const ansMatch = line.match(answerRegex);
    if (ansMatch && currentQuestion) {
      const letter = ansMatch[2].toUpperCase();
      const code = letter.charCodeAt(0) - 65;
      if (code >= 0 && code < 4) {
        currentQuestion.correctAnswer = code;
      }
      continue;
    }

    if (questionRegex.test(line) || (!currentQuestion && line.length > 5)) {
      if (currentQuestion && options.length > 0) {
        currentQuestion.options = options;
        questions.push(currentQuestion);
      }
      currentQuestion = {
        question: line.replace(questionRegex, '').trim() || line,
        options: [],
        correctAnswer: 0,
        explanation: '',
      };
      options = [];
    } else if (optionRegex.test(line) && currentQuestion) {
      const optionText = line.replace(optionRegex, '').trim();
      options.push(optionText);
    } else if (currentQuestion && options.length === 0) {
      currentQuestion.question += ' ' + line;
    }
  }

  if (currentQuestion) {
    currentQuestion.options = options.length >= 2 ? options : ['Đúng', 'Sai', 'Tùy trường hợp', 'Cả 3 đều đúng'];
    questions.push(currentQuestion);
  }

  return questions;
}
