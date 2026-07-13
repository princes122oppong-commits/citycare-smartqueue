/* ==========================================================================
   Staff dashboard - live Supabase data.
   ========================================================================== */

let queueOverviewChart = null;
let deptSummaryChart = null;

document.addEventListener("DOMContentLoaded", () => {
  loadStaffDashboard();
  subscribeToTokenUpdates(loadStaffDashboard);
});

async function fetchDashboardQueueRows() {
  const [queueResult, departmentResult, patientResult] = await Promise.all([
    supabaseClient
      .from("queue_entries")
      .select("id, token_no, status, joined_at, updated_at, served_at, called_at, expected_wait_minutes, patient_id, department_id")
      .order("joined_at", { ascending: true }),
    supabaseClient.from("departments").select("id, name"),
    supabaseClient.from("patients").select("id, full_name"),
  ]);

  if (queueResult.error) {
    console.error("Failed to load dashboard queue:", queueResult.error.message);
    return [];
  }

  const departmentMap = Object.fromEntries((departmentResult.data || []).map((row) => [row.id, row.name]));
  const patientMap = Object.fromEntries((patientResult.data || []).map((row) => [row.id, row.full_name]));

  return (queueResult.data || []).map((row) => ({
    ...row,
    patients: { full_name: patientMap[row.patient_id] || "Unknown patient" },
    departments: { name: departmentMap[row.department_id] || "Unassigned" },
  }));
}

function setStatCards(rows) {
  const waiting = rows.filter((row) => row.status === "waiting");
  const serving = rows.filter((row) => row.status === "now_serving");
  const today = new Date().toISOString().slice(0, 10);
  const servedToday = rows.filter((row) => row.status === "served" && (row.served_at || "").startsWith(today));
  const activeWaits = rows.filter((row) => ["waiting", "now_serving"].includes(row.status));
  const avg = activeWaits.length
    ? Math.round(activeWaits.reduce((sum, row) => sum + (Number(row.expected_wait_minutes) || minutesSince(row.joined_at)), 0) / activeWaits.length)
    : 0;
  const cards = document.querySelectorAll(".stat-card .stat-value");
  if (cards[0]) cards[0].textContent = waiting.length;
  if (cards[1]) cards[1].textContent = serving.length;
  if (cards[2]) cards[2].textContent = servedToday.length;
  if (cards[3]) cards[3].innerHTML = `${avg} <span class="unit">min</span>`;
}

function renderSnapshot(rows) {
  const list = document.querySelector(".snapshot-list");
  if (!list) return;
  const active = rows.filter((row) => ["waiting", "now_serving"].includes(row.status)).slice(0, 5);
  list.innerHTML = active.length
    ? active.map((row) => {
      var deptName = typeof escapeHtml === "function" ? escapeHtml(row.departments?.name || "Unassigned") : row.departments?.name || "Unassigned";
      var tokenNo = typeof escapeHtml === "function" ? escapeHtml(row.token_no) : row.token_no;
      return '<li>' +
        '<div class="snap-token">' + tokenNo + '</div>' +
        '<div class="snap-dept">' + deptName + '</div>' +
        '<div class="snap-status ' + (row.status === "now_serving" ? "now-serving" : "wait-mid") + '">' +
        (row.status === "now_serving" ? "Now Serving" : minutesSince(row.joined_at) + " min") +
        '</div></li>';
    }).join("")
    : '<li><div class="snap-dept">No active queue entries.</div></li>';
}

function renderRecentActivity(rows) {
  const body = document.getElementById("recent-activity-body");
  if (!body) return;
  const recent = [...rows].sort((a, b) => new Date(b.updated_at || b.joined_at) - new Date(a.updated_at || a.joined_at)).slice(0, 5);
  body.innerHTML = recent.length
    ? recent.map((row) => {
      var tokenNo = typeof escapeHtml === "function" ? escapeHtml(row.token_no) : row.token_no;
      var patientName = typeof escapeHtml === "function" ? escapeHtml(row.patients?.full_name || "Unknown") : row.patients?.full_name || "Unknown";
      var deptName = typeof escapeHtml === "function" ? escapeHtml(row.departments?.name || "Unassigned") : row.departments?.name || "Unassigned";
      var status = typeof escapeHtml === "function" ? escapeHtml(row.status) : row.status;
      return '<tr>' +
        '<td class="cell-primary">' + tokenNo + '</td>' +
        '<td>' + patientName + '</td>' +
        '<td>' + deptName + '</td>' +
        '<td><span class="badge ' + staffBadgeClass(row.status) + '">' + status + '</span></td>' +
        '<td class="cell-muted">' + minutesSince(row.joined_at) + ' min</td>' +
        '</tr>';
    }).join("")
    : '<tr><td colspan="5">No queue activity yet.</td></tr>';
}

function renderQueueOverviewChart(rows) {
  const ctx = document.getElementById("queueOverviewChart");
  if (!ctx || typeof Chart === "undefined") return;
  const labels = ["00:00", "06:00", "12:00", "18:00"];
  const waiting = [0, 0, 0, 0];
  const serving = [0, 0, 0, 0];
  rows.forEach((row) => {
    const index = Math.min(3, Math.floor(new Date(row.joined_at).getHours() / 6));
    if (row.status === "waiting") waiting[index] += 1;
    if (row.status === "now_serving" || row.status === "served") serving[index] += 1;
  });
  if (queueOverviewChart) queueOverviewChart.destroy();
  queueOverviewChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Waiting", data: waiting, borderColor: "#2f6fed", backgroundColor: "rgba(47,111,237,0.08)", tension: 0.4, fill: true, pointRadius: 3 },
        { label: "Being Served", data: serving, borderColor: "#1c9a5b", backgroundColor: "rgba(28,154,91,0.06)", tension: 0.4, fill: true, pointRadius: 3 },
      ],
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } },
  });
}

function renderDepartmentSummaryChart(rows) {
  const ctx = document.getElementById("deptSummaryChart");
  const legend = document.querySelector(".dept-legend");
  if (!ctx || typeof Chart === "undefined") return;
  const active = rows.filter((row) => ["waiting", "now_serving"].includes(row.status));
  const counts = active.reduce((acc, row) => {
    const name = row.departments?.name || "Unassigned";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const colors = ["#1c9a5b", "#7b4fe0", "#e08a1e", "#2f6fed", "#d0393f", "#64748b"];
  if (deptSummaryChart) deptSummaryChart.destroy();
  deptSummaryChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => colors[i % colors.length]), borderWidth: 0 }] },
    options: { cutout: "68%", plugins: { legend: { display: false } } },
  });
  if (legend) {
    legend.innerHTML = labels.length
      ? labels.map((label, i) => `<li><i class="dot" style="background:${colors[i % colors.length]}"></i>${escapeStaffHtml(label)} <span>${values[i]}</span></li>`).join("")
      : "<li>No department queue data yet.</li>";
  }
}

async function loadStaffDashboard() {
  const rows = await fetchDashboardQueueRows();
  setStatCards(rows);
  renderSnapshot(rows);
  renderRecentActivity(rows);
  renderQueueOverviewChart(rows);
  renderDepartmentSummaryChart(rows);
}
