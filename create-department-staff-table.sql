-- ==========================================================================
-- Create a separate "department_staff" table for doctors/nurses
-- that have department assignments, separate from receptionists.
-- Run this in Supabase SQL Editor AFTER rename-staff-to-receptionist.sql
-- ==========================================================================

-- Step 1: Create department_staff table
create table if not exists public.department_staff (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid null references auth.users(id),
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('Doctor','Nurse','Staff')),
  department_id int not null references departments(id),
  phone text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Step 2: Migrate existing records from receptionist that have department_id
insert into public.department_staff (auth_uid, full_name, email, role, department_id, phone, status, created_at, updated_at)
select auth_uid, full_name, email, 'Staff', department_id, phone, status, created_at, updated_at
from public.receptionist
where department_id is not null;

-- Step 3: Remove department_id from those records in receptionist table
update public.receptionist
set department_id = null
where department_id is not null;

-- Step 4: Drop old foreign keys pointing to receptionist
alter table queue_entries drop constraint if exists queue_entries_staff_id_fkey;
alter table appointments drop constraint if exists appointments_doctor_id_fkey;

-- Step 5: Add foreign keys pointing to department_staff
alter table queue_entries
  add constraint queue_entries_staff_id_fkey
  foreign key (staff_id) references department_staff(id);

alter table appointments
  add constraint appointments_doctor_id_fkey
  foreign key (doctor_id) references department_staff(id);

-- Step 6: Enable RLS on department_staff
alter table department_staff enable row level security;

-- Step 7: Create RLS policies for department_staff
create policy "Department staff can access own record" on department_staff
  for select using (auth.uid() = auth_uid);

create policy "Department staff can update own record" on department_staff
  for update using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);

create policy "Administrators can select department staff" on department_staff
  for select using (public.is_administrator());

create policy "Administrators can insert department staff" on department_staff
  for insert with check (public.is_administrator());

create policy "Administrators can update department staff" on department_staff
  for update using (public.is_administrator())
  with check (public.is_administrator());

create policy "Administrators can delete department staff" on department_staff
  for delete using (public.is_administrator());

-- Step 8: Update RLS policies to allow department staff access
drop policy if exists "Receptionist can access department queue entries" on queue_entries;
drop policy if exists "Receptionist can insert queue entries" on queue_entries;
drop policy if exists "Receptionist can update queue entries" on queue_entries;

create policy "Receptionist can access department queue entries" on queue_entries
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid() and ds.department_id = queue_entries.department_id)
  );

create policy "Receptionist can insert queue entries" on queue_entries
  for insert with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

create policy "Receptionist can update queue entries" on queue_entries
  for update using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid() and ds.department_id = queue_entries.department_id)
  ) with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

-- Appointments
drop policy if exists "Receptionist can access department and assigned appointments" on appointments;

create policy "Receptionist can access department and assigned appointments" on appointments
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

-- Patients
drop policy if exists "Receptionist can insert patient profiles" on patients;
drop policy if exists "Receptionist can select patient profiles" on patients;
drop policy if exists "Receptionist can update patient profiles" on patients;

create policy "Receptionist can insert patient profiles" on patients
  for insert with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

create policy "Receptionist can select patient profiles" on patients
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

create policy "Receptionist can update patient profiles" on patients
  for update using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  ) with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

-- Notifications
drop policy if exists "Patients can access own notifications" on notifications;

-- Step 9: Notify PostgREST to reload schema
notify pgrst, 'reload schema';