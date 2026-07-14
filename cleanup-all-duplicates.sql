-- ==========================================================================
-- Delete ALL duplicate user records (keep only System Admin)
-- Run this in the Supabase SQL Editor
-- ==========================================================================
-- This deletes records for the 3 duplicate people from all tables:
--   - auth.users (login accounts)
--   - public.users (admin/receptionist records)
--   - public.receptionist (receptionist records)
-- Only the System Admin (oppongscarcity21@gmail.com) will remain.
-- ==========================================================================

-- 1. Delete from public.receptionist
DELETE FROM public.receptionist WHERE email IN (
  'amaniampongjoe21@gmail.com',
  'opokusilas@gmil.com',
  'oppongjosephattakorah21@gmail.com'
);

-- 2. Delete from public.users
DELETE FROM public.users WHERE email IN (
  'amaniampongjoe21@gmail.com',
  'opokusilas@gmil.com',
  'oppongjosephattakorah21@gmail.com'
);

-- 3. Delete from auth.users (login accounts)
DELETE FROM auth.users WHERE email IN (
  'amaniampongjoe21@gmail.com',
  'opokusilas@gmil.com',
  'oppongjosephattakorah21@gmail.com'
);

-- 4. Verify - should only show System Admin
SELECT '--- Remaining auth.users ---' as info;
SELECT id, email FROM auth.users;

SELECT '--- Remaining public.users ---' as info;
SELECT id, email, role, status FROM public.users;

SELECT '--- Remaining public.receptionist ---' as info;
SELECT id, email, role, status FROM public.receptionist;