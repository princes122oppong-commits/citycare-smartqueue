-- ==========================================================================
-- Fix: Add RLS policy for staff to update appointments in their department
-- Run this in the Supabase SQL Editor
-- ==========================================================================

-- Add policy for staff to update appointments in their department
DROP POLICY IF EXISTS "Staff can update department appointments" ON appointments;
CREATE POLICY "Staff can update department appointments" ON appointments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM staff s WHERE s.auth_uid = auth.uid() AND s.department_id = appointments.department_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM staff s WHERE s.auth_uid = auth.uid() AND s.department_id = appointments.department_id)
  );

-- Verify
SELECT 'Staff appointment update policy added' as status;