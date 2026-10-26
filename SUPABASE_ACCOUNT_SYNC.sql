-- Chạy một lần trong SQL Editor của đúng Supabase project đang chạy app.
-- Chỉ khóa publishable/anon được đưa vào trình duyệt; service_role chỉ ở Vercel server.
create table if not exists public.mcq_sync_heads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision uuid not null,
  manifest jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.mcq_sync_heads enable row level security;
grant select, insert, update on public.mcq_sync_heads to authenticated;
drop policy if exists "Read own sync head" on public.mcq_sync_heads;
drop policy if exists "Insert own sync head" on public.mcq_sync_heads;
drop policy if exists "Update own sync head" on public.mcq_sync_heads;
create policy "Read own sync head" on public.mcq_sync_heads for select to authenticated using (user_id = (select auth.uid()));
create policy "Insert own sync head" on public.mcq_sync_heads for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own sync head" on public.mcq_sync_heads for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.mcq_commit_sync(p_expected uuid, p_revision uuid, p_manifest jsonb)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if (select auth.uid()) is null then raise exception 'Login required'; end if;
  if p_expected is null then
    insert into public.mcq_sync_heads(user_id, revision, manifest)
    values ((select auth.uid()), p_revision, p_manifest)
    on conflict (user_id) do nothing;
  else
    update public.mcq_sync_heads set revision = p_revision, manifest = p_manifest, updated_at = now()
    where user_id = (select auth.uid()) and revision = p_expected;
  end if;
  return found;
end;
$$;
revoke all on function public.mcq_commit_sync(uuid, uuid, jsonb) from public;
grant execute on function public.mcq_commit_sync(uuid, uuid, jsonb) to authenticated;

insert into storage.buckets (id, name, public) values ('mcq-private-sync', 'mcq-private-sync', false)
on conflict (id) do update set public = false;

drop policy if exists "Upload own sync chunks" on storage.objects;
drop policy if exists "Read own sync chunks" on storage.objects;
drop policy if exists "Delete own sync chunks" on storage.objects;
create policy "Upload own sync chunks" on storage.objects for insert to authenticated
with check (bucket_id = 'mcq-private-sync' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Read own sync chunks" on storage.objects for select to authenticated
using (bucket_id = 'mcq-private-sync' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own sync chunks" on storage.objects for delete to authenticated
using (bucket_id = 'mcq-private-sync' and (storage.foldername(name))[1] = (select auth.uid())::text);
