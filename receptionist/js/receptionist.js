/* ==========================================================
   MediQueue — receptionist Console
   Frontend logic with Supabase integration.
   ========================================================== */

(() => {
  "use strict";

  /* ==========================================================
     Make sure supabaseClient is available (loaded from
     ../../supabase-config.js via the HTML page).
     ========================================================== */
  if (typeof supabaseClient === "undefined" || !supabaseClient) {
    console.error(
      "receptionist.js: supabaseClient not found. Ensure supabase-config.js is loaded first."
    );
    return;
  }

  const sb = supabaseClient;

  /* ---------------- Data access layer ---------------- */
  const db = {
    async getQueue() {
      const { data, error } = await sb
        .from("queue_entries")
        .select("*, patients(full_name, phone), departments(name)")
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        ticket: row.token_no,
        patientName: row.patients?.full_name || "Unknown",
        phone: row.patients?.phone || "",
        department: row.departments?.name || "Unassigned",
        status: row.status,
        createdAt: new Date(row.joined_at),
      }));
    },

    async getPatients() {
      const { data, error } = await sb
        .from("patients")
        .select("full_name, phone, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => ({
        name: row.full_name,
        phone: row.phone,
        lastVisit: row.created_at
          ? new Date(row.created_at).toISOString().slice(0, 10)
          : "—",
        visits: 0, // visits count would require a separate query / view
      }));
    },

    async getDepartments() {
      const { data, error } = await sb
        .from("departments")
        .select("name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => row.name);
    },

    async callNext(args) {
      // args: { department_id } optional
      let query = sb
        .from("queue_entries")
        .select("id, token_no, patient_id, department_id, patients(full_name), departments(name)")
        .eq("status", "waiting")
        .order("joined_at", { ascending: true })
        .limit(1);

      if (args?.department_id) {
        query = query.eq("department_id", args.department_id);
      }

      const { data: waiting, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      if (!waiting || waiting.length === 0) return null;

      const next = waiting[0];

      // Mark any currently serving ticket as "served" if we auto‑complete it
      let servedQuery = sb
        .from("queue_entries")
        .update({ status: "served", served_at: new Date().toISOString() })
        .eq("status", "now_serving");

      if (args?.department_id) {
        servedQuery = servedQuery.eq("department_id", args.department_id);
      }
      await servedQuery;

      // Mark this ticket as now_serving
      const { error: updateError } = await sb
        .from("queue_entries")
        .update({ status: "now_serving", called_at: new Date().toISOString() })
        .eq("id", next.id);
      if (updateError) throw updateError;

      return {
        id: next.id,
        ticket: next.token_no,
        patientName: next.patients?.full_name || "Unknown",
        department: next.departments?.name || "Unassigned",
        status: "now_serving",
        createdAt: new Date(),
      };
    },

    async skipTicket(id) {
      const { error } = await sb
        .from("queue_entries")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
      return { id, status: "cancelled" };
    },

    async completeTicket(id) {
      const { error } = await sb
        .from("queue_entries")
        .update({ status: "served", served_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { id, status: "served" };
    },

    async recallTicket(id) {
      const { error } = await sb
        .from("queue_entries")
        .update({ status: "waiting" })
        .eq("id", id);
      if (error) throw error;
      return { id, status: "waiting" };
    },
  };

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  /* ---------------- App state ---------------- */
  const state = {
    queue: [],
    patients: [],
    departments: [],
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
    return (
      {
        waiting: "Waiting",
        now_serving: "Serving",
        serving: "Serving",
        served: "Served",
        completed: "Completed",
        cancelled: "Cancelled",
        skipped: "Skipped",
      }[status] || status
    );
  }

  /* ---------------- Rendering ---------------- */
  function renderClock() {
    const now = new Date();
    el.clock.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function renderNowServing() {
    const serving = state.queue.find(
      (t) => t.status === "serving" || t.status === "now_serving"
    );
    if (serving) {
      el.nowServingNumber.textContent = serving.ticket;
      el.nowServingName.textContent =
        `${serving.patientName} · ${serving.department}`;
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
    const waiting = state.queue.filter(
      (t) => t.status === "waiting"
    ).length;
    el.statWaiting.textContent = waiting;

    const waitingTickets = state.queue.filter(
      (t) => t.status === "waiting"
    );
    const avg = waitingTickets.length
      ? Math.round(
          waitingTickets.reduce(
            (sum, t) => sum + (Date.now() - t.createdAt.getTime()) / 60000,
            0
          ) / waitingTickets.length
        )
      : 0;
    el.statAvgWait.innerHTML = `${avg}<span class="unit">min</span>`;

    const served = state.queue.filter(
      (t) => t.status === "served" || t.status === "completed"
    ).length;
    const skipped = state.queue.filter(
      (t) => t.status === "cancelled" || t.status === "skipped"
    ).length;
    el.statServed.textContent = served;
    el.statSkipped.textContent = skipped;
  }

  function renderNavBadge() {
    const waiting = state.queue.filter((t) => t.status === "waiting").length;
    el.navQueueCount.textContent = waiting;
  }

  function initials(name) {
    return name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  function renderQueueTable() {
    const rows = state.queue
      .filter((t) => t.status !== "served" && t.status !== "completed")
      .filter((t) =>
        state.deptFilter === "all" ? true : t.department === state.deptFilter
      )
      .filter((t) => {
        if (!state.search) return true;
        const q = state.search.toLowerCase();
        return (
          t.ticket.toLowerCase().includes(q) ||
          t.patientName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const order = {
          now_serving: 0,
          serving: 0,
          waiting: 1,
          cancelled: 2,
          skipped: 2,
        };
        const aOrder = order[a.status] ?? 3;
        const bOrder = order[b.status] ?? 3;
        return aOrder - bOrder || a.createdAt - b.createdAt;
      });

    el.queueTableBody.innerHTML = "";

    if (rows.length === 0) {
      el.queueEmpty.hidden = false;
    } else {
      el.queueEmpty.hidden = true;
      rows.forEach((t) => el.queueTableBody.appendChild(buildQueueRow(t)));
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
    } else if (t.status === "serving" || t.status === "now_serving") {
      actionsWrap.appendChild(makeActionBtn("Complete", true, () => handleComplete(t.id)));
      actionsWrap.appendChild(makeActionBtn("Skip", false, () => handleSkip(t.id)));
    } else if (t.status === "cancelled" || t.status === "skipped") {
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
    state.patients.forEach((p) => {
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
      wrap.appendChild(
        makeActionBtn("View", false, () =>
          showToast(`Viewing ${p.name}'s record (placeholder)`)
        )
      );
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
    try {
      state.queue = await db.getQueue();
    } catch (err) {
      console.error("Failed to load queue:", err);
      showToast("Failed to load queue data");
    }
    renderAll();
  }

  async function handleCallNext() {
    el.callNextBtn.disabled = true;
    try {
      const next = await db.callNext();
      await loadQueueAndRender();
      showToast(
        next
          ? `Now calling ${next.ticket} — ${next.patientName}`
          : "No one waiting in the queue"
      );
    } catch (err) {
      console.error("callNext failed:", err);
      showToast("Failed to call next patient");
    } finally {
      el.callNextBtn.disabled = false;
    }
  }

  async function callSpecific(id) {
    // Complete any currently serving ticket first
    const currentlyServing = state.queue.find(
      (t) => t.status === "serving" || t.status === "now_serving"
    );
    if (currentlyServing) {
      try {
        await db.completeTicket(currentlyServing.id);
      } catch (err) {
        console.warn("Failed to auto-complete current ticket:", err);
      }
    }

    // Set the specific ticket to "now_serving" via Supabase
    try {
      const { error } = await supabaseClient
        .from("queue_entries")
        .update({ status: "now_serving", called_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to call specific ticket:", err);
      showToast("Failed to call patient");
      return;
    }

    await loadQueueAndRender();
    const t = state.queue.find((x) => x.id === id);
    showToast(`Now calling ${t ? t.ticket : ""}`);
  }

  async function handleSkip(id) {
    try {
      await db.skipTicket(id);
      await loadQueueAndRender();
      showToast(`Ticket skipped`);
    } catch (err) {
      console.error("skipTicket failed:", err);
      showToast("Failed to skip ticket");
    }
  }

  async function handleComplete(id) {
    try {
      await db.completeTicket(id);
      await loadQueueAndRender();
      showToast(`Ticket completed`);
    } catch (err) {
      console.error("completeTicket failed:", err);
      showToast("Failed to complete ticket");
    }
  }

  async function handleRecall(id) {
    try {
      await db.recallTicket(id);
      await loadQueueAndRender();
      showToast(`Ticket returned to waiting list`);
    } catch (err) {
      console.error("recallTicket failed:", err);
      showToast("Failed to recall ticket");
    }
  }

  async function handleCompleteCurrent() {
    const serving = state.queue.find(
      (t) => t.status === "serving" || t.status === "now_serving"
    );
    if (!serving) return;
    await handleComplete(serving.id);
  }

  async function handleSkipCurrent() {
    const serving = state.queue.find(
      (t) => t.status === "serving" || t.status === "now_serving"
    );
    if (!serving) return;
    await handleSkip(serving.id);
  }

  /* ---------------- View switching ---------------- */
  const VIEW_META = {
    dashboard: {
      title: "Dashboard",
      sub: "Outpatient Department · Window 3",
    },
    queue: { title: "Live Queue", sub: "All departments" },
    patients: {
      title: "Patients",
      sub: "Search and manage patient records",
    },
    reports: { title: "Reports", sub: "Daily and weekly analytics" },
    settings: {
      title: "Settings",
      sub: "Window, department, and account",
    },
  };

  function switchView(view) {
    state.view = view;
    el.navItems.forEach((item) =>
      item.classList.toggle("is-active", item.dataset.view === view)
    );
    el.views.forEach((section) => {
      section.hidden = section.id !== `view-${view}`;
    });
    const meta = VIEW_META[view] || VIEW_META.dashboard;
    el.viewTitle.textContent = meta.title;
    el.viewSub.textContent = meta.sub;

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
    el.navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        switchView(item.dataset.view);
      });
    });

    el.callNextBtn.addEventListener("click", handleCallNext);
    el.completeBtn.addEventListener("click", handleCompleteCurrent);
    el.skipBtn.addEventListener("click", handleSkipCurrent);

    el.queueSearch.addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      renderQueueTable();
    });

    el.deptFilter.addEventListener("change", (e) => {
      state.deptFilter = e.target.value;
      renderQueueTable();
    });

    el.logoutBtn.addEventListener("click", async () => {
      try {
        if (supabaseClient) {
          await supabaseClient.auth.signOut();
        }
      } catch (e) {
        console.warn("Logout error:", e.message);
      }
      window.location.href = "../../receptionist-login.html";
    });

    // Periodic refresh of "time ago" + avg wait without a full reload
    setInterval(() => {
      renderQueueTable();
      renderStats();
    }, 30000);
  }

  /* ---------------- Supabase realtime subscription ---------------- */
  function subscribeToQueueChanges() {
    if (!supabaseClient) return;
    supabaseClient
      .channel("receptionist-queue-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => loadQueueAndRender()
      )
      .subscribe();
  }

  /* ---------------- Init ---------------- */
  async function init() {
    renderClock();
    setInterval(renderClock, 1000);

    wireEvents();

    try {
      // Load departments for the filter dropdown
      state.departments = await db.getDepartments();
      if (el.deptFilter && state.departments.length > 0) {
        // Populate department filter if it exists
        const currentVal = el.deptFilter.value;
        el.deptFilter.innerHTML =
          '<option value="all">All Departments</option>';
        state.departments.forEach((dept) => {
          const opt = document.createElement("option");
          opt.value = dept;
          opt.textContent = dept;
          el.deptFilter.appendChild(opt);
        });
        el.deptFilter.value = currentVal;
      }
    } catch (err) {
      console.warn("Failed to load departments:", err);
    }

    await loadQueueAndRender();

    try {
      state.patients = await db.getPatients();
    } catch (err) {
      console.warn("Failed to load patients:", err);
    }

    el.completeBtn.disabled = true;
    el.skipBtn.disabled = true;

    // Subscribe to realtime updates
    subscribeToQueueChanges();
  }

  document.addEventListener("DOMContentLoaded", init);
})();