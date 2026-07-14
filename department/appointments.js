/* ==========================================================================
   Department Portal - Appointments page
   Shows appointments scheduled for this department.
   ========================================================================== */

var deptId = null;
var deptName = "";
var allAppointments = [];

document.addEventListener("DOMContentLoaded", async function() {
  // Auth guard
  if (!supabaseClient) {
    window.location.href = "../department-login.html";
    return;
  }

  var authResult = await supabaseClient.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    window.location.href = "../department-login.html";
    return;
  }

  var userId = authResult.data.user.id;

  // Get receptionist profile with department
  var receptionistResult = await supabaseClient
    .from("receptionist")
    .select("id, full_name, department_id, role")
    .eq("auth_uid", userId)
    .maybeSingle();

  if (receptionistResult.error || !receptionistResult.data || !receptionistResult.data.department_id) {
    await supabaseClient.auth.signOut();
    window.location.href = "../department-login.html";
    return;
  }

  deptId = receptionistResult.data.department_id;

  // Get department name
  var deptResult = await supabaseClient
    .from("departments")
    .select("name")
    .eq("id", deptId)
    .single();

  deptName = deptResult.data ? deptResult.data.name : "Department";

  // Update page title and sidebar
  var titles = document.querySelectorAll("#pageTitle");
  titles.forEach(function(el) { el.textContent = deptName + " - Appointments"; });

  var subs = document.querySelectorAll("#pageSub");
  subs.forEach(function(el) { el.textContent = "View scheduled appointments for " + deptName + "."; });

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
      window.location.href = "../department-login.html";
    });
  });

  // Refresh button
  var refreshBtns = document.querySelectorAll("#refreshBtn");
  refreshBtns.forEach(function(btn) {
    btn.addEventListener("click", function() { loadAppointments(); });
  });

  // Load appointments
  loadAppointments();

  // Subscribe to realtime updates
  subscribeToChanges();
});

async function loadAppointments() {
  if (!supabaseClient || !deptId) return;

  var today = startOfTodayIso();

  // Fetch appointments for this department
  var apptResult = await supabaseClient
    .from("appointments")
    .select("id, patient_id, scheduled_at, type, status, reason")
    .eq("department_id", deptId)
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

  allAppointments = apptResult.data.map(function(row) {
    return {
      id: row.id,
      patientName: patientMap[row.patient_id] || "Unknown",
      scheduledAt: row.scheduled_at,
      dateTime: formatDisplayDateTime(row.scheduled_at),
      type: row.type || "Consultation",
      status: row.status || "Pending",
      reason: row.reason || "",
    };
  });

  renderStats();
  renderTable();
}

function renderStats() {
  var statToday = document.getElementById("statToday");
  var statConfirmed = document.getElementById("statConfirmed");
  var statPending = document.getElementById("statPending");
  var apptBadge = document.getElementById("apptBadge");

  if (!statToday) return;

  var todayStr = new Date().toISOString().slice(0, 10);
  var todayAppts = allAppointments.filter(function(a) {
    return a.scheduledAt && a.scheduledAt.slice(0, 10) === todayStr;
  });
  var confirmed = allAppointments.filter(function(a) { return a.status === "Confirmed"; });
  var pending = allAppointments.filter(function(a) { return a.status === "Pending"; });

  statToday.textContent = todayAppts.length;
  statConfirmed.textContent = confirmed.length;
  statPending.textContent = pending.length;
  if (apptBadge) apptBadge.textContent = allAppointments.length + " total";
}

function renderTable() {
  var body = document.getElementById("apptBody");
  if (!body) return;

  if (allAppointments.length > 0) {
    body.innerHTML = allAppointments.map(function(a) {
      var statusClass = "badge-" + (a.status === "Confirmed" ? "success" : a.status === "Cancelled" ? "danger" : "warning");
      return '<tr>' +
        '<td>' + escapeHtml(a.patientName) + '</td>' +
        '<td>' + escapeHtml(a.dateTime) + '</td>' +
        '<td>' + escapeHtml(a.type) + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + escapeHtml(a.status) + '</span></td>' +
        '<td>' +
          (a.status === "Pending" ? '<button class="btn btn-sm btn-success" data-action="confirm" data-id="' + a.id + '">Confirm</button> ' : '') +
          (a.status !== "Cancelled" && a.status !== "Completed" ? '<button class="btn btn-sm btn-danger" data-action="cancel" data-id="' + a.id + '">Cancel</button>' : '') +
        '</td>' +
        '</tr>';
    }).join("");
  } else {
    body.innerHTML = '<tr><td colspan="5">No appointments scheduled for this department.</td></tr>';
  }

  // Add event listeners for action buttons
  body.querySelectorAll('[data-action="confirm"]').forEach(function(btn) {
    btn.addEventListener("click", function() {
      updateAppointmentStatus(this.dataset.id, "Confirmed");
    });
  });
  body.querySelectorAll('[data-action="cancel"]').forEach(function(btn) {
    btn.addEventListener("click", function() {
      if (confirm("Cancel this appointment?")) {
        updateAppointmentStatus(this.dataset.id, "Cancelled");
      }
    });
  });
}

async function updateAppointmentStatus(id, status) {
  var result = await supabaseClient
    .from("appointments")
    .update({ status: status })
    .eq("id", id);

  if (result.error) {
    alert("Failed to update appointment: " + result.error.message);
    return;
  }

  await loadAppointments();
}

function formatDisplayDateTime(value) {
  if (!value) return "";
  var d = new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function subscribeToChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("dept-appointments-changes")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "appointments" },
      function() { loadAppointments(); }
    )
    .subscribe();
}