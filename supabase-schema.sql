-- One row per tutor, holding their whole app state as JSON — mirrors the
-- shape already saved to localStorage under "parallelka-v1".
create table app_data (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_data enable row level security;

create policy "Users can read own data"
  on app_data for select
  using ( (select auth.jwt()->>'sub') = user_id );

create policy "Users can insert own data"
  on app_data for insert
  with check ( (select auth.jwt()->>'sub') = user_id );

create policy "Users can update own data"
  on app_data for update
  using ( (select auth.jwt()->>'sub') = user_id );
