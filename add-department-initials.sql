-- ==========================================================================
-- Add initials column to departments table
-- Run this in the Supabase SQL Editor
-- ==========================================================================
-- This allows departments to have a prefix like "GM" for General Medicine,
-- "LS" for Laboratory Service, etc. Used for token generation.
-- ==========================================================================

-- 1. Add initials column to departments table
ALTER TABLE departments ADD COLUMN IF NOT EXISTS initials text;

-- 2. Update existing departments with auto-generated initials
--    (first 2 uppercase letters of the department name)
UPDATE departments SET initials = UPPER(LEFT(name, 2)) WHERE initials IS NULL OR initials = '';

-- 3. Make initials required for new departments
ALTER TABLE departments ALTER COLUMN initials SET NOT NULL;

-- 4. Verify
SELECT id, name, initials, status FROM departments ORDER BY name;