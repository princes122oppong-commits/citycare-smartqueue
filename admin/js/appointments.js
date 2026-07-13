/* ============================================================
   appointments.js - live Supabase appointments
   ============================================================ */

let allAppointments = [];

async function loadAppointments() {
  const [appointmentRows, departmentRows, patientRows] = await Promise.all([
    fetchTable("appointments", {
      select: "id,scheduled_at,type,status,patient_id,department_id",
      order: { column: "scheduled_at", ascending: true },
    }),
    fetchTable("departments", { select: "id,name" }),
    fetchTable("patients", { select: "id,full_name" }),
  ]);

  const departmentMap = Object.fromEntries(departmentRows.map((row) => [row.id, row.name]));
  const patientMap = Object.fromEntries(patientRows.map((row) => [row.id, row.full_name]));

  allAppointments = appointmentRows.map((row) => ({
    id: row.id,
    patient: patientMap[row.patient_id] || "Unknown",
    department: departmentMap[row.department_id] || "Unassigned",
    scheduled_at: row.scheduled_at,
    datetime: formatDisplayDateTime(row.scheduled_at),
    type: row.type || "Consultation",
    status: row.status || "Pending",
  }));
  renderTable();
}

function renderTable() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const type = document.getElementById("typeFilter").value;
  const status = document.getElementById("statusFilter").value;

  const rows = allAppointments.filter((a) => {
    const matchesSearch = !search || a.patient.toLowerCase().includes(search) || a.id.toLowerCase().includes(search);
    const matchesType = !type || a.type === type;
    const matchesStatus = !status || a.status === status;
    return matchesSearch && matchesType && matchesStatus;
  });

  const body = document.getElementById("appointmentsTableBody");
  body.innerHTML = rows.length
    ? rows.map((a) => `
      <tr data-id="${a.id}">
        <td>${escapeHtml(a.id)}</td>
        <td>${escapeHtml(a.patient)}</td>
        <td>${escapeHtml(a.department)}</td>
        <td>${escapeHtml(a.datetime)}</td>
        <td>${escapeHtml(a.type)}</td>
        <td><span class="pill pill--${statusClass(a.status)}">${escapeHtml(a.status)}</span></td>
        <td class="row-actions">
          <button data-action="cancel" title="Cancel">Cancel</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">No appointments found.</td></tr>`;
}

async function handleTableClick(e) {
  const row = e.target.closest("tr[data-id]");
  if (!row || e.target.dataset.action !== "cancel") return;
  const id = row.dataset.id;
  const appt = allAppointments.find((a) => a.id === id);
  if (!appt || !confirm(`Cancel appointment ${id} for ${appt.patient}?`)) return;

  const { error } = await supabaseClient.from("appointments").update({ status: "Cancelled" }).eq("id", id);
  if (error) {
    console.error(error.message);
    alert(`Unable to cancel appointment: ${error.message}`);
    return;
  }
  await loadAppointments();
}

function subscribeToRealtimeUpdates() {
  if (!supabaseClient?.channel) return;
  supabaseClient
    .channel("admin-appointments-realtime")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "appointments" },
      function() { loadAppointments(); }
    )
    .subscribe();
}

function initAppointmentsPage() {
  loadAppointments();
  subscribeToRealtimeUpdates();
  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("typeFilter").addEventListener("change", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);
  document.getElementById("appointmentsTableBody").addEventListener("click", handleTableClick);
}

document.addEventListener("DOMContentLoaded", initAppointmentsPage);
