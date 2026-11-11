-- Step 1: Create the telemetry_spans table
create table if not exists public.telemetry_spans (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  visit_id uuid not null references public.page_visits(id) on delete cascade,
  trace_id text not null,
  span_id text not null,
  parent_span_id text,
  name text not null,
  kind text not null default 'client_request', -- 'client_request', 'navigation', 'server_api', 'db_query', 'error'
  status text not null default 'ok',          -- 'ok' or 'error'
  status_code int,
  duration_ms numeric(10, 2) not null default 0,
  start_time timestamptz not null,
  end_time timestamptz not null,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Step 2: Add performance indexes for lightning-fast replay lookups
create index if not exists idx_telemetry_spans_visit_id on public.telemetry_spans(visit_id);
create index if not exists idx_telemetry_spans_session_id on public.telemetry_spans(session_id);
create index if not exists idx_telemetry_spans_trace_id on public.telemetry_spans(trace_id);
create index if not exists idx_telemetry_spans_start_time on public.telemetry_spans(start_time);

-- Step 3: Configure Table Permissions and Row Level Security (RLS)
alter table public.telemetry_spans enable row level security;
grant select on public.telemetry_spans to authenticated;
grant all on public.telemetry_spans to service_role;

-- Step 4: Add Access Policy reusing your existing authorization helper
create policy "View permitted telemetry spans" on public.telemetry_spans for select to authenticated
  using (public.can_view_website(auth.uid(), website_id));
