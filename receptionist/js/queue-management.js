/* ==========================================================================
   Queue Management — Per-department queue cards
   Each department has its own independent "Now Serving" + waiting list.
   Dynamically loads departments from the database.
   ========================================================================== */

let departmentsData = [];   // { id, name, initials, color }
let queueDataByDept = {};   // { [deptId]: [queueRows...] }
const DEPT_COLORS = [
  "#1c9a5b", "#7b4fe0", "#e08a1e", "#2f6fed", "#d0393f",
  "#0d9488", "#9333ea", "#dc2626", "#2563eb", "#ca8a04",
];

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("dept-queue-container");
  if (!container) return;

  // Load departments
  await loadDepartments();

  if (departmentsData.length === 0) {
    container.innerHTML = '<p style="padding:40px;text-align:center;color:var(--gray-500);">No active departments found. Create departments in the admin panel.</p>';
    return;
  }

  // Load initial queue data
  await loadAllQueueData();
  renderAllDepartmentCards();

  // Subscribe to realtime changes
  subscribeToQueueChanges();
});

async function loadDepartments() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("departments")
    .select("id, name, initials")
    .eq("status", "Active")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load departments:", error.message);
    return;
  }

  departmentsData = (data || []).map((dept, i) => ({
    id: dept.id,
    name: dept.name || "Unnamed",
    initials: dept.initials || dept.name.charAt(0).toUpperCase(),
    color: DEPT_COLORS[i % DEPT_COLORS.length],
  }));
}

async function loadAllQueueData() {
  if (!supabaseClient || departmentsData.length === 0) return;

  const deptIds = departmentsData.map((d) => d.id);

  // Fetch only today's queue entries for all departments
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const { data, error } = await supabaseClient
    .from("queue_entries")
    .select("id, token_no, status, joined_at, patient_id, department_id, expected_wait_minutes")
    .in("department_id", deptIds)
    .gte("joined_at", todayIso)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("Failed to load queue data:", error.message);
    return;
  }

  // Get patient names
  const patientIds = [...new Set((data || []).map((r) => r.patient_id).filter(Boolean))];
  const patientMap = {};
  if (patientIds.length > 0) {
    const { data: patients } = await supabaseClient
      .from("patients")
      .select("id, full_name")
      .in("id", patientIds);
    if (patients) {
      patients.forEach((p) => { patientMap[p.id] = p.full_name; });
    }
  }

  // Organize queue rows by department
  queueDataByDept = {};
  departmentsData.forEach((dept) => { queueDataByDept[dept.id] = []; });

  (data || []).forEach((row) => {
    if (!queueDataByDept[row.department_id]) {
      queueDataByDept[row.department_id] = [];
    }
    queueDataByDept[row.department_id].push({
      id: row.id,
      tokenNo: row.token_no,
      patientName: patientMap[row.patient_id] || "Unknown",
      status: row.status || "waiting",
      joinedAt: row.joined_at,
      timeInQueue: formatWaitTime(row.joined_at),
      expectedWaitMinutes: Number(row.expected_wait_minutes) || 15,
    });
  });
}

function formatWaitTime(joinedAt) {
  if (!joinedAt) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(joinedAt).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function renderAllDepartmentCards() {
  const container = document.getElementById("dept-queue-container");
  if (!container) return;

  container.innerHTML = "";

  departmentsData.forEach((dept) => {
    const card = createDepartmentCard(dept);
    container.appendChild(card);
  });
}

function createDepartmentCard(dept) {
  const card = document.createElement("div");
  card.className = "dept-queue-card";
  card.id = `dept-card-${dept.id}`;
  card.dataset.deptId = dept.id;

  const rows = queueDataByDept[dept.id] || [];
  const serving = rows.find((r) => r.status === "now_serving");
  const waiting = rows.filter((r) => r.status === "waiting");

  // Header
  const header = document.createElement("div");
  header.className = "dept-queue-header";
  header.innerHTML = `
    <div class="dept-badge" style="background:${dept.color}">${escapeHtml(dept.initials)}</div>
    <div class="dept-info">
      <h4>${escapeHtml(dept.name)}</h4>
      <div class="dept-stats">
        <span>🟢 ${waiting.length} waiting</span>
        <span>🔵 ${serving ? 1 : 0} serving</span>
      </div>
    </div>
  `;
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "dept-queue-body";

  // Now Serving section
  const nowServingDiv = document.createElement("div");
  nowServingDiv.className = "dept-now-serving";
  nowServingDiv.id = `ns-${dept.id}`;

  if (serving) {
    nowServingDiv.innerHTML = `
      <div class="ns-left">
        <span class="ns-token-badge">${escapeHtml(serving.tokenNo)}</span>
        <span class="ns-patient">${escapeHtml(serving.patientName)}</span>
      </div>
      <div class="ns-actions">
        <button class="btn-served" data-dept-id="${dept.id}" data-action="complete" data-entry-id="${serving.id}">✓ Served</button>
        <button class="btn-skip" data-dept-id="${dept.id}" data-action="skip" data-entry-id="${serving.id}">Skip</button>
      </div>
    `;
  } else {
    const nextWaitingId = waiting.length > 0 ? waiting[0].id : null;
    nowServingDiv.innerHTML = `
      <div class="ns-empty">No patient being served</div>
      <div class="ns-actions">
        <button class="btn-call" data-dept-id="${dept.id}" data-action="call-next" ${nextWaitingId ? `data-entry-id="${nextWaitingId}"` : "disabled"} ${!nextWaitingId ? 'style="opacity:0.4;cursor:not-allowed;"' : ""}>▶ Call Next</button>
      </div>
    `;
  }
  body.appendChild(nowServingDiv);

  // Waiting list table
  const table = document.createElement("table");
  table.className = "dept-waiting-table";
  table.innerHTML = `
    <thead>
      <tr><th>Token</th><th>Patient</th><th>Wait Time</th></tr>
    </thead>
    <tbody id="waiting-body-${dept.id}">
      ${waiting.length > 0
        ? waiting.map((r) => `
            <tr>
              <td><strong>${escapeHtml(r.tokenNo)}</strong></td>
              <td>${escapeHtml(r.patientName)}</td>
              <td>${r.timeInQueue}</td>
            </tr>
          `).join("")
        : '<tr class="waiting-empty"><td colspan="3">No patients waiting</td></tr>'
      }
    </tbody>
  `;
  body.appendChild(table);
  card.appendChild(body);

  // Event listeners
  card.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", handleDeptAction);
  });

  return card;
}

async function handleDeptAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const deptId = Number(btn.dataset.deptId);
  const entryId = btn.dataset.entryId;

  if (!supabaseClient) return;

  try {
    if (action === "call-next") {
      await callNextForDepartment(deptId);
    } else if (action === "complete") {
      await markEntryAsServed(entryId);
    } else if (action === "skip") {
      await skipEntry(entryId);
    }
  } catch (err) {
    console.error("Queue action failed:", err);
    alert(`Action failed: ${err.message}`);
  }
}

async function callNextForDepartment(deptId) {
  const rows = queueDataByDept[deptId] || [];

  // Complete current serving if any
  const currentServing = rows.find((r) => r.status === "now_serving");
  if (currentServing) {
    const { error: completeErr } = await supabaseClient
      .from("queue_entries")
      .update({ status: "served", served_at: new Date().toISOString() })
      .eq("id", currentServing.id);
    if (completeErr) throw completeErr;
  }

  // Find next waiting patient
  const nextWaiting = rows.find((r) => r.status === "waiting");
  if (!nextWaiting) {
    alert("No patients waiting in this department.");
    return;
  }

  // Mark as now_serving
  const { error } = await supabaseClient
    .from("queue_entries")
    .update({ status: "now_serving", called_at: new Date().toISOString() })
    .eq("id", nextWaiting.id);
  if (error) throw error;

  await refreshDepartmentQueue(deptId);
}

async function markEntryAsServed(entryId) {
  const { error } = await supabaseClient
    .from("queue_entries")
    .update({ status: "served", served_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;

  // Find which department this entry belongs to
  for (const deptIdStr in queueDataByDept) {
    const deptId = Number(deptIdStr);
    const match = queueDataByDept[deptId].find((r) => r.id === entryId);
    if (match) {
      await refreshDepartmentQueue(deptId);
      break;
    }
  }
}

async function skipEntry(entryId) {
  if (!confirm("Skip this patient?")) return;

  const { error } = await supabaseClient
    .from("queue_entries")
    .update({ status: "cancelled" })
    .eq("id", entryId);
  if (error) throw error;

  // Find which department this entry belongs to
  for (const deptIdStr in queueDataByDept) {
    const deptId = Number(deptIdStr);
    const match = queueDataByDept[deptId].find((r) => r.id === entryId);
    if (match) {
      await refreshDepartmentQueue(deptId);
      break;
    }
  }
}

async function refreshDepartmentQueue(deptId) {
  // Refresh queue data for this specific department
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const { data, error } = await supabaseClient
    .from("queue_entries")
    .select("id, token_no, status, joined_at, patient_id, department_id, expected_wait_minutes")
    .eq("department_id", deptId)
    .gte("joined_at", todayIso)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("Failed to refresh queue:", error.message);
    return;
  }

  // Get patient names
  const patientIds = [...new Set((data || []).map((r) => r.patient_id).filter(Boolean))];
  const patientMap = {};
  if (patientIds.length > 0) {
    const { data: patients } = await supabaseClient
      .from("patients")
      .select("id, full_name")
      .in("id", patientIds);
    if (patients) {
      patients.forEach((p) => { patientMap[p.id] = p.full_name; });
    }
  }

  queueDataByDept[deptId] = (data || []).map((row) => ({
    id: row.id,
    tokenNo: row.token_no,
    patientName: patientMap[row.patient_id] || "Unknown",
    status: row.status || "waiting",
    joinedAt: row.joined_at,
    timeInQueue: formatWaitTime(row.joined_at),
    expectedWaitMinutes: Number(row.expected_wait_minutes) || 15,
  }));

  // Re-render just this card
  const card = document.getElementById(`dept-card-${deptId}`);
  if (card) {
    const dept = departmentsData.find((d) => d.id === deptId);
    if (dept) {
      const newCard = createDepartmentCard(dept);
      card.replaceWith(newCard);
    }
  }
}

function subscribeToQueueChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("mgmt-queue-changes")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "queue_entries" },
      async () => {
        await loadAllQueueData();
        renderAllDepartmentCards();
      }
    )
    .subscribe();
}