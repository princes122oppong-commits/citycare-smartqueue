-- Supabase Row Level Security policies for the SmartQueue Health application.
-- IMPORTANT: Run this file only in the Supabase SQL editor (PostgreSQL dialect).
-- Do not execute it against an MSSQL / SQL Server connection.
-- Apply this migration after the core schema has been created.

/* ==========================================================================
   HELPER FUNCTION: is_administrator()
   Checks both `users` and `receptionist` tables for admin role.
   ========================================================================== */

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

-- ==================== DEPARTMENTS ====================
alter table departments enable row level security;

drop policy if exists "Authenticated users can read departments" on departments;
drop policy if exists "Authenticated users can insert departments" on departments;
drop policy if exists "Administrators can update departments" on departments;
drop policy if exists "Administrators can delete departments" on departments;

create policy "Authenticated users can read departments" on departments
  for select using (auth.role() = 'authenticated');
create policy "Authenticated users can insert departments" on departments
  for insert with check (auth.role() = 'authenticated');
create policy "Administrators can update departments" on departments
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete departments" on departments
  for delete using (public.is_administrator());

-- ==================== PATIENTS ====================
alter table patients enable row level security;

drop policy if exists "Patients can access own profile" on patients;
drop policy if exists "Patients can manage own profile" on patients;
drop policy if exists "Patients can insert own profile" on patients;
drop policy if exists "receptionist can insert patient profiles" on patients;
drop policy if exists "receptionist can select patient profiles" on patients;
drop policy if exists "receptionist can update patient profiles" on patients;
drop policy if exists "Administrators can select patient profiles" on patients;
drop policy if exists "Administrators can update patient profiles" on patients;
drop policy if exists "Administrators can delete patient profiles" on patients;

create policy "Patients can access own profile" on patients
  for select using (auth.uid() = auth_uid);
create policy "Patients can manage own profile" on patients
  for update using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);
create policy "Patients can insert own profile" on patients
  for insert with check (auth.uid() = auth_uid);

-- receptionist policies (needed for walk-in registration and department portal)
create policy "receptionist can insert patient profiles" on patients
  for insert with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );
create policy "receptionist can select patient profiles" on patients
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );
create policy "receptionist can update patient profiles" on patients
  for update using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  ) with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

create policy "Administrators can select patient profiles" on patients
  for select using (public.is_administrator());
create policy "Administrators can update patient profiles" on patients
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete patient profiles" on patients
  for delete using (public.is_administrator());

-- ==================== receptionist ====================
alter table receptionist enable row level security;

drop policy if exists "receptionist can access own record" on receptionist;
drop policy if exists "receptionist can access unlinked own email record" on receptionist;
drop policy if exists "receptionist can update own record" on receptionist;
drop policy if exists "receptionist can claim unlinked own email record" on receptionist;
drop policy if exists "Administrators can select receptionist records" on receptionist;
drop policy if exists "Administrators can insert receptionist records" on receptionist;
drop policy if exists "Administrators can update receptionist records" on receptionist;
drop policy if exists "Administrators can delete receptionist records" on receptionist;

create policy "receptionist can access own record" on receptionist
  for select using (auth.uid() = auth_uid);
create policy "receptionist can access unlinked own email record" on receptionist
  for select using (auth_uid is null and lower(email) = lower(auth.jwt() ->> 'email'));
create policy "receptionist can update own record" on receptionist
  for update using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);
create policy "receptionist can claim unlinked own email record" on receptionist
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

-- ==================== APPOINTMENTS ====================
alter table appointments enable row level security;

drop policy if exists "Patients can access own appointments" on appointments;
drop policy if exists "Patients can insert own appointments" on appointments;
drop policy if exists "Patients can update own appointments" on appointments;
drop policy if exists "Patients can delete own appointments" on appointments;
drop policy if exists "receptionist can access department and assigned appointments" on appointments;
drop policy if exists "Administrators can select appointments" on appointments;
drop policy if exists "Administrators can insert appointments" on appointments;
drop policy if exists "Administrators can update appointments" on appointments;
drop policy if exists "Administrators can delete appointments" on appointments;

create policy "Patients can access own appointments" on appointments
  for select using (
    exists (select 1 from patients p where p.id = appointments.patient_id and p.auth_uid = auth.uid())
  );
create policy "Patients can insert own appointments" on appointments
  for insert with check (
    exists (select 1 from patients p where p.id = appointments.patient_id and p.auth_uid = auth.uid())
  );
create policy "Patients can update own appointments" on appointments
  for update using (
    exists (select 1 from patients p where p.id = appointments.patient_id and p.auth_uid = auth.uid())
  ) with check (
    exists (select 1 from patients p where p.id = appointments.patient_id and p.auth_uid = auth.uid())
  );
create policy "Patients can delete own appointments" on appointments
  for delete using (
    exists (select 1 from patients p where p.id = appointments.patient_id and p.auth_uid = auth.uid())
  );
create policy "receptionist can access department and assigned appointments" on appointments
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );
create policy "Administrators can select appointments" on appointments
  for select using (public.is_administrator());
create policy "Administrators can insert appointments" on appointments
  for insert with check (public.is_administrator());
create policy "Administrators can update appointments" on appointments
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete appointments" on appointments
  for delete using (public.is_administrator());

-- ==================== QUEUE ENTRIES ====================
alter table queue_entries enable row level security;

drop policy if exists "Patients can access own queue entries" on queue_entries;
drop policy if exists "Patients can insert own queue entries" on queue_entries;
drop policy if exists "receptionist can access department queue entries" on queue_entries;
drop policy if exists "receptionist can insert queue entries" on queue_entries;
drop policy if exists "receptionist can update queue entries" on queue_entries;
drop policy if exists "Administrators can select queue entries" on queue_entries;
drop policy if exists "Administrators can insert queue entries" on queue_entries;
drop policy if exists "Administrators can update queue entries" on queue_entries;
drop policy if exists "Administrators can delete queue entries" on queue_entries;

create policy "Patients can access own queue entries" on queue_entries
  for select using (
    exists (select 1 from patients p where p.id = queue_entries.patient_id and p.auth_uid = auth.uid())
  );
create policy "Patients can insert own queue entries" on queue_entries
  for insert with check (
    exists (select 1 from patients p where p.id = queue_entries.patient_id and p.auth_uid = auth.uid())
  );

-- receptionist/Department policies
create policy "receptionist can access department queue entries" on queue_entries
  for select using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid() and (s.id = queue_entries.receptionist_id or s.department_id = queue_entries.department_id))
  );
create policy "receptionist can insert queue entries" on queue_entries
  for insert with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );
create policy "receptionist can update queue entries" on queue_entries
  for update using (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid() and (s.id = queue_entries.receptionist_id or s.department_id = queue_entries.department_id))
  ) with check (
    exists (select 1 from receptionist s where s.auth_uid = auth.uid())
  );

create policy "Administrators can select queue entries" on queue_entries
  for select using (public.is_administrator());
create policy "Administrators can insert queue entries" on queue_entries
  for insert with check (public.is_administrator());
create policy "Administrators can update queue entries" on queue_entries
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete queue entries" on queue_entries
  for delete using (public.is_administrator());

-- ==================== NOTIFICATIONS ====================
alter table notifications enable row level security;

drop policy if exists "Patients can access own notifications" on notifications;
drop policy if exists "Patients can insert own notifications" on notifications;
drop policy if exists "Administrators can select notifications" on notifications;
drop policy if exists "Administrators can insert notifications" on notifications;
drop policy if exists "Administrators can update notifications" on notifications;
drop policy if exists "Administrators can delete notifications" on notifications;

create policy "Patients can access own notifications" on notifications
  for select using (
    exists (select 1 from patients p where p.id = notifications.patient_id and p.auth_uid = auth.uid())
  );
create policy "Patients can insert own notifications" on notifications
  for insert with check (
    exists (select 1 from patients p where p.id = notifications.patient_id and p.auth_uid = auth.uid())
  );
create policy "Administrators can select notifications" on notifications
  for select using (public.is_administrator());
create policy "Administrators can insert notifications" on notifications
  for insert with check (public.is_administrator());
create policy "Administrators can update notifications" on notifications
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete notifications" on notifications
  for delete using (public.is_administrator());

-- ==================== USERS ====================
alter table users enable row level security;

drop policy if exists "Users can access own user row" on users;
drop policy if exists "Authenticated users can access users by email" on users;
drop policy if exists "Administrators can select users" on users;
drop policy if exists "Administrators can insert users" on users;
drop policy if exists "Administrators can update users" on users;
drop policy if exists "Administrators can delete users" on users;

create policy "Users can access own user row" on users
  for select using (auth.uid() = auth_uid);
create policy "Authenticated users can access users by email" on users
  for select using (
    auth.uid() = auth_uid or lower(email) = lower(auth.jwt() ->> 'email')
  );
create policy "Administrators can select users" on users
  for select using (public.is_administrator());
create policy "Administrators can insert users" on users
  for insert with check (public.is_administrator());
create policy "Administrators can update users" on users
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete users" on users
  for delete using (public.is_administrator());

-- ==================== SETTINGS ====================
alter table settings add column if not exists hospital_name text;
alter table settings add column if not exists hospital_email text;
alter table settings add column if not exists phone_number text;
alter table settings add column if not exists address text;
alter table settings add column if not exists maintenance_mode boolean not null default false;
insert into settings (id) values (1)
  on conflict (id) do nothing;
alter table settings enable row level security;
drop policy if exists "Administrators can select settings" on settings;
drop policy if exists "Administrators can insert settings" on settings;
drop policy if exists "Administrators can update settings" on settings;
drop policy if exists "Administrators can delete settings" on settings;
create policy "Administrators can select settings" on settings
  for select using (public.is_administrator());
create policy "Administrators can insert settings" on settings
  for insert with check (public.is_administrator());
create policy "Administrators can update settings" on settings
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete settings" on settings
  for delete using (public.is_administrator());

-- ==================== ON DELETE CASCADE for Department FK ====================
-- Safely adds cascade delete so deleting a department removes related records
do $$
begin
  -- Drop and recreate queue_entries -> departments FK if it exists
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_type = 'FOREIGN KEY'
      and table_name = 'queue_entries'
      and constraint_name ilike '%department%'
  ) then
    execute (
      select 'alter table queue_entries drop constraint "' || constraint_name || '"'
      from information_schema.table_constraints
      where constraint_type = 'FOREIGN KEY'
        and table_name = 'queue_entries'
        and constraint_name ilike '%department%'
      limit 1
    );
  end if;
  begin
    alter table queue_entries
      add constraint queue_entries_department_id_fkey
      foreign key (department_id) references departments(id) on delete cascade;
  exception when duplicate_object then
    null;
  end;

  -- Drop and recreate appointments -> departments FK if it exists
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_type = 'FOREIGN KEY'
      and table_name = 'appointments'
      and constraint_name ilike '%department%'
  ) then
    execute (
      select 'alter table appointments drop constraint "' || constraint_name || '"'
      from information_schema.table_constraints
      where constraint_type = 'FOREIGN KEY'
        and table_name = 'appointments'
        and constraint_name ilike '%department%'
      limit 1
    );
  end if;
  begin
    alter table appointments
      add constraint appointments_department_id_fkey
      foreign key (department_id) references departments(id) on delete cascade;
  exception when duplicate_object then
    null;
  end;
end $$;

notify pgrst, 'reload schema';