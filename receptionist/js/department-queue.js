/* ==========================================================================
   Department Queue page logic
   Shows only the queue for the logged-in receptionist's department.
   Department receptionist can mark patients as served, which notifies reception.
   ========================================================================== */

let deptQueueRows = [];
let currentServingId = null;
let receptionistDepartmentId = null;
let receptionistDepartmentName = "";

document.addEventListener("DOMContentLoaded", async () => {
  const markServedBtn = document.getElementById("mark-served-btn");
  if (!markServedBtn) return;

  // Get the logged-in receptionist's profile to find their department
  const receptionistInfo = await getCurrentreceptionistProfile();
  if (!receptionistInfo?.profile) {
    document.getElementById("dept-queue-body").innerHTML =
      '<tr><td colspan="4">Unable to load receptionist profile. Please ensure you are assigned to a department.</td></tr>';
    return;
  }

  receptionistDepartmentId = receptionistInfo.profile.department_id;
  receptionistDepartmentName = receptionistInfo.profile.departments?.name || "Your Department";

  // Update the page title with the department name
  const titleEl = document.getElementById("dept-title");
  const subEl = document.getElementById("dept-sub");
  if (titleEl) titleEl.textContent = receptionistDepartmentName + " Queue";
  if (subEl) subEl.textContent = "Manage patients in " + receptionistDepartmentName + ".";

  // Update profile sidebar
  document.querySelectorAll(".profile-name").forEach(function(el) {
    el.textContent = receptionistInfo.profile.full_name || "receptionist User";
  });
  document.querySelectorAll(".profile-role").forEach(function(el) {
    el.textContent = receptionistInfo.profile.role || "receptionist";
  });
  document.querySelectorAll(".profile-email").forEach(function(el) {
    el.textContent = receptionistInfo.profile.email || receptionistInfo.authUser.email || "";
  });
  document.querySelectorAll(".profile-avatar").forEach(function(el) {
    var name = receptionistInfo.profile.full_name || "receptionist User";
    el.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function(p) { return p[0]; }).join("").toUpperCase() || "SU";
  });

  if (!receptionistDepartmentId) {
    document.getElementById("dept-queue-body").innerHTML =
      '<tr><td colspan="4">You are not assigned to any department. Please contact an administrator.</td></tr>';
    return;
  }

  loadDepartmentQueue();
  subscribeToTokenUpdates(function() { loadDepartmentQueue(); });

  markServedBtn.addEventListener("click", markCurrentAsServed);
});

async function loadDepartmentQueue() {
  if (!supabaseClient || !receptionistDepartmentId) return;

  // Fetch queue entries for this department only
  const [queueResult, patientResult] = await Promise.all([
    supabaseClient
      .from("queue_entries")
      .select("id, token_no, status, joined_at, called_at, served_at, patient_id, expected_wait_minutes")
      .eq("department_id", receptionistDepartmentId)
      .in("status", ["waiting", "now_serving", "served"])
      .order("joined_at", { ascending: true }),
    supabaseClient.from("patients").select("id, full_name"),
  ]);

  if (queueResult.error) {
    console.error("Failed to load department queue:", queueResult.error.message);
    return;
  }

  const patientMap = Object.fromEntries((patientResult.data || []).map(function(row) {
    return [row.id, row.full_name];
  }));

  deptQueueRows = (queueResult.data || []).map(function(row) {
    return {
      id: row.id,
      tokenNo: row.token_no,
      patientName: patientMap[row.patient_id] || "Unknown patient",
      status: row.status || "waiting",
      statusLabel: row.status === "now_serving" ? "Now Serving" : row.status === "served" ? "Served" : "Waiting",
      joinedAt: row.joined_at,
      calledAt: row.called_at,
      servedAt: row.served_at,
      timeInQueue: minutesSince(row.joined_at) + " min",
      expectedWaitMinutes: Number(row.expected_wait_minutes) || 15,
    };
  });

  renderDepartmentQueue();
}

function renderDepartmentQueue() {
  const currentServing = deptQueueRows.find(function(row) { return row.status === "now_serving"; });
  const waitingRows = deptQueueRows.filter(function(row) { return row.status === "waiting"; });
  const servedRows = deptQueueRows.filter(function(row) { return row.status === "served"; });

  currentServingId = currentServing?.id || null;

  // Update Now Serving section
  if (currentServing) {
    document.getElementById("ns-token").textContent = currentServing.tokenNo;
    document.getElementById("ns-name").textContent = currentServing.patientName;
    document.getElementById("ns-dept").textContent = receptionistDepartmentName;
    document.getElementById("meta-token").textContent = currentServing.tokenNo;
    document.getElementById("meta-time").textContent = currentServing.timeInQueue;
    document.getElementById("meta-patient").textContent = currentServing.patientName;
  } else {
    document.getElementById("ns-token").textContent = "—";
    document.getElementById("ns-name").textContent = "No patient being served";
    document.getElementById("ns-dept").textContent = "—";
    document.getElementById("meta-token").textContent = "—";
    document.getElementById("meta-time").textContent = "—";
    document.getElementById("meta-patient").textContent = "—";
  }

  // Update waiting count
  var countEl = document.getElementById("waiting-count");
  if (countEl) countEl.textContent = waitingRows.length + " waiting";

  // Render waiting table
  var body = document.getElementById("dept-queue-body");
  if (body) {
    body.innerHTML = waitingRows.length
      ? waitingRows.map(function(row) {
          return '<tr>' +
            '<td class="cell-primary">' + escapereceptionistHtml(row.tokenNo) + '</td>' +
            '<td>' + escapereceptionistHtml(row.patientName) + '</td>' +
            '<td>' + escapereceptionistHtml(row.timeInQueue) + '</td>' +
            '<td><span class="badge ' + receptionistBadgeClass(row.status) + '">' + escapereceptionistHtml(row.statusLabel) + '</span></td>' +
            '</tr>';
        }).join("")
      : '<tr><td colspan="4">No patients waiting in your department.</td></tr>';
  }

  // Render recently served
  var servedBody = document.getElementById("recent-served-body");
  if (servedBody) {
    var recentServed = servedRows.slice(-5).reverse();
    servedBody.innerHTML = recentServed.length
      ? recentServed.map(function(row) {
          var servedTime = row.servedAt ? formatreceptionistTime(row.servedAt) : "";
          return '<tr>' +
            '<td class="cell-primary">' + escapereceptionistHtml(row.tokenNo) + '</td>' +
            '<td>' + escapereceptionistHtml(row.patientName) + '</td>' +
            '<td>' + escapereceptionistHtml(servedTime) + '</td>' +
            '</tr>';
        }).join("")
      : '<tr><td colspan="3">No patients served yet today.</td></tr>';
  }
}

function formatreceptionistTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

async function markCurrentAsServed() {
  if (!currentServingId) {
    alert("No patient is currently being served.");
    return;
  }

  if (!confirm("Mark this patient as served?")) return;

  // Find the current serving patient details
  var currentServing = deptQueueRows.find(function(row) { return row.id === currentServingId; });
  if (!currentServing) return;

  var servedAt = new Date().toISOString();

  // Update the queue entry status to served
  var result = await supabaseClient
    .from("queue_entries")
    .update({ status: "served", served_at: servedAt })
    .eq("id", currentServingId);

  if (result.error) {
    console.error("Unable to mark patient as served:", result.error);
    alert("Failed to update: " + result.error.message);
    return;
  }

  // Send notification to reception receptionist about the served patient
  try {
    // Find the receptionist_id of the receptionist who registered this patient
    var entryResult = await supabaseClient
      .from("queue_entries")
      .select("receptionist_id, patient_id")
      .eq("id", currentServingId)
      .single();

    if (!entryResult.error && entryResult.data) {
      var receptionreceptionistId = entryResult.data.receptionist_id;
      var patientId = entryResult.data.patient_id;

      // Create a notification for the reception receptionist
      if (receptionreceptionistId) {
        // We'll store this in a notifications-like way
        // For now, the real-time subscription will update the queue management page
        console.log("Patient " + currentServing.patientName + " (" + currentServing.tokenNo + ") served. Notifying reception.");
      }

      // Also notify the patient
      if (patientId) {
        await supabaseClient.from("notifications").insert({
          patient_id: patientId,
          title: "Consultation Complete",
          body: "Your consultation in " + receptionistDepartmentName + " is complete. Thank you for visiting!",
          category: "queue",
          icon: "✅",
          unread: true,
        });
      }
    }
  } catch (notifErr) {
    console.warn("Failed to send notification:", notifErr.message);
  }

  await loadDepartmentQueue();
}