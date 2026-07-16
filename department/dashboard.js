/* ==========================================================================
   Department Portal - Dashboard & Queue logic
   receptionist login here sees ONLY their department's queue.
   They can mark patients as served.
   ========================================================================== */

function minutesSince(value) {
  if (!value) return 0;
  var diff = new Date() - new Date(value);
  return Math.max(0, Math.round(diff / 60000));
}

var deptId = null;
var deptName = "";
var currentServingId = null;
var allQueueRows = [];

document.addEventListener("DOMContentLoaded", async function() {
  // Auth guard - redirect to department login if not authenticated
  if (!supabaseClient) {
    window.location.href = "../department_staff-login.html";
    return;
  }

  var authResult = await supabaseClient.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    window.location.href = "../department_staff-login.html";
    return;
  }

  var userId = authResult.data.user.id;

  // Get department staff profile with department
  var deptStaffResult = await supabaseClient
    .from("department_staff")
    .select("id, full_name, department_id, role")
    .eq("auth_uid", userId)
    .maybeSingle();

  if (deptStaffResult.error || !deptStaffResult.data || !deptStaffResult.data.department_id) {
    await supabaseClient.auth.signOut();
    window.location.href = "../department_staff-login.html";
    return;
  }

  deptId = deptStaffResult.data.department_id;

  // Get department name
  var deptName = "Department";
  if (deptId) {
    var deptResult = await supabaseClient
      .from("departments")
      .select("name")
      .eq("id", deptId)
      .single();
    deptName = deptResult.data ? deptResult.data.name : "Department";
  }

  // Update page title and sidebar
  var titles = document.querySelectorAll("#pageTitle");
  titles.forEach(function(el) { el.textContent = deptName; });

  var subs = document.querySelectorAll("#pageSub");
  subs.forEach(function(el) { el.textContent = "Manage " + deptName + " queue and serve patients."; });

  // Update sidebar
  var deptNameEls = document.querySelectorAll(".dept-name");
  deptNameEls.forEach(function(el) { el.textContent = deptName; });

  var initials = deptName.charAt(0).toUpperCase();
  var avatars = document.querySelectorAll(".dept-avatar");
  avatars.forEach(function(el) { el.textContent = initials; });

  // Sign out button
  var signoutBtns = document.querySelectorAll("#signoutBtn");
  signoutBtns.forEach(function(btn) {
    btn.addEventListener("click", async function() {
      if (!confirm("Sign out of " + deptName + "?")) return;
      await supabaseClient.auth.signOut();
      window.location.href = "../department_staff-login.html";
    });
  });

  // Refresh button
  var refreshBtns = document.querySelectorAll("#refreshBtn");
  refreshBtns.forEach(function(btn) {
    btn.addEventListener("click", function() { loadQueue(); loadTodaysAppointments(); });
  });

  // Mark as served button
  var markBtn = document.getElementById("markServedBtn");
  if (markBtn) {
    markBtn.addEventListener("click", markAsServed);
  }

  // Load queue data and today's appointments
  loadQueue();
  loadTodaysAppointments();

  // Subscribe to realtime updates
  subscribeToChanges();

// Subscribe to popup notifications
  if (typeof subscribereceptionistNotifications === "function") {
    subscribereceptionistNotifications(deptId);
  }

  // Update notification badge
  updateNotificationBadge();
});

// Update unread notification badge
async function updateNotificationBadge() {
  if (!supabaseClient || !deptId) return;
  var { count } = await supabaseClient
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("unread", true);
  var badge = document.getElementById("unread-badge");
  if (badge) {
    badge.textContent = count || 0;
    badge.style.display = count > 0 ? "" : "none";
  }
}

async function loadQueue() {
  if (!supabaseClient || !deptId) {
    console.warn("loadQueue: Missing department ID");
    return;
  }

  // Fetch queue entries for this department only
  var today = startOfTodayIso();
  var queueResult = await supabaseClient
    .from("queue_entries")
    .select("id, token_no, status, joined_at, called_at, served_at, patient_id, expected_wait_minutes")
    .eq("department_id", deptId)
    .gte("joined_at", today)
    .order("joined_at", { ascending: true });

  if (queueResult.error) {
    console.error("Failed to load queue:", queueResult.error.message);
    return;
  }

  // Get patient names
  var patientIds = queueResult.data.map(function(r) { return r.patient_id; });
  var patientMap = {};
  if (patientIds.length > 0) {
    var patientResult = await supabaseClient
      .from("patients")
      .select("id, full_name")
      .in("id", patientIds);

    if (!patientResult.error) {
      patientResult.data.forEach(function(p) { patientMap[p.id] = p.full_name; });
    }
  }

  allQueueRows = queueResult.data.map(function(row) {
    return {
      id: row.id,
      tokenNo: row.token_no,
      patientName: patientMap[row.patient_id] || "Unknown",
      status: row.status,
      joinedAt: row.joined_at,
      timeInQueue: minutesSince(row.joined_at) + " min",
    };
  });

  renderDashboard();
  renderQueuePage();
}

function renderDashboard() {
  // Only on dashboard page
  var statWaiting = document.getElementById("statWaiting");
  var statServing = document.getElementById("statServing");
  var statServed = document.getElementById("statServed");
  var servingBody = document.getElementById("servingBody");
  var queueBody = document.getElementById("queueBody");
  var waitingBadge = document.getElementById("waitingBadge");

  if (!statWaiting) return; // Not on dashboard page

  var waiting = allQueueRows.filter(function(r) { return r.status === "waiting"; });
  var serving = allQueueRows.filter(function(r) { return r.status === "now_serving"; });
  var served = allQueueRows.filter(function(r) { return r.status === "served"; });

  statWaiting.textContent = waiting.length;
  statServing.textContent = serving.length;
  statServed.textContent = served.length;

  // Now serving
  if (serving.length > 0) {
    var s = serving[0];
    servingBody.innerHTML = '<div class="serving-active">' +
      '<div class="serving-token-lg">' + escapeHtml(s.tokenNo) + '</div>' +
      '<div class="serving-name">' + escapeHtml(s.patientName) + '</div>' +
      '<div class="serving-wait">Waiting: ' + escapeHtml(s.timeInQueue) + '</div>' +
      '</div>';
  } else {
    servingBody.innerHTML = '<div class="no-patient">No patient currently being served</div>';
  }

  // Waiting queue
  if (waiting.length > 0) {
    queueBody.innerHTML = waiting.map(function(r) {
      return '<tr>' +
        '<td class="cell-primary">' + escapeHtml(r.tokenNo) + '</td>' +
        '<td>' + escapeHtml(r.patientName) + '</td>' +
        '<td>' + escapeHtml(r.timeInQueue) + '</td>' +
        '</tr>';
    }).join("");
  } else {
    queueBody.innerHTML = '<tr><td colspan="3">No patients waiting</td></tr>';
  }

  if (waitingBadge) waitingBadge.textContent = waiting.length + " waiting";
}

function renderQueuePage() {
  // Only on queue page
  var servingDisplay = document.getElementById("servingDisplay");
  var servingToken = document.getElementById("servingToken");
  var servingPatient = document.getElementById("servingPatient");
  var servingTokenNo = document.getElementById("servingTokenNo");
  var servingTime = document.getElementById("servingTime");
  var waitingBadge = document.getElementById("waitingBadge");
  var queueBody = document.getElementById("queueBody");
  var servedBody = document.getElementById("servedBody");

  if (!servingDisplay) return; // Not on queue page

  var waiting = allQueueRows.filter(function(r) { return r.status === "waiting"; });
  var serving = allQueueRows.filter(function(r) { return r.status === "now_serving"; });
  var served = allQueueRows.filter(function(r) { return r.status === "served"; });

  currentServingId = serving.length > 0 ? serving[0].id : null;

  // Now serving section
  if (serving.length > 0) {
    var s = serving[0];
    servingToken.textContent = s.tokenNo;
    servingPatient.textContent = s.patientName;
    servingTokenNo.textContent = s.tokenNo;
    servingTime.textContent = s.timeInQueue;
    document.getElementById("markServedBtn").style.display = "flex";
  } else {
    servingToken.textContent = "—";
    servingPatient.textContent = "No patient being served";
    servingTokenNo.textContent = "—";
    servingTime.textContent = "—";
    document.getElementById("markServedBtn").style.display = "none";
  }

  // Waiting queue
  if (waiting.length > 0) {
    queueBody.innerHTML = waiting.map(function(r) {
      return '<tr>' +
        '<td class="cell-primary">' + escapeHtml(r.tokenNo) + '</td>' +
        '<td>' + escapeHtml(r.patientName) + '</td>' +
        '<td>' + escapeHtml(r.timeInQueue) + '</td>' +
        '</tr>';
    }).join("");
  } else {
    queueBody.innerHTML = '<tr><td colspan="3">No patients waiting</td></tr>';
  }

  if (waitingBadge) waitingBadge.textContent = waiting.length + " waiting";

  // Served
  var recentServed = served.slice(-5).reverse();
  if (recentServed.length > 0) {
    servedBody.innerHTML = recentServed.map(function(r) {
      var time = r.joinedAt ? new Date(r.joinedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      return '<tr>' +
        '<td class="cell-primary">' + escapeHtml(r.tokenNo) + '</td>' +
        '<td>' + escapeHtml(r.patientName) + '</td>' +
        '<td>' + time + '</td>' +
        '</tr>';
    }).join("");
  } else {
    servedBody.innerHTML = '<tr><td colspan="3">No patients served yet today.</td></tr>';
  }
}

async function markAsServed() {
  if (!currentServingId) {
    alert("No patient is currently being served.");
    return;
  }

  if (!confirm("Mark this patient as served?")) return;

  var servedAt = new Date().toISOString();

  var result = await supabaseClient
    .from("queue_entries")
    .update({ status: "served", served_at: servedAt })
    .eq("id", currentServingId);

  if (result.error) {
    alert("Failed to mark as served: " + result.error.message);
    return;
  }

  // Notify the patient
  try {
    var entryResult = await supabaseClient
      .from("queue_entries")
      .select("patient_id")
      .eq("id", currentServingId)
      .single();

    if (!entryResult.error && entryResult.data) {
      await supabaseClient.from("notifications").insert({
        patient_id: entryResult.data.patient_id,
        title: "Consultation Complete - " + deptName,
        body: "Your consultation in " + deptName + " is complete. Thank you!",
        category: "queue",
        icon: "✅",
        unread: true,
      });
    }
  } catch (e) {
    console.warn("Notification failed:", e.message);
  }

  await loadQueue();
}

async function loadTodaysAppointments() {
  if (!supabaseClient || !deptId) {
    console.warn("loadTodaysAppointments: Missing department ID");
    return;
  }

  var todayStr = new Date().toISOString().slice(0, 10);
  var tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  var apptResult = await supabaseClient
    .from("appointments")
    .select("id, patient_id, scheduled_at, type, status")
    .eq("department_id", deptId)
    .gte("scheduled_at", todayStr)
    .lt("scheduled_at", tomorrowStr)
    .order("scheduled_at", { ascending: true });

  if (apptResult.error) {
    console.error("Failed to load appointments:", apptResult.error.message);
    return;
  }

  // Get patient names
  var patientIds = apptResult.data.map(function(r) { return r.patient_id; });
  var patientMap = {};
  if (patientIds.length > 0) {
    var patientResult = await supabaseClient
      .from("patients")
      .select("id, full_name")
      .in("id", patientIds);

    if (!patientResult.error) {
      patientResult.data.forEach(function(p) { patientMap[p.id] = p.full_name; });
    }
  }

  var apptBody = document.getElementById("apptBody");
  var apptBadge = document.getElementById("apptBadge");
  if (!apptBody) return;

  if (apptResult.data.length > 0) {
    apptBody.innerHTML = apptResult.data.map(function(a) {
      var time = new Date(a.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      var statusClass = a.status === "Confirmed" ? "badge-success" : a.status === "Cancelled" ? "badge-danger" : "badge-warning";
      return '<tr>' +
        '<td>' + escapeHtml(patientMap[a.patient_id] || "Unknown") + '</td>' +
        '<td>' + escapeHtml(time) + '</td>' +
        '<td>' + escapeHtml(a.type || "Consultation") + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + escapeHtml(a.status) + '</span></td>' +
        '</tr>';
    }).join("");
  } else {
    apptBody.innerHTML = '<tr><td colspan="4">No appointments scheduled for today.</td></tr>';
  }

  if (apptBadge) apptBadge.textContent = apptResult.data.length + " today";
}

function subscribeToChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("dept-queue-changes")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "queue_entries" },
      function() { loadQueue(); }
    )
    .on("postgres_changes",
      { event: "*", schema: "public", table: "appointments" },
      function() { loadTodaysAppointments(); }
    )
    .subscribe();
}
