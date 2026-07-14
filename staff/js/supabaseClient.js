/* ==========================================================================
   Shared Supabase helpers for receptionist pages.
   The root ../../supabase-config.js must be loaded before this file.
   ========================================================================== */

if (typeof supabaseClient === "undefined" || !supabaseClient) {
  console.warn("Shared supabaseClient not found. Ensure ../../supabase-config.js is loaded before receptionist helpers.");
}

async function ensurereceptionistSession() {
  if (!supabaseClient) return;

  const loginPath = new URL("../../receptionist-login.html", window.location.href).href;
  const currentPath = window.location.pathname.toLowerCase();
  if (currentPath.endsWith("/receptionist-login.html")) return;

  async function attemptSessionCheck(retriesLeft) {
    let userId;

    try {
      // First try to get the session from storage
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData?.session) {
        if (retriesLeft > 0) {
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
        userId = refreshData.user.id;
      } else {
        userId = data.user.id;
      }

      // Store userId for the rest of the function
      window.__receptionistUserId = userId;
      return;
    } catch (err) {
      console.error("receptionist session check failed:", err);
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

  var uid = window.__receptionistUserId;

  // Check receptionist table first
  try {
    const { data: receptionistProfile, error: receptionistError } = await supabaseClient
      .from("receptionist")
      .select("id, status")
      .eq("auth_uid", uid)
      .maybeSingle();

    if (!receptionistError && receptionistProfile && receptionistProfile.status !== "Inactive") return;
  } catch (e) {
    console.warn("receptionist table check failed:", e.message);
  }

  // Fall back to users table
  try {
    const { data: userProfile, error: userError } = await supabaseClient
      .from("users")
      .select("id, role, status")
      .eq("auth_uid", uid)
      .maybeSingle();

    if (
      !userError &&
      userProfile &&
      ["receptionist", "Administrator"].includes(userProfile.role) &&
      userProfile.status !== "Inactive"
    ) {
      return;
    }
  } catch (e) {
    console.warn("Users table check failed:", e.message);
  }

  // Not found in either table - redirect to login
  await supabaseClient.auth.signOut();
  window.location.href = loginPath;
}

function escapereceptionistHtml(value) {
  return typeof escapeHtml === "function" ? escapeHtml(value) : String(value ?? "");
}

function formatreceptionistDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatreceptionistDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function minutesSince(value) {
  if (!value) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
}

function receptionistBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["served", "completed", "confirmed", "active"].includes(normalized)) return "green";
  if (["waiting", "pending"].includes(normalized)) return "amber";
  if (["now_serving", "called", "in queue"].includes(normalized)) return "blue";
  if (["cancelled", "canceled", "skipped", "inactive", "no show"].includes(normalized)) return "red";
  return "blue";
}

async function getCurrentreceptionistProfile() {
  if (!supabaseClient) return null;
  const { data: authData, error } = await supabaseClient.auth.getUser();
  if (error || !authData.user) return null;

  // Try receptionist table first
  try {
    const receptionistResult = await supabaseClient
      .from("receptionist")
      .select("id, auth_uid, full_name, email, role, department_id, phone, status, created_at, updated_at")
      .eq("auth_uid", authData.user.id)
      .maybeSingle();

    if (!receptionistResult.error && receptionistResult.data) {
      let departmentRow = null;
      if (receptionistResult.data.department_id) {
        const deptResult = await supabaseClient
          .from("departments")
          .select("name")
          .eq("id", receptionistResult.data.department_id)
          .maybeSingle();
        if (!deptResult.error) {
          departmentRow = deptResult.data;
        }
      }

      return {
        source: "receptionist",
        authUser: authData.user,
        profile: {
          ...receptionistResult.data,
          departments: departmentRow ? { name: departmentRow.name } : null,
        },
      };
    }
  } catch (e) {
    console.warn("receptionist profile lookup failed:", e.message);
  }

  // Fall back to users table
  try {
    const userResult = await supabaseClient
      .from("users")
      .select("id, auth_uid, full_name, email, role, department_id, phone, notes, status, joined_at")
      .eq("auth_uid", authData.user.id)
      .maybeSingle();

    if (!userResult.error && userResult.data && ["receptionist", "Administrator"].includes(userResult.data.role)) {
      let departmentRow = null;
      if (userResult.data.department_id) {
        const deptResult = await supabaseClient
          .from("departments")
          .select("name")
          .eq("id", userResult.data.department_id)
          .maybeSingle();
        if (!deptResult.error) {
          departmentRow = deptResult.data;
        }
      }

      return {
        source: "users",
        authUser: authData.user,
        profile: {
          ...userResult.data,
          departments: departmentRow ? { name: departmentRow.name } : null,
        },
      };
    }
  } catch (e) {
    console.warn("Users table profile lookup failed:", e.message);
  }

  return null;
}

async function renderreceptionistShellProfile() {
  const info = await getCurrentreceptionistProfile();
  if (!info?.profile) return;
  const name = info.profile.full_name || "receptionist User";
  const role = info.profile.role || "receptionist";
  const email = info.profile.email || info.authUser.email || "";
  document.querySelectorAll(".profile-name").forEach((el) => { el.textContent = name; });
  document.querySelectorAll(".profile-role").forEach((el) => { el.textContent = role; });
  document.querySelectorAll(".profile-email").forEach((el) => { el.textContent = email; });
  document.querySelectorAll(".profile-avatar").forEach((el) => {
    el.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SU";
  });
}

async function fetchWaitingTokens(departmentId = null) {
  if (!supabaseClient) return { data: [], error: "Supabase not configured" };

  let queueQuery = supabaseClient
    .from("queue_entries")
    .select("id, token_no, status, joined_at, patient_id, department_id, expected_wait_minutes")
    .in("status", ["waiting", "now_serving"])
    .order("joined_at", { ascending: true });

  if (departmentId) queueQuery = queueQuery.eq("department_id", departmentId);

  const [queueResult, departmentResult, patientResult] = await Promise.all([
    queueQuery,
    supabaseClient.from("departments").select("id, name"),
    supabaseClient.from("patients").select("id, full_name"),
  ]);

  if (queueResult.error) {
    return { data: [], error: queueResult.error };
  }

  const departmentMap = Object.fromEntries((departmentResult.data || []).map((row) => [row.id, row.name]));
  const patientMap = Object.fromEntries((patientResult.data || []).map((row) => [row.id, row.full_name]));

  return {
    data: (queueResult.data || []).map((row) => ({
      ...row,
      patients: { full_name: patientMap[row.patient_id] || "Unknown patient" },
      departments: { name: departmentMap[row.department_id] || "Unassigned" },
    })),
    error: null,
  };
}

function subscribeToTokenUpdates(onChange) {
  if (!supabaseClient) return null;

  return supabaseClient
    .channel("queue-entries-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "queue_entries" },
      (payload) => onChange(payload)
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", ensurereceptionistSession);
document.addEventListener("DOMContentLoaded", renderreceptionistShellProfile);

/* ------------------------------------------------------------
   receptionist sign out handler
   ------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", function() {
  const signoutBtn = document.getElementById("receptionistSignoutBtn");
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
      window.location.href = "../../receptionist-login.html";
    });
  }
});
