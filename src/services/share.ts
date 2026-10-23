import type { SharedExamDraft } from '../types/quiz';

async function jsonRequest<T>(path: string, method: 'GET' | 'POST', body?: unknown, secret?: string): Promise<T> {
  const response = await fetch(`/api/share${path}`, {
    method,
    cache: 'no-store',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(secret ? { 'x-exam-publish-secret': secret } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Không thể kết nối máy chủ (${response.status}).`);
  return data as T;
}

export type PublicQuestion = {
  id: string;
  question: string;
  options: string[];
  categoryName?: string;
  images: string[];
};
export type PublicExam = { id: string; title: string; timeLimitMinutes: number; questions: PublicQuestion[] };
export type PublicSummary = { correct: number; incorrect: number; skipped: number; total: number };

export const getPublicExam = (id: string) => jsonRequest<PublicExam>(`/exam/${id}`, 'GET');
export const startPublicExam = (id: string) => jsonRequest<{ attemptId: string; deadlineAt: string }>(`/exam/${id}/start`, 'POST', {});
export const resumePublicExam = (id: string, attemptId: string) => jsonRequest<{ deadlineAt: string; summary: PublicSummary | null }>(`/exam/${id}/attempt/${attemptId}`, 'GET');
export const submitPublicExam = (id: string, attemptId: string, answers: Record<string, number | null>) =>
  jsonRequest<PublicSummary>(`/exam/${id}/submit`, 'POST', { attemptId, answers });

/** Upload images directly to private Storage; serverless requests carry only text metadata. */
export async function publishExam(draft: SharedExamDraft, secret: string, onProgress: (text: string) => void): Promise<string> {
  const { id } = await jsonRequest<{ id: string }>('/new', 'POST', {}, secret);
  const uploaded = new Map<string, string>();
  const questions = [];
  const imagesTotal = draft.questions.reduce((total, q) => total + (q.images?.length || (q.imageUrl ? 1 : 0)), 0);
  let imagesDone = 0;

  for (const question of draft.questions) {
    const images: string[] = [];
    for (const source of question.images?.length ? question.images : question.imageUrl ? [question.imageUrl] : []) {
      if (!uploaded.has(source)) {
        onProgress(`Đang tải ảnh ${imagesDone + 1}/${imagesTotal}...`);
        let blob: Blob;
        try {
          const response = await fetch(source);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          blob = await response.blob();
        } catch {
          throw new Error('Không thể đọc một ảnh trong đề. Vui lòng tải lại ảnh vào ngân hàng câu hỏi rồi thử lại.');
        }
        const mime = blob.type.toLowerCase().split(';')[0];
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
          throw new Error('Ảnh chia sẻ chỉ hỗ trợ PNG, JPEG, WebP và GIF.');
        }
        if (blob.size > 20_000_000) throw new Error('Có ảnh lớn hơn 20 MB.');
        const ticket = await jsonRequest<{ signedUrl: string; imageRef: string }>(
          '/image-upload', 'POST', { examId: id, mime, bytes: blob.size }, secret
        );
        const form = new FormData();
        form.append('cacheControl', '3600');
        form.append('', blob, 'exam-image');
        const response = await fetch(ticket.signedUrl, { method: 'PUT', body: form });
        if (!response.ok) throw new Error(`Không tải được ảnh lên kho lưu trữ (${response.status}).`);
        uploaded.set(source, ticket.imageRef);
        imagesDone++;
      }
      images.push(uploaded.get(source)!);
    }
    questions.push({
      question: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      categoryName: question.categoryName,
      images,
    });
  }
  onProgress('Đang lưu đề và tạo link...');
  const payload = { id, title: draft.config.title, timeLimitMinutes: draft.config.timeLimitMinutes, questions };
  if (new Blob([JSON.stringify(payload)]).size > 3_800_000) {
    throw new Error('Phần chữ của đề quá lớn để gửi qua Vercel. Hãy chia thành hai đề nhỏ hơn.');
  }
  const result = await jsonRequest<{ url: string }>('/publish', 'POST', payload, secret);
  return new URL(result.url, window.location.origin).toString();
}
