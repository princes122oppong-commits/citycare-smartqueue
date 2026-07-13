-- ==========================================================================
-- Clean up duplicate user records
-- Run this in the Supabase SQL Editor
-- ==========================================================================
-- These are records in the "users" table that duplicate existing "staff" records.
-- The "staff" table records are the real ones (with auth logins).
-- ==========================================================================

-- Delete duplicate from users table for Oppong Joseph (already exists in staff)
DELETE FROM users WHERE id = '0b458df3-bd39-41f5-bec1-c7d3e8f222ad';

-- Delete duplicate from users table for Oppong Stephen k (already exists in staff)
DELETE FROM users WHERE id = 'f2ba11f0-2b96-44b4-a838-bb02699a2307';

-- Delete duplicate from users table for Oppong Stephen kofi (already exists in staff)
DELETE FROM users WHERE id = 'a4fb52d8-03e4-4d94-9475-db138613039e';

-- Verify remaining users
SELECT '--- Remaining users ---' as info;
SELECT id, full_name, email, role, department_id, status
FROM users
ORDER BY full_name;

SELECT '--- Remaining staff ---' as info;
SELECT id, full_name, email, role, department_id, status
FROM staff
ORDER BY full_name;