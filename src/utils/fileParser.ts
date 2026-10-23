import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { parsePdfBuffer } from './pdfParser';
import { Question } from '../types/quiz';

export interface ParsedFileResult {
  fileName: string;
  extractedText: string;
  rawQuestions: Partial<Question>[];
  detectedImages: string[];
  format: 'docx' | 'xlsx' | 'json' | 'txt' | 'pdf';
  pageCount?: number;
  hasBottomAnswerGrid?: boolean;
}

export interface ParsedKeyEntry {
  questionNum?: number;
  idTag?: string;
  sourceBlock?: number;
  correctLetter: string;
  correctIndex: number;
  explanation?: string;
  incorrectLetters?: string[];
  method?: 'explicit' | 'exclusion' | 'grid' | 'unresolved';
}

export interface RichAnswerSection {
  sourceId?: string;
  sourceNumber: number;
  sourceBlock?: number;
  html?: string;
  pages?: {pageNum:number;dataUrl:string}[];
}

export interface AnswerKeyDocument {
  text: string;
  richSections: RichAnswerSection[];
}

/** Mammoth's semantic HTML retains the Word file's tables, embedded figures and captions. */
export function splitAnswerHtml(html: string): RichAnswerSection[] {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)];
  const headings: {start:number;end:number;sourceNumber:number;sourceId?:string;sourceBlock?:number}[] = [];
  let activeBlock: number | undefined;
  for (const p of paragraphs) {
    const visible = p[0].replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ').trim();
    const block = visible.match(/^(?:ANS\s*)?BLOCK\s*(\d+)\b/i);
    if (block) activeBlock = Number(block[1]);
    const match = visible.match(/^(?:Câu|Question|Q)\s*(\d+)\s*(?:[.):-]\s*)?(?:ID\s*:?\s*(\d+))?\b/i);
    if (match) headings.push({start:p.index!,end:p.index!+p[0].length,
      sourceNumber:Number(match[1]),sourceId:match[2],sourceBlock:activeBlock});
  }
  return headings.map((h,i)=>({sourceNumber:h.sourceNumber,sourceId:h.sourceId,sourceBlock:h.sourceBlock,
    html:html.slice(h.end,headings[i+1]?.start??html.length)}));
}

export interface KeyMatchIssue {
  questionNumber: number;
  sourceBlock?: number;
  questionId?: string;
  answerId?: string;
  reason: string;
}

/**
 * Normalizes Vietnamese text by repairing fragmented letter spacing,
 * collapsing multiple spaces, and removing document header markers.
 */
export function normalizeVietnameseText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    .replace(/--- TRANG \d+ ---/gi, '\n')
    .replace(/Trang \d+\s*(?:[\/\-]|of)\s*\d+/gi, '')
    .replace(/Page \d+\s*(?:[\/\-]|of)\s*\d+/gi, '')
    .replace(/\f/g, '\n')
    .replace(/\r\n/g, '\n');

  // Only repair known broken labels. Joining arbitrary adjacent letters destroys
  // normal Vietnamese word boundaries and makes answer options impossible to parse.
  cleaned = cleaned
    .replace(/C\s*â\s*u/gi, 'Câu')
    .replace(/Đ\s*á\s*p\s*á\s*n/gi, 'Đáp án')
    .replace(/L\s*ự\s*a\s*c\s*h\s*ọ\s*n/gi, 'Lựa chọn')
    .replace(/P\s*h\s*ư\s*ơ\s*n\s*g\s*á\s*n/gi, 'Phương án')
    .replace(/G\s*i\s*ả\s*i\s*t\s*h\s*í\s*c\s*h/gi, 'Giải thích')
    .replace(/L\s*ờ\s*i\s*g\s*i\s*ả\s*i/gi, 'Lời giải')
    .replace(/B\s*ệ\s*n\s*h\s*n\s*h\s*â\s*n/gi, 'Bệnh nhân')
    .replace(/T\s*h\s*ô\s*n\s*g\s*t\s*i\s*n/gi, 'Thông tin');

  // Fix spaces before punctuation
  cleaned = cleaned.replace(/\s+([\.\,\:\;\?\!\)])/g, '$1');
  // Collapse multiple horizontal spaces
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  return cleaned;
}

function cleanDocumentText(text: string): string {
  return normalizeVietnameseText(text);
}

/**
 * Universal Answer Key & Explanation Parser
 * Smartly extracts correct answers from:
 * 1. Direct answer lists: "1.A 2.B 3.C 4.D" or "1-E, 2-A"
 * 2. Detailed explanation texts (like Viet-USMLE / ANS BLOCK PDFs):
 *    e.g. "Câu 1 ID 3096... (Lựa chọn A)... (Lựa chọn B)... (Lựa chọn C)... (Lựa chọn D)..." -> missing Option E is the correct answer!
 * 3. Explicit text declarations: "Đáp án E", "Lựa chọn E là đáp án đúng"
 */
export function parseAnswerKeysFromText(text: string): {
  byIndex: Map<number, ParsedKeyEntry>;
  byId: Map<string, ParsedKeyEntry>;
  byBlockIndex: Map<string, ParsedKeyEntry>;
  entries: ParsedKeyEntry[];
  declaredBlock?: number;
  totalFound: number;
} {
  const byIndex = new Map<number, ParsedKeyEntry>();
  const byId = new Map<string, ParsedKeyEntry>();
  const byBlockIndex = new Map<string, ParsedKeyEntry>();
  const entries: ParsedKeyEntry[] = [];

  const cleaned = cleanDocumentText(text);
  if (!cleaned.trim()) {
    return { byIndex, byId, byBlockIndex, entries, totalFound: 0 };
  }

  const titleBlock = cleaned.match(/(?:^|\n)\s*(?:(?:ANS|ĐÁP ÁN|ANSWER\s*KEY)\s*)?BLOCK\s*(\d+)\b(?!\s*[-–]\s*\d)/i);
  const declaredBlock = titleBlock ? Number(titleBlock[1]) : undefined;
  const add = (entry: ParsedKeyEntry) => {
    entries.push(entry);
    if (entry.idTag) byId.set(entry.idTag, entry);
    if (entry.questionNum) {
      byIndex.set(entry.questionNum, entry);
      if (entry.sourceBlock !== undefined) byBlockIndex.set(`${entry.sourceBlock}:${entry.questionNum}`, entry);
    }
  };

  // Explanation files: only headers beginning a line delimit questions. Digits
  // inside clinical prose must never become question numbers or answer keys.
  const header = /^\s*(?:Câu|Question|Q)\s*(\d+)\s*(?:[.):-]\s*)?(?:ID\s*:?\s*(\d+))?\b[^\n]*/gim;
  const headers = [...cleaned.matchAll(header)];
  if (headers.length) {
    let activeBlock = declaredBlock;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const previousEnd = i ? headers[i - 1].index! : 0;
      const heading = [...cleaned.slice(previousEnd, h.index!).matchAll(/(?:^|\n)\s*BLOCK\s*(\d+)\s*$/gim)].at(-1);
      if (heading) activeBlock = Number(heading[1]);
      const block = cleaned.slice(h.index!, i + 1 < headers.length ? headers[i + 1].index! : cleaned.length);
      const inline = h[0].match(/^\s*(?:Câu|Question|Q)\s*\d+\s*(?:ID\s*:?\s*\d+)?\s*(?:[.):-]|->|=>)\s*([A-J])\b/i);
      const explicit = inline || block.match(/(?:Đáp\s*án(?:\s*đúng)?|Key|Correct\s*Answer|Phương\s*án\s*đúng)\s*(?::|là)?\s*([A-J])\b/i) ||
        block.match(/(?:Lựa\s*chọn|Phương\s*án)\s+([A-J])\s+là\s+đáp\s*án\s*đúng/i);
      const incorrect = new Set<string>();
      for (const choice of block.matchAll(/\((?:Các\s+)?(?:Lựa\s*chọn|Phương\s*án)\s+([^)]*)\)/gi)) {
        for (const letter of choice[1].match(/\b[A-J]\b/gi) || []) incorrect.add(letter.toUpperCase());
      }
      let correctLetter = explicit?.[1]?.toUpperCase() || '';
      let method: ParsedKeyEntry['method'] = explicit ? 'explicit' : 'unresolved';
      if (!correctLetter && incorrect.size >= 2) {
        // Provisional only; applyAnswerKeysToQuestions rechecks against the
        // ACTUAL number of options before accepting an exclusion answer.
        const max = Math.max(69, ...[...incorrect].map(s => s.charCodeAt(0) + 1));
        const remaining = Array.from({length: Math.min(74,max)-64}, (_, j) => String.fromCharCode(65+j)).filter(s => !incorrect.has(s));
        if (remaining.length === 1) { correctLetter = remaining[0]; method = 'exclusion'; }
      }
      add({questionNum:Number(h[1]), idTag:h[2], sourceBlock:activeBlock,
        correctLetter, correctIndex:correctLetter ? correctLetter.charCodeAt(0)-65 : -1,
        explanation:block, incorrectLetters:[...incorrect], method});
    }
  } else {
    // Compact answer grids: "1.A 2-B", "Câu 3: D", "1 ID 3096 -> E".
    const pairs = /(?:^|[\s,;])(?:Câu\s*)?(\d{1,3})\s*(?:ID\s*:?\s*(\d+))?\s*(?:[.):-]|->|=>)\s*([A-J])\b/gi;
    let activeBlock = declaredBlock;
    for (const line of cleaned.split('\n')) {
      const blockHeading = line.match(/^\s*BLOCK\s*(\d+)\s*$/i);
      if (blockHeading) { activeBlock = Number(blockHeading[1]); continue; }
      for (const m of line.matchAll(pairs)) add({questionNum:Number(m[1]),idTag:m[2],sourceBlock:activeBlock,
        correctLetter:m[3].toUpperCase(),correctIndex:m[3].toUpperCase().charCodeAt(0)-65,method:'grid'});
      const idOnly = /^\s*ID\s*:?\s*(\d+)\s*(?:[.):-]|->|=>)\s*([A-J])\b/i.exec(line);
      if (idOnly) add({idTag:idOnly[1],sourceBlock:activeBlock,
        correctLetter:idOnly[2].toUpperCase(),correctIndex:idOnly[2].toUpperCase().charCodeAt(0)-65,method:'grid'});
    }
  }

  return {byIndex,byId,byBlockIndex,entries,declaredBlock,totalFound:entries.length};
}

/**
 * Advanced Universal Regex MCQ Question Parser
 * Supports single-line options, multi-line options, PDF artifacts, embedded IDs & figures
 */
export function parseTextToStructuredQuestions(rawText: string): Partial<Question>[] {
  const text = cleanDocumentText(rawText);
  if (!text || !text.trim()) return [];

  // Detect if there is a bottom Answer Key section (BẢNG ĐÁP ÁN)
  const bottomAnswerHeaderRegex = /(?:\n\s*)(?:BẢNG ĐÁP ÁN|ĐÁP ÁN CHUẨN|ĐÁP ÁN CÁC CÂU HỎI|ANSWER KEY|ĐÁP ÁN THAM KHẢO)[\:\s\n]/i;
  const bottomHeaderMatch = text.match(bottomAnswerHeaderRegex);

  let mainBodyText = text;
  let bottomKeysText = '';

  if (bottomHeaderMatch && bottomHeaderMatch.index !== undefined) {
    mainBodyText = text.slice(0, bottomHeaderMatch.index);
    bottomKeysText = text.slice(bottomHeaderMatch.index);
  }

  const bottomKeys = parseAnswerKeysFromText(bottomKeysText);
  const questions: Partial<Question>[] = [];
  const header = /^\s*(?:Câu|Question|Q)\s*(\d+)\s*(?:[.):-]\s*)?(?:ID\s*:?\s*(\d+))?\b[^\n]*/gim;
  const markers = [...mainBodyText.matchAll(header)];
  let currentBlock = 1;

  for (let qIdx = 0; qIdx < markers.length; qIdx++) {
    const marker = markers[qIdx];
    const start = marker.index!;
    const end = qIdx + 1 < markers.length ? markers[qIdx + 1].index! : mainBodyText.length;
    const preamble = mainBodyText.slice(qIdx ? markers[qIdx - 1].index! : 0, start);
    const blockHeading = [...preamble.matchAll(/(?:^|\n)\s*BLOCK\s*(\d+)\s*(?:\n|$)/gi)].at(-1);
    if (blockHeading) currentBlock = Number(blockHeading[1]);
    const block = mainBodyText.slice(start, end).replace(/(?:^|\n)\s*BLOCK\s*\d+\s*$/gim, '').trim();
    const sourceNumber = Number(marker[1]);
    const sourceId = marker[2];

    // First use line-start labels. A second pass supports compact files with
    // "A. ... B. ..." on one line without mistaking prose for options.
    const lineOption = /^[ \t]*([A-J])[.):/-][ \t]+/gim;
    let optionMarkers = [...block.matchAll(lineOption)];
    if (optionMarkers.length < 2) {
      optionMarkers = [...block.matchAll(/(?<!\S)([A-J])[.):/-][ \t]+/gim)];
    }
    const consecutive = optionMarkers.filter((m, i, list) =>
      i === 0 ? m[1].toUpperCase() === 'A' : m[1].toUpperCase().charCodeAt(0) === list[i - 1][1].toUpperCase().charCodeAt(0) + 1
    );
    const labels = consecutive.length >= 2 ? consecutive : [];
    const rawStem = labels.length ? block.slice(0, labels[0].index) : block;
    const questionStem = rawStem
      .replace(/^(?:Câu|Question|Q)\s*\d+\s*(?:[.):-]\s*)?(?:ID\s*:?\s*\d+)?\s*/i, '')
      .replace(/\s+/g, ' ').trim();
    const options = labels.map((label, i) => block
      .slice(label.index! + label[0].length, i + 1 < labels.length ? labels[i + 1].index! : block.length)
      .replace(/(?:^|\n)\s*(?:Đáp án|Key|Giải thích|Lời giải)\s*:?.*$/is, '')
      .replace(/\s+/g, ' ').trim()
    );
    // Never invent options or a correct answer when extraction is incomplete.
    if (!questionStem) continue;

    const answerRegex = /(?:Đáp án|Key|Correct Answer|Lựa chọn đúng|Đáp án đúng)[\:\s]*([A-J])/i;
    const inlineAnsMatch = block.match(answerRegex);
    let correctAnswer = -1;

    if (inlineAnsMatch) {
      const letter = inlineAnsMatch[1].toUpperCase();
      correctAnswer = letter.charCodeAt(0) - 65;
    } else if (sourceId && bottomKeys.byId.has(sourceId)) {
      correctAnswer = bottomKeys.byId.get(sourceId)!.correctIndex;
    } else if (bottomKeys.byIndex.has(sourceNumber)) {
      correctAnswer = bottomKeys.byIndex.get(sourceNumber)!.correctIndex;
    }

    const explanationRegex = /(?:Giải thích|Lời giải|Explanation)[\:\s]*(.*)/is;
    const explMatch = block.match(explanationRegex);
    const explanation = explMatch ? explMatch[1].trim() : '';

    if (correctAnswer < 0 || correctAnswer >= options.length) {
      correctAnswer = -1;
    }
    questions.push({ question: questionStem, options, correctAnswer, explanation,
      sourceId, sourceBlock: currentBlock, sourceNumber, difficulty: 'medium' });
  }

  return questions;
}

/**
 * Merges ONE OR MULTIPLE Answer Key files onto an existing list of parsed questions
 */
export function applyAnswerKeysToQuestions(
  questions: Partial<Question>[],
  answerKeyTexts: (string | AnswerKeyDocument)[] | string
): { updatedQuestions: Partial<Question>[]; matchedCount: number; verifiedCount: number; reviewMatches: KeyMatchIssue[]; unresolved: KeyMatchIssue[] } {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { updatedQuestions: [], matchedCount: 0, verifiedCount: 0, reviewMatches: [], unresolved: [] };
  }

  const sources = Array.isArray(answerKeyTexts)
    ? answerKeyTexts
    : typeof answerKeyTexts === 'string'
    ? [answerKeyTexts]
    : [];

  const keys = sources.filter(s => typeof s === 'string' ? !!s.trim() : !!s?.text?.trim())
    .map(s => ({...parseAnswerKeysFromText(typeof s==='string' ? s : s.text),
      richSections:typeof s==='string' ? [] : s.richSections || []}));
  const distinctQuestionBlocks = new Set(questions.map(q => q.sourceBlock).filter(x => x !== undefined));
  const singleBlockBank = distinctQuestionBlocks.size <= 1;
  let matchedCount = 0;
  let verifiedCount = 0;
  const reviewMatches: KeyMatchIssue[] = [];
  const unresolved: KeyMatchIssue[] = [];

  const distance = (a: string, b: string): number => {
    const row = Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) {
      let prev=row[0]; row[0]=i;
      for(let j=1;j<=b.length;j++) {
        const old=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=old;
      }
    }
    return row[b.length];
  };
  const resolvedIndex = (entry: ParsedKeyEntry, options: string[]): number => {
    if (entry.method === 'explicit' || entry.method === 'grid') return entry.correctIndex >= 0 && entry.correctIndex < options.length ? entry.correctIndex : -1;
    const excluded = new Set(entry.incorrectLetters || []);
    if (excluded.size < 2) return -1;
    const remaining = options.map((_,i)=>String.fromCharCode(65+i)).filter(l=>!excluded.has(l));
    return remaining.length === 1 ? remaining[0].charCodeAt(0)-65 : -1;
  };

  const updatedQuestions = questions.map((q, idx) => {
    if (!q || typeof q !== 'object') return {};
    const opts = Array.isArray(q.options) ? q.options : [];
    const qStem = typeof q.question === 'string' ? q.question : '';
    const idMatch = qStem.match(/(?:ID[\:\s]*|Câu\s*\d+\s*ID[\:\s]*)(\d+)/i);
    const qIdTag = q.sourceId || (idMatch ? idMatch[1] : undefined);
    const number = q.sourceNumber || idx+1;
    const sameBlock = (e: ParsedKeyEntry) => q.sourceBlock === undefined || e.sourceBlock === undefined || e.sourceBlock === q.sourceBlock;
    let candidates = qIdTag ? keys.flatMap(k=>k.entries.filter(e=>e.idTag===qIdTag && sameBlock(e))) : [];
    let fuzzy = false;

    if (!candidates.length) {
      if (qIdTag) {
        // A near ID may be a transcription error, but only the SAME numbered
        // question in the SAME declared block is eligible. Flag it for review.
        candidates = keys.flatMap(k=>k.entries.filter(e=>e.idTag && e.questionNum===number &&
          q.sourceBlock!==undefined && e.sourceBlock===q.sourceBlock &&
          distance(qIdTag,e.idTag!)<=2));
        fuzzy = candidates.length>0;
        if (!candidates.length && q.sourceBlock !== undefined) {
          candidates = keys.flatMap(k=>k.entries.filter(e=>!e.idTag && e.questionNum===number && e.sourceBlock===q.sourceBlock));
          fuzzy = candidates.length>0;
        }
      } else {
        candidates = keys.flatMap(k=>k.entries.filter(e=>e.questionNum===number &&
          (q.sourceBlock !== undefined && e.sourceBlock === q.sourceBlock ||
           singleBlockBank && (e.sourceBlock === undefined || q.sourceBlock === undefined))));
      }
    }

    const answers = candidates.map(e=>({entry:e,index:resolvedIndex(e,opts)})).filter(x=>x.index>=0);
    const unique = new Set(answers.map(x=>x.index));
    if (unique.size !== 1) {
      const reason = unique.size>1 ? 'Các file đáp án mâu thuẫn' : candidates.length ? 'Lời giải không đủ chứng cứ xác định duy nhất một phương án' : 'Không có đáp án cùng ID và block';
      unresolved.push({questionNumber:number,sourceBlock:q.sourceBlock,questionId:qIdTag,answerId:candidates[0]?.idTag,reason});
      return q;
    }

    const chosen = answers[0];
    const rich = keys.flatMap(k=>k.richSections).filter(s=>
      (s.sourceBlock===undefined || q.sourceBlock===undefined || s.sourceBlock===q.sourceBlock) &&
      (qIdTag && s.sourceId===qIdTag || s.sourceNumber===number && s.sourceBlock!==undefined && s.sourceBlock===q.sourceBlock));
    const preferred = rich.find(s=>!!s.html) || rich[0];
    matchedCount++;
    if (fuzzy) reviewMatches.push({questionNumber:number,sourceBlock:q.sourceBlock,
      questionId:qIdTag,answerId:chosen.entry.idTag,reason:chosen.entry.idTag ? 'ID trong file đáp án khác ID trong đề; ghép theo block và số câu' : 'File đáp án không có ID; ghép theo block và số câu'});
    else verifiedCount++;
    return {...q,correctAnswer:chosen.index,explanation:q.explanation || chosen.entry.explanation || '',
      explanationHtml:preferred?.html || q.explanationHtml,
      explanationPages:preferred?.html ? undefined : preferred?.pages || q.explanationPages};
  });

  return { updatedQuestions, matchedCount, verifiedCount, reviewMatches, unresolved };
}

export async function parseUploadedFile(file: File | { name: string; buffer: ArrayBuffer }): Promise<ParsedFileResult> {
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase();

  // 1. PDF File Processing
  if (ext === 'pdf') {
    const arrayBuffer = 'arrayBuffer' in file ? await file.arrayBuffer() : file.buffer;
    const pdfData = await parsePdfBuffer(arrayBuffer);

    const allPdfImages = (pdfData.pages || []).flatMap((p) => p.images || []).filter(Boolean);
    const parsedQuestions = parseTextToStructuredQuestions(pdfData.fullText);
    const byId = new Map(parsedQuestions.filter(q => q.sourceId).map(q => [q.sourceId, q]));
    for (const page of pdfData.pages) for (const placement of page.imagePlacements) {
      const question = byId.get(placement.sourceId);
      if (question) {
        question.images = [...(question.images || []), placement.dataUrl];
        question.imageUrl = question.images[0];
      }
    }

    return {
      fileName,
      extractedText: pdfData.fullText,
      rawQuestions: parsedQuestions,
      detectedImages: allPdfImages,
      format: 'pdf',
      pageCount: pdfData.numPages,
    };
  }

  // 2. DOCX File Processing
  if (ext === 'docx') {
    const arrayBuffer = 'arrayBuffer' in file ? await file.arrayBuffer() : file.buffer;
    const detectedImages: string[] = [];

    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement((image) => {
          return image.read('base64').then((imageBuffer) => {
            const src = `data:${image.contentType};base64,${imageBuffer}`;
            detectedImages.push(src);
            return { src };
          });
        }),
      }
    );

    let imageIndex = 0;
    const rawText = result.value
      .replace(/<img\b[^>]*>/gi, () => `\n[[MCQ_IMAGE_${imageIndex++}]]\n`)
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const parsedQuestions = parseTextToStructuredQuestions(rawText);
    for (const q of parsedQuestions) {
      const combined = [q.question || '', ...(q.options || [])].join(' ');
      const indices = [...combined.matchAll(/\[\[MCQ_IMAGE_(\d+)\]\]/g)].map(m => Number(m[1]));
      q.images = indices.map(i => detectedImages[i]).filter(Boolean);
      q.imageUrl = q.images[0];
      q.question = q.question?.replace(/\[\[MCQ_IMAGE_\d+\]\]/g, '').trim();
      q.options = q.options?.map(o => o.replace(/\[\[MCQ_IMAGE_\d+\]\]/g, '').trim());
    }

    return {
      fileName,
      extractedText: rawText || result.value,
      rawQuestions: parsedQuestions,
      detectedImages,
      format: 'docx',
    };
  }

  // 3. Excel Processing (XLSX, XLS, CSV)
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const arrayBuffer = 'arrayBuffer' in file ? await file.arrayBuffer() : file.buffer;
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const rawQuestions: Partial<Question>[] = [];
    let textDump = '';

    jsonRows.forEach((row, idx) => {
      const qText =
        row['Câu hỏi'] ||
        row['Question'] ||
        row['Cau Hoi'] ||
        row['cau_hoi'] ||
        row['question'] ||
        row['Stem'] ||
        row['Nội dung'] ||
        Object.values(row)[0];

      const optA = row['A'] || row['Đáp án A'] || row['Option A'] || row['Lựa chọn A'] || Object.values(row)[1];
      const optB = row['B'] || row['Đáp án B'] || row['Option B'] || row['Lựa chọn B'] || Object.values(row)[2];
      const optC = row['C'] || row['Đáp án C'] || row['Option C'] || row['Lựa chọn C'] || Object.values(row)[3];
      const optD = row['D'] || row['Đáp án D'] || row['Option D'] || row['Lựa chọn D'] || Object.values(row)[4];

      const rawAns =
        row['Đáp án đúng'] ||
        row['Correct Answer'] ||
        row['Đáp án'] ||
        row['Answer'] ||
        row['Dap an'] ||
        Object.values(row)[5];

      const expl = row['Giải thích'] || row['Explanation'] || row['Lý do'] || '';

      if (qText && String(qText).trim()) {
        const options = [optA, optB, optC, optD].map((o) => String(o || '').trim()).filter(Boolean);

        let correctAnswer = -1;
        if (typeof rawAns === 'number') {
          // Spreadsheet answers are normally one-based (1=A); explicit 0 also means A.
          correctAnswer = rawAns === 0 ? 0 : Number.isInteger(rawAns) && rawAns >= 1 && rawAns <= options.length ? rawAns - 1 : -1;
        } else if (typeof rawAns === 'string') {
          const cleanAns = rawAns.trim().toUpperCase();
          if (cleanAns === 'B' || cleanAns === '2') correctAnswer = 1;
          else if (cleanAns === 'C' || cleanAns === '3') correctAnswer = 2;
          else if (cleanAns === 'D' || cleanAns === '4') correctAnswer = 3;
          else if (cleanAns === 'A' || cleanAns === '1') correctAnswer = 0;
        }

        rawQuestions.push({
          question: String(qText).trim(),
          options: options.length >= 2 ? options : ['Đúng', 'Sai', 'Cả 2 đều đúng', 'Cả 2 đều sai'],
          correctAnswer,
          explanation: String(expl || '').trim(),
        });

        textDump += `Câu ${idx + 1}: ${qText}\nA. ${optA}\nB. ${optB}\nC. ${optC}\nD. ${optD}\nĐáp án: ${rawAns}\n\n`;
      }
    });

    return {
      fileName,
      extractedText: textDump || JSON.stringify(jsonRows),
      rawQuestions,
      detectedImages: [],
      format: 'xlsx',
    };
  }

  // 4. JSON File Processing
  if (ext === 'json') {
    const text = 'text' in file ? await file.text() : new TextDecoder().decode(file.buffer);
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.questions || [parsed];
      return {
        fileName,
        extractedText: text,
        rawQuestions: items,
        detectedImages: [],
        format: 'json',
      };
    } catch {
      // Fallback
    }
  }

  // 5. Plain Text
  const textContent = 'text' in file ? await file.text() : new TextDecoder().decode(file.buffer);
  const parsedQuestions = parseTextToStructuredQuestions(textContent);

  return {
    fileName,
    extractedText: textContent,
    rawQuestions: parsedQuestions,
    detectedImages: [],
    format: 'txt',
  };
}

/** Read answer text without extracting hundreds of irrelevant figures from a solution PDF/DOCX. */
export async function extractAnswerKeyText(file: File | {name:string;buffer:ArrayBuffer}): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = 'arrayBuffer' in file ? await file.arrayBuffer() : file.buffer;
  if (ext === 'pdf') {
    const result = await parsePdfBuffer(buffer,{extractImages:false});
    if (!result.pages.some(page=>page.text.trim())) throw new Error('PDF đáp án không có lớp văn bản; cần OCR trước khi ghép.');
    return result.fullText;
  }
  if (ext === 'docx') {
    const source = typeof window === 'undefined' ? {buffer:Buffer.from(buffer)} : {arrayBuffer:buffer};
    const result = await mammoth.extractRawText(source);
    if (!result.value.trim()) throw new Error('Word đáp án không có văn bản.');
    return result.value;
  }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const workbook = XLSX.read(buffer,{type:'array'});
    return workbook.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[name],{header:1,defval:''});
      const lines = rows.map(row => {
        const cells = row.map(v=>String(v).trim()).filter(Boolean);
        if (cells.length >= 2 && /^\d+$/.test(cells[0])) {
          const letter = [...cells].reverse().find((c:string)=>/^[A-J]$/i.test(c));
          const id = cells.slice(1,-1).find(c=>/^\d{4,}$/.test(c));
          if (letter) return `${cells[0]}${id ? ` ID ${id}` : ''} -> ${letter}`;
        }
        return cells.join(' ');
      });
      return `BLOCK ${name.match(/(?:BLOCK|KHỐI)\s*(\d+)/i)?.[1] || name}\n${lines.join('\n')}`;
    }).join('\n');
  }
  return 'text' in file ? file.text() : new TextDecoder().decode(buffer);
}

/** Import the answer prose together with Word figures/tables or PDF page excerpts. */
export async function extractAnswerKeyDocument(file: File | {name:string;buffer:ArrayBuffer}): Promise<AnswerKeyDocument> {
  const ext=file.name.split('.').pop()?.toLowerCase();
  const buffer='arrayBuffer' in file ? await file.arrayBuffer() : file.buffer;
  if (ext==='docx') {
    const source=typeof window==='undefined' ? {buffer:Buffer.from(buffer)} : {arrayBuffer:buffer};
    const [raw,formatted]=await Promise.all([mammoth.extractRawText(source),mammoth.convertToHtml(source)]);
    if (!raw.value.trim()) throw new Error('Word đáp án không có văn bản.');
    return {text:raw.value,richSections:splitAnswerHtml(formatted.value)};
  }
  if (ext==='pdf') {
    const result=await parsePdfBuffer(buffer,{extractImages:false,extractAnswerPages:true});
    if (!result.pages.some(page=>page.text.trim())) throw new Error('PDF đáp án không có lớp văn bản; cần OCR trước khi ghép.');
    const sections=new Map<string,RichAnswerSection>();
    const block=Number(result.fullText.match(/(?:ANS\s*)?BLOCK\s*(\d+)\b/i)?.[1]) || undefined;
    for (const page of result.pages) for (const excerpt of page.answerExcerpts || []) {
      const key=`${excerpt.sourceNumber}:${excerpt.sourceId || ''}`;
      if (!sections.has(key)) sections.set(key,{sourceId:excerpt.sourceId,sourceNumber:excerpt.sourceNumber,sourceBlock:block,pages:[]});
      sections.get(key)!.pages!.push({pageNum:excerpt.pageNum,dataUrl:excerpt.dataUrl});
    }
    return {text:result.fullText,richSections:[...sections.values()]};
  }
  return {text:await extractAnswerKeyText(file),richSections:[]};
}
