-- ==========================================================================
-- Fix notifications RLS policies for patients (SELECT + INSERT)
-- Run this in Supabase SQL Editor
-- Handles duplicate patient rows by matching via auth_uid subquery
-- ==========================================================================

-- SELECT policy: allow patient to read their own notifications
drop policy if exists "Patients can access own notifications" on notifications;

create policy "Patients can access own notifications" on notifications
  for select using (
    exists (select 1 from patients p where p.id = notifications.patient_id and p.auth_uid = auth.uid())
    or notifications.patient_id in (select id from patients where auth_uid = auth.uid())
  );

-- INSERT policy: allow patient to create notifications for themselves
drop policy if exists "Patients can insert own notifications" on notifications;

create policy "Patients can insert own notifications" on notifications
  for insert with check (
    exists (select 1 from patients p where p.id = notifications.patient_id and p.auth_uid = auth.uid())
    or notifications.patient_id in (select id from patients where auth_uid = auth.uid())
  );

notify pgrst, 'reload schema';