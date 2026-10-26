import React, { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, Cloud, CloudDownload, CloudUpload, LogOut } from 'lucide-react';
import { downloadSnapshot, getSyncHead, hasPersonalData, snapshotHash, syncClient, syncConfigured, uploadSnapshot, type CloudSnapshot, type SyncHead } from '../services/cloudSync';
import { getStorageItem, setStorageItem } from '../utils/storage';

interface SyncMeta { revision: string; hash: string }
interface Props {
  visible: boolean;
  syncChange: object;
  allowRestore: boolean;
  capture: () => Promise<CloudSnapshot>;
  onRestore: (snapshot: CloudSnapshot) => Promise<void>;
  onOpen: () => void;
  onBack: () => void;
}
const button = 'min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-50';

export const CloudSyncPanel: React.FC<Props> = ({ visible, syncChange, allowRestore, capture, onRestore, onOpen, onBack }) => {
  const actions = useRef({ capture, onRestore });
  actions.current = { capture, onRestore };
  const localChange = useRef(syncChange);
  localChange.current = syncChange;
  const lastSyncedChange = useRef<object | null>(null);
  const lastSyncedFilters = useRef<string | null>(null);
  const canRestore = useRef(allowRestore);
  canRestore.current = allowRestore;
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [recovery, setRecovery] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'conflict'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [head, setHead] = useState<SyncHead | null>(null);
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const lock = useRef(false);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const metaRef = useRef<SyncMeta | null>(null);
  metaRef.current = meta;
  const stateRef = useRef(state);
  stateRef.current = state;
  const metaKey = (id: string) => `mcq_genius_cloud_sync_${id}`;
  const saveMeta = async (id: string, value: SyncMeta) => {
    await setStorageItem(metaKey(id), value);
    metaRef.current = value;
    setMeta(value);
  };
  const fail = (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    setMessage(detail === 'SYNC_CONFLICT' ? 'Hai thiết bị cùng sửa dữ liệu. Hãy chọn bản dữ liệu cần giữ.' : `Đồng bộ chưa xong: ${detail}`);
  };
  const pull = async (remote: SyncHead, id: string, expectedLocalHash: string) => {
    setMessage('Đang tải dữ liệu và ảnh về thiết bị...');
    const snapshot = await downloadSnapshot(remote, id);
    if (await snapshotHash(await actions.current.capture()) !== expectedLocalHash) {
      stateRef.current = 'conflict'; setState('conflict');
      setMessage('Dữ liệu trên máy đã thay đổi trong lúc tải. Hãy chọn bản cần giữ.');
      return;
    }
    if (!canRestore.current) {
      stateRef.current = 'ready'; setState('ready');
      setMessage('Đã tải bản mới; sẽ áp dụng khi bạn quay về trang chủ.');
      return;
    }
    await actions.current.onRestore(snapshot);
    await saveMeta(id, { revision: remote.revision, hash: await snapshotHash(snapshot) });
    lastSyncedChange.current = null;
    lastSyncedFilters.current = JSON.stringify(snapshot.mcq_genius_saved_review_filters);
    setHead(remote);
    stateRef.current = 'ready'; setState('ready');
    setMessage('Đã tải dữ liệu xuống thiết bị. Bạn có thể tiếp tục học khi offline.');
  };
  const push = async (snapshot: CloudSnapshot, previous: SyncHead | null, id: string) => {
    const capturedChange = localChange.current;
    setMessage('Đang nén và tải câu hỏi, ảnh, lịch sử lên đám mây...');
    const { head: published, hash } = await uploadSnapshot(snapshot, previous?.revision || null, previous);
    await saveMeta(id, { revision: published.revision, hash });
    lastSyncedChange.current = capturedChange;
    lastSyncedFilters.current = JSON.stringify(snapshot.mcq_genius_saved_review_filters);
    setHead(published);
    stateRef.current = 'ready'; setState('ready');
    setMessage('Đã lưu dữ liệu lên tài khoản.');
  };
  const reconcile = async (initial = false) => {
    const account = userRef.current;
    if (!account || lock.current || !navigator.onLine) {
      if (!navigator.onLine) setMessage('Đang offline; dữ liệu vẫn được lưu trên máy.');
      return;
    }
    lock.current = true; setBusy(true);
    try {
      const saved = initial ? await getStorageItem<SyncMeta | null>(metaKey(account.id), null) : metaRef.current;
      metaRef.current = saved; setMeta(saved);
      const remote = await getSyncHead();
      setHead(remote);
      if (!initial && saved && remote?.revision === saved.revision && localChange.current === lastSyncedChange.current) {
        const filters = await getStorageItem<unknown[]>('mcq_genius_saved_review_filters', []);
        if (JSON.stringify(filters) === lastSyncedFilters.current) {
          stateRef.current = 'ready'; setState('ready');
          return;
        }
      }
      const snapshot = await actions.current.capture();
      const hash = await snapshotHash(snapshot);
      if (!remote) {
        if (saved) { stateRef.current = 'conflict'; setState('conflict'); setMessage('Bản đám mây trước đây không còn. Hãy chọn cách xử lý.'); }
        else await push(snapshot, null, account.id);
      } else if (saved?.revision === remote.revision) {
        if (hash !== saved.hash) await push(snapshot, remote, account.id);
        else { stateRef.current = 'ready'; setState('ready'); if (initial) setMessage('Dữ liệu trên thiết bị đã đồng bộ.'); }
      } else if ((saved && hash === saved.hash) || (!saved && !hasPersonalData(snapshot))) {
        if (canRestore.current) await pull(remote, account.id, hash);
        else { stateRef.current = 'ready'; setState('ready'); setMessage('Có bản mới trên đám mây. Sẽ tải về khi bạn quay lại trang chủ.'); }
      } else {
        stateRef.current = 'conflict'; setState('conflict');
        setMessage('Máy này và tài khoản đều có dữ liệu. Chọn bản bạn muốn dùng; app chưa ghi đè bản nào.');
      }
    } catch (error) {
      fail(error);
      if (String(error).includes('SYNC_CONFLICT')) { stateRef.current = 'conflict'; setState('conflict'); }
      else { stateRef.current = 'ready'; setState('ready'); }
    } finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (!syncClient) { setState('ready'); return; }
    let active = true;
    void syncClient.auth.getSession().then(({ data }) => { if (active) setUser(data.session?.user || null); });
    const { data: { subscription } } = syncClient.auth.onAuthStateChange((event, session) => {
      if (active) { setUser(session?.user || null); if (event === 'PASSWORD_RECOVERY') setRecovery(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!user?.id) { setHead(null); setMeta(null); setState('loading'); return; }
    stateRef.current = 'loading'; setState('loading');
    void reconcile(true);
  }, [user?.id]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (stateRef.current === 'ready') void reconcile(); }, 60_000);
    const online = () => { if (stateRef.current === 'ready') void reconcile(); };
    window.addEventListener('online', online);
    return () => { window.clearInterval(interval); window.removeEventListener('online', online); };
  }, []);
  useEffect(() => {
    if (stateRef.current !== 'ready') return;
    const timer = window.setTimeout(() => { void reconcile(); }, 10_000);
    return () => window.clearTimeout(timer);
  }, [syncChange]);
  useEffect(() => { if (allowRestore && stateRef.current === 'ready') void reconcile(); }, [allowRestore]);
  const authorize = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!syncClient) return;
    setBusy(true); setMessage('');
    try {
      const result = mode === 'register'
        ? await syncClient.auth.signUp({ email: email.trim(), password })
        : await syncClient.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'register' && !result.data.session) setMessage('Đã gửi email xác nhận. Mở email rồi đăng nhập tại đây.');
      else setMessage('Đăng nhập thành công. Đang kiểm tra dữ liệu trên đám mây...');
      setPassword('');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  };
  const recoverPassword = async () => {
    if (!syncClient || !email.trim()) { setMessage('Nhập email tài khoản trước khi yêu cầu đặt lại mật khẩu.'); return; }
    setBusy(true);
    const { error } = await syncClient.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) fail(error); else setMessage('Đã gửi email đặt lại mật khẩu. Mở liên kết trong email trên thiết bị này.');
    setBusy(false);
  };
  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!syncClient) return;
    setBusy(true);
    const { error } = await syncClient.auth.updateUser({ password });
    if (error) fail(error); else { setPassword(''); setRecovery(false); setMessage('Đã đổi mật khẩu.'); }
    setBusy(false);
  };
  const resolve = async (decision: 'local' | 'cloud') => {
    if (!user || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const remote = await getSyncHead();
      setHead(remote);
      if (decision === 'cloud') {
        if (!remote) throw new Error('Tài khoản chưa có bản đám mây. Hãy chọn lưu dữ liệu máy này.');
        await pull(remote, user.id, await snapshotHash(await actions.current.capture()));
      } else {
        await push(await actions.current.capture(), remote, user.id);
      }
    } catch (error) { fail(error); }
    finally { lock.current = false; setBusy(false); }
  };

  if (!visible) return state === 'conflict' ? <button type="button" onClick={onOpen} className="w-full rounded-xl border border-amber-400 bg-amber-50 p-3 text-left text-sm font-semibold text-amber-900">Đồng bộ cần bạn chọn dữ liệu trên máy hoặc trên đám mây. Mở Đồng bộ dữ liệu →</button> : null;
  return <section className="mx-auto max-w-3xl space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <div><button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm text-indigo-600"><ArrowLeft size={17} /> Trang chủ</button><h1 className="flex items-center gap-2 text-2xl font-bold"><Cloud /> Đồng bộ dữ liệu</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Dùng cùng một tài khoản trên máy tính và điện thoại. App vẫn lưu bản offline trên từng thiết bị.</p></div>
    {!syncConfigured && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY trên Vercel.</p>}
    {syncConfigured && !user && <form onSubmit={authorize} className="space-y-3"><div className="flex gap-2"><button type="button" onClick={() => setMode('login')} aria-pressed={mode === 'login'} className={`${button} ${mode === 'login' ? 'bg-indigo-600 text-white' : 'border'}`}>Đăng nhập</button><button type="button" onClick={() => setMode('register')} aria-pressed={mode === 'register'} className={`${button} ${mode === 'register' ? 'bg-indigo-600 text-white' : 'border'}`}>Tạo tài khoản</button></div><label className="block text-sm font-semibold">Email<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-900" /></label><label className="block text-sm font-semibold">Mật khẩu<input type="password" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-900" /></label><button disabled={busy} className={`${button} bg-indigo-600 text-white`}>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>{mode === 'login' && <button type="button" disabled={busy} onClick={() => void recoverPassword()} className="block min-h-11 text-sm text-indigo-600 underline">Quên mật khẩu?</button>}</form>}
    {user && recovery && <form onSubmit={updatePassword} className="space-y-2 rounded-xl border border-indigo-300 p-4"><label className="block text-sm font-semibold">Mật khẩu mới<input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-900" /></label><button disabled={busy} className={`${button} bg-indigo-600 text-white`}>Lưu mật khẩu mới</button></form>}
    {user && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Tài khoản: <strong>{user.email}</strong></p><button type="button" disabled={busy} onClick={() => void syncClient?.auth.signOut()} className={`${button} inline-flex items-center gap-2 border`}><LogOut size={16} /> Đăng xuất</button></div><div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-900">{busy || state === 'loading' ? 'Đang kiểm tra dữ liệu...' : state === 'conflict' ? 'Cần chọn bản dữ liệu' : 'Đã kết nối'}{head && <span className="ml-2 text-xs text-slate-500">Bản đám mây: {new Date(head.updated_at).toLocaleString('vi-VN')}</span>}</div>{state === 'conflict' ? <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30"><p className="text-sm font-semibold">Hai nơi có dữ liệu khác nhau. Chọn một bản để thay thế bản còn lại.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void resolve('local')} className={`${button} inline-flex items-center gap-2 bg-indigo-600 text-white`}><CloudUpload size={17} /> Giữ bản máy này, tải lên</button><button type="button" disabled={busy || !head} onClick={() => void resolve('cloud')} className={`${button} inline-flex items-center gap-2 border border-amber-500 text-amber-900 dark:text-amber-200`}><CloudDownload size={17} /> Thay bản máy này bằng đám mây</button></div></div> : <button type="button" disabled={busy || state !== 'ready'} onClick={() => void reconcile()} className={`${button} bg-indigo-600 text-white`}>Đồng bộ ngay</button>}<p className="text-xs text-slate-500">Khi có mạng, app tự đồng bộ sau khi bạn thay đổi dữ liệu và kiểm tra thêm mỗi phút. Đăng xuất không xóa dữ liệu offline trên thiết bị này.</p></div>}
    {message && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">{message}</p>}
  </section>;
};
