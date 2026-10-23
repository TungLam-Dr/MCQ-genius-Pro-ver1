import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTextToStructuredQuestions,
  parseAnswerKeysFromText,
  applyAnswerKeysToQuestions,
} from './fileParser';

test('parseTextToStructuredQuestions detects bottom answer grid automatically', () => {
  const sampleDocWithBottomGrid = `
Câu 1. Bệnh nhân bị đau ngực khi gắng sức.
A. Thiếu máu cơ tim
B. Viêm phổi
C. Loét dạ dày
D. Đau thần kinh liên sườn

Câu 2. Thuốc nào thuộc nhóm chế men chuyển ACEi?
A. Lisinopril
B. Metoprolol
C. Aspirin
D. Atorvastatin

Câu 3. Tần số nhịp tim bình thường ở người trưởng thành lúc nghỉ?
A. 40-50 l/p
B. 60-100 l/p
C. 120-140 l/p
D. >150 l/p

BẢNG ĐÁP ÁN CHUẨN:
1.A  2.A  3.B
`;

  const questions = parseTextToStructuredQuestions(sampleDocWithBottomGrid);
  assert.equal(questions.length, 3);
  assert.equal(questions[0].correctAnswer, 0); // 1.A -> 0
  assert.equal(questions[1].correctAnswer, 0); // 2.A -> 0
  assert.equal(questions[2].correctAnswer, 1); // 3.B -> 1
});

test('applyAnswerKeysToQuestions merges separate Answer Key file onto questions', () => {
  const initialQuestions = [
    { question: 'Câu 1 ID: 3096 Bệnh nhân nam 68 tuổi...', options: ['A', 'B', 'C', 'D', 'E'], correctAnswer: 0 },
    { question: 'Câu 2 Bệnh nhân nam 56 tuổi...', options: ['A', 'B', 'C', 'D', 'E'], correctAnswer: 0 },
    { question: 'Câu 3 Bệnh nhân nam 58 tuổi...', options: ['A', 'B', 'C', 'D', 'E'], correctAnswer: 0 },
  ];

  const answerKeyFileText = `
FILE ĐÁP ÁN ĐỀ THI
1 ID 3096 -> E
2-A
3.C
`;

  const { updatedQuestions, matchedCount } = applyAnswerKeysToQuestions(initialQuestions, answerKeyFileText);

  assert.equal(matchedCount, 3);
  assert.equal(updatedQuestions[0].correctAnswer, 4); // E -> 4
  assert.equal(updatedQuestions[1].correctAnswer, 0); // A -> 0
  assert.equal(updatedQuestions[2].correctAnswer, 2); // C -> 2
});
