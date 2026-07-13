/* ============================================================
   Patient Dashboard Logic

   Loads:
   - Logged in patient
   - Current queue status
   - Upcoming appointment

   ============================================================ */


/* ============================================================
   Render Appointment Card
============================================================ */

function renderAppointmentCard(appointment) {

  const apptList =
    document.getElementById("appt-list");


  if (!apptList) return;



  if (!appointment) {

    apptList.innerHTML = `

      <div class="appt-row empty">

        <div class="appt-info">

          <div class="appt-title">
            No upcoming appointments
          </div>

          <div class="appt-doc">
            Book an appointment to see it here.
          </div>

        </div>

      </div>

    `;

    return;
  }




  const scheduledAt =
    new Date(
      appointment.scheduled_at
    );



  const month =
    scheduledAt
      .toLocaleDateString(
        "en-US",
        {
          month:"short"
        }
      )
      .toUpperCase();



  const day =
    scheduledAt
      .toLocaleDateString(
        "en-US",
        {
          day:"2-digit"
        }
      );



  const time =
    scheduledAt
      .toLocaleTimeString(
        "en-US",
        {
          hour:"numeric",
          minute:"2-digit"
        }
      );




  apptList.innerHTML = `

    <div class="appt-row">


      <div class="appt-date">

        <span class="mon">
          ${month}
        </span>

        <span class="day">
          ${day}
        </span>

      </div>




      <div class="appt-info">


        <div class="appt-title">
          ${escapeHtml(appointment.type || "Consultation")}
        </div>




        




        <div class="appt-meta">

          ${escapeHtml(time)}
          •
          ${escapeHtml(appointment.department_name || "Department")}

        </div>


      </div>




      <span class="pill pill-confirmed" style="margin-bottom:4px;">
        ${escapeHtml(appointment.status || "Pending")}
      </span>

      ${appointment.status !== "Cancelled" && appointment.status !== "Completed" ? `
        <button class="btn-cancel-appt" data-appt-id="${appointment.id}" style="display:block;width:100%;margin-top:8px;padding:6px 10px;border:1px solid #e0453d;border-radius:6px;background:#fff;color:#e0453d;font-size:11px;font-weight:600;cursor:pointer;">Cancel Appointment</button>
      ` : ''}

    </div>

  `;

  // Add cancel button event listener
  var cancelBtn = apptList.querySelector('.btn-cancel-appt');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async function() {
      if (!confirm('Cancel this appointment?')) return;
      var { error } = await supabaseClient
        .from('appointments')
        .update({ status: 'Cancelled' })
        .eq('id', this.dataset.apptId);
      if (error) {
        alert('Failed to cancel: ' + error.message);
      }
    });
  }

}






/* ============================================================
   Load Dashboard Data
============================================================ */


async function renderDashboard(patient, authUser){


  const displayName =
    authUser?.user_metadata?.full_name ||
    patient?.full_name ||
    "Patient";

  document.getElementById(
    "patient-name"
  ).textContent = displayName;

  const welcomeSubtitle = document.querySelector(".page-head .sub");
  if (welcomeSubtitle) {
    const details = [
      authUser?.email || patient?.email,
      authUser?.user_metadata?.phone || patient?.phone,
    ].filter(Boolean);

    welcomeSubtitle.innerHTML = details.length
      ? `Signed in as <strong>${details.map(escapeHtml).join(" • ")}</strong>`
      : "We're glad to have you here.";
  }





/* ============================================================
   LOAD QUEUE
============================================================ */


const [queueResult, appointmentResult, departmentResult] = await Promise.all([
  supabaseClient
    .from("queue_entries")
    .select("token_no, status, expected_wait_minutes, joined_at, department_id")
    .eq("patient_id", patient.id)
    .in("status", ["waiting", "now_serving"])
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle(),
  supabaseClient
    .from("appointments")
    .select("id, patient_id, scheduled_at, status, type, department_id")
    .eq("patient_id", patient.id)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1),
  supabaseClient.from("departments").select("id, name"),
]);







/* ============================================================
   LOAD APPOINTMENT
============================================================ */


const departmentMap = Object.fromEntries((departmentResult.data || []).map((row) => [row.id, row.name]));
const appointment = (appointmentResult.data || [])[0]
  ? {
      ...(appointmentResult.data[0]),
      department_name: departmentMap[appointmentResult.data[0].department_id] || "Department",
    }
  : null;



console.log("========== FULL QUEUE ==========");
console.log(JSON.stringify(queueResult.data, null, 2));
console.log(queueResult.error);




console.log(
  "Appointment:",
  appointment
);



console.log(
  "Appointment Error:",
  appointmentResult.error
);
const queue = queueResult.data
  ? {
      ...queueResult.data,
      department_name: departmentMap[queueResult.data.department_id] || "Unknown Department",
    }
  : null;



let peopleAhead = 0;

if (queue) {
  const { count, error } = await supabaseClient
    .from("queue_entries")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("department_id", queue.department_id)
    .eq("status", "waiting")
    .lt("joined_at", queue.joined_at);

  if (error) {
    console.error("People ahead error:", error);
  }

  peopleAhead = count ?? 0;
  console.log("People Ahead:", peopleAhead);
}






/* ============================================================
   UPDATE QUEUE CARD
============================================================ */


if(queue){


  document.getElementById(
    "current-queue"
  ).textContent =
    queue.token_no;




  document.getElementById(
    "current-dept"
  ).textContent =

    queue.department_name ||

    "Unknown Department";





  document.getElementById(
    "people-ahead"
  ).textContent =
    peopleAhead;





  document.getElementById(
    "wait-time"
  ).textContent =


    queue.expected_wait_minutes

    ? `${queue.expected_wait_minutes} mins`

    : "—";





  document.getElementById(
    "queue-status-pill"
  ).innerHTML =
    `<span class="dot"></span>${escapeHtml(queue.status)}`;



}



else{


  document.getElementById(
    "current-queue"
  ).textContent =
    "—";



  document.getElementById(
    "current-dept"
  ).textContent =
    "No active queue";



  document.getElementById(
    "people-ahead"
  ).textContent =
    peopleAhead;



  document.getElementById(
    "wait-time"
  ).textContent =
    "—";



  document.getElementById(
    "queue-status-pill"
  ).innerHTML =

    `
      <span class="dot"></span>
      Idle
    `;

}




/* Render appointment */

renderAppointmentCard(
  appointment
);



}








/* ============================================================
   Realtime Subscriptions
============================================================ */

function subscribeToRealtimeUpdates(patient) {
  if (!supabaseClient) return;

  supabaseClient
    .channel("patient-dashboard-updates")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "appointments", filter: "patient_id=eq." + patient.id },
      function() { refreshAppointment(patient); }
    )
    .on("postgres_changes",
      { event: "*", schema: "public", table: "queue_entries", filter: "patient_id=eq." + patient.id },
      function() { refreshQueue(patient); }
    )
    .subscribe();
}

async function refreshAppointment(patient) {
  if (!supabaseClient || !patient) return;

  var deptResult = await supabaseClient.from("departments").select("id, name");
  var departmentMap = Object.fromEntries((deptResult.data || []).map(function(row) { return [row.id, row.name]; }));

  var apptResult = await supabaseClient
    .from("appointments")
    .select("id, patient_id, scheduled_at, status, type, department_id")
    .eq("patient_id", patient.id)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1);

  var appointment = (apptResult.data || [])[0]
    ? { ...apptResult.data[0], department_name: departmentMap[apptResult.data[0].department_id] || "Department" }
    : null;

  renderAppointmentCard(appointment);
}

async function refreshQueue(patient) {
  if (!supabaseClient || !patient) return;

  var deptResult = await supabaseClient.from("departments").select("id, name");
  var departmentMap = Object.fromEntries((deptResult.data || []).map(function(row) { return [row.id, row.name]; }));

  var queueResult = await supabaseClient
    .from("queue_entries")
    .select("token_no, status, expected_wait_minutes, joined_at, department_id")
    .eq("patient_id", patient.id)
    .in("status", ["waiting", "now_serving"])
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  var queue = queueResult.data
    ? { ...queueResult.data, department_name: departmentMap[queueResult.data.department_id] || "Unknown Department" }
    : null;

  if (queue) {
    document.getElementById("current-queue").textContent = queue.token_no;
    document.getElementById("current-dept").textContent = queue.department_name || "Unknown Department";
    document.getElementById("wait-time").textContent = queue.expected_wait_minutes ? queue.expected_wait_minutes + " mins" : "—";
    document.getElementById("queue-status-pill").innerHTML = '<span class="dot"></span>' + escapeHtml(queue.status);
  }
}

/* ============================================================
   Initialize Dashboard
============================================================ */


async function initDashboard(){




if(!supabaseClient){

console.error(
  "Supabase client missing"
);

return;

}


const {

data:{
  user
},

error

}

=
await supabaseClient.auth.getUser();





console.log(
  "Authenticated User:",
  user
);



console.log(
  "Auth Error:",
  error
);






if (!user) {
  window.location.href = getLoginUrl();
  return;
}






const {

data:patient,

error:patientError

}

=
await supabaseClient

.from("patients")

.select("*")

.eq(
"auth_uid",
user.id
)

.single();






console.log(
"Patient Record:",
patient
);



console.log(
"Patient Error:",
patientError
);






if (patientError || !patient) {
  console.error("Patient lookup failed or no profile exists:", patientError?.message || "No patient profile found");
  await supabaseClient.auth.signOut();
  window.location.href = getLoginUrl();
  return;
}

await renderDashboard(patient, user);

// Subscribe to realtime updates for live status changes
subscribeToRealtimeUpdates(patient);

// Subscribe to popup toast notifications
if (typeof subscribePatientNotifications === "function") {
  subscribePatientNotifications(patient.id);
}



}







async function handleLogout() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error("Logout failed:", error.message);
    return;
  }

  window.location.href = getLoginUrl();
}

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn?.addEventListener("click", handleLogout);
  initDashboard();
});