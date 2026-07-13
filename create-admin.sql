-- ==========================================================================
-- Create Admin User in Supabase (Robust version)
-- Run this in the Supabase SQL Editor
-- ==========================================================================
-- This script creates an admin user with:
--   Email: oppongscarcity21@gmail.com
--   Password: Oppong21@
-- ==========================================================================

-- 1. Check if the auth user already exists
DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'oppongscarcity21@gmail.com';
BEGIN
  -- Check if user already exists in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  -- If not, create the user in auth.users
  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_sent_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt('Oppong21@', gen_salt('bf')),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"System Admin"}',
      now(),
      now()
    )
    RETURNING id INTO v_user_id;

    RAISE NOTICE 'Created auth user with id: %', v_user_id;
  ELSE
    RAISE NOTICE 'Auth user already exists with id: %', v_user_id;
  END IF;

  -- 2. Upsert the user into public.users with Administrator role
  INSERT INTO public.users (auth_uid, full_name, email, role, status, joined_at)
  VALUES (v_user_id, 'System Admin', v_email, 'Administrator', 'Active', now())
  ON CONFLICT (email) DO UPDATE SET
    auth_uid = v_user_id,
    role = 'Administrator',
    status = 'Active',
    full_name = 'System Admin';
END $$;

-- 3. Verify the results
SELECT 
  'Auth User:' as "Check",
  id, email, email_confirmed_at, created_at
FROM auth.users 
WHERE email = 'oppongscarcity21@gmail.com';

SELECT 
  'Public User:' as "Check",
  id, auth_uid, email, role, status
FROM public.users 
WHERE email = 'oppongscarcity21@gmail.com';