-- ==========================================================================
-- Fix notifications table for receptionist, department staff, and admin
-- Adds department_id, recipient_role, and auth_uid columns
-- Adds proper RLS policies for all roles
-- Run this in Supabase SQL Editor
-- ==========================================================================

-- ==========================================================================
-- STEP 1: Add new columns to notifications table
-- ==========================================================================
alter table notifications add column if not exists department_id int null references departments(id);
alter table notifications add column if not exists recipient_role text not null default 'patient' check (recipient_role in ('patient', 'receptionist', 'department_staff', 'admin'));
alter table notifications add column if not exists auth_uid uuid null references auth.users(id);

-- Add index for the new columns
create index if not exists idx_notifications_department on notifications(department_id);
create index if not exists idx_notifications_recipient_role on notifications(recipient_role);
create index if not exists idx_notifications_auth_uid on notifications(auth_uid);

-- ==========================================================================
-- STEP 2: Drop existing RLS policies on notifications
-- ==========================================================================
drop policy if exists "Patients can access own notifications" on notifications;
drop policy if exists "Patients can insert own notifications" on notifications;
drop policy if exists "Administrators can select notifications" on notifications;
drop policy if exists "Administrators can insert notifications" on notifications;
drop policy if exists "Administrators can update notifications" on notifications;
drop policy if exists "Administrators can delete notifications" on notifications;

-- ==========================================================================
-- STEP 3: Enable RLS on notifications
-- ==========================================================================
alter table notifications enable row level security;

-- ==========================================================================
-- STEP 4: Create RLS policies for all roles
-- ==========================================================================

-- 4a. Patient policies
create policy "Patients can access own notifications" on notifications
  for select using (
    recipient_role = 'patient'
    and (
      exists (select 1 from patients p where p.id = notifications.patient_id and p.auth_uid = auth.uid())
      or notifications.patient_id in (select id from patients where auth_uid = auth.uid())
    )
  );

create policy "Patients can insert own notifications" on notifications
  for insert with check (
    recipient_role = 'patient'
    and (
      exists (select 1 from patients p where p.id = notifications.patient_id and p.auth_uid = auth.uid())
      or notifications.patient_id in (select id from patients where auth_uid = auth.uid())
    )
  );

-- 4b. Receptionist policies
create policy "Receptionist can select notifications" on notifications
  for select using (
    recipient_role = 'receptionist'
    and (
      exists (select 1 from receptionist s where s.auth_uid = auth.uid())
      or auth_uid = auth.uid()
    )
  );

create policy "Receptionist can insert notifications" on notifications
  for insert with check (
    recipient_role = 'receptionist'
    and exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

create policy "Receptionist can update notifications" on notifications
  for update using (
    recipient_role = 'receptionist'
    and exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  ) with check (
    recipient_role = 'receptionist'
    and exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

-- 4c. Department staff policies
create policy "Department staff can select notifications" on notifications
  for select using (
    recipient_role = 'department_staff'
    and (
      exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
      or auth_uid = auth.uid()
    )
  );

create policy "Department staff can insert notifications" on notifications
  for insert with check (
    recipient_role = 'department_staff'
    and exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

create policy "Department staff can update notifications" on notifications
  for update using (
    recipient_role = 'department_staff'
    and exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  ) with check (
    recipient_role = 'department_staff'
    and exists (select 1 from department_staff ds where ds.auth_uid = auth.uid())
  );

-- 4d. Admin policies (full access)
create policy "Administrators can select notifications" on notifications
  for select using (public.is_administrator());

create policy "Administrators can insert notifications" on notifications
  for insert with check (public.is_administrator());

create policy "Administrators can update notifications" on notifications
  for update using (public.is_administrator())
  with check (public.is_administrator());

create policy "Administrators can delete notifications" on notifications
  for delete using (public.is_administrator());

-- ==========================================================================
-- STEP 5: Notify PostgREST to reload schema
-- ==========================================================================
notify pgrst, 'reload schema';