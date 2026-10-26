import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3, Send } from 'lucide-react';
import { getPublicExam, resumePublicExam, startPublicExam, submitPublicExam, type PublicExam, type PublicSummary } from '../services/share';
import { OptionContent } from './OptionContent';

export default function PublicExamPage({ examId }: { examId: string }) {
  const [exam, setExam] = useState<PublicExam | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const answersRef = useRef<Record<string, number | null>>({});
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const sessionKey = `mcq-public-exam-${examId}`;

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const next = await getPublicExam(examId);
        if (!active) return;
        setExam(next);
        const raw = sessionStorage.getItem(sessionKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (typeof saved?.attemptId === 'string') {
            const current = await resumePublicExam(examId, saved.attemptId);
            if (!active) return;
            setAttemptId(saved.attemptId);
            setDeadlineAt(current.deadlineAt);
            if (current.summary) setSummary({ ...current.summary, total: next.questions.length });
            else if (saved.answers && typeof saved.answers === 'object') {
              answersRef.current = saved.answers;
              setAnswers(saved.answers);
            }
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải bài thi.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [examId, sessionKey]);

  const start = async () => {
    setBusy(true); setError('');
    try {
      const result = await startPublicExam(examId);
      setAttemptId(result.attemptId);
      setDeadlineAt(result.deadlineAt);
      setIndex(0);
      setSummary(null);
      answersRef.current = {};
      setAnswers({});
      sessionStorage.setItem(sessionKey, JSON.stringify({ attemptId: result.attemptId, answers: {} }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể bắt đầu bài thi.'); }
    finally { setBusy(false); }
  };

  const submit = useCallback(async () => {
    if (!attemptId || submitting.current || summary) return;
    submitting.current = true;
    setBusy(true); setError('');
    try {
      const result = await submitPublicExam(examId, attemptId, answersRef.current);
      setSummary(result);
      sessionStorage.setItem(sessionKey, JSON.stringify({ attemptId, answers: {} }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể nộp bài. Vui lòng thử lại.');
    } finally { submitting.current = false; setBusy(false); }
  }, [attemptId, examId, sessionKey, summary]);

  useEffect(() => {
    if (!deadlineAt || summary) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !submitting.current) void submit();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt, submit, summary]);

  const choose = (id: string, choice: number) => {
    if (busy || summary || secondsLeft <= 0 || !attemptId) return;
    const next = { ...answersRef.current, [id]: choice };
    answersRef.current = next;
    setAnswers(next);
    sessionStorage.setItem(sessionKey, JSON.stringify({ attemptId, answers: next }));
  };

  const question = exam?.questions[index];
  const answered = exam ? exam.questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== null).length : 0;
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-28 sm:pb-12">
      <header className="bg-slate-950 px-4 py-5 text-white">
        <div className="mx-auto max-w-4xl">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">Bài thi MCQ</span>
          <h1 className="mt-1 text-xl font-extrabold break-words">{exam?.title || 'Đang tải bài thi...'}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">{error}</div>}
        {loading && <div role="status" className="rounded-2xl bg-white p-8 text-center">Đang mở đề thi...</div>}
        {!loading && exam && !attemptId && (
          <section className="rounded-3xl bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-bold">Sẵn sàng làm bài?</h2>
            <p>{exam.questions.length} câu hỏi · {exam.timeLimitMinutes} phút. Thời gian bắt đầu khi bạn bấm nút bên dưới.</p>
            <button type="button" disabled={busy} onClick={() => void start()} className="min-h-12 rounded-xl bg-indigo-600 px-6 font-bold text-white disabled:opacity-60">{busy ? 'Đang bắt đầu...' : 'Bắt đầu bài thi'}</button>
          </section>
        )}
        {exam && attemptId && summary && (
          <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-extrabold">Kết quả bài thi</h2>
            <p className="mt-2 text-slate-600">Tổng cộng {summary.total} câu · Điểm {Math.round(summary.correct / Math.max(1, summary.total) * 100)}%</p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm">Đúng</p><b className="text-3xl text-emerald-700">{summary.correct}</b></div>
              <div className="rounded-2xl bg-red-50 p-4"><p className="text-sm">Sai</p><b className="text-3xl text-red-700">{summary.incorrect}</b></div>
              <div className="rounded-2xl bg-amber-50 p-4"><p className="text-sm">Bỏ trống</p><b className="text-3xl text-amber-700">{summary.skipped}</b></div>
            </div>
            <p className="mt-5 text-sm text-slate-500">Bài thi này chỉ hiển thị điểm và số câu đúng/sai, không hiển thị đáp án.</p>
          </section>
        )}
        {exam && attemptId && !summary && question && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-5 py-3 text-sm font-semibold shadow-sm">
              <span>Đã trả lời {answered}/{exam.questions.length}</span>
              <span className="inline-flex items-center gap-2 text-indigo-700"><Clock3 size={18} /> {Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:{(secondsLeft % 60).toString().padStart(2, '0')}</span>
            </div>
            <article className="rounded-3xl bg-white p-5 shadow-sm sm:p-8">
              <p className="text-sm font-bold text-indigo-700">Câu {index + 1}/{exam.questions.length} · {question.categoryName || 'MCQ'}</p>
              <h2 className="mt-3 whitespace-pre-wrap text-lg font-bold leading-relaxed">{question.question}</h2>
              {question.images.map((src, i) => <img key={i} src={src} alt={`Hình câu ${index + 1}, ảnh ${i + 1}`} className="mt-4 max-h-[55vh] max-w-full rounded-xl border border-slate-200 object-contain" />)}
              <div className="mt-5 grid gap-3">
                {question.options.map((option, i) => (
                  <button key={i} type="button" disabled={busy || secondsLeft <= 0} onClick={() => choose(question.id, i)}
                    className={`min-h-12 rounded-xl border-2 px-4 py-3 text-left transition-colors ${answers[question.id] === i ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 hover:border-indigo-300'} disabled:opacity-60`}>
                    <strong className="mr-3">{String.fromCharCode(65 + i)}.</strong><OptionContent text={option} images={question.optionImages?.[i]} letter={String.fromCharCode(65 + i)} />
                  </button>
                ))}
              </div>
            </article>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {exam.questions.map((q, i) => <button key={q.id} type="button" onClick={() => setIndex(i)} className={`min-h-11 rounded-lg text-sm font-bold ${i === index ? 'bg-indigo-600 text-white' : answers[q.id] !== undefined ? 'bg-indigo-100 text-indigo-800' : 'bg-white text-slate-700'}`} aria-label={`Tới câu ${i + 1}`}>{i + 1}</button>)}
            </div>
            <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3 shadow-2xl sm:static sm:rounded-2xl sm:border sm:shadow-sm">
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
                <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold disabled:opacity-40"><ArrowLeft size={18} /> Trước</button>
                <button type="button" disabled={busy} onClick={() => setConfirmSubmit(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-emerald-600 px-4 font-bold text-white disabled:opacity-60"><Send size={16} /> {busy ? 'Đang nộp' : 'Nộp bài'}</button>
                <button type="button" onClick={() => setIndex(Math.min(exam.questions.length - 1, index + 1))} disabled={index === exam.questions.length - 1} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold disabled:opacity-40">Sau <ArrowRight size={18} /></button>
              </div>
            </nav>
          </>
        )}
      </main>
      {confirmSubmit && <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="public-submit-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <h2 id="public-submit-title" className="text-lg font-bold">Nộp bài và xem điểm?</h2>
          <p className="mt-2 text-sm text-slate-600">Bạn đã trả lời {answered}/{exam?.questions.length || 0} câu.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmSubmit(false)} className="min-h-11 rounded-xl px-4 font-semibold">Tiếp tục làm</button>
            <button type="button" onClick={() => { setConfirmSubmit(false); void submit(); }} className="min-h-11 rounded-xl bg-emerald-600 px-4 font-bold text-white">Nộp bài</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
