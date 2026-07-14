-- Fresh Supabase bootstrap for SmartQueue Health
-- Run this in Supabase SQL Editor as a new migration.
-- This is the single source of truth for schema + RLS policies.

create extension if not exists pgcrypto;

/* ==========================================================================
   TABLES
   ========================================================================== */

create table if not exists departments (
  id serial primary key,
  name text not null unique,
  description text,
  status text not null default 'Active',
  initials text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid null references auth.users(id),
  full_name text not null,
  phone text not null,
  email text not null unique,
  dob date,
  gender text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid null references auth.users(id),
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('Doctor','Nurse','Staff','Administrator')),
  department_id int null references departments(id),
  phone text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  department_id int not null references departments(id),
  doctor_id uuid null references staff(id),
  scheduled_at timestamptz not null,
  status text not null default 'Pending' check (status in ('Pending','Confirmed','Cancelled','Completed','Rescheduled')),
  type text not null default 'Consultation',
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists queue_entries (
  id uuid primary key default gen_random_uuid(),
  token_no text not null,
  patient_id uuid not null references patients(id),
  department_id int not null references departments(id) on delete cascade,
  appointment_id uuid null references appointments(id),
  staff_id uuid null references staff(id),
  status text not null default 'waiting' check (status in ('waiting','now_serving','served','skipped','cancelled')),
  type text not null default 'walk-in' check (type in ('walk-in','appointment')),
  reason text,
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  served_at timestamptz,
  expected_wait_minutes int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queue_entries_dept_token_unique unique (department_id, token_no)
);

-- Safely add ON DELETE CASCADE to existing foreign key constraints
-- Uses a DO block to handle cases where the constraint might already exist or have a different name
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

  -- Recreate with cascade
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

  -- Recreate with cascade
  begin
    alter table appointments
      add constraint appointments_department_id_fkey
      foreign key (department_id) references departments(id) on delete cascade;
  exception when duplicate_object then
    null;
  end;
end $$;

create or replace view tokens as
  select * from queue_entries;

create or replace view queue_tickets as
  select * from queue_entries;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  title text not null,
  body text,
  category text not null default 'queue',
  icon text,
  unread boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid null references auth.users(id),
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('Staff','Administrator')),
  status text not null default 'Active',
  joined_at timestamptz not null default now(),
  department_id int null references departments(id),
  phone text,
  notes text
);

create table if not exists settings (
  id int primary key,
  hospital_name text,
  hospital_email text,
  phone_number text,
  address text,
  email_notifications boolean not null default true,
  sms_notifications boolean not null default false,
  queue_alert_threshold int not null default 15,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into settings (id) values (1)
  on conflict (id) do nothing;

/* ==========================================================================
   HELPER FUNCTION: is_administrator()
   Checks both `users` and `staff` tables for admin role.
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
    from public.staff
    where auth_uid = auth.uid()
      and role = 'Administrator'
  );
$$;

/* ==========================================================================
   FUNCTION: delete_auth_user(user_id uuid)
   Allows administrators to delete auth users by their UID.
   Requires the function to be defined as SECURITY DEFINER
   so it runs with the privileges of the creator (who must be a superuser or have
   the ability to delete from auth.users).
   ========================================================================== */

create or replace function public.delete_auth_user(user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verify the caller is an administrator
  if not public.is_administrator() then
    raise exception 'Only administrators can delete auth users';
  end if;

  -- Delete from auth.users (this will cascade to all references)
  delete from auth.users where id = user_id;
end;
$$;

/* ==========================================================================
   ROW LEVEL SECURITY POLICIES
   ========================================================================== */

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
create policy "Staff can insert patient profiles" on patients
  for insert with check (
    exists (select 1 from staff s where s.auth_uid = auth.uid())
  );
create policy "Staff can select patient profiles" on patients
  for select using (
    exists (select 1 from staff s where s.auth_uid = auth.uid())
  );
create policy "Staff can update patient profiles" on patients
  for update using (
    exists (select 1 from staff s where s.auth_uid = auth.uid())
  ) with check (
    exists (select 1 from staff s where s.auth_uid = auth.uid())
  );
create policy "Administrators can select patient profiles" on patients
  for select using (public.is_administrator());
create policy "Administrators can update patient profiles" on patients
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete patient profiles" on patients
  for delete using (public.is_administrator());

-- ==================== STAFF ====================
alter table staff enable row level security;

drop policy if exists "Staff can access own record" on staff;
drop policy if exists "Staff can access unlinked own email record" on staff;
drop policy if exists "Staff can update own record" on staff;
drop policy if exists "Staff can claim unlinked own email record" on staff;
drop policy if exists "Administrators can select staff records" on staff;
drop policy if exists "Administrators can insert staff records" on staff;
drop policy if exists "Administrators can update staff records" on staff;
drop policy if exists "Administrators can delete staff records" on staff;

create policy "Staff can access own record" on staff
  for select using (auth.uid() = auth_uid);
create policy "Staff can access unlinked own email record" on staff
  for select using (auth_uid is null and lower(email) = lower(auth.jwt() ->> 'email'));
create policy "Staff can update own record" on staff
  for update using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);
create policy "Staff can claim unlinked own email record" on staff
  for update using (auth_uid is null and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (auth_uid = auth.uid() and lower(email) = lower(auth.jwt() ->> 'email'));
create policy "Administrators can select staff records" on staff
  for select using (public.is_administrator());
create policy "Administrators can insert staff records" on staff
  for insert with check (public.is_administrator());
create policy "Administrators can update staff records" on staff
  for update using (public.is_administrator())
  with check (public.is_administrator());
create policy "Administrators can delete staff records" on staff
  for delete using (public.is_administrator());

-- ==================== APPOINTMENTS ====================
alter table appointments enable row level security;

drop policy if exists "Patients can access own appointments" on appointments;
drop policy if exists "Patients can insert own appointments" on appointments;
drop policy if exists "Patients can update own appointments" on appointments;
drop policy if exists "Patients can delete own appointments" on appointments;
drop policy if exists "Staff can access department and assigned appointments" on appointments;
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
create policy "Staff can access department and assigned appointments" on appointments
  for select using (
    exists (select 1 from staff s where s.auth_uid = auth.uid())
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
drop policy if exists "Staff can access department queue entries" on queue_entries;
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
create policy "Staff can access department queue entries" on queue_entries
  for select using (
    exists (select 1 from staff s where s.auth_uid = auth.uid() and (s.id = queue_entries.staff_id or s.department_id = queue_entries.department_id))
  );
create policy "Staff can insert queue entries" on queue_entries
  for insert with check (
    exists (select 1 from staff s where s.auth_uid = auth.uid())
  );
create policy "Staff can update queue entries" on queue_entries
  for update using (
    exists (select 1 from staff s where s.auth_uid = auth.uid() and (s.id = queue_entries.staff_id or s.department_id = queue_entries.department_id))
  ) with check (
    exists (select 1 from staff s where s.auth_uid = auth.uid())
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

/* ==========================================================================
   INDEXES
   ========================================================================== */

create index if not exists idx_queue_entries_status on queue_entries(status);
create index if not exists idx_queue_entries_department on queue_entries(department_id);
create index if not exists idx_appointments_patient on appointments(patient_id);
create index if not exists idx_appointments_scheduled on appointments(scheduled_at);
create index if not exists idx_notifications_patient on notifications(patient_id);
create index if not exists idx_staff_department on staff(department_id);

/* ==========================================================================
   QUEUE SEQUENCES TABLE
   For atomic token generation without race conditions
   ========================================================================== */

create table if not exists queue_sequences (
  department_id int primary key references departments(id),
  last_number int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_queue_sequences_department on queue_sequences(department_id);

/* ==========================================================================
   FUNCTION: generate_next_queue_token()
   Atomically generates the next unique token for a department
   This prevents race conditions when multiple staff register patients simultaneously
   ========================================================================== */

create or replace function public.generate_next_queue_token(p_department_id int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
  v_prefix text;
begin
  -- Ensure sequence record exists
  insert into queue_sequences(department_id, last_number)
  values(p_department_id, 0)
  on conflict do nothing;
  
  -- Atomically increment and get next number
  update queue_sequences
  set last_number = last_number + 1
  where department_id = p_department_id
  returning last_number into v_next;
  
  -- Get department initials
  select initials into v_prefix
  from departments
  where id = p_department_id;
  
  -- Fallback if no initials found
  if v_prefix is null or v_prefix = '' then
    select upper(left(name, 1)) into v_prefix
    from departments
    where id = p_department_id;
  end if;
  
  if v_prefix is null or v_prefix = '' then
    v_prefix := 'Q';
  end if;
  
  -- Return formatted token
  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

/* ==========================================================================
   RELOAD SCHEMA
   ========================================================================== */

notify pgrst, 'reload schema';
