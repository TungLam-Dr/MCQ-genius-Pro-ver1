import { Category, Question } from '../types/quiz';

export interface ParseFileResponse {
  suggestedCategoryName: string;
  questions: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    categorySuggestion?: string;
  }>;
}

export interface CategorizeResponse {
  categories: Array<{
    name: string;
    description: string;
    icon: string;
    questionIndices: number[];
  }>;
}

export interface GenerateQuestionsResponse {
  categoryName: string;
  questions: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
}

export async function parseFileWithGemini(
  rawContent: string,
  fileName: string,
  preParsedQuestions: Partial<Question>[] = []
): Promise<ParseFileResponse> {
  const res = await fetch('/api/gemini/parse-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawContent, fileName, preParsedQuestions }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Lỗi khi kết nối với máy chủ AI.');
  }
  return data.data;
}

export async function categorizeQuestionsWithGemini(
  questions: Question[]
): Promise<CategorizeResponse> {
  const res = await fetch('/api/gemini/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Lỗi phân loại câu hỏi với Gemini.');
  }
  return data.data;
}

export async function generateQuestionsWithGemini(
  topic: string,
  count: number,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): Promise<GenerateQuestionsResponse> {
  const res = await fetch('/api/gemini/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, count, difficulty }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Lỗi tạo câu hỏi với Gemini.');
  }
  return data.data;
}

export async function askGeminiDebate(payload: {
  question: string;
  options: string[];
  correctAnswer: number;
  userSelectedOption: number | null;
  explanation?: string;
  chatHistory?: { sender: 'user' | 'ai'; text: string }[];
  userMessage?: string;
  mode?: import('../types/quiz').DebateMode;
  confusedOptions?: string[];
}): Promise<string> {
  const res = await fetch('/api/gemini/debate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Lỗi kết nối với Gemini Study Buddy.');
  }
  return data.text;
}

export async function checkGeminiHealth(): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/gemini/health');
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message || data.error };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Không thể kết nối đến máy chủ.' };
  }
}

