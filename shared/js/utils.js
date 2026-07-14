/* ==========================================================================
   shared/js/utils.js
   Shared utility functions used across all portals (admin, receptionist, patient).
   ========================================================================== */

/**
 * Escape HTML special characters to prevent XSS.
 */
var ESCAPE_REPLACE = [
  ["&", "&" + "amp;"],
  ["<", "&" + "lt;"],
  [">", "&" + "gt;"],
  ['"', "&" + "quot;"],
  ["'", "&#" + "39;"]
];

function escapeHtml(value) {
  var str = String(value ?? "");
  for (var i = 0; i < ESCAPE_REPLACE.length; i++) {
    str = str.split(ESCAPE_REPLACE[i][0]).join(ESCAPE_REPLACE[i][1]);
  }
  return str;
}

/**
 * Format a Date as "May 20, 2025"
 */
function formatDisplayDate(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a Date as "May 20, 2025" (short)
 */
function formatDateShort(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format minutes as "28 mins"
 */
function formatMinutes(mins) {
  return `${Math.round(Number(mins) || 0)} mins`;
}

/**
 * Format a date-time value for display.
 */
function formatDisplayDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a time value for display.
 */
function formatDisplayTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Get ISO string for start of today.
 */
function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * Get ISO string for end of today.
 */
function endOfTodayIso() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

/**
 * Calculate minutes since a given date string.
 */
function minutesSince(value) {
  if (!value) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
}

/**
 * Map a status string to a CSS class suffix for status pills.
 */
function statusClass(status) {
  const map = {
    active: "success",
    normal: "success",
    confirmed: "success",
    served: "success",
    busy: "warning",
    pending: "warning",
    waiting: "warning",
    inactive: "danger",
    cancelled: "danger",
    left: "danger",
  };
  return map[(status || "").toLowerCase()] || "neutral";
}

/**
 * Map status to badge class for receptionist UI.
 */
function receptionistBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["served", "completed", "confirmed", "active"].includes(normalized)) return "green";
  if (["waiting", "pending"].includes(normalized)) return "amber";
  if (["now_serving", "called", "in queue"].includes(normalized)) return "blue";
  if (["cancelled", "canceled", "skipped", "inactive", "no show"].includes(normalized)) return "red";
  return "blue";
}

/**
 * Build an ISO datetime string from a date and time string.
 */
function buildScheduledAt(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [time, period] = timeStr.split(" ");
  const [hours, minutes] = time.split(":").map(Number);
  let hour = hours;
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  const scheduled = new Date(dateStr);
  scheduled.setHours(hour, minutes, 0, 0);
  return scheduled.toISOString();
}

/**
 * Generic Supabase fetch wrapper with error handling.
 */
async function fetchTable(table, options = {}) {
  let query = supabaseClient.from(table).select(options.select || "*");
  if (options.eq) {
    Object.entries(options.eq).forEach(([col, val]) => {
      query = query.eq(col, val);
    });
  }
  if (options.order) {
    query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
  }
  if (options.gte) {
    Object.entries(options.gte).forEach(([col, val]) => {
      query = query.gte(col, val);
    });
  }
  if (options.lte) {
    Object.entries(options.lte).forEach(([col, val]) => {
      query = query.lte(col, val);
    });
  }
  if (options.in) {
    Object.entries(options.in).forEach(([col, val]) => {
      query = query.in(col, val);
    });
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }
  const { data, error } = await query;
  if (error) {
    console.error(`Error fetching ${table}:`, error.message);
    return [];
  }
  return data;
}

/**
 * Count rows in a table with optional filters.
 */
async function countTable(table, applyFilters = null) {
  let query = supabaseClient.from(table).select("*", { count: "exact", head: true });
  if (typeof applyFilters === "function") query = applyFilters(query);
  const { count, error } = await query;
  if (error) {
    console.error(`Error counting ${table}:`, error.message);
    return 0;
  }
  return count || 0;
}

/**
 * Initialize sidebar toggle for mobile.
 */
function initSidebarToggle(sidebarSelector = ".sidebar", toggleAttr = "[data-sidebar-toggle]") {
  const toggleBtn = document.querySelector(toggleAttr);
  const sidebar = document.querySelector(sidebarSelector);
  if (!toggleBtn || !sidebar) return;
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("sidebar--open");
  });
}