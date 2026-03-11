-- Run this SQL in your Supabase project → SQL Editor

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password text not null,
  ghl_key_encrypted text,
  created_at timestamptz default now()
);

-- Disable Row Level Security so our backend service key can read/write freely
alter table users disable row level security;
