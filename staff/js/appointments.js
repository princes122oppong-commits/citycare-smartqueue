/* ==========================================================================
   Appointments page logic — live Supabase appointments.
   ========================================================================== */

let allAppointments = [];

document.addEventListener("DOMContentLoaded", () => {
  const deptFilter = document.getElementById("dept-filter");
  const statusFilter = document.getElementById("status-filter");
  const searchInput = document.getElementById("appt-search");

  if (!deptFilter || !statusFilter || !searchInput) return;

  loadAppointments();
  subscribeToRealtimeUpdates();

  deptFilter.addEventListener("change", renderAppointmentsTable);
  statusFilter.addEventListener("change", renderAppointmentsTable);
  searchInput.addEventListener("input", renderAppointmentsTable);
});

function renderAppointmentsTable() {
  const tbody = document.getElementById("appt-table-body");
  if (!tbody) return;

  const deptFilter = document.getElementById("dept-filter");
  const statusFilter = document.getElementById("status-filter");
  const searchInput = document.getElementById("appt-search");

  const dept = deptFilter?.value || "All Departments";
  const status = statusFilter?.value || "All Status";
  const term = searchInput?.value.trim().toLowerCase() || "";

  const filteredRows = allAppointments.filter((row) => {
    const matchesDept = dept === "All Departments" || row.department === dept;
    const matchesStatus = status === "All Status" || row.statusLabel === status;
    const matchesSearch = !term || [row.id, row.patientName, row.department, row.statusLabel].join(" ").toLowerCase().includes(term);
    return matchesDept && matchesStatus && matchesSearch;
  });

  tbody.innerHTML = filteredRows.length
    ? filteredRows.map((row) => `
        <tr>
          <td class="cell-primary">${escapereceptionistHtml(row.id)}</td>
          <td>${escapereceptionistHtml(row.patientName)}</td>
          <td>${escapereceptionistHtml(row.department)}</td>
          <td class="cell-muted">${escapereceptionistHtml(row.scheduledAt)}</td>
          <td><span class="badge ${receptionistBadgeClass(row.status)}">${escapereceptionistHtml(row.statusLabel)}</span></td>
          <td><button class="icon-action" aria-label="View">${viewIcon()}</button></td>
        </tr>
      `).join("")
    : `<tr><td colspan="6">No appointments found.</td></tr>`;
}

async function loadAppointments() {
  if (!supabaseClient) return;

  const [appointmentResult, departmentResult, patientResult] = await Promise.all([
    supabaseClient
      .from("appointments")
      .select("id, scheduled_at, type, status, patient_id, department_id")
      .order("scheduled_at", { ascending: true }),
    supabaseClient.from("departments").select("id, name"),
    supabaseClient.from("patients").select("id, full_name"),
  ]);

  if (appointmentResult.error) {
    console.error("Failed to load appointments:", appointmentResult.error);
    return;
  }

  if (departmentResult.error) {
    console.error("Failed to load departments:", departmentResult.error.message);
    return;
  }

  if (patientResult.error) {
    console.error("Failed to load patients:", patientResult.error.message);
    return;
  }

  const departmentMap = Object.fromEntries((departmentResult.data || []).map((row) => [row.id, row.name]));
  const patientMap = Object.fromEntries((patientResult.data || []).map((row) => [row.id, row.full_name]));

  allAppointments = (appointmentResult.data || []).map((row) => ({
    id: row.id,
    patientName: patientMap[row.patient_id] || "Unknown patient",
    department: departmentMap[row.department_id] || "Unassigned",
    scheduledAt: formatreceptionistDateTime(row.scheduled_at),
    status: row.status || "pending",
    statusLabel: String(row.status || "pending").replace(/^./, (char) => char.toUpperCase()),
  }));

  renderAppointmentsTable();
}

function subscribeToRealtimeUpdates() {
  if (!supabaseClient?.channel) return;
  
  try {
    supabaseClient
      .channel("receptionist-appointments-realtime")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        function(payload) { 
          console.log("Appointment change detected:", payload);
          loadAppointments().catch(function(err) {
            console.error("Error reloading appointments:", err);
          });
        }
      )
      .subscribe();
  } catch (error) {
    console.error("Failed to setup realtime subscription:", error);
  }
}

function viewIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}
