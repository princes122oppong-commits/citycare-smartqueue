-- ==========================================================================
-- Fix is_administrator() function and ALL RLS policies
-- Run this in the Supabase SQL Editor
-- ==========================================================================

-- 1. Drop the old function with CASCADE (drops all dependent policies)
DROP FUNCTION IF EXISTS public.is_administrator() CASCADE;

-- 2. Recreate with SECURITY DEFINER (runs as table owner, bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_administrator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE auth_uid = auth.uid()
      AND role = 'Administrator'
      AND status = 'Active'
  ) OR EXISTS (
    SELECT 1
    FROM public.receptionist
    WHERE auth_uid = auth.uid()
      AND role = 'Administrator'
      AND status = 'Active'
  );
$$;

-- ==================== DEPARTMENTS ====================
CREATE POLICY "Administrators can update departments" ON departments
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete departments" ON departments
  FOR DELETE USING (public.is_administrator());

-- ==================== PATIENTS ====================
CREATE POLICY "Administrators can select patient profiles" ON patients
  FOR SELECT USING (public.is_administrator());
CREATE POLICY "Administrators can update patient profiles" ON patients
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete patient profiles" ON patients
  FOR DELETE USING (public.is_administrator());

-- ==================== receptionist ====================
CREATE POLICY "Administrators can select receptionist records" ON receptionist
  FOR SELECT USING (public.is_administrator());
CREATE POLICY "Administrators can insert receptionist records" ON receptionist
  FOR INSERT WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can update receptionist records" ON receptionist
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete receptionist records" ON receptionist
  FOR DELETE USING (public.is_administrator());

-- ==================== APPOINTMENTS ====================
CREATE POLICY "Administrators can select appointments" ON appointments
  FOR SELECT USING (public.is_administrator());
CREATE POLICY "Administrators can insert appointments" ON appointments
  FOR INSERT WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can update appointments" ON appointments
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete appointments" ON appointments
  FOR DELETE USING (public.is_administrator());

-- ==================== QUEUE ENTRIES ====================
CREATE POLICY "Administrators can select queue entries" ON queue_entries
  FOR SELECT USING (public.is_administrator());
CREATE POLICY "Administrators can insert queue entries" ON queue_entries
  FOR INSERT WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can update queue entries" ON queue_entries
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete queue entries" ON queue_entries
  FOR DELETE USING (public.is_administrator());

-- ==================== NOTIFICATIONS ====================
CREATE POLICY "Administrators can select notifications" ON notifications
  FOR SELECT USING (public.is_administrator());
CREATE POLICY "Administrators can insert notifications" ON notifications
  FOR INSERT WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can update notifications" ON notifications
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete notifications" ON notifications
  FOR DELETE USING (public.is_administrator());

-- ==================== USERS ====================
CREATE POLICY "Administrators can select users" ON users
  FOR SELECT USING (public.is_administrator());
CREATE POLICY "Administrators can insert users" ON users
  FOR INSERT WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can update users" ON users
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete users" ON users
  FOR DELETE USING (public.is_administrator());

-- ==================== SETTINGS ====================
CREATE POLICY "Administrators can select settings" ON settings
  FOR SELECT USING (public.is_administrator());
CREATE POLICY "Administrators can insert settings" ON settings
  FOR INSERT WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can update settings" ON settings
  FOR UPDATE USING (public.is_administrator())
  WITH CHECK (public.is_administrator());
CREATE POLICY "Administrators can delete settings" ON settings
  FOR DELETE USING (public.is_administrator());

-- ==================== DELETE AUTH USER FUNCTION ====================
-- Recreate the function that allows admins to delete auth users
CREATE OR REPLACE FUNCTION public.delete_auth_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is an administrator
  IF NOT public.is_administrator() THEN
    RAISE EXCEPTION 'Only administrators can delete auth users';
  END IF;

  -- Delete from auth.users (this will cascade to all references)
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

-- Verify function was created
SELECT 'is_administrator and delete_auth_user functions recreated with CASCADE' as status;
