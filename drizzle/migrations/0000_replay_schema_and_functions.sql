create type public.app_role as enum ('admin', 'viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- First account ever created becomes admin; later accounts get no access until an admin grants it.
create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_role after insert on auth.users
  for each row execute function public.handle_new_user_role();

create table public.websites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site_key text not null unique default encode(gen_random_bytes(12), 'hex'),
  allowed_origins text[] not null default '{}',
  permitted_paths text[] not null default '{"/*"}',
  retention_days int not null default 30,
  created_at timestamptz not null default now()
);
create table public.website_access (
  user_id uuid not null,
  website_id uuid not null references public.websites(id) on delete cascade,
  primary key (user_id, website_id)
);
create table public.sessions (
  id uuid primary key,
  website_id uuid not null references public.websites(id) on delete cascade,
  user_agent text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table public.page_visits (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  website_id uuid not null references public.websites(id) on delete cascade,
  module_name text not null,
  url text not null,
  path text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  event_count int not null default 0
);
create index on public.page_visits (website_id, started_at desc);
create index on public.page_visits (session_id);
create table public.event_batches (
  id bigserial primary key,
  visit_id uuid not null references public.page_visits(id) on delete cascade,
  seq int not null,
  events jsonb not null,
  created_at timestamptz not null default now(),
  unique (visit_id, seq)
);

grant select, insert, update, delete on public.websites, public.website_access to authenticated;
grant select on public.sessions, public.page_visits, public.event_batches to authenticated;
grant all on public.websites, public.website_access, public.sessions, public.page_visits, public.event_batches to service_role;
grant usage on sequence public.event_batches_id_seq to service_role;

alter table public.websites enable row level security;
alter table public.website_access enable row level security;
alter table public.sessions enable row level security;
alter table public.page_visits enable row level security;
alter table public.event_batches enable row level security;

create or replace function public.can_view_website(_user_id uuid, _website_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin')
    or (public.has_role(_user_id, 'viewer') and exists (
      select 1 from public.website_access where user_id = _user_id and website_id = _website_id))
$$;

create policy "View permitted websites" on public.websites for select to authenticated
  using (public.can_view_website(auth.uid(), id));
create policy "Admins manage websites" on public.websites for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage access" on public.website_access for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "View own access" on public.website_access for select to authenticated
  using (user_id = auth.uid());
create policy "View permitted sessions" on public.sessions for select to authenticated
  using (public.can_view_website(auth.uid(), website_id));
create policy "View permitted visits" on public.page_visits for select to authenticated
  using (public.can_view_website(auth.uid(), website_id));
create policy "View permitted events" on public.event_batches for select to authenticated
  using (exists (select 1 from public.page_visits v where v.id = visit_id
    and public.can_view_website(auth.uid(), v.website_id)));

insert into public.websites (name, site_key, allowed_origins, permitted_paths)
values ('Demo Shop (built-in test site)', 'demo-site-key', '{"*"}', '{"/demo*"}');

create or replace function public.ingest_batch(
  _website_id uuid, _session_id uuid, _user_agent text,
  _visit_id uuid, _module text, _url text, _path text, _started_at timestamptz,
  _seq int, _events jsonb, _ended boolean
) returns void language plpgsql security definer set search_path = public as $$
declare inserted int;
begin
  insert into public.sessions (id, website_id, user_agent) values (_session_id, _website_id, _user_agent)
    on conflict (id) do update set last_seen_at = now() where sessions.website_id = _website_id;
  if not exists (select 1 from public.sessions where id = _session_id and website_id = _website_id) then
    raise exception 'session belongs to another website';
  end if;
  insert into public.page_visits (id, session_id, website_id, module_name, url, path, started_at)
    values (_visit_id, _session_id, _website_id, _module, _url, _path, _started_at)
    on conflict (id) do nothing;
  if not exists (select 1 from public.page_visits where id = _visit_id and session_id = _session_id) then
    raise exception 'visit belongs to another session';
  end if;
  insert into public.event_batches (visit_id, seq, events) values (_visit_id, _seq, _events)
    on conflict (visit_id, seq) do nothing;
  get diagnostics inserted = row_count;
  update public.page_visits set
    event_count = event_count + case when inserted > 0 then jsonb_array_length(_events) else 0 end,
    ended_at = case when _ended then now() else ended_at end
  where id = _visit_id;
end $$;
revoke execute on function public.ingest_batch from public, anon, authenticated;
grant execute on function public.ingest_batch to service_role;

-- Deletes sessions (and their visits/event batches via cascade) that are older
-- than each website's configured retention_days, counted from the last activity.
create or replace function public.purge_expired_sessions()
returns table (purged uuid) language plpgsql security definer set search_path = public as $$
begin
  return query
  delete from public.sessions s
  using public.websites w
  where s.website_id = w.id
    and s.last_seen_at < now() - make_interval(days => greatest(1, w.retention_days))
  returning s.id;
end $$;
revoke execute on function public.purge_expired_sessions from public, anon, authenticated;
grant execute on function public.purge_expired_sessions to service_role;