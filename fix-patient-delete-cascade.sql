-- ==========================================================================
-- Fix: Add ON DELETE CASCADE to queue_entries -> patients foreign key
-- Run this in the Supabase SQL Editor
-- ==========================================================================
-- This allows deleting patients who have queue entries
-- (the queue entries will be deleted automatically)
-- ==========================================================================

-- 1. Drop the existing foreign key constraint
ALTER TABLE queue_entries DROP CONSTRAINT IF EXISTS queue_entries_patient_id_fkey;

-- 2. Re-add with ON DELETE CASCADE
ALTER TABLE queue_entries 
  ADD CONSTRAINT queue_entries_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

-- 3. Also do the same for notifications
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_patient_id_fkey;
ALTER TABLE notifications 
  ADD CONSTRAINT notifications_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

-- 4. Also do the same for appointments
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey;
ALTER TABLE appointments 
  ADD CONSTRAINT appointments_patient_id_fkey 
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

-- Verify
SELECT 'CASCADE constraints added successfully' as status;