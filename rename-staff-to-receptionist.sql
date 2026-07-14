-- ==========================================================================
-- Rename "staff" table to "receptionist" in Supabase
-- Run this in Supabase SQL Editor
-- ==========================================================================

-- Step 1: Drop existing RLS policies on staff table
drop policy if exists "Staff can access own record" on staff;
drop policy if exists "Staff can access unlinked own email record" on staff;
drop policy if exists "Staff can update own record" on staff;
drop policy if exists "Staff can claim unlinked own email record" on staff;
drop policy if exists "Administrators can select staff records" on staff;
drop policy if exists "Administrators can insert staff records" on staff;
drop policy if exists "Administrators can update staff records" on staff;
drop policy if exists "Administrators can delete staff records" on staff;

-- Step 2: Disable RLS on staff before rename
alter table staff disable row level security;

-- Step 3: Drop foreign key constraints that reference staff(id)
-- (queue_entries and appointments have staff_id referencing staff)
alter table queue_entries drop constraint if exists queue_entries_staff_id_fkey;
alter table appointments drop constraint if exists appointments_doctor_id_fkey;

-- Step 4: Rename the table
alter table if exists staff rename to receptionist;

-- Step 5: Recreate foreign key constraints with new table name
alter table queue_entries
  add constraint queue_entries_staff_id_fkey
  foreign key (staff_id) references receptionist(id);

alter table appointments
  add constraint appointments_doctor_id_fkey
  foreign key (doctor_id) references receptionist(id);

-- Step 6: Enable RLS on the renamed table
alter table receptionist enable row level security;

-- Step 7: Recreate RLS policies on receptionist table
create policy "Receptionist can access own record" on receptionist
  for select using (auth.uid() = auth_uid);

create policy "Receptionist can access unlinked own email record" on receptionist
  for select using (auth_uid is null and lower(email) = lower(auth.jwt() ->> 'email'));

create policy "Receptionist can update own record" on receptionist
  for update using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);

create policy "Receptionist can claim unlinked own email record" on receptionist
  for update using (auth_uid is null and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (auth_uid = auth.uid() and lower(email) = lower(auth.jwt() ->> 'email'));

create policy "Administrators can select receptionist records" on receptionist
  for select using (public.is_administrator());

create policy "Administrators can insert receptionist records" on receptionist
  for insert with check (public.is_administrator());

create policy "Administrators can update receptionist records" on receptionist
  for update using (public.is_administrator())
  with check (public.is_administrator());

create policy "Administrators can delete receptionist records" on receptionist
  for delete using (public.is_administrator());

-- Step 8: Update the is_administrator() function to use new table name
create or replace function public.is_administrator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where auth_uid = auth.uid()
      and role = 'Administrator'
  ) or exists (
    select 1
    from public.receptionist
    where auth_uid = auth.uid()
      and role = 'Administrator'
  );
$$;

-- Step 9: Update all RLS policies on other tables that reference staff table
-- Patients policies that check staff table
drop policy if exists "Staff can insert patient profiles" on patients;
drop policy if exists "Staff can select patient profiles" on patients;
drop policy if exists "Staff can update patient profiles" on patients;

create policy "Receptionist can insert patient profiles" on patients
  for insert with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

create policy "Receptionist can select patient profiles" on patients
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

create policy "Receptionist can update patient profiles" on patients
  for update using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  ) with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

-- Appointments policies that reference staff
drop policy if exists "Staff can access department and assigned appointments" on appointments;

create policy "Receptionist can access department and assigned appointments" on appointments
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

-- Queue entries policies that reference staff
drop policy if exists "Staff can access department queue entries" on queue_entries;
drop policy if exists "Staff can insert queue entries" on queue_entries;
drop policy if exists "Staff can update queue entries" on queue_entries;

create policy "Receptionist can access department queue entries" on queue_entries
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid() and (s.id = queue_entries.staff_id or s.department_id = queue_entries.department_id))
  );

create policy "Receptionist can insert queue entries" on queue_entries
  for insert with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

create policy "Receptionist can update queue entries" on queue_entries
  for update using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid() and (s.id = queue_entries.staff_id or s.department_id = queue_entries.department_id))
  ) with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

-- Step 10: Notify PostgREST to reload schema
notify pgrst, 'reload schema';

-- ==========================================================================
-- DONE
-- ==========================================================================