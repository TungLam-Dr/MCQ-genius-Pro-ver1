import React, { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Image as ImageIcon, Lightbulb, Maximize2 } from 'lucide-react';
import { Question } from '../types/quiz';

interface Props {
  question: Question;
  onZoom: (image: string) => void;
}

const textClass = 'text-[15px] leading-[1.85] text-slate-700 dark:text-slate-200';
const allowed = new Set([
  'P', 'DIV', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'BR', 'IMG',
  'H2', 'H3', 'H4', 'SUP', 'SUB', 'SPAN'
]);

/** Render only known semantic Word tags. Uploaded HTML never reaches innerHTML. */
function safeNode(node: Node, key: number | string, onZoom: (src: string) => void): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  if (!allowed.has(el.tagName)) {
    return Array.from(el.childNodes).map((n, i) => safeNode(n, i, onZoom));
  }
  const children = Array.from(el.childNodes).map((n, i) => safeNode(n, i, onZoom));
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') {
    const src = el.getAttribute('src') || '';
    if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)) return null;
    return (
      <button
        type="button"
        key={key}
        onClick={() => onZoom(src)}
        className="group relative my-4 inline-block max-w-full cursor-zoom-in rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-950"
        title="Phóng to hình trong lời giải"
      >
        <img
          src={src}
          alt={el.getAttribute('alt') || 'Hình trong lời giải gốc'}
          loading="lazy"
          className="max-h-[560px] max-w-full rounded-xl object-contain"
        />
        <span className="absolute bottom-4 right-4 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 size={13} /> Phóng to
        </span>
      </button>
    );
  }
  const classes: Record<string, string> = {
    p: `mb-4 ${textClass}`,
    div: `mb-3 ${textClass}`,
    strong: 'font-bold text-slate-900 dark:text-white',
    b: 'font-bold text-slate-900 dark:text-white',
    em: 'italic',
    i: 'italic',
    u: 'underline',
    ul: 'mb-5 list-disc space-y-2 pl-6',
    ol: 'mb-5 list-decimal space-y-2 pl-6',
    li: textClass,
    table: 'w-full border-collapse text-left text-sm leading-6',
    th: 'border border-slate-200 bg-slate-100 px-3 py-2.5 align-top font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white',
    td: 'border border-slate-200 px-3 py-2.5 align-top text-slate-700 dark:border-slate-700 dark:text-slate-200',
    h2: 'mb-3 text-lg font-bold',
    h3: 'mb-3 text-base font-bold',
    h4: 'mb-2 font-bold',
  };
  if (tag === 'table') {
    return (
      <div key={key} className="mb-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className={classes.table}>
          <tbody>{children}</tbody>
        </table>
      </div>
    );
  }
  if (tag === 'tbody' || tag === 'thead') {
    return <React.Fragment key={key}>{children}</React.Fragment>;
  }
  return React.createElement(tag, { key, className: classes[tag] }, ...children);
}

export const AnswerExplanation: React.FC<Props> = ({ question, onZoom }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const parsed = useMemo(() => {
    if (!question.explanationHtml || typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(question.explanationHtml, 'text/html');
    const nodes = Array.from(doc.body.childNodes);
    const objectives = nodes.filter(
      (n) =>
        n.nodeType === Node.ELEMENT_NODE &&
        /^(?:Mục tiêu học tập|Ghi nhớ|Learning objective)\s*:/i.test(n.textContent?.trim() || '')
    );
    return { body: nodes.filter((n) => !objectives.includes(n)), objectives };
  }, [question.explanationHtml]);

  const hasPages = !!question.explanationPages?.length;
  const correct = question.correctAnswer >= 0 && question.correctAnswer < question.options.length;
  const option = correct ? String.fromCharCode(65 + question.correctAnswer) : null;
  const plain = (question.explanation || '')
    .replace(/^\s*(?:Câu|Question|Q)\s*\d+\s*(?:[.):-]\s*)?(?:ID\s*:?\s*\d+)?\s*/i, '')
    .trim();
  const paragraphs = plain
    .replace(/\n(?!\s*(?:\((?:Các\s+)?Lựa\s+chọn|Mục tiêu học tập|Ghi nhớ|\n))/gi, ' ')
    .split(/\n\s*\n|\n(?=\s*(?:\((?:Các\s+)?Lựa\s+chọn|Mục tiêu học tập|Ghi nhớ))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <section className="overflow-hidden rounded-[24px] border border-teal-200 bg-white shadow-[0_12px_30px_-20px_rgba(15,118,110,.35)] dark:border-teal-900 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-100 bg-gradient-to-r from-teal-50 to-sky-50 px-5 py-4 dark:border-teal-900 dark:from-teal-950/50 dark:to-slate-900">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-teal-600 p-2 text-white">
            <BookOpen size={19} />
          </span>
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">Học lại câu này</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">Lời giải và tư liệu từ file đáp án</p>
          </div>
        </div>
        {option && (
          <span className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-sm font-bold text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200">
            Đáp án đúng: {option}
          </span>
        )}
      </div>
      <div className="px-5 py-6 sm:px-7">
        {parsed ? (
          <>
            {parsed.objectives.length > 0 && (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
                  <Lightbulb size={17} /> Mục tiêu học tập
                </div>
                {parsed.objectives.map((n, i) => safeNode(n, i, onZoom))}
              </div>
            )}
            <div className="answer-rich max-w-none">{parsed.body.map((n, i) => safeNode(n, i, onZoom))}</div>
          </>
        ) : (
          <div className="space-y-4">
            {paragraphs.map((p, i) => {
              const objective = /^(?:Mục tiêu học tập|Ghi nhớ)\s*:/i.test(p);
              const choice = /^\((?:Các\s+)?Lựa\s+chọn\s+[A-J]/i.test(p);
              return (
                <div
                  key={i}
                  className={
                    objective
                      ? 'rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30'
                      : choice
                      ? 'rounded-xl border-l-4 border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/60'
                      : ''
                  }
                >
                  {objective && (
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-200">
                      <Lightbulb size={16} /> Mục tiêu học tập
                    </div>
                  )}
                  <p className={`${textClass} whitespace-pre-line`}>{p}</p>
                </div>
              );
            })}
          </div>
        )}
        {hasPages && (
          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <span className="flex items-center gap-2">
                <ImageIcon size={17} /> Xem trang gốc: bảng, hình và chú thích ({question.explanationPages!.length} trang)
              </span>
              {showOriginal ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>
            {showOriginal && (
              <div className="mt-4 space-y-5">
                {question.explanationPages!.map((page, i) => (
                  <figure
                    key={i}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <button type="button" onClick={() => onZoom(page.dataUrl)} className="w-full cursor-zoom-in">
                      <img
                        loading="lazy"
                        src={page.dataUrl}
                        alt={`Lời giải gốc, trang ${page.pageNum}`}
                        className="mx-auto w-full max-w-3xl rounded-lg"
                      />
                    </button>
                    <figcaption className="mt-2 text-center text-xs text-slate-500">
                      Trang {page.pageNum} · Nhấn ảnh để phóng to
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
