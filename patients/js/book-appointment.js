/* ============================================================
   Book Appointment page logic
   Loads departments dynamically from Supabase.
   ============================================================ */

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateInput(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setMinDate() {
  const dateInput = document.getElementById("date");
  if (!dateInput) return;
  const today = new Date();
  dateInput.min = formatDateInput(today);
  if (!dateInput.value) {
    dateInput.value = formatDateInput(today);
  }
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

  updateSummary();
}

function updateSummary() {
  const department = document.getElementById("department").value;
  const date = document.getElementById("date").value;
  const selectedSlot = document.querySelector(".time-slot.selected");

  document.getElementById("sum-department").textContent = department;
  document.getElementById("sum-date").textContent = date ? formatDate(date) : "—";
  document.getElementById("sum-time").textContent = selectedSlot ? selectedSlot.textContent : "—";
}

async function loadExistingAppointments() {
  const container = document.getElementById("existing-appointments");
  if (!container || !supabaseClient) return;

  const patient = await getCurrentPatient();
  if (!patient) return;

  const { data, error } = await supabaseClient
    .from("appointments")
    .select("id, department_id, scheduled_at, status, type")
    .eq("patient_id", patient.id)
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.warn("Unable to load appointments:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<div class="n-empty" style="padding:16px 4px; text-align:center; color:var(--text-400); font-size:13px;">No existing appointments.</div>`;
    return;
  }

  // Map department ids to names
  const { data: depts } = await supabaseClient
    .from("departments")
    .select("id, name");

  const deptMap = {};
  (depts || []).forEach(d => { deptMap[d.id] = d.name; });

  container.innerHTML = data.map(a => {
    const dt = new Date(a.scheduled_at);
    const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const statusClass = a.status === "Confirmed" ? "badge-success" : a.status === "Cancelled" ? "badge-danger" : "badge-warning";
    return `<div class="existing-appt-item">
      <div class="ea-icon">📅</div>
      <div class="ea-body">
        <div class="ea-title">${escapeHtml(deptMap[a.department_id] || "Department")}</div>
        <div class="ea-meta">${dateStr} · ${timeStr}</div>
      </div>
      <span class="badge ${statusClass}">${escapeHtml(a.status)}</span>
    </div>`;
  }).join("");
}

function initTimeSlots() {
  const slots = document.querySelectorAll(".time-slot");
  slots.forEach((slot, i) => {
    if (i === 1) slot.classList.add("selected"); // default: 10:00 AM
    slot.addEventListener("click", () => {
      slots.forEach(s => s.classList.remove("selected"));
      slot.classList.add("selected");
      updateSummary();
    });
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const original = btn.textContent;
  btn.textContent = 'Confirming…';
  btn.disabled = true;

  try {
    if (!supabaseClient) throw new Error('Supabase is not configured.');
    const patient = await getCurrentPatient();
    if (!patient) {
      window.location.href = getLoginUrl();
      return;
    }

    const deptSelect = document.getElementById('department');
    const selectedOption = deptSelect?.selectedOptions?.[0];
    const departmentId = selectedOption?.dataset?.deptId ? Number(selectedOption.dataset.deptId) : null;
    const date = document.getElementById('date').value;
    const selectedSlot = document.querySelector('.time-slot.selected');
    const reason = document.getElementById('reason').value.trim();

    if (!departmentId) {
      throw new Error('Please select a department.');
    }

    if (!date || !selectedSlot) {
      throw new Error('Please select a date and time.');
    }

    const scheduledAt = buildScheduledAt(date, selectedSlot.textContent);
    if (!scheduledAt) throw new Error('Invalid appointment date or time.');

    const { data, error } = await supabaseClient.from('appointments').insert([
      {
        patient_id: patient.id,
        department_id: departmentId,
        scheduled_at: scheduledAt,
        status: 'Pending',
        type: 'Consultation',
        reason,
      },
    ]).select().single();

    if (error) throw error;

    // Create notification for the patient
    try {
      await supabaseClient.from("notifications").insert({
        patient_id: patient.id,
        title: "Appointment Booked",
        body: `Your appointment for ${deptSelect.value} on ${formatDate(date)} at ${selectedSlot.textContent} has been confirmed.`,
        category: "appointments",
        icon: "📅",
        unread: true,
      });
    } catch (notifErr) {
      console.warn("Failed to create notification:", notifErr.message);
    }

    alert('Appointment confirmed.');
    window.location.href = 'patients-dashboard.html';
  } catch (err) {
    alert(err.message || 'Unable to book the appointment.');
    console.error(err);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadDepartments();
  setMinDate();
  initTimeSlots();
  updateSummary();
  await loadExistingAppointments();

  document.getElementById('department').addEventListener('change', updateSummary);
  document.getElementById('date').addEventListener('change', updateSummary);
  document.getElementById('appointment-form').addEventListener('submit', handleSubmit);
});
