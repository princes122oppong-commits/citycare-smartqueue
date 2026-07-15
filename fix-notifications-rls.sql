-- ==========================================================================
-- Fix notifications RLS policy for patients
-- Run this in Supabase SQL Editor
-- This handles the case where a patient has duplicate rows
-- or where the notification's patient_id needs to match via auth_uid
-- ==========================================================================

drop policy if exists "Patients can access own notifications" on notifications;

create policy "Patients can access own notifications" on notifications
  for select using (
    exists (select 1 from patients p where p.id = notifications.patient_id and p.auth_uid = auth.uid())
    or notifications.patient_id in (select id from patients where auth_uid = auth.uid())
  );

notify pgrst, 'reload schema';