/* ==========================================================================
   Queue Management page logic — live Supabase queue state.
   ========================================================================== */

let managementQueueRows = [];
let currentServingId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const deptFilter = document.getElementById("dept-filter");
  const searchInput = document.getElementById("mgmt-search");
  const callNextBtn = document.getElementById("call-next-btn");
  const markServedBtn = document.getElementById("mark-served-btn");

  if (!deptFilter || !searchInput || !callNextBtn || !markServedBtn) return;

  // Load departments dynamically
  await loadDepartmentFilter(deptFilter);

  loadQueueManagement();
  subscribeToTokenUpdates(() => loadQueueManagement());

  deptFilter.addEventListener("change", renderQueueManagementTable);
  searchInput.addEventListener("input", renderQueueManagementTable);
  callNextBtn.addEventListener("click", callNextPatient);
  markServedBtn.addEventListener("click", markCurrentAsServed);
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

function getManagementFilters() {
  const deptFilter = document.getElementById("dept-filter");
  const searchInput = document.getElementById("mgmt-search");
  return {
    dept: deptFilter?.value || "All Departments",
    term: searchInput?.value.trim().toLowerCase() || "",
  };
}

function renderQueueManagementTable() {
  const upcomingBody = document.getElementById("upcoming-queue-body");
  if (!upcomingBody) return;

  const { dept, term } = getManagementFilters();
  const filteredRows = managementQueueRows.filter((row) => {
    const matchesDept = dept === "All Departments" || row.department === dept;
    const matchesSearch = !term || [row.tokenNo, row.patientName, row.department].join(" ").toLowerCase().includes(term);
    return matchesDept && matchesSearch && row.status === "waiting";
  });

  const currentServing = managementQueueRows.find((row) => row.status === "now_serving");
  currentServingId = currentServing?.id || null;

  if (currentServing) {
    setNowServingView(currentServing);
  } else {
    clearNowServingView();
  }

  upcomingBody.innerHTML = filteredRows.length
    ? filteredRows.map((row) => `
        <tr>
          <td class="cell-primary">${escapereceptionistHtml(row.tokenNo)}</td>
          <td>${escapereceptionistHtml(row.patientName)}</td>
          <td>${escapereceptionistHtml(row.department)}</td>
          <td>${escapereceptionistHtml(row.timeInQueue)}</td>
          <td><span class="badge ${receptionistBadgeClass(row.status)}">${escapereceptionistHtml(row.statusLabel)}</span></td>
        </tr>
      `).join("")
    : `<tr><td colspan="5">No patients are waiting in the queue.</td></tr>`;
}

function setNowServingView(row) {
  document.getElementById("ns-token").textContent = row.tokenNo;
  document.getElementById("ns-name").textContent = row.patientName;
  document.getElementById("ns-dept").textContent = row.department;
  document.getElementById("meta-token").textContent = row.tokenNo;
  document.getElementById("meta-time").textContent = row.timeInQueue;
  document.getElementById("meta-wait").textContent = `${Math.max(row.expectedWaitMinutes || 15, 5)} mins`;
}

function clearNowServingView() {
  document.getElementById("ns-token").textContent = "—";
  document.getElementById("ns-name").textContent = "No patient being served";
  document.getElementById("ns-dept").textContent = "—";
  document.getElementById("meta-token").textContent = "—";
  document.getElementById("meta-time").textContent = "—";
  document.getElementById("meta-wait").textContent = "—";
}

async function loadQueueManagement() {
  const { data, error } = await fetchWaitingTokens();
  if (error) {
    console.error("Failed to load queue management data:", error);
    return;
  }

  managementQueueRows = (data || []).map((row) => ({
    id: row.id,
    tokenNo: row.token_no,
    patientName: row.patients?.full_name || "Unknown patient",
    department: row.departments?.name || "Unassigned",
    status: row.status || "waiting",
    statusLabel: row.status === "now_serving" ? "Now Serving" : "Waiting",
    timeInQueue: `${minutesSince(row.joined_at)} min`,
    expectedWaitMinutes: Number(row.expected_wait_minutes) || 15,
  }));

  renderQueueManagementTable();
}

async function callNextPatient() {
  if (!supabaseClient) return;

  const currentServing = managementQueueRows.find((row) => row.status === "now_serving");
  const nextWaiting = managementQueueRows.find((row) => row.status === "waiting");

  if (!nextWaiting) {
    alert("No patients left in the queue.");
    return;
  }

  if (currentServing) {
    const { error: completeError } = await supabaseClient
      .from("queue_entries")
      .update({ status: "served", served_at: new Date().toISOString() })
      .eq("id", currentServing.id);

    if (completeError) {
      console.error("Unable to complete current serving patient:", completeError);
      alert(`Queue update failed: ${completeError.message}`);
      return;
    }
  }

  const { error } = await supabaseClient
    .from("queue_entries")
    .update({ status: "now_serving", called_at: new Date().toISOString() })
    .eq("id", nextWaiting.id);

  if (error) {
    console.error("Unable to call next patient:", error);
    alert(`Queue update failed: ${error.message}`);
    return;
  }

  await loadQueueManagement();
}

async function markCurrentAsServed() {
  if (!currentServingId) {
    alert("No patient is currently being served.");
    return;
  }

  const { error } = await supabaseClient
    .from("queue_entries")
    .update({ status: "served", served_at: new Date().toISOString() })
    .eq("id", currentServingId);

  if (error) {
    console.error("Unable to mark current patient as served:", error);
    alert(`Queue update failed: ${error.message}`);
    return;
  }

  await loadQueueManagement();
}
