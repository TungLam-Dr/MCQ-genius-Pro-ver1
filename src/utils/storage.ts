import type { Question } from '../types/quiz';
import type { CloudSnapshot } from '../services/cloudSync';

const DB_NAME = 'mcq_genius_db';
const DB_VERSION = 2;
const DATA_STORE = 'app_data';
const QUESTION_STORE = 'questions';
const QUESTIONS_KEY = 'mcq_genius_questions';
const ORDER_KEY = 'question_order';
const READY_KEY = 'questions_migrated';

let databasePromise: Promise<IDBDatabase> | undefined;
let previousQuestions = new Map<string, Question>();

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Trình duyệt không hỗ trợ IndexedDB.'));
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
        if (!db.objectStoreNames.contains(QUESTION_STORE)) db.createObjectStore(QUESTION_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Hãy đóng các tab MCQ Genius khác rồi tải lại trang.'));
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise!;
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Giao dịch lưu trữ bị hủy.'));
    tx.onerror = () => reject(tx.error || new Error('Không thể lưu dữ liệu.'));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function legacyValue<T>(key: string): T | undefined {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw) as T;
}

function clearLegacy(key: string): void {
  try { localStorage.removeItem(key); } catch { /* IndexedDB has already committed. */ }
}

async function saveQuestions(questions: Question[], migrating = false): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([DATA_STORE, QUESTION_STORE], 'readwrite');
  const done = complete(tx);
  const data = tx.objectStore(DATA_STORE);
  const records = tx.objectStore(QUESTION_STORE);
  const existing = records.getAllKeys();
  existing.onsuccess = () => {
    const ids = new Set(questions.map(q => q.id));
    for (const oldId of existing.result) if (!ids.has(String(oldId))) records.delete(oldId);
    for (const question of questions) {
      if (migrating || previousQuestions.get(question.id) !== question) records.put(question);
    }
    data.put(questions.map(q => q.id), ORDER_KEY);
    data.put(true, READY_KEY);
    data.delete(QUESTIONS_KEY); // Remove the old whole-array copy only after the new records commit.
  };
  await done;
  previousQuestions = new Map(questions.map(q => [q.id, q]));
}

/** Saves the question bank as individual records; all other values use app_data. */
export async function setStorageItem<T>(key: string, value: T): Promise<void> {
  if (key === QUESTIONS_KEY) {
    await saveQuestions(value as Question[]);
    return;
  }
  const db = await openDB();
  const tx = db.transaction(DATA_STORE, 'readwrite');
  const done = complete(tx);
  tx.objectStore(DATA_STORE).put(value, key);
  await done;
}

/** Replace the offline bank and its metadata in one IndexedDB transaction. */
export async function replaceStoredSnapshot(values: CloudSnapshot): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([DATA_STORE, QUESTION_STORE], 'readwrite');
  const done = complete(tx);
  const data = tx.objectStore(DATA_STORE);
  const questions = tx.objectStore(QUESTION_STORE);
  questions.clear();
  for (const question of values.mcq_genius_questions) questions.put(question);
  data.put(values.mcq_genius_questions.map(q => q.id), ORDER_KEY);
  data.put(true, READY_KEY);
  data.delete(QUESTIONS_KEY);
  for (const [key, value] of Object.entries(values)) {
    if (key !== QUESTIONS_KEY) data.put(value, key);
  }
  await done;
  previousQuestions = new Map(values.mcq_genius_questions.map(q => [q.id, q]));
}

/** Imports legacy localStorage once. Never discards old data before the IndexedDB commit. */
export async function getStorageItem<T>(key: string, fallbackValue: T): Promise<T> {
  const db = await openDB();
  if (key === QUESTIONS_KEY) {
    const tx = db.transaction([DATA_STORE, QUESTION_STORE], 'readonly');
    const data = tx.objectStore(DATA_STORE);
    const [migrated, order, oldArray, records] = await Promise.all([
      requestValue(data.get(READY_KEY)) as Promise<boolean | undefined>,
      requestValue(data.get(ORDER_KEY)) as Promise<string[] | undefined>,
      requestValue(data.get(QUESTIONS_KEY)) as Promise<Question[] | undefined>,
      requestValue(tx.objectStore(QUESTION_STORE).getAll()) as Promise<Question[]>,
    ]);
    if (migrated) {
      const byId = new Map(records.map(q => [q.id, q]));
      const sorted = (order || []).map(id => byId.get(id)).filter((q): q is Question => !!q);
      for (const q of records) if (!sorted.includes(q)) sorted.push(q);
      previousQuestions = new Map(sorted.map(q => [q.id, q]));
      clearLegacy(key);
      return sorted as T;
    }
    const legacy = oldArray ?? legacyValue<Question[]>(key);
    const questions = legacy ?? fallbackValue as Question[];
    await saveQuestions(questions, true);
    if (legacy !== undefined) clearLegacy(key);
    return questions as T;
  }

  const tx = db.transaction(DATA_STORE, 'readonly');
  const stored = await requestValue(tx.objectStore(DATA_STORE).get(key)) as T | undefined;
  if (stored !== undefined) {
    clearLegacy(key);
    return stored;
  }
  const legacy = legacyValue<T>(key);
  const value = legacy ?? fallbackValue;
  await setStorageItem(key, value);
  if (legacy !== undefined) clearLegacy(key);
  return value;
}
