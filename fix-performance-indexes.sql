-- ==========================================================================
-- Performance fix: add missing composite indexes
-- Run this in Supabase SQL Editor
-- These indexes speed up the most common queries:
--   - patient dashboard (filter by patient_id + status)
--   - queue management (filter by department_id + status)
--   - people-ahead count (department_id + status + joined_at)
-- ==========================================================================

-- Patient dashboard: get active queue entry for a patient
create index if not exists idx_queue_entries_patient_status
  on queue_entries (patient_id, status);

-- Queue management: list waiting/serving entries per department
create index if not exists idx_queue_entries_dept_status_joined
  on queue_entries (department_id, status, joined_at);

-- Appointments: upcoming appointments per patient
create index if not exists idx_appointments_patient_scheduled
  on appointments (patient_id, scheduled_at);

-- Appointments: per department + status (receptionist/dept views)
create index if not exists idx_appointments_dept_status
  on appointments (department_id, status);

-- Notifications: unread count per patient (badge)
create index if not exists idx_notifications_patient_unread
  on notifications (patient_id, unread);

-- Patients: lookup by auth_uid (login)
create index if not exists idx_patients_auth_uid
  on patients (auth_uid);

-- Receptionist: lookup by auth_uid
create index if not exists idx_receptionist_auth_uid
  on receptionist (auth_uid);

notify pgrst, 'reload schema';