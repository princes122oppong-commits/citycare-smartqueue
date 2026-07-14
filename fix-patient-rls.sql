-- Fix patient table RLS policy for registration
-- Run this in Supabase SQL Editor

-- Enable RLS on patients table
alter table patients enable row level security;

-- Drop existing policies first
drop policy if exists "Patients can insert own profile" on patients;
drop policy if exists "Patients can access own profile" on patients;
drop policy if exists "Patients can manage own profile" on patients;

-- Allow patients to insert their own profile during registration
create policy "Patients can insert own profile" on patients
  for insert with check (auth.uid() = auth_uid);

-- Allow patients to read their own profile
create policy "Patients can access own profile" on patients
  for select using (auth.uid() = auth_uid);

-- Allow patients to update their own profile
create policy "Patients can manage own profile" on patients
  for update using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);