-- ==========================================================================
-- Fix RLS policies for appointments to allow department staff to update
-- Run this in Supabase SQL Editor
-- ==========================================================================

-- Drop the old SELECT-only policy
drop policy if exists "Receptionist can access department and assigned appointments" on appointments;

-- Recreate with SELECT + UPDATE for both receptionists and department staff
create policy "Receptionist can access department and assigned appointments" on appointments
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
    or exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

-- Add UPDATE policy for department staff (doctors/nurses can confirm/cancel)
drop policy if exists "Department staff can update appointments" on appointments;

create policy "Department staff can update appointments" on appointments
  for update using (
    exists (select 1 from department_staff ds where ds.auth_uid = auth.uid() and ds.department_id = appointments.department_id)
  ) with check (
    exists (select 1 from department_staff ds where ds.auth_uid = auth.uid() and ds.department_id = appointments.department_id)
  );

-- Add UPDATE policy for receptionists (they can also manage appointments)
drop policy if exists "Receptionist can update appointments" on appointments;

create policy "Receptionist can update appointments" on appointments
  for update using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  ) with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

-- Notify PostgREST to reload schema
notify pgrst, 'reload schema';