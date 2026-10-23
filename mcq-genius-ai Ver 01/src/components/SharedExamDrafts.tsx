import React, { useState } from 'react';
import { Clock, Eye, FilePlus2, Trash2 } from 'lucide-react';
import type { SharedExamDraft } from '../types/quiz';

interface Props {
  drafts: SharedExamDraft[];
  onCreate: () => void;
  onPreview: (draft: SharedExamDraft) => void;
  onDelete: (id: string) => void;
}

export const SharedExamDrafts: React.FC<Props> = ({ drafts, onCreate, onPreview, onDelete }) => {
  const [pendingDelete, setPendingDelete] = useState<SharedExamDraft | null>(null);

  return (
    <section className="mx-auto max-w-5xl space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Bài thi chuẩn bị chia sẻ</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Mỗi bản nháp giữ nguyên câu hỏi, thứ tự đáp án và thời gian từ lúc tạo.
          </p>
        </div>
        <button type="button" onClick={onCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-500">
          <FilePlus2 className="h-4 w-4" /> Tạo đề mới
        </button>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
        Đây là bản nháp lưu trên thiết bị của bạn. Chưa có link để gửi cho người khác. Phần tạo link và chấm điểm an toàn sẽ được kết nối sau khi có máy chủ lưu đề.
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Chưa có bản nháp. Vào Tạo đề MCQ, đặt tên và chọn “Lưu bản đề để chuẩn bị chia sẻ”.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {drafts.map(draft => (
            <article key={draft.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Bản nháp · Chưa có link</span>
              <h2 className="mt-3 break-words text-lg font-bold text-slate-900 dark:text-white">{draft.config.title}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span>{draft.questions.length} câu</span><span>·</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{draft.config.timeLimitMinutes > 0 ? `${draft.config.timeLimitMinutes} phút` : 'Không giới hạn thời gian'}</span>
                <span>·</span><span>{new Date(draft.createdAt).toLocaleDateString('vi-VN')}</span>
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => onPreview(draft)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-500">
                  <Eye className="h-4 w-4" /> Xem thử trang thi
                </button>
                <button type="button" onClick={() => setPendingDelete(draft)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300 px-4 text-xs font-bold text-red-700 dark:border-red-700 dark:text-red-300">
                  <Trash2 className="h-4 w-4" /> Xóa bản nháp
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPendingDelete(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-draft-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <h2 id="delete-draft-title" className="text-lg font-bold">Xóa bản nháp này?</h2>
            <p className="mt-2 break-words text-sm text-slate-600 dark:text-slate-300">{pendingDelete.config.title}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} className="min-h-11 rounded-xl px-4 text-sm font-semibold">Hủy</button>
              <button type="button" onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null); }} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white">Xác nhận xóa</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
