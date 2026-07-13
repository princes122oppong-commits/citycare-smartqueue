/* ============================================================
   admin/js/supabase-config.js
   Admin-specific Supabase helpers and auth guard.
   Include this file AFTER ../../supabase-config.js on every admin page.
   ============================================================ */

if (typeof supabaseClient === 'undefined' || !supabaseClient) {
  console.warn('Shared supabaseClient not found. Ensure ../../supabase-config.js is loaded before admin helpers.');
}

/* ------------------------------------------------------------
   Admin auth guard - redirects to admin login if not authenticated
   ------------------------------------------------------------ */

async function ensureAdminSession() {
  if (!supabaseClient) {
    console.warn("Supabase client not available for admin session check.");
    return;
  }

  const loginPath = new URL("../../admin-login.html", window.location.href).href;
  const currentPath = window.location.pathname.toLowerCase();
  if (currentPath.endsWith("/admin-login.html")) return;

  // Helper to attempt session validation with retries
  async function attemptSessionCheck(retriesLeft) {
    try {
      // First try to get the session from storage
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData?.session) {
        if (retriesLeft > 0) {
          // Session might not be restored yet - wait and retry
          return new Promise(function(resolve) {
            setTimeout(function() { resolve(attemptSessionCheck(retriesLeft - 1)); }, 1000);
          });
        }
        window.location.href = loginPath;
        return;
      }

      // Validate the session by getting the user
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data.user) {
        // Session exists but user fetch failed - try refreshing
        const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
        if (refreshError || !refreshData?.user) {
          if (retriesLeft > 0) {
            return new Promise(function(resolve) {
              setTimeout(function() { resolve(attemptSessionCheck(retriesLeft - 1)); }, 1000);
            });
          }
          await supabaseClient.auth.signOut();
          window.location.href = loginPath;
          return;
        }
        // Use refreshed user data
        data.user = refreshData.user;
      }

      const isAdmin = await isCurrentUserAdministrator(data.user.id);
      if (!isAdmin) {
        await supabaseClient.auth.signOut();
        window.location.href = loginPath;
      }
    } catch (err) {
      console.error("Admin session check failed:", err);
      if (retriesLeft > 0) {
        return new Promise(function(resolve) {
          setTimeout(function() { resolve(attemptSessionCheck(retriesLeft - 1)); }, 1000);
        });
      }
      window.location.href = loginPath;
    }
  }

  // Start with 3 retries (about 3 seconds total)
  await attemptSessionCheck(3);
}

// Run auth guard on every page load
document.addEventListener("DOMContentLoaded", ensureAdminSession);

/* ------------------------------------------------------------
   Shared helper functions used across admin pages
   ------------------------------------------------------------ */

function formatDisplayDate(date) {
  return (date || new Date()).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric"
  });
}

function formatMinutes(mins) {
  return (Math.round(Number(mins) || 0)) + " mins";
}

function formatDisplayDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

function formatDisplayTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit"
  });
}

function startOfTodayIso() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayIso() {
  var d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

async function countTable(table, applyFilters) {
  var query = supabaseClient.from(table).select("*", { count: "exact", head: true });
  if (typeof applyFilters === "function") query = applyFilters(query);
  var result = await query;
  if (result.error) {
    console.error("Error counting " + table + ":", result.error.message);
    return 0;
  }
  return result.count || 0;
}

function statusClass(status) {
  var map = {
    active: "success", normal: "success", confirmed: "success", served: "success",
    busy: "warning", pending: "warning", waiting: "warning",
    inactive: "danger", cancelled: "danger", left: "danger"
  };
  return map[(status || "").toLowerCase()] || "neutral";
}

async function fetchTable(table, options) {
  options = options || {};
  var query = supabaseClient.from(table).select(options.select || "*");
  if (options.eq) {
    Object.keys(options.eq).forEach(function(col) {
      query = query.eq(col, options.eq[col]);
    });
  }
  if (options.order) {
    query = query.order(options.order.column, { ascending: options.order.ascending !== false });
  }
  if (options.gte) {
    Object.keys(options.gte).forEach(function(col) {
      query = query.gte(col, options.gte[col]);
    });
  }
  if (options.lte) {
    Object.keys(options.lte).forEach(function(col) {
      query = query.lte(col, options.lte[col]);
    });
  }
  if (options.in) {
    Object.keys(options.in).forEach(function(col) {
      query = query.in(col, options.in[col]);
    });
  }
  if (options.limit) query = query.limit(options.limit);
  var result = await query;
  if (result.error) {
    console.error("Error fetching " + table + ":", result.error.message);
    return [];
  }
  return result.data;
}

/* ------------------------------------------------------------
   Sidebar toggle for mobile
   ------------------------------------------------------------ */

function initSidebarToggle() {
  const toggleBtn = document.querySelector("[data-sidebar-toggle]");
  const sidebar = document.querySelector(".sidebar");
  if (!toggleBtn || !sidebar) return;
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("sidebar--open");
  });
}

document.addEventListener("DOMContentLoaded", initSidebarToggle);

/* ------------------------------------------------------------
   Sign out handler - used across all admin pages
   ------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", function() {
  const signoutBtn = document.getElementById("signoutBtn");
  if (signoutBtn) {
    signoutBtn.addEventListener("click", async function() {
      if (!confirm("Are you sure you want to sign out?")) return;
      try {
        if (supabaseClient) {
          await supabaseClient.auth.signOut();
        }
      } catch (e) {
        console.warn("Sign out error:", e.message);
      }
      window.location.href = "../../admin-login.html";
    });
  }
});
