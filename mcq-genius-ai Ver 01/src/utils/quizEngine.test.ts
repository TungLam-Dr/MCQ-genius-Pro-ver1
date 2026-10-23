import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTimeMinutesSeconds,
  selectQuestionsForBlock,
  calculateTestResult,
  parseRawTextToQuestions,
} from './quizEngine';
import { Question, TestConfig } from '../types/quiz';

const mockQuestions: Question[] = [
  {
    id: 'q1',
    categoryId: 'cat1',
    categoryName: 'Toán',
    question: '1 + 1 bằng mấy?',
    options: ['1', '2', '3', '4'],
    correctAnswer: 1, // '2'
  },
  {
    id: 'q2',
    categoryId: 'cat1',
    categoryName: 'Toán',
    question: '2 + 2 bằng mấy?',
    options: ['2', '4', '6', '8'],
    correctAnswer: 1, // '4'
  },
  {
    id: 'q3',
    categoryId: 'cat2',
    categoryName: 'Lý',
    question: 'Vận tốc là gì?',
    options: ['Quãng đường chia thời gian', 'Thời gian chia quãng đường', 'Lực nhân vận tốc', 'Khối lượng nhân gia tốc'],
    correctAnswer: 0,
  },
  {
    id: 'q4',
    categoryId: 'cat2',
    categoryName: 'Lý',
    question: 'Đơn vị đo lực là gì?',
    options: ['Joule', 'Newton', 'Watt', 'Volt'],
    correctAnswer: 1,
  },
];

test('formatTimeMinutesSeconds converts seconds correctly', () => {
  assert.equal(formatTimeMinutesSeconds(0), '00:00');
  assert.equal(formatTimeMinutesSeconds(1800), '30:00');
  assert.equal(formatTimeMinutesSeconds(2450), '40:50');
  assert.equal(formatTimeMinutesSeconds(65), '01:05');
});

test('selectQuestionsForBlock handles category specific counts', () => {
  const config: TestConfig = {
    title: 'Đề thi thử',
    presetType: 'custom',
    totalQuestions: 3,
    timeLimitMinutes: 20,
    selectionMode: 'categories',
    categorySelections: [
      { categoryId: 'cat1', categoryName: 'Toán', availableCount: 2, requestedCount: 1 },
      { categoryId: 'cat2', categoryName: 'Lý', availableCount: 2, requestedCount: 2 },
    ],
    shuffleQuestions: false,
    shuffleOptions: false,
  };

  const selected = selectQuestionsForBlock(mockQuestions, config);
  assert.equal(selected.length, 3);
  const cat1Count = selected.filter((q) => q.categoryId === 'cat1').length;
  const cat2Count = selected.filter((q) => q.categoryId === 'cat2').length;
  assert.equal(cat1Count, 1);
  assert.equal(cat2Count, 2);
});

test('calculateTestResult calculates score and accuracy correctly', () => {
  const userAnswers = {
    q1: 1, // correct
    q2: 0, // incorrect
    q3: 0, // correct
    q4: null, // skipped
  };

  const result = calculateTestResult(mockQuestions, userAnswers, {}, 120, 'Đề thi 4 câu');

  assert.equal(result.totalQuestions, 4);
  assert.equal(result.answeredCount, 3);
  assert.equal(result.correctCount, 2);
  assert.equal(result.incorrectCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.scorePercentage, 50); // 2/4 = 50%
  assert.equal(result.categoryBreakdown['cat1'].total, 2);
  assert.equal(result.categoryBreakdown['cat1'].correct, 1);
});

test('parseRawTextToQuestions extracts basic questions from text', () => {
  const sampleText = `
Câu 1. Thủ đô Việt Nam là gì?
A. TP.HCM
B. Hà Nội
C. Đà Nẵng
D. Cần Thơ
Đáp án: B

Câu 2. Số Pi xấp xỉ bằng bao nhiêu?
A. 3.14
B. 2.71
C. 1.41
D. 1.73
Đáp án: A
  `;

  const parsed = parseRawTextToQuestions(sampleText);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].correctAnswer, 1); // B
  assert.equal(parsed[1].correctAnswer, 0); // A
});
