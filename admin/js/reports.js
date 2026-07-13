/* ============================================================
   reports.js - live Supabase reports
   ============================================================ */

const STATUS_COLORS = {
  served: "#2f5fe0",
  waiting: "#f0973b",
  now_serving: "#8b5cf6",
  skipped: "#e0453d",
  cancelled: "#6b7280",
};

function getReportStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function dayLabel(key) {
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildLastSevenDayKeys() {
  const start = getReportStartDate();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function averageWait(rows) {
  const values = rows.map((row) => Number(row.expected_wait_minutes) || 0).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function loadReportRows() {
  return fetchTable("queue_entries", {
    select: "status,joined_at,expected_wait_minutes,department_id",
    gte: { joined_at: getReportStartDate().toISOString() },
    order: { column: "joined_at", ascending: true },
  });
}

async function loadReportStats(rows) {
  const start = getReportStartDate().toISOString();
  const totalPatients = await countTable("patients");
  const appointments = await countTable("appointments", (query) => query.gte("scheduled_at", start));
  const served = rows.filter((row) => row.status === "served").length;
  const left = rows.filter((row) => ["skipped", "cancelled"].includes(row.status)).length;

  document.getElementById("statTotalPatients").textContent = totalPatients.toLocaleString();
  document.getElementById("statAvgWait").textContent = formatMinutes(averageWait(rows));
  document.getElementById("statServed").textContent = served.toLocaleString();
  document.getElementById("statLeft").textContent = left.toLocaleString();
  document.getElementById("statAppointments").textContent = appointments.toLocaleString();
}

function loadDepartmentPerformance(rows, departmentMap = {}) {
  const grouped = rows.reduce((acc, row) => {
    const name = departmentMap[row.department_id] || "Unassigned";
    if (!acc[name]) acc[name] = [];
    acc[name].push(row);
    return acc;
  }, {});

  const data = Object.entries(grouped).map(([department, departmentRows]) => {
    const served = departmentRows.filter((row) => row.status === "served").length;
    const left = departmentRows.filter((row) => ["skipped", "cancelled"].includes(row.status)).length;
    return {
      department,
      total: departmentRows.length,
      served,
      avg_wait: averageWait(departmentRows),
      left,
      satisfaction: departmentRows.length ? Math.round((served / departmentRows.length) * 100) : 0,
    };
  }).sort((a, b) => b.total - a.total);

  const body = document.getElementById("departmentPerformanceBody");
  body.innerHTML = data.length
    ? data.map((d) => `
      <tr>
        <td>${escapeHtml(d.department)}</td>
        <td>${d.total}</td>
        <td>${d.served}</td>
        <td>${formatMinutes(d.avg_wait)}</td>
        <td>${d.left}</td>
        <td>${d.satisfaction}%</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">No queue data found for this report period.</td></tr>`;
}

function renderQueueVolumeChart(rows) {
  const keys = buildLastSevenDayKeys();
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  rows.forEach((row) => {
    const key = dayKey(row.joined_at);
    if (key in counts) counts[key] += 1;
  });

  new Chart(document.getElementById("queueVolumeChart"), {
    type: "line",
    data: {
      labels: keys.map(dayLabel),
      datasets: [{ label: "Patients", data: keys.map((key) => counts[key]), borderColor: "#2f5fe0", backgroundColor: "rgba(47,95,224,0.08)", fill: true, tension: 0.4 }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

function renderAvgWaitChart(rows) {
  const keys = buildLastSevenDayKeys();
  const buckets = Object.fromEntries(keys.map((key) => [key, []]));
  rows.forEach((row) => {
    const key = dayKey(row.joined_at);
    if (key in buckets) buckets[key].push(row);
  });

  new Chart(document.getElementById("avgWaitChart"), {
    type: "bar",
    data: {
      labels: keys.map(dayLabel),
      datasets: [{ label: "Avg. Wait (mins)", data: keys.map((key) => averageWait(buckets[key])), backgroundColor: "#2f5fe0", borderRadius: 6 }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

function renderStatusDistChart(rows) {
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const colors = labels.map((label) => STATUS_COLORS[label] || "#6b7280");

  new Chart(document.getElementById("statusDistChart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { display: false } }, cutout: "70%" },
  });

  const total = values.reduce((a, b) => a + b, 0);
  document.getElementById("statusDistLegend").innerHTML = total
    ? labels.map((label, i) => {
      const pct = Math.round((values[i] / total) * 100);
      return `<li><i class="dot" style="background:${colors[i]}"></i>${escapeHtml(label)}<b>${values[i].toLocaleString()} (${pct}%)</b></li>`;
    }).join("")
    : "<li>No queue data yet.</li>";
}

function exportCsv(rows, departmentMap = {}) {
  const header = "Department,Status,Joined At,Expected Wait Minutes";
  const lines = rows.map((row) => [
    departmentMap[row.department_id] || "Unassigned",
    row.status || "",
    row.joined_at || "",
    row.expected_wait_minutes || 0,
  ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "smartqueue-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function subscribeToRealtimeUpdates() {
  if (!supabaseClient?.channel) return;
  supabaseClient
    .channel("admin-reports-realtime")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "queue_entries" },
      function() { initReportsPage(); }
    )
    .subscribe();
}

async function initReportsPage() {
  const [rows, departments] = await Promise.all([
    loadReportRows(),
    fetchTable("departments", { select: "id,name" }),
  ]);
  const departmentMap = Object.fromEntries(departments.map((row) => [row.id, row.name]));
  const keys = buildLastSevenDayKeys();
  document.getElementById("dateRangeLabel").firstChild.textContent = `${dayLabel(keys[0])} - ${dayLabel(keys[keys.length - 1])} `;
  await loadReportStats(rows);
  loadDepartmentPerformance(rows, departmentMap);
  renderQueueVolumeChart(rows);
  renderAvgWaitChart(rows);
  renderStatusDistChart(rows);
  document.getElementById("exportBtn").addEventListener("click", () => exportCsv(rows, departmentMap));
}

document.addEventListener("DOMContentLoaded", function() {
  initReportsPage();
  subscribeToRealtimeUpdates();
});
