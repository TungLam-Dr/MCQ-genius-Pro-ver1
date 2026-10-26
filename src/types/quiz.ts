export interface Question {
  id: string;
  categoryId: string;
  categoryName: string;
  question: string;
  options: string[];
  correctAnswer: number; // 0-indexed option index
  explanation?: string;
  manualExplanation?: string; // Additional editable notes; preserves original rich answer source
  explanationHtml?: string; // Word answer: formatted paragraphs, tables, captions and images
  explanationPages?: { pageNum: number; dataUrl: string }[]; // PDF answer: original page excerpts
  imageUrl?: string;
  images?: string[];
  optionImages?: string[][]; // Images belonging to each answer choice, in option order
  sourceId?: string; // ID printed in the imported document; used for answer-key/image matching
  sourceBlock?: number;
  sourceNumber?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  codeBlock?: string;
  tags?: string[];
}

export interface Category {
  id: string;
  name: string;
  description: string;
  /** Older categories have no kind/parentId and remain question categories at the root. */
  kind?: 'folder' | 'questions';
  parentId?: string | null;
  icon?: string;
  color?: string;
  questionCount: number;
  createdAt: string;
}

export interface CategorySelection {
  categoryId: string;
  categoryName: string;
  availableCount: number;
  requestedCount: number;
}

export type BlockPresetType = '40q_30m' | '50q_40m' | 'custom';

export interface TestConfig {
  title: string;
  presetType: BlockPresetType;
  totalQuestions: number;
  timeLimitMinutes: number; // 0 for unlimited
  selectionMode: 'categories' | 'random_mix' | 'ai_generated';
  categorySelections: CategorySelection[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

/** Bản đề cố định; link công khai chỉ có sau khi xuất bản. */
export interface SharedExamDraft {
  id: string;
  createdAt: string;
  config: TestConfig;
  questions: Question[];
  shareUrl?: string;
}

export interface UserAnswerRecord {
  questionId: string;
  selectedOption: number | null; // null if skipped
  timeSpentSeconds?: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  total: number;
  correct: number;
  percentage: number;
}

export interface TestResult {
  sessionId: string;
  testConfig?: TestConfig; // Stored with new attempts; older saved attempts remain readable.
  title: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  scorePercentage: number;
  userAnswers: Record<string, number | null>;
  flaggedQuestions: Record<string, boolean>;
  categoryBreakdown: Record<string, CategoryBreakdown>;
  questions: Question[];
}

/** Small durable practice record. Deleting the full test does not erase learning stats. */
export interface QuestionAttempt {
  sessionId: string;
  questionId: string;
  categoryId: string;
  categoryName: string;
  endTime: string;
  answered: boolean;
  correct: boolean;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';
export type StudyFlagColor = 'red' | 'orange' | 'green' | 'blue' | 'pink' | 'teal' | 'purple';
export interface ReviewSchedule {
  dueAt: string;
  lastReviewedAt: string;
  intervalDays: number;
  repetitions: number;
  lastGrade: ReviewGrade;
}

export type DebateMode =
  | 'initial'
  | 'explain_first'
  | 'hint_step'
  | 'confused_between'
  | 'full_explanation'
  | 'change_scenario'
  | 'teach_back'
  | 'chat';

export interface WhatIfScenario {
  scenarioQuestion: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface DebateChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  mode?: DebateMode;
  whatIfScenario?: WhatIfScenario;
}

