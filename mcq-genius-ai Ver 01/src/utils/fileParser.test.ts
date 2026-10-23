import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTextToStructuredQuestions, parseAnswerKeysFromText, applyAnswerKeysToQuestions } from './fileParser';

test('parseTextToStructuredQuestions handles Viet-USMLE PDF format with ID tags and 5 options', () => {
  const samplePdfText = `
BLOCK 1-2 NỘI TIM MẠCH

Câu 1 ID: 3096 Bệnh nhân nam 68 tuổi đến phòng khám do đánh trống ngực...
A. Đường dẫn truyền phụ
B. Xơ hóa tế bào cơ tim
C. Sẹo cơ tim
D. Giãn nhĩ trái
E. Tác dụng phụ của thuốc

Câu 2 ID: 2692 Bệnh nhân nam 56 tuổi đến phòng khám do khó thở...
A. Cai rượu  B. Bỏ hút thuốc lá  C. ACEi  D. Digoxin
`;

  const questions = parseTextToStructuredQuestions(samplePdfText);
  assert.equal(questions.length, 2);

  // Question 1
  assert.equal(questions[0].options?.length, 5);
  assert.equal(questions[0].options?.[0], 'Đường dẫn truyền phụ');
  assert.equal(questions[0].options?.[4], 'Tác dụng phụ của thuốc');

  // Question 2 (Side-by-side options)
  assert.equal(questions[1].options?.length, 4);
  assert.equal(questions[1].options?.[0], 'Cai rượu');
  assert.equal(questions[1].options?.[1], 'Bỏ hút thuốc lá');
  assert.equal(questions[1].options?.[2], 'ACEi');
  assert.equal(questions[1].options?.[3], 'Digoxin');
});

test('parseAnswerKeysFromText handles Viet-USMLE explanation PDF with elimination', () => {
  const sampleAnsText = `
ANS BLOCK 1 TIM MẠCH

Câu 1 ID 3096
Bệnh nhân này bị cuồng nhĩ...
(Lựa chọn A) Đường dẫn truyền phụ thấy trong hội chứng WPW...
(Lựa chọn B) Xơ hóa tế bào cơ tim...
(Lựa chọn C) Sẹo cơ tim xuất hiện sau nhồi máu...
(Lựa chọn D) Giãn nhĩ trái không gây rung nhĩ...
Mục tiêu học tập: Rung nhĩ do tái cấu trúc nhĩ...

Câu 2 ID 2692
Đáp án đúng là B.
Bệnh nhân bị cơ tim giãn nở do rượu...
`;

  const { byIndex, byId, totalFound } = parseAnswerKeysFromText(sampleAnsText);
  assert.ok(totalFound >= 2);

  // Question 1 (ID 3096) deduced E by elimination of A, B, C, D
  const key3096 = byId.get('3096');
  assert.ok(key3096);
  assert.equal(key3096?.correctLetter, 'E');
  assert.equal(key3096?.correctIndex, 4);

  // Question 2 (ID 2692) explicit B
  const key2692 = byId.get('2692');
  assert.ok(key2692);
  assert.equal(key2692?.correctLetter, 'B');
  assert.equal(key2692?.correctIndex, 1);
});

test('applyAnswerKeysToQuestions safely merges explanation answers onto parsed questions', () => {
  const questions = parseTextToStructuredQuestions(`
Câu 1 ID: 3096 Bệnh nhân 68 tuổi...
A. Option 1
B. Option 2
C. Option 3
D. Option 4
E. Option 5

Câu 2 ID: 2692 Bệnh nhân 56 tuổi...
A. Option 1
B. Option 2
C. Option 3
D. Option 4
`);

  const ansText = `
Câu 1 ID 3096
(Lựa chọn A) Sai
(Lựa chọn B) Sai
(Lựa chọn C) Sai
(Lựa chọn D) Sai

Câu 2 ID 2692
Đáp án: B
`;

  const { updatedQuestions, matchedCount } = applyAnswerKeysToQuestions(questions, ansText);

  assert.equal(matchedCount, 2);
  assert.equal(updatedQuestions[0].correctAnswer, 4); // E
  assert.equal(updatedQuestions[1].correctAnswer, 1); // B
});

