-- ==========================================================================
-- Create the generate_next_queue_token function
-- This function atomically generates unique queue tokens per department
-- Run this in Supabase SQL Editor
-- ==========================================================================

-- Step 1: Create the queue_sequences table if it doesn't exist
create table if not exists public.queue_sequences (
  department_id int primary key references departments(id),
  last_number int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Step 2: Create the function
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

-- Step 3: Notify PostgREST to reload schema
notify pgrst, 'reload schema';