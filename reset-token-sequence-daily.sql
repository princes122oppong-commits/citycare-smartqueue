-- ==========================================================================
-- Fix: Reset queue token sequence to 001 each day
-- The generate_next_queue_token function now checks if it's a new day
-- and resets the counter back to 0 before incrementing.
-- Run this in Supabase SQL Editor
-- ==========================================================================

create or replace function public.generate_next_queue_token(p_department_id int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
  v_prefix text;
  v_last_date date;
  v_today date;
begin
  -- Ensure sequence record exists
  insert into queue_sequences(department_id, last_number, created_at, updated_at)
  values(p_department_id, 0, now(), now())
  on conflict do nothing;

  -- Get the last date when the sequence was updated
  select updated_at::date into v_last_date
  from queue_sequences
  where department_id = p_department_id;

  v_today := now()::date;

  -- If last update was a different day, reset the counter to 0
  if v_last_date is distinct from v_today then
    update queue_sequences
    set last_number = 0,
        updated_at = now()
    where department_id = p_department_id;
  end if;

  -- Atomically increment and get next number
  update queue_sequences
  set last_number = last_number + 1,
      updated_at = now()
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

  -- Return formatted token (3 digits with leading zeros)
  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

notify pgrst, 'reload schema';