import { randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const router = express.Router();
const BUCKET = 'mcq-share-images';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUESTIONS = 200;
const MAX_ASSETS = 300;

type ExamQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  categoryName?: string;
  images: string[];
};

type ExamRow = {
  id: string;
  title: string;
  time_limit_minutes: number;
  questions: ExamQuestion[];
};

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trên Vercel.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function authorize(req: Request, res: Response): boolean {
  const expected = process.env.EXAM_PUBLISH_SECRET;
  const supplied = req.get('x-exam-publish-secret');
  if (!expected) {
    res.status(503).json({ error: 'Chưa cấu hình EXAM_PUBLISH_SECRET trên Vercel.' });
    return false;
  }
  const a = Buffer.from(supplied || '');
  const b = Buffer.from(expected);
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({ error: 'Mã xuất bản không đúng.' });
    return false;
  }
  return true;
}

function fail(res: Response, error: unknown): Response {
  console.error('Shared exam:', error);
  return res.status(500).json({ error: 'Không thể xử lý đề chia sẻ. Kiểm tra cấu hình Supabase và thử lại.' });
}

function assertQuestions(value: unknown, examId: string): ExamQuestion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_QUESTIONS) {
    throw new Error('Số câu hỏi phải từ 1 đến 200.');
  }
  let assets = 0;
  return value.map((item: any, index): ExamQuestion => {
    const options = item?.options;
    const images = item?.images || [];
    if (typeof item?.question !== 'string' || !item.question.trim() || item.question.length > 15000 ||
        !Array.isArray(options) || options.length < 2 || options.length > 10 ||
        options.some((option: unknown) => typeof option !== 'string' || option.length > 8000) ||
        !Number.isInteger(item.correctAnswer) || item.correctAnswer < 0 || item.correctAnswer >= options.length ||
        !Array.isArray(images) || images.length > 12 ||
        images.some((image: unknown) => typeof image !== 'string' || !image.startsWith(`mcq-asset://${examId}/`))) {
      throw new Error(`Câu ${index + 1} thiếu đáp án đúng, có dữ liệu không hợp lệ hoặc ảnh chưa được tải lên.`);
    }
    assets += images.length;
    if (assets > MAX_ASSETS) throw new Error('Đề có quá nhiều ảnh.');
    return {
      id: `q-${index + 1}`,
      question: item.question,
      options,
      correctAnswer: item.correctAnswer,
      categoryName: typeof item.categoryName === 'string' ? item.categoryName.slice(0, 120) : '',
      images,
    };
  });
}

async function publicQuestions(db: SupabaseClient, exam: ExamRow) {
  const imageCache = new Map<string, string>();
  const paths = [...new Set(exam.questions.flatMap(question => question.images.map(url => url.slice('mcq-asset://'.length))))];
  await Promise.all(paths.map(async path => {
    if (!path.startsWith(`${exam.id}/`)) throw new Error('Đường dẫn ảnh không hợp lệ.');
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 86400);
    if (error || !data?.signedUrl) throw error || new Error('Không thể mở ảnh.');
    imageCache.set(path, data.signedUrl);
  }));
  return exam.questions.map(({ correctAnswer: _hidden, ...question }) => ({
    ...question,
    images: question.images.map(url => imageCache.get(url.slice('mcq-asset://'.length))!),
  }));
}

async function getExam(db: SupabaseClient, id: string): Promise<ExamRow | null> {
  const { data, error } = await db.from('mcq_shared_exams').select('id,title,time_limit_minutes,questions').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as ExamRow | null;
}

// Server checks a private publish passphrase. It is never bundled in browser code.
router.post('/new', (req, res) => {
  if (!authorize(req, res)) return;
  res.json({ id: randomUUID() });
});

router.post('/image-upload', async (req, res) => {
  if (!authorize(req, res)) return;
  const { examId, mime, bytes } = req.body || {};
  const extensions: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  };
  if (typeof examId !== 'string' || !ID.test(examId) || !extensions[mime] || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 20_000_000) {
    return res.status(400).json({ error: 'Ảnh không hợp lệ hoặc lớn hơn 20 MB.' });
  }
  try {
    const path = `${examId}/${randomUUID()}.${extensions[mime]}`;
    const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.signedUrl) throw error || new Error('Không tạo được URL tải ảnh.');
    return res.json({ signedUrl: data.signedUrl, path, imageRef: `mcq-asset://${path}` });
  } catch (error) { return fail(res, error); }
});

router.post('/publish', async (req, res) => {
  if (!authorize(req, res)) return;
  const { id, title, timeLimitMinutes, questions } = req.body || {};
  if (typeof id !== 'string' || !ID.test(id) || typeof title !== 'string' || !title.trim() || title.length > 160 ||
      !Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 360) {
    return res.status(400).json({ error: 'Tên đề hoặc thời gian không hợp lệ (1–360 phút).' });
  }
  let normalized: ExamQuestion[];
  try { normalized = assertQuestions(questions, id); }
  catch (error) { return res.status(400).json({ error: (error as Error).message }); }
  try {
    const { error } = await admin().from('mcq_shared_exams').insert({ id, title: title.trim(), time_limit_minutes: timeLimitMinutes, questions: normalized });
    if (error) throw error;
    return res.json({ id, url: `/exam/${id}` });
  } catch (error) { return fail(res, error); }
});

router.get('/exam/:id', async (req, res) => {
  if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy đề.' });
  try {
    const db = admin();
    const exam = await getExam(db, req.params.id);
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ id: exam.id, title: exam.title, timeLimitMinutes: exam.time_limit_minutes, questions: await publicQuestions(db, exam) });
  } catch (error) { return fail(res, error); }
});

router.post('/exam/:id/start', async (req, res) => {
  if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy đề.' });
  try {
    const db = admin();
    const exam = await getExam(db, req.params.id);
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề.' });
    const attemptId = randomUUID();
    const startedAt = new Date();
    const { error } = await db.from('mcq_shared_attempts').insert({ id: attemptId, exam_id: exam.id, started_at: startedAt.toISOString() });
    if (error) throw error;
    return res.json({ attemptId, deadlineAt: new Date(startedAt.getTime() + exam.time_limit_minutes * 60_000).toISOString() });
  } catch (error) { return fail(res, error); }
});

router.get('/exam/:id/attempt/:attemptId', async (req, res) => {
  if (!ID.test(req.params.id) || !ID.test(req.params.attemptId)) return res.status(404).json({ error: 'Không tìm thấy lượt làm bài.' });
  try {
    const { data, error } = await admin().from('mcq_shared_attempts').select('started_at,submitted_at,correct_count,incorrect_count,skipped_count').eq('id', req.params.attemptId).eq('exam_id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy lượt làm bài.' });
    const exam = await getExam(admin(), req.params.id);
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ deadlineAt: new Date(new Date(data.started_at).getTime() + exam.time_limit_minutes * 60_000).toISOString(),
      summary: data.submitted_at ? { correct: data.correct_count, incorrect: data.incorrect_count, skipped: data.skipped_count } : null });
  } catch (error) { return fail(res, error); }
});

router.post('/exam/:id/submit', async (req, res) => {
  if (!ID.test(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy đề.' });
  const { attemptId, answers } = req.body || {};
  if (typeof attemptId !== 'string' || !ID.test(attemptId) || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'Bài nộp không hợp lệ.' });
  }
  try {
    const db = admin();
    const [exam, attemptQuery] = await Promise.all([
      getExam(db, req.params.id),
      db.from('mcq_shared_attempts').select('started_at,submitted_at').eq('id', attemptId).eq('exam_id', req.params.id).maybeSingle(),
    ]);
    if (attemptQuery.error) throw attemptQuery.error;
    const attempt = attemptQuery.data;
    if (!exam || !attempt) return res.status(404).json({ error: 'Không tìm thấy lượt làm bài.' });
    if (attempt.submitted_at) return res.status(409).json({ error: 'Lượt làm bài này đã được nộp.' });
    const deadline = new Date(attempt.started_at).getTime() + exam.time_limit_minutes * 60_000;
    if (Date.now() > deadline + 30000) return res.status(408).json({ error: 'Đã quá thời gian nộp bài. Vui lòng bắt đầu lượt mới.' });
    let correct = 0, incorrect = 0, skipped = 0;
    for (const question of exam.questions) {
      const choice = answers[question.id];
      if (choice === undefined || choice === null) skipped++;
      else if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return res.status(400).json({ error: 'Đáp án chọn không hợp lệ.' });
      else if (choice === question.correctAnswer) correct++;
      else incorrect++;
    }
    const { data, error } = await db.from('mcq_shared_attempts').update({ submitted_at: new Date().toISOString(), correct_count: correct, incorrect_count: incorrect, skipped_count: skipped })
      .eq('id', attemptId).eq('exam_id', exam.id).is('submitted_at', null).select('id');
    if (error) throw error;
    if (!data?.length) return res.status(409).json({ error: 'Lượt làm bài này đã được nộp.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ correct, incorrect, skipped, total: exam.questions.length });
  } catch (error) { return fail(res, error); }
});

export { router as shareRouter };
