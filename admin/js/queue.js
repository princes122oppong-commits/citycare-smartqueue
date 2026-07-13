/* ============================================================
   queue.js - live Supabase queue management
   ============================================================ */

let allQueues = [];

function averageWait(rows) {
  const values = rows.map((row) => Number(row.expected_wait_minutes) || 0).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeDepartmentQueue(department, entries) {
  const active = entries.filter((entry) => ["waiting", "now_serving"].includes(entry.status));
  const serving = active.find((entry) => entry.status === "now_serving");
  const waiting = active.filter((entry) => entry.status === "waiting");
  const current = serving || waiting[0];
  const next = waiting.filter((entry) => entry.id !== current?.id).slice(0, 3);

  return {
    department: department.name,
    current_token: current?.token_no || "-",
    in_queue: active.length,
    next_tokens: next.length ? next.map((entry) => entry.token_no).join(", ") : "-",
    avg_wait: averageWait(active),
    status: department.status || (active.length > 10 ? "Busy" : "Normal"),
  };
}

async function loadQueues() {
  document.getElementById("dateLabel").firstChild.textContent = formatDisplayDate() + " ";
  const [departments, entries] = await Promise.all([
    fetchTable("departments", { order: { column: "name", ascending: true } }),
    fetchTable("queue_entries", {
      select: "id,token_no,department_id,status,expected_wait_minutes,joined_at",
      in: { status: ["waiting", "now_serving"] },
      order: { column: "joined_at", ascending: true },
    }),
  ]);

  allQueues = departments.map((department) =>
    summarizeDepartmentQueue(department, entries.filter((entry) => entry.department_id === department.id))
  );
  populateDepartmentFilter();
  renderTable();
}

function populateDepartmentFilter() {
  const select = document.getElementById("departmentFilter");
  const current = select.value;
  const names = allQueues.map((q) => q.department);
  select.innerHTML = `<option value="">All Departments</option>` + names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (names.includes(current)) select.value = current;
}

function renderTable() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const dept = document.getElementById("departmentFilter").value;

  const rows = allQueues.filter((q) => {
    const matchesSearch = !search || q.department.toLowerCase().includes(search) || q.current_token.toLowerCase().includes(search);
    const matchesDept = !dept || q.department === dept;
    return matchesSearch && matchesDept;
  });

  const body = document.getElementById("queueTableBody");
  body.innerHTML = rows.length
    ? rows.map((q) => `
      <tr>
        <td>${escapeHtml(q.department)}</td>
        <td><strong>${escapeHtml(q.current_token)}</strong></td>
        <td>${q.in_queue}</td>
        <td>${escapeHtml(q.next_tokens)}</td>
        <td>${formatMinutes(q.avg_wait)}</td>
        <td><span class="pill pill--${statusClass(q.status)}">${escapeHtml(q.status)}</span></td>
        <td class="row-actions">
          <button title="Refresh queue" data-action="refresh">Refresh</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">No live queue data found.</td></tr>`;
}

function subscribeToQueueChanges() {
  if (!supabaseClient?.channel) return;
  supabaseClient
    .channel("admin-queue-management")
    .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, loadQueues)
    .subscribe();
}

function initQueuePage() {
  loadQueues();
  subscribeToQueueChanges();
  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("departmentFilter").addEventListener("change", renderTable);
  document.getElementById("queueTableBody").addEventListener("click", (event) => {
    if (event.target.dataset.action === "refresh") loadQueues();
  });
}

document.addEventListener("DOMContentLoaded", initQueuePage);
