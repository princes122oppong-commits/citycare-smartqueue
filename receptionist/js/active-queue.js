/* ==========================================================================
   Active Queue page logic — live Supabase queue rows.
   ========================================================================== */

let activeQueueRows = [];

document.addEventListener("DOMContentLoaded", async () => {
  const deptFilter = document.getElementById("dept-filter");
  const searchInput = document.getElementById("queue-search");
  if (!deptFilter || !searchInput) return;

  // Load departments dynamically
  await loadDepartmentFilter(deptFilter);

  loadActiveQueue();
  subscribeToTokenUpdates(() => loadActiveQueue());

  deptFilter.addEventListener("change", renderActiveQueueTable);
  searchInput.addEventListener("input", renderActiveQueueTable);
});

async function loadDepartmentFilter(selectEl) {
  if (!supabaseClient) return;

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

  data.forEach((dept) => {
    const option = document.createElement("option");
    option.value = dept.name;
    option.textContent = dept.name;
    selectEl.appendChild(option);
  });
}

function getActiveQueueFilters() {
  const deptFilter = document.getElementById("dept-filter");
  const searchInput = document.getElementById("queue-search");
  return {
    dept: deptFilter?.value || "All Departments",
    term: searchInput?.value.trim().toLowerCase() || "",
  };
}

function renderActiveQueueTable() {
  const tbody = document.getElementById("queue-table-body");
  const countLabel = document.getElementById("active-queue-count");
  if (!tbody) return;

  const { dept, term } = getActiveQueueFilters();
  const filteredRows = activeQueueRows.filter((row) => {
    const matchesDept = dept === "All Departments" || row.department === dept;
    const matchesSearch = !term || [row.tokenNo, row.patientName, row.department].join(" ").toLowerCase().includes(term);
    return matchesDept && matchesSearch;
  });

  const showingFrom = filteredRows.length ? 1 : 0;
  const showingTo = filteredRows.length;
  if (countLabel) {
    countLabel.textContent = `Showing ${showingFrom} to ${showingTo} of ${activeQueueRows.length} patients`;
  }

  tbody.innerHTML = filteredRows.length
    ? filteredRows.map((row) => `
        <tr>
          <td class="cell-primary">${escapereceptionistHtml(row.tokenNo)}</td>
          <td>${escapereceptionistHtml(row.patientName)}</td>
          <td>${escapereceptionistHtml(row.department)}</td>
          <td>${escapereceptionistHtml(row.timeInQueue)}</td>
          <td><span class="badge ${receptionistBadgeClass(row.status)}">${escapereceptionistHtml(row.statusLabel)}</span></td>
          <td><button class="icon-action" aria-label="View">${viewIcon()}</button></td>
        </tr>
      `).join("")
    : `<tr><td colspan="6">No active queue entries found.</td></tr>`;
}

async function loadActiveQueue() {
  const { data, error } = await fetchWaitingTokens();
  if (error) {
    console.error("Failed to load active queue:", error);
    return;
  }

  activeQueueRows = (data || []).map((row) => ({
    id: row.id,
    tokenNo: row.token_no,
    patientName: row.patients?.full_name || "Unknown patient",
    department: row.departments?.name || "Unassigned",
    status: row.status || "waiting",
    statusLabel: row.status === "now_serving" ? "Now Serving" : "Waiting",
    timeInQueue: `${minutesSince(row.joined_at)} min`,
  }));

  renderActiveQueueTable();
}

function viewIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}
