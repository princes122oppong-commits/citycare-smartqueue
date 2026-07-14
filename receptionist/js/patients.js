/* ==========================================================================
   Patients page logic — live Supabase patient records.
   ========================================================================== */

let allPatients = [];

document.addEventListener("DOMContentLoaded", () => {
  const deptFilter = document.getElementById("dept-filter");
  const searchInput = document.getElementById("patient-search");
  const addPatientBtn = document.getElementById("add-patient-btn");

  if (!deptFilter || !searchInput || !addPatientBtn) return;

  loadPatients();
  subscribeToTokenUpdates(() => loadPatients());

  deptFilter.addEventListener("change", renderPatientsTable);
  searchInput.addEventListener("input", renderPatientsTable);
  addPatientBtn.addEventListener("click", () => {
    window.location.href = "walkin-registration.html";
  });
});

function renderPatientsTable() {
  const tbody = document.getElementById("patients-table-body");
  if (!tbody) return;

  const deptFilter = document.getElementById("dept-filter");
  const searchInput = document.getElementById("patient-search");

  const dept = deptFilter?.value || "All Departments";
  const term = searchInput?.value.trim().toLowerCase() || "";

  const filteredRows = allPatients.filter((row) => {
    const matchesDept = dept === "All Departments" || row.department === dept;
    const matchesSearch = !term || [row.id, row.name, row.phone, row.department, row.lastVisit, row.status].join(" ").toLowerCase().includes(term);
    return matchesDept && matchesSearch;
  });

  tbody.innerHTML = filteredRows.length
    ? filteredRows.map((row) => `
        <tr>
          <td class="cell-primary">${escapereceptionistHtml(row.id)}</td>
          <td>${escapereceptionistHtml(row.name)}</td>
          <td>${escapereceptionistHtml(row.phone)}</td>
          <td>${escapereceptionistHtml(row.department)}</td>
          <td class="cell-muted">${escapereceptionistHtml(row.lastVisit)}</td>
          <td><span class="badge ${receptionistBadgeClass(row.status)}">${escapereceptionistHtml(row.statusLabel)}</span></td>
          <td><button class="icon-action" aria-label="View">${viewIcon()}</button></td>
        </tr>
      `).join("")
    : `<tr><td colspan="7">No patients found.</td></tr>`;
}

async function loadPatients() {
  if (!supabaseClient) return;

  const [patientResult, departmentResult, queueResult] = await Promise.all([
    supabaseClient
      .from("patients")
      .select("id, full_name, phone, created_at")
      .order("created_at", { ascending: false }),
    supabaseClient.from("departments").select("id, name"),
    supabaseClient
      .from("queue_entries")
      .select("patient_id, status, joined_at, department_id")
      .order("joined_at", { ascending: false }),
  ]);

  if (patientResult.error) {
    console.error("Failed to load patients:", patientResult.error);
    return;
  }

  if (departmentResult.error) {
    console.error("Failed to load departments:", departmentResult.error.message);
    return;
  }

  if (queueResult.error) {
    console.error("Failed to load queue entries:", queueResult.error.message);
    return;
  }

  const departmentMap = Object.fromEntries((departmentResult.data || []).map((row) => [row.id, row.name]));
  const latestQueueByPatient = {};
  (queueResult.data || []).forEach((row) => {
    if (!latestQueueByPatient[row.patient_id]) {
      latestQueueByPatient[row.patient_id] = row;
    }
  });

  allPatients = (patientResult.data || []).map((row) => {
    const latestQueue = latestQueueByPatient[row.id];
    return {
      id: row.id,
      name: row.full_name,
      phone: row.phone,
      department: departmentMap[latestQueue?.department_id] || "Unassigned",
      lastVisit: formatreceptionistDate(latestQueue?.joined_at || row.created_at),
      status: latestQueue?.status || "No Visit",
      statusLabel: latestQueue?.status ? String(latestQueue.status).replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase()) : "No Visit",
    };
  });

  renderPatientsTable();
}

function viewIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}
