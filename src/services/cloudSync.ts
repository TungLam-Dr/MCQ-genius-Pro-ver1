import { createClient } from '@supabase/supabase-js';
import type { Category, Question, QuestionAttempt, ReviewSchedule, SharedExamDraft, StudyFlagColor, TestResult } from '../types/quiz';
import { INITIAL_CATEGORIES, INITIAL_QUESTIONS } from '../data/defaultQuestions';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const syncConfigured = !!url && !!key;
export const syncClient = syncConfigured ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const bucket = 'mcq-private-sync';
const chunkSize = 4 * 1024 * 1024;

export interface CloudSnapshot {
  version: 1;
  mcq_genius_categories: Category[];
  mcq_genius_questions: Question[];
  mcq_genius_history: TestResult[];
  mcq_genius_attempts: QuestionAttempt[];
  mcq_genius_share_drafts: SharedExamDraft[];
  mcq_genius_study_flags: Record<string, boolean>;
  mcq_genius_study_flag_colors: Record<string, StudyFlagColor>;
  mcq_genius_review_schedule: Record<string, ReviewSchedule>;
  mcq_genius_suspended: Record<string, boolean>;
  mcq_genius_buried_until: Record<string, string>;
  mcq_genius_saved_review_filters: unknown[];
}
export interface SyncHead {
  revision: string;
  manifest: { paths: string[]; sha256: string; encoding: 'gzip' | 'json'; bytes: number; previousPaths?: string[] };
  updated_at: string;
}
export function hasPersonalData(snapshot: CloudSnapshot): boolean {
  const defaultQuestions = new Map(INITIAL_QUESTIONS.map(q => [q.id, JSON.stringify(q)]));
  const defaultCategories = new Map(INITIAL_CATEGORIES.map(c => [c.id, JSON.stringify(c)]));
  return snapshot.mcq_genius_questions.length !== INITIAL_QUESTIONS.length ||
    snapshot.mcq_genius_categories.length !== INITIAL_CATEGORIES.length ||
    snapshot.mcq_genius_questions.some(q => defaultQuestions.get(q.id) !== JSON.stringify(q)) ||
    snapshot.mcq_genius_categories.some(c => defaultCategories.get(c.id) !== JSON.stringify(c)) ||
    snapshot.mcq_genius_history.length > 0 || snapshot.mcq_genius_attempts.length > 0 ||
    Object.keys(snapshot.mcq_genius_study_flags).length > 0 || snapshot.mcq_genius_share_drafts.length > 0 ||
    Object.keys(snapshot.mcq_genius_review_schedule).length > 0 || snapshot.mcq_genius_saved_review_filters.length > 0 ||
    Object.keys(snapshot.mcq_genius_suspended).length > 0 || Object.keys(snapshot.mcq_genius_buried_until).length > 0;
}
function client() {
  if (!syncClient) throw new Error('Thiếu cấu hình Supabase trên Vercel.');
  return syncClient;
}
function assertSnapshot(value: unknown): asserts value is CloudSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Bản sao lưu không hợp lệ.');
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.mcq_genius_questions) ||
      !Array.isArray(data.mcq_genius_categories) || !Array.isArray(data.mcq_genius_history) ||
      !Array.isArray(data.mcq_genius_attempts) || !Array.isArray(data.mcq_genius_share_drafts) ||
      !Array.isArray(data.mcq_genius_saved_review_filters) ||
      !data.mcq_genius_study_flags || !data.mcq_genius_review_schedule ||
      data.mcq_genius_questions.some((q: Question) => !q || typeof q.id !== 'string' || !Array.isArray(q.options))) {
    throw new Error('Bản sao lưu thiếu dữ liệu hoặc bị hỏng.');
  }
}
async function compress(bytes: Uint8Array): Promise<{ bytes: Uint8Array; encoding: 'gzip' | 'json' }> {
  if (typeof CompressionStream === 'undefined') return { bytes, encoding: 'json' };
  const zipped = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return { bytes: new Uint8Array(zipped), encoding: 'gzip' };
}
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function snapshotHash(snapshot: CloudSnapshot): Promise<string> {
  return digest(new TextEncoder().encode(JSON.stringify(snapshot)));
}
export async function getSyncHead(): Promise<SyncHead | null> {
  const { data: { user } } = await client().auth.getUser();
  if (!user) throw new Error('Phiên đăng nhập đã hết hạn.');
  const { data, error } = await client().from('mcq_sync_heads').select('revision,manifest,updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data as SyncHead | null;
}
export async function uploadSnapshot(snapshot: CloudSnapshot, expected: string | null, previous?: SyncHead | null): Promise<{ head: SyncHead; hash: string }> {
  const { data: { user } } = await client().auth.getUser();
  if (!user) throw new Error('Bạn cần đăng nhập lại.');
  assertSnapshot(snapshot);
  const raw = new TextEncoder().encode(JSON.stringify(snapshot));
  const hash = await digest(raw);
  const packed = await compress(raw);
  if (packed.bytes.length > 100 * chunkSize) throw new Error('Bản sao lưu vượt 400 MB. Hãy giảm dung lượng ảnh trước khi đồng bộ.');
  const revision = crypto.randomUUID();
  const paths: string[] = [];
  try {
    for (let index = 0; index < packed.bytes.length; index += chunkSize) {
      const path = `${user.id}/${revision}/${paths.length}.bin`;
      const part = packed.bytes.slice(index, index + chunkSize);
      const { error } = await client().storage.from(bucket).upload(path, new Blob([part], { type: 'application/octet-stream' }), { upsert: false, contentType: 'application/octet-stream' });
      if (error) throw error;
      paths.push(path);
    }
    const manifest: SyncHead['manifest'] = { paths, sha256: hash, encoding: packed.encoding, bytes: packed.bytes.length, previousPaths: previous?.manifest.paths };
    const { data: committed, error } = await client().rpc('mcq_commit_sync', {
      p_expected: expected, p_revision: revision, p_manifest: manifest,
    });
    if (error) throw error;
    if (!committed) throw new Error('SYNC_CONFLICT');
    if (previous?.manifest.previousPaths?.length) void client().storage.from(bucket).remove(previous.manifest.previousPaths);
    return { head: { revision, manifest, updated_at: new Date().toISOString() }, hash };
  } catch (error) {
    if (paths.length) void client().storage.from(bucket).remove(paths);
    throw error;
  }
}
export async function downloadSnapshot(head: SyncHead, userId: string): Promise<CloudSnapshot> {
  const { paths, sha256, encoding, bytes } = head.manifest;
  if (!Array.isArray(paths) || !paths.length || paths.length > 100 ||
      !paths.every(path => typeof path === 'string' && path.startsWith(`${userId}/${head.revision}/`)) ||
      !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 400 * 1024 * 1024) throw new Error('Danh sách tệp đồng bộ không hợp lệ.');
  const parts: Uint8Array[] = [];
  for (const path of paths) {
    const { data, error } = await client().storage.from(bucket).download(path);
    if (error || !data) throw error || new Error('Không tải được dữ liệu.');
    parts.push(new Uint8Array(await data.arrayBuffer()));
  }
  const combined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  if (combined.byteLength !== bytes) throw new Error('Dữ liệu tải về không đầy đủ.');
  let offset = 0;
  for (const part of parts) { combined.set(part, offset); offset += part.byteLength; }
  if (encoding === 'gzip' && typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải nén. Hãy cập nhật trình duyệt.');
  if (encoding !== 'gzip' && encoding !== 'json') throw new Error('Định dạng bản sao lưu không hợp lệ.');
  const raw = encoding === 'gzip'
    ? new Uint8Array(await new Response(new Blob([combined]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
    : combined;
  if (await digest(raw) !== sha256) throw new Error('Dữ liệu không khớp mã kiểm tra. Hủy tải về để giữ bản trên máy.');
  const snapshot: unknown = JSON.parse(new TextDecoder().decode(raw));
  assertSnapshot(snapshot);
  return snapshot;
}
