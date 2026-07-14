/* ============================================================
   departments.js - live Supabase departments
   ============================================================ */

let allDepartments = [];
let editingDeptId = null;

function averageWait(rows) {
  const values = rows.map((row) => Number(row.expected_wait_minutes) || 0).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function loadDepartments() {
  const [departments, queueRows] = await Promise.all([
    fetchTable("departments", { order: { column: "name", ascending: true } }),
    fetchTable("queue_entries", {
      select: "department_id,status,expected_wait_minutes",
      in: { status: ["waiting", "now_serving"] },
    }),
  ]);

  allDepartments = departments.map((department) => {
    const entries = queueRows.filter((entry) => entry.department_id === department.id);
    return {
      id: department.id,
      name: department.name || "Unnamed",
      initials: department.initials || "",
      description: department.description || "",
      in_queue: entries.length,
      avg_wait: averageWait(entries),
      status: department.status || "Active",
    };
  });

  renderTable();
}

function renderTable() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const rows = allDepartments.filter((d) =>
    !search || d.name.toLowerCase().includes(search) || d.description.toLowerCase().includes(search) || (d.initials || "").toLowerCase().includes(search)
  );

  const body = document.getElementById("departmentsTableBody");
  body.innerHTML = rows.length
    ? rows.map((d) => `
      <tr data-id="${d.id}">
        <td>${escapeHtml(d.name)}</td>
        <td><span class="pill pill--info">${escapeHtml(d.initials)}</span></td>
        <td>${escapeHtml(d.description)}</td>
        <td>${d.in_queue}</td>
        <td>${formatMinutes(d.avg_wait)}</td>
        <td><span class="pill pill--${statusClass(d.status)}">${escapeHtml(d.status)}</span></td>
        <td class="row-actions">
          <button data-action="edit" title="Edit">Edit</button>
          <button data-action="delete" title="Delete">Delete</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">No departments found.</td></tr>`;
}

function openModal(dept = null) {
  editingDeptId = dept ? dept.id : null;
  document.getElementById("modalTitle").textContent = dept ? "Edit Department" : "Add Department";
  document.getElementById("fieldName").value = dept?.name || "";
  document.getElementById("fieldInitials").value = dept?.initials || "";
  document.getElementById("fieldDescription").value = dept?.description || "";
  document.getElementById("fieldStatus").value = dept?.status || "Active";
  document.getElementById("deptModal").hidden = false;
}

function closeModal() {
  document.getElementById("deptModal").hidden = true;
  document.getElementById("deptForm").reset();
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById("fieldName").value.trim(),
    initials: document.getElementById("fieldInitials").value.trim().toUpperCase(),
    description: document.getElementById("fieldDescription").value.trim(),
    status: document.getElementById("fieldStatus").value,
  };

  if (!payload.name) return;
  if (!payload.initials) {
    alert("Please enter department initials (e.g., GM, LS, PED).");
    return;
  }

  const request = editingDeptId
    ? supabaseClient.from("departments").update(payload).eq("id", editingDeptId)
    : supabaseClient.from("departments").insert([payload]);

  const { error } = await request;
  if (error) {
    console.error(error.message);
    alert(`Unable to save department: ${error.message}`);
    return;
  }

  closeModal();
  await loadDepartments();
}

async function handleTableClick(e) {
  const row = e.target.closest("tr[data-id]");
  if (!row) return;
  const id = Number(row.dataset.id);
  const dept = allDepartments.find((d) => d.id === id);
  if (!dept) return;

  if (e.target.dataset.action === "edit") {
    openModal(dept);
  } else if (e.target.dataset.action === "delete") {
    if (!confirm(`Deactivate the "${dept.name}" department?\n\nThis will set the department to "Inactive" so it won't appear in dropdowns. Existing queue entries and appointments will be preserved.\n\nAre you sure?`)) return;

    try {
      const deptResult = await supabaseClient
        .from("departments")
        .update({ status: "Inactive" })
        .eq("id", id);

      if (deptResult.error) {
        alert(`Unable to deactivate department: ${deptResult.error.message}`);
        return;
      }

      await loadDepartments();
    } catch (err) {
      alert(`Unable to deactivate department: ${err.message}`);
    }
  }
}

function subscribeToRealtimeUpdates() {
  if (!supabaseClient?.channel) return;
  supabaseClient
    .channel("admin-departments-realtime")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "queue_entries" },
      function() { loadDepartments(); }
    )
    .subscribe();
}

function initDepartmentsPage() {
  loadDepartments();
  subscribeToRealtimeUpdates();
  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("departmentsTableBody").addEventListener("click", handleTableClick);
  document.getElementById("addDeptBtn").addEventListener("click", () => openModal());
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  document.getElementById("cancelModalBtn").addEventListener("click", closeModal);
  document.getElementById("deptForm").addEventListener("submit", handleFormSubmit);
}

document.addEventListener("DOMContentLoaded", initDepartmentsPage);