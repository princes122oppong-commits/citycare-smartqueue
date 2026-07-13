/* ============================================================
   dashboard.js - live Supabase dashboard data
   ============================================================ */

const QUEUE_ACTIVE_STATUSES = ["waiting", "now_serving"];
const QUEUE_STATUS_COLORS = {
  served: "#2f5fe0",
  waiting: "#f0973b",
  now_serving: "#8b5cf6",
  skipped: "#e0453d",
  cancelled: "#6b7280",
};

document.getElementById("dateLabel").firstChild.textContent = formatDisplayDate() + " ";

function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function averageWait(rows) {
  const values = rows.map((row) => Number(row.expected_wait_minutes) || 0).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function loadStats() {
  const todayStart = startOfTodayIso();
  const todayEnd = endOfTodayIso();

  // Show loading state
  document.querySelectorAll(".stat-card__value[id]").forEach(function(el) {
    el.dataset.original = el.textContent;
    el.innerHTML = '<span class="loading-pulse">...</span>';
  });

  const [totalPatients, queueRows, appointmentsToday] = await Promise.all([
    countTable("patients"),
    fetchTable("queue_entries", {
      select: "status,expected_wait_minutes,joined_at",
      gte: { joined_at: todayStart },
      lte: { joined_at: todayEnd },
    }),
    countTable("appointments", function(query) {
      return query.gte("scheduled_at", todayStart).lte("scheduled_at", todayEnd);
    }),
  ]);

  const activeQueue = queueRows.filter(function(row) { return QUEUE_ACTIVE_STATUSES.includes(row.status); });
  document.getElementById("statTotalPatients").textContent = totalPatients;
  document.getElementById("statAvgWait").textContent = formatMinutes(averageWait(queueRows));
  document.getElementById("statInQueue").textContent = activeQueue.length;
  document.getElementById("statAppointments").textContent = appointmentsToday;
}

async function loadDepartmentStatus() {
  const [departments, queueRows] = await Promise.all([
    fetchTable("departments", { order: { column: "name", ascending: true } }),
    fetchTable("queue_entries", {
      select: "department_id,status,expected_wait_minutes",
      in: { status: QUEUE_ACTIVE_STATUSES },
    }),
  ]);

  const rows = departments.map((department) => {
    const entries = queueRows.filter((entry) => entry.department_id === department.id);
    return {
      name: department.name,
      in_queue: entries.length,
      avg_wait: averageWait(entries),
      status: department.status || (entries.length > 10 ? "Busy" : "Normal"),
    };
  });

  const body = document.getElementById("departmentStatusBody");
  body.innerHTML = rows.length
    ? rows.map((d) => `
      <tr>
        <td>${escapeHtml(d.name)}</td>
        <td>${d.in_queue}</td>
        <td>${formatMinutes(d.avg_wait)}</td>
        <td><span class="pill pill--${statusClass(d.status)}">${escapeHtml(d.status)}</span></td>
      </tr>
    `).join("")
    : emptyRow(4, "No departments found.");
}

async function loadRecentQueue() {
  const [queueRows, departments, patients] = await Promise.all([
    fetchTable("queue_entries", {
      select: "token_no,status,joined_at,department_id,patient_id",
      order: { column: "joined_at", ascending: false },
      limit: 5,
    }),
    fetchTable("departments", { select: "id,name" }),
    fetchTable("patients", { select: "id,full_name" }),
  ]);

  const departmentMap = Object.fromEntries(departments.map((row) => [row.id, row.name]));
  const patientMap = Object.fromEntries(patients.map((row) => [row.id, row.full_name]));

  const body = document.getElementById("recentQueueBody");
  body.innerHTML = queueRows.length
    ? queueRows.map((r) => `
      <tr>
        <td>${escapeHtml(r.token_no)}</td>
        <td>${escapeHtml(departmentMap[r.department_id] || "Unassigned")}</td>
        <td>${escapeHtml(patientMap[r.patient_id] || "Unknown")}</td>
        <td><span class="pill pill--${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
        <td>${escapeHtml(formatDisplayTime(r.joined_at))}</td>
      </tr>
    `).join("")
    : emptyRow(5, "No queue activity yet.");
}

async function loadUpcomingAppointments() {
  const [appointmentRows, departments, patients] = await Promise.all([
    fetchTable("appointments", {
      select: "scheduled_at,type,patient_id,department_id",
      gte: { scheduled_at: new Date().toISOString() },
      order: { column: "scheduled_at", ascending: true },
      limit: 4,
    }),
    fetchTable("departments", { select: "id,name" }),
    fetchTable("patients", { select: "id,full_name" }),
  ]);

  const departmentMap = Object.fromEntries(departments.map((row) => [row.id, row.name]));
  const patientMap = Object.fromEntries(patients.map((row) => [row.id, row.full_name]));

  const body = document.getElementById("upcomingAppointmentsBody");
  body.innerHTML = appointmentRows.length
    ? appointmentRows.map((a) => `
      <tr>
        <td>${escapeHtml(formatDisplayTime(a.scheduled_at))}</td>
        <td>${escapeHtml(patientMap[a.patient_id] || "Unknown")}</td>
        <td>${escapeHtml(departmentMap[a.department_id] || "Unassigned")}</td>
        <td>${escapeHtml(a.type || "Consultation")}</td>
      </tr>
    `).join("")
    : emptyRow(4, "No upcoming appointments.");
}

async function loadSystemAlerts() {
  const [notifications, busyQueues, departments] = await Promise.all([
    fetchTable("notifications", {
      select: "title,body,icon,created_at,category",
      order: { column: "created_at", ascending: false },
      limit: 3,
    }),
    fetchTable("queue_entries", {
      select: "expected_wait_minutes,department_id",
      in: { status: QUEUE_ACTIVE_STATUSES },
      order: { column: "expected_wait_minutes", ascending: false },
      limit: 1,
    }),
    fetchTable("departments", { select: "id,name" }),
  ]);

  const alerts = notifications.map((row) => ({
    icon: row.icon || "!",
    title: row.title || row.body || row.category || "Notification",
    meta: formatDisplayDateTime(row.created_at),
  }));

  const departmentMap = Object.fromEntries(departments.map((row) => [row.id, row.name]));
  const longestWait = busyQueues[0];
  if (longestWait && Number(longestWait.expected_wait_minutes) > 30) {
    alerts.unshift({
      icon: "!",
      title: `High wait time in ${departmentMap[longestWait.department_id] || "a department"} (${formatMinutes(longestWait.expected_wait_minutes)})`,
      meta: formatDisplayDateTime(new Date()),
    });
  }

  const list = document.getElementById("systemAlertsList");
  list.innerHTML = alerts.length
    ? alerts.slice(0, 3).map((a) => `
      <li class="alert-item">
        <span class="alert-item__icon">${escapeHtml(a.icon)}</span>
        <div class="alert-item__body">
          <span class="alert-item__title">${escapeHtml(a.title)}</span>
          <span class="alert-item__meta">${escapeHtml(a.meta)}</span>
        </div>
      </li>
    `).join("")
    : `<li class="alert-item"><div class="alert-item__body"><span class="alert-item__title">No alerts yet.</span></div></li>`;
}

async function loadAdminProfile() {
  if (typeof getCurrentStaffOrAdmin !== "function") return;
  try {
    const info = await getCurrentStaffOrAdmin();
    if (!info?.profile) return;
    const nameEl = document.querySelector(".sidebar__user .user__name");
    const emailEl = document.querySelector(".sidebar__user .user__email");
    const avatarEl = document.querySelector(".sidebar__user .user__avatar");
    if (nameEl) nameEl.textContent = info.profile.full_name || nameEl.textContent;
    if (emailEl) emailEl.textContent = info.profile.email || emailEl.textContent;
    if (avatarEl && info.profile.full_name) avatarEl.textContent = info.profile.full_name.charAt(0).toUpperCase();
  } catch (err) {
    console.warn("Failed to load admin profile:", err?.message || err);
  }
}

async function getQueueChartData() {
  const rows = await fetchTable("queue_entries", {
    select: "status,joined_at,served_at,expected_wait_minutes",
    gte: { joined_at: startOfTodayIso() },
    lte: { joined_at: endOfTodayIso() },
  });
  const labels = ["00:00", "06:00", "12:00", "18:00"];
  const joined = [0, 0, 0, 0];
  const served = [0, 0, 0, 0];
  const waits = [[], [], [], []];

  rows.forEach((row) => {
    const hour = new Date(row.joined_at).getHours();
    const index = Math.min(3, Math.floor(hour / 6));
    joined[index] += 1;
    if (row.status === "served" || row.served_at) served[index] += 1;
    waits[index].push(Number(row.expected_wait_minutes) || 0);
  });

  return {
    labels,
    joined,
    served,
    avgWait: waits.map((bucket) => bucket.length ? bucket.reduce((sum, value) => sum + value, 0) / bucket.length : 0),
  };
}

async function renderQueueOverviewChart() {
  const ctx = document.getElementById("queueOverviewChart");
  const d = await getQueueChartData();
  new Chart(ctx, {
    type: "line",
    data: {
      labels: d.labels,
      datasets: [
        { label: "Joined Queue", data: d.joined, borderColor: "#2f5fe0", backgroundColor: "transparent", tension: 0.4 },
        { label: "Served", data: d.served, borderColor: "#1aa35c", backgroundColor: "transparent", tension: 0.4 },
        { label: "Average Wait Time (mins)", data: d.avgWait, borderColor: "#8b5cf6", backgroundColor: "transparent", tension: 0.4, yAxisID: "y1" },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true },
        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } },
      },
    },
  });
}

async function renderQueueDistributionChart() {
  const rows = await fetchTable("queue_entries", { select: "status" });
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const colors = labels.map((label) => QUEUE_STATUS_COLORS[label] || "#6b7280");

  new Chart(document.getElementById("queueDistributionChart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { display: false } }, cutout: "70%" },
  });

  const total = values.reduce((a, b) => a + b, 0);
  const legend = document.getElementById("queueDistributionLegend");
  legend.innerHTML = total
    ? labels.map((label, i) => {
      const pct = Math.round((values[i] / total) * 100);
      return `<li><i class="dot" style="background:${colors[i]}"></i>${escapeHtml(label)}<b>${values[i]} (${pct}%)</b></li>`;
    }).join("")
    : "<li>No queue data yet.</li>";
}

async function initDashboard() {
  await Promise.all([
    loadStats(),
    loadDepartmentStatus(),
    loadRecentQueue(),
    loadUpcomingAppointments(),
    loadSystemAlerts(),
    loadAdminProfile(),
  ]);
  await Promise.all([renderQueueOverviewChart(), renderQueueDistributionChart()]);
}

function subscribeToRealtimeUpdates() {
  if (!supabaseClient?.channel) return;
  supabaseClient
    .channel("admin-dashboard-realtime")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "queue_entries" },
      function() { initDashboard(); }
    )
    .on("postgres_changes",
      { event: "*", schema: "public", table: "appointments" },
      function() { initDashboard(); }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", function() {
  initDashboard();
  subscribeToRealtimeUpdates();
});
