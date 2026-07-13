/* ==========================================================
   MediQueue — Staff Console
   Frontend logic running on local mock data.

   ---------------------------------------------------------
   SUPABASE INTEGRATION NOTES (for the next pass)
   ---------------------------------------------------------
   Everything that touches data lives behind the `db` object
   below. To go live:

     1. Add the Supabase client script tag in staff.html:
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

     2. Init once at the top of this file:
        const supabase = window.supabase.createClient(
          "YOUR_SUPABASE_URL",
          "YOUR_SUPABASE_ANON_KEY"
        );

     3. Replace each method in `db` with a real query, e.g.:
        async getQueue() {
          const { data, error } = await supabase
            .from("queue_tickets")
            .select("*, patients(name, phone)")
            .order("created_at", { ascending: true });
          if (error) throw error;
          return data;
        }

     4. For live updates, subscribe once in init():
        supabase.channel("queue-changes")
          .on("postgres_changes",
              { event: "*", schema: "public", table: "queue_tickets" },
              () => loadQueueAndRender())
          .subscribe();

   Nothing else in this file needs to change — every render
   function reads from the `state` object, which `db` calls
   populate.
   ========================================================== */

(() => {
  "use strict";

  /* ---------------- Mock data store ---------------- */
  const DEPARTMENTS = ["General", "Pediatrics", "Cardiology", "Lab"];

  const FIRST_NAMES = ["Kwame", "Ama", "Kojo", "Efua", "Yaw", "Akosua", "Kofi", "Abena", "Kwabena", "Adjoa"];
  const LAST_NAMES = ["Mensah", "Owusu", "Boateng", "Asante", "Appiah", "Darko", "Nkrumah", "Aidoo"];

  function randomName() {
    return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
  }

  function makeTicket(i, deptOverride) {
    const dept = deptOverride || DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
    const prefix = dept[0].toUpperCase();
    const minutesAgo = Math.floor(Math.random() * 40) + 1;
    return {
      id: `t${i}`,
      ticket: `${prefix}-${String(i).padStart(3, "0")}`,
      patientName: randomName(),
      phone: `02${Math.floor(10000000 + Math.random() * 89999999)}`,
      department: dept,
      status: "waiting", // waiting | serving | completed | skipped
      createdAt: new Date(Date.now() - minutesAgo * 60000),
    };
  }

  let ticketSeq = 1;
  let mockQueue = Array.from({ length: 7 }, () => makeTicket(ticketSeq++));

  const mockPatients = [
    { name: "Akosua Frimpong", phone: "0244123456", lastVisit: "2026-06-28", visits: 5 },
    { name: "Yaw Osei", phone: "0209988776", lastVisit: "2026-07-01", visits: 2 },
    { name: "Efua Sarpong", phone: "0277001122", lastVisit: "2026-06-15", visits: 9 },
    { name: "Kwabena Tetteh", phone: "0501234567", lastVisit: "2026-07-05", visits: 1 },
  ];

  let dailyServedCount = 12;
  let dailySkippedCount = 3;

  /* ---------------- Data access layer ----------------
     Swap the bodies of these methods for real Supabase
     calls when wiring up the backend. Keep the method
     names and return shapes the same. */
  const db = {
    async getQueue() {
      await sleep(120);
      return [...mockQueue];
    },
    async getPatients() {
      await sleep(80);
      return [...mockPatients];
    },
    async callNext() {
      await sleep(150);
      // demote any currently-serving ticket to completed
      const currentlyServing = mockQueue.find(t => t.status === "serving");
      if (currentlyServing) {
        currentlyServing.status = "completed";
        dailyServedCount++;
      }
      const next = mockQueue.find(t => t.status === "waiting");
      if (next) next.status = "serving";
      return next || null;
    },
    async skipTicket(id) {
      await sleep(100);
      const t = mockQueue.find(t => t.id === id);
      if (t) {
        t.status = "skipped";
        dailySkippedCount++;
      }
      return t;
    },
    async completeTicket(id) {
      await sleep(100);
      const t = mockQueue.find(t => t.id === id);
      if (t) {
        t.status = "completed";
        dailyServedCount++;
      }
      return t;
    },
    async recallTicket(id) {
      await sleep(100);
      const t = mockQueue.find(t => t.id === id);
      if (t) t.status = "waiting";
      return t;
    },
  };

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  /* ---------------- App state ---------------- */
  const state = {
    queue: [],
    patients: [],
    search: "",
    deptFilter: "all",
    view: "dashboard",
  };

  /* ---------------- DOM refs ---------------- */
  const el = {
    clock: document.getElementById("clock"),
    navItems: document.querySelectorAll(".nav-item[data-view]"),
    viewTitle: document.getElementById("viewTitle"),
    viewSub: document.getElementById("viewSub"),
    views: document.querySelectorAll(".view"),

    navQueueCount: document.getElementById("navQueueCount"),

    nowServingNumber: document.getElementById("nowServingNumber"),
    nowServingName: document.getElementById("nowServingName"),
    callNextBtn: document.getElementById("callNextBtn"),
    skipBtn: document.getElementById("skipBtn"),
    completeBtn: document.getElementById("completeBtn"),

    statWaiting: document.getElementById("statWaiting"),
    statAvgWait: document.getElementById("statAvgWait"),
    statServed: document.getElementById("statServed"),
    statSkipped: document.getElementById("statSkipped"),

    queueSearch: document.getElementById("queueSearch"),
    deptFilter: document.getElementById("deptFilter"),
    queueTableBody: document.getElementById("queueTableBody"),
    queueEmpty: document.getElementById("queueEmpty"),

    patientsTableBody: document.getElementById("patientsTableBody"),

    toast: document.getElementById("toast"),
    logoutBtn: document.getElementById("logoutBtn"),
  };

  /* ---------------- Helpers ---------------- */
  function timeAgo(date) {
    const mins = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hr ${mins % 60}m ago`;
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.toast.classList.remove("is-visible"), 2400);
  }

  function statusLabel(status) {
    return { waiting: "Waiting", serving: "Serving", completed: "Completed", skipped: "Skipped" }[status] || status;
  }

  /* ---------------- Rendering ---------------- */
  function renderClock() {
    const now = new Date();
    el.clock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function renderNowServing() {
    const serving = state.queue.find(t => t.status === "serving");
    if (serving) {
      el.nowServingNumber.textContent = serving.ticket;
      el.nowServingName.textContent = `${serving.patientName} · ${serving.department}`;
      el.completeBtn.disabled = false;
      el.skipBtn.disabled = false;
    } else {
      el.nowServingNumber.textContent = "—";
      el.nowServingName.textContent = "No patient called yet";
      el.completeBtn.disabled = true;
      el.skipBtn.disabled = true;
    }
  }

  function renderStats() {
    const waiting = state.queue.filter(t => t.status === "waiting").length;
    el.statWaiting.textContent = waiting;

    // rough avg wait: minutes since created for waiting tickets
    const waitingTickets = state.queue.filter(t => t.status === "waiting");
    const avg = waitingTickets.length
      ? Math.round(
          waitingTickets.reduce((sum, t) => sum + (Date.now() - t.createdAt.getTime()) / 60000, 0) /
            waitingTickets.length
        )
      : 0;
    el.statAvgWait.innerHTML = `${avg}<span class="unit">min</span>`;

    el.statServed.textContent = dailyServedCount;
    el.statSkipped.textContent = dailySkippedCount;
  }

  function renderNavBadge() {
    const waiting = state.queue.filter(t => t.status === "waiting").length;
    el.navQueueCount.textContent = waiting;
  }

  function initials(name) {
    return name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  }

  function renderQueueTable() {
    const rows = state.queue
      .filter(t => t.status !== "completed")
      .filter(t => (state.deptFilter === "all" ? true : t.department === state.deptFilter))
      .filter(t => {
        if (!state.search) return true;
        const q = state.search.toLowerCase();
        return t.ticket.toLowerCase().includes(q) || t.patientName.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const order = { serving: 0, waiting: 1, skipped: 2 };
        return order[a.status] - order[b.status] || a.createdAt - b.createdAt;
      });

    el.queueTableBody.innerHTML = "";

    if (rows.length === 0) {
      el.queueEmpty.hidden = false;
    } else {
      el.queueEmpty.hidden = true;
      rows.forEach(t => el.queueTableBody.appendChild(buildQueueRow(t)));
    }
  }

  function buildQueueRow(t) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><span class="ticket-pill">${t.ticket}</span></td>
      <td>
        <span class="patient-name">${t.patientName}</span>
        <span class="patient-sub">${t.phone}</span>
      </td>
      <td>${t.department}</td>
      <td>${timeAgo(t.createdAt)}</td>
      <td><span class="status-tag ${t.status}">${statusLabel(t.status)}</span></td>
      <td class="col-actions"></td>
    `;

    const actionsCell = tr.querySelector(".col-actions");
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "row-actions";

    if (t.status === "waiting") {
      actionsWrap.appendChild(makeActionBtn("Call", true, () => callSpecific(t.id)));
      actionsWrap.appendChild(makeActionBtn("Skip", false, () => handleSkip(t.id)));
    } else if (t.status === "serving") {
      actionsWrap.appendChild(makeActionBtn("Complete", true, () => handleComplete(t.id)));
      actionsWrap.appendChild(makeActionBtn("Skip", false, () => handleSkip(t.id)));
    } else if (t.status === "skipped") {
      actionsWrap.appendChild(makeActionBtn("Recall", false, () => handleRecall(t.id)));
    }

    actionsCell.appendChild(actionsWrap);
    return tr;
  }

  function makeActionBtn(label, primary, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    if (primary) btn.classList.add("primary");
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderPatientsTable() {
    el.patientsTableBody.innerHTML = "";
    state.patients.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="patient-name">${p.name}</span></td>
        <td>${p.phone}</td>
        <td>${p.lastVisit}</td>
        <td>${p.visits}</td>
        <td class="col-actions"></td>
      `;
      const actionsCell = tr.querySelector(".col-actions");
      const wrap = document.createElement("div");
      wrap.className = "row-actions";
      wrap.appendChild(makeActionBtn("View", false, () => showToast(`Viewing ${p.name}'s record (placeholder)`)));
      actionsCell.appendChild(wrap);
      el.patientsTableBody.appendChild(tr);
    });
  }

  function renderAll() {
    renderNowServing();
    renderStats();
    renderNavBadge();
    renderQueueTable();
  }

  /* ---------------- Actions ---------------- */
  async function loadQueueAndRender() {
    state.queue = await db.getQueue();
    renderAll();
  }

  async function handleCallNext() {
    el.callNextBtn.disabled = true;
    try {
      const next = await db.callNext();
      state.queue = await db.getQueue();
      renderAll();
      showToast(next ? `Now calling ${next.ticket} — ${next.patientName}` : "No one waiting in the queue");
    } finally {
      el.callNextBtn.disabled = false;
    }
  }

  async function callSpecific(id) {
    // treat as "jump the queue and call this ticket now"
    const currentlyServing = state.queue.find(t => t.status === "serving");
    if (currentlyServing) await db.completeTicket(currentlyServing.id);
    const ticket = state.queue.find(t => t.id === id);
    if (ticket) ticket.status = "serving";
    state.queue = await db.getQueue();
    // re-apply the manual call since mock db doesn't know about it
    const t = state.queue.find(x => x.id === id);
    if (t) t.status = "serving";
    renderAll();
    showToast(`Now calling ${t ? t.ticket : ""}`);
  }

  async function handleSkip(id) {
    const t = await db.skipTicket(id);
    state.queue = await db.getQueue();
    renderAll();
    showToast(t ? `${t.ticket} marked as skipped / no-show` : "Ticket skipped");
  }

  async function handleComplete(id) {
    const t = await db.completeTicket(id);
    state.queue = await db.getQueue();
    renderAll();
    showToast(t ? `${t.ticket} marked complete` : "Ticket completed");
  }

  async function handleRecall(id) {
    const t = await db.recallTicket(id);
    state.queue = await db.getQueue();
    renderAll();
    showToast(t ? `${t.ticket} returned to the waiting list` : "Ticket recalled");
  }

  async function handleCompleteCurrent() {
    const serving = state.queue.find(t => t.status === "serving");
    if (!serving) return;
    await handleComplete(serving.id);
  }

  async function handleSkipCurrent() {
    const serving = state.queue.find(t => t.status === "serving");
    if (!serving) return;
    await handleSkip(serving.id);
  }

  /* ---------------- View switching ---------------- */
  const VIEW_META = {
    dashboard: { title: "Dashboard", sub: "Outpatient Department · Window 3" },
    queue: { title: "Live Queue", sub: "All departments" },
    patients: { title: "Patients", sub: "Search and manage patient records" },
    reports: { title: "Reports", sub: "Daily and weekly analytics" },
    settings: { title: "Settings", sub: "Window, department, and account" },
  };

  function switchView(view) {
    state.view = view;
    el.navItems.forEach(item => item.classList.toggle("is-active", item.dataset.view === view));
    el.views.forEach(section => {
      section.hidden = section.id !== `view-${view}`;
    });
    const meta = VIEW_META[view] || VIEW_META.dashboard;
    el.viewTitle.textContent = meta.title;
    el.viewSub.textContent = meta.sub;

    // "queue" nav reuses the dashboard view (queue table is already there);
    // if you split it into its own section later, render it here.
    if (view === "queue") {
      el.viewTitle.textContent = "Live Queue";
      document.getElementById("view-dashboard").hidden = false;
    }
    if (view === "patients") {
      renderPatientsTable();
    }
  }

  /* ---------------- Event wiring ---------------- */
  function wireEvents() {
    el.navItems.forEach(item => {
      item.addEventListener("click", e => {
        e.preventDefault();
        switchView(item.dataset.view);
      });
    });

    el.callNextBtn.addEventListener("click", handleCallNext);
    el.completeBtn.addEventListener("click", handleCompleteCurrent);
    el.skipBtn.addEventListener("click", handleSkipCurrent);

    el.queueSearch.addEventListener("input", e => {
      state.search = e.target.value.trim();
      renderQueueTable();
    });

    el.deptFilter.addEventListener("change", e => {
      state.deptFilter = e.target.value;
      renderQueueTable();
    });

    el.logoutBtn.addEventListener("click", () => {
      showToast("Logged out (placeholder — wire up to auth)");
    });

    // periodic refresh of "time ago" + avg wait without a full reload
    setInterval(() => {
      renderQueueTable();
      renderStats();
    }, 30000);
  }

  /* ---------------- Init ---------------- */
  async function init() {
    renderClock();
    setInterval(renderClock, 1000);

    wireEvents();

    state.queue = await db.getQueue();
    state.patients = await db.getPatients();
    renderAll();

    el.completeBtn.disabled = true;
    el.skipBtn.disabled = true;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
