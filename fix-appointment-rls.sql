-- ==========================================================================
-- Fix: Add RLS policy for receptionist to update appointments in their department
-- Run this in the Supabase SQL Editor
-- ==========================================================================

-- Add policy for receptionist to update appointments in their department
DROP POLICY IF EXISTS "receptionist can update department appointments" ON appointments;
CREATE POLICY "receptionist can update department appointments" ON appointments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM receptionist s WHERE s.auth_uid = auth.uid() AND s.department_id = appointments.department_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM receptionist s WHERE s.auth_uid = auth.uid() AND s.department_id = appointments.department_id)
  );

-- Verify
SELECT 'receptionist appointment update policy added' as status;