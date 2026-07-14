/* ==========================================================================
   Diagnostic SQL Queries for SmartQueue System
   Run these in Supabase SQL Editor to find data issues
   ========================================================================== */

-- 1. Detect duplicate queue tokens (same department, same token_no)
select department_id, token_no, count(*)
from queue_entries
group by department_id, token_no
having count(*) > 1;

-- 2. Find staff records missing department assignments
select id, full_name, department_id
from staff
where department_id is null;

-- 3. Find users missing department assignments
select id, full_name, department_id
from users
where department_id is null;

-- 4. Find orphan queue records (department was deleted)
select *
from queue_entries
where department_id not in (
  select id from departments
);

-- 5. Find queue entries pointing to non-existent staff
select *
from queue_entries
where staff_id is not null
  and staff_id not in (
    select id from staff
  );

-- 6. Find queue entries pointing to non-existent patients
select *
from queue_entries
where patient_id not in (
  select id from patients
);

-- 7. Find appointments pointing to non-existent departments
select *
from appointments
where department_id not in (
  select id from departments
);

-- 8. Count current queue state summary
select status, count(*)
from queue_entries
where joined_at >= current_date
group by status
order by status;