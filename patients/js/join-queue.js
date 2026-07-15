/* ============================================================
   Join Queue page logic
   Uses Supabase to create a live walk-in queue entry.
   ============================================================ */

const AVERAGE_MINUTES_PER_PATIENT = 5;

function getSelectedDepartment() {
  const select = document.getElementById("department");
  const option = select?.selectedOptions?.[0];
  return {
    id: option?.dataset?.deptId ? Number(option.dataset.deptId) : null,
    name: select?.value || "",
  };
}

async function loadDepartments() {
  const select = document.getElementById("department");
  if (!select || !supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("departments")
    .select("id, name")
    .eq("status", "Active")
    .order("name", { ascending: true });

  if (error) {
    console.warn("Unable to load departments:", error.message);
    return;
  }

  if (!data?.length) return;

  select.innerHTML = data
    .map(
      (dept) =>
        `<option value="${escapeHtml(dept.name)}" data-dept-id="${dept.id}">${escapeHtml(dept.name)}</option>`
    )
    .join("");
}

async function updateSummary() {
  const { id: departmentId, name: departmentName } = getSelectedDepartment();
  const sumDepartment = document.getElementById("sum-department");
  const waitValue = document.querySelectorAll(".s-value")[2];
  const aheadValue = document.querySelectorAll(".s-value")[3];

  if (sumDepartment) sumDepartment.textContent = departmentName || "—";

  if (!departmentId || !supabaseClient) {
    if (waitValue) waitValue.textContent = "—";
    if (aheadValue) aheadValue.textContent = "—";
    return;
  }

  const { count, error } = await supabaseClient
    .from("queue_entries")
    .select("*", { count: "exact", head: true })
    .eq("department_id", departmentId)
    .in("status", ["waiting", "now_serving"]);

  if (error) {
    console.warn("Unable to load queue summary:", error.message);
    if (waitValue) waitValue.textContent = "—";
    if (aheadValue) aheadValue.textContent = "—";
    return;
  }

  const peopleAhead = count || 0;
  const estimatedWait = Math.max(AVERAGE_MINUTES_PER_PATIENT, peopleAhead * AVERAGE_MINUTES_PER_PATIENT);

  if (waitValue) waitValue.textContent = `${estimatedWait} mins`;
  if (aheadValue) aheadValue.textContent = `${peopleAhead} people`;
}

async function generateTokenNumber(departmentId, _departmentName) {
  if (!supabaseClient || !departmentId) return null;
  try {
    const { data, error } = await supabaseClient
      .rpc('generate_next_queue_token', { p_department_id: departmentId });
    if (error) {
      console.warn("Failed to generate token via database function:", error.message);
      // Fallback: count-based approach
      const initials = await getDepartmentInitials(departmentId);
      const prefix = initials || "Q";
      const { count } = await supabaseClient
        .from("queue_entries")
        .select("*", { count: "exact", head: true })
        .eq("department_id", departmentId)
        .gte("joined_at", startOfTodayIso());
      const sequence = String((count || 0) + 1).padStart(3, "0");
      return `${prefix}${sequence}`;
    }
    return data;
  } catch (e) {
    console.warn("Could not generate token:", e.message);
    return null;
  }
}

async function getDepartmentInitials(departmentId) {
  try {
    var result = await supabaseClient
      .from("departments")
      .select("initials")
      .eq("id", departmentId)
      .single();
    if (!result.error && result.data && result.data.initials) {
      return result.data.initials;
    }
  } catch (e) {
    console.warn("Could not fetch department initials:", e.message);
  }
  return null;
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  const original = btn.textContent;
  btn.textContent = "Joining…";
  btn.disabled = true;

  try {
    if (!supabaseClient) throw new Error("Supabase is not configured.");
    const patient = await getCurrentPatient();
    if (!patient) {
      window.location.href = getLoginUrl();
      return;
    }

    const { id: departmentId, name: departmentName } = getSelectedDepartment();
    const reason = document.getElementById("reason").value.trim();
    if (!departmentId) throw new Error("Please select a department.");

    const tokenNo = await generateTokenNumber(departmentId, departmentName);
    const { count } = await supabaseClient
      .from("queue_entries")
      .select("*", { count: "exact", head: true })
      .eq("department_id", departmentId)
      .eq("status", "waiting");

    const expectedWaitMinutes = Math.max(
      AVERAGE_MINUTES_PER_PATIENT,
      (count || 0) * AVERAGE_MINUTES_PER_PATIENT
    );

    const { data, error } = await supabaseClient
      .from("queue_entries")
      .insert([
        {
          token_no: tokenNo,
          patient_id: patient.id,
          department_id: departmentId,
          status: "waiting",
          type: "walk-in",
          reason,
          expected_wait_minutes: expectedWaitMinutes,
          joined_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Create notification for the patient
    try {
      await supabaseClient.from("notifications").insert({
        patient_id: patient.id,
        title: "Joined Queue",
        body: `You have joined the queue for ${departmentName}. Your token number is ${data.token_no}.`,
        category: "queue",
        icon: "📡",
        unread: true,
      });
    } catch (notifErr) {
      console.warn("Failed to create notification:", notifErr.message);
    }

    alert(`You have joined the queue. Your token number is ${data.token_no}.`);
    window.location.href = "queue-status.html";
  } catch (err) {
    alert(err.message || "Unable to join the queue. Please try again.");
    console.error(err);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadDepartments();
  await updateSummary();
  document.getElementById("department")?.addEventListener("change", updateSummary);
  document.getElementById("join-form")?.addEventListener("submit", handleSubmit);
});
