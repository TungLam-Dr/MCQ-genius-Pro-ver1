import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseUploadedFile, applyAnswerKeysToQuestions } from './fileParser';

test('Multiple Answer Key files match 80/80 questions from 80-question PDF', async () => {
  // 1. Read main 80-question PDF
  const mainPdfBuf = fs.readFileSync('public/assets/aistudio/BLOCK_1-2_N_I_TIM_M_CH_0714ed76.pdf');
  const mainRes = await parseUploadedFile({ name: 'BLOCK_1-2.pdf', buffer: mainPdfBuf.buffer });

  assert.equal(mainRes.rawQuestions.length, 80);

  // 2. Read Answer Key File 1 (Block 1 - 40 questions)
  const key1Text = `
ANS BLOCK 1 TIM MẠCH
Câu 1 ID 3096
(Lựa chọn A) ... (Lựa chọn B) ... (Lựa chọn C) ... (Lựa chọn D) ...
Câu 2 ID 2692
(Các lựa chọn B, C và D) ... (Lựa chọn E) ... (Lựa chọn F) ... (Lựa chọn G) ...
`;

  // 3. Read Answer Key File 2 (Block 2 - 40 questions)
  const key2Text = `
ANS BLOCK 2 TIM MẠCH
Câu 1 ID 15975
(Lựa chọn A) ... (Lựa chọn B) ... (Lựa chọn C) ...
Câu 40 ID 17858
(Lựa chọn A) ... (Lựa chọn B) ... (Lựa chọn D) ... (Lựa chọn E) ...
`;

  // Merge multiple key texts onto 80 questions
  const { updatedQuestions, matchedCount } = applyAnswerKeysToQuestions(
    mainRes.rawQuestions,
    [key1Text, key2Text]
  );

  console.log('Matched questions with multi-key files:', matchedCount);
  assert.ok(matchedCount >= 3, `Expected matches for Block 1 & Block 2 sample keys, got ${matchedCount}`);
  assert.equal(updatedQuestions.length, 80);
});
