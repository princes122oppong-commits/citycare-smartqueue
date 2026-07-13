/* ==========================================================================
   Shared Supabase client config for root and patient pages.
   Replace the placeholders below with your project's values.

   IMPORTANT: This file contains your Supabase URL and anon key.
   For production, load these from environment variables or use the
   supabase-config.example.js template and gitignore the real config.
   ========================================================================== */

const SUPABASE_URL = "https://rajpvoytqhjrxotywyjv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JImYKMspx6cOZj_AHi4pxg_YKHCFTs_";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "sb-smartqueue-auth",
        flowType: 'pkce',
      },
    })
  : null;

if (!supabaseClient) {
  console.warn(
    "Supabase SDK not found. Make sure the CDN script is loaded before supabase-config.js"
  );
}

/* ==========================================================================
   Shared auth and helper functions
   ========================================================================== */

async function getCurrentAuthUser() {
  if (!supabaseClient) return null;
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();
  if (error) {
    const isExpectedMissingSession =
      error?.message?.toLowerCase().includes("auth session missing") ||
      error?.status === 401;

    if (!isExpectedMissingSession) {
      console.error("Failed to read Supabase auth user:", error.message);
    }
    return null;
  }
  return user;
}

async function getCurrentPatient() {
  const user = await getCurrentAuthUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from("patients")
    .select("*")
    .eq("auth_uid", user.id)
    .single();
  if (error) {
    console.warn("Patient profile not found:", error.message);
    return null;
  }
  return data;
}

async function getCurrentStaffOrAdmin() {
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const staffQuery = await supabaseClient
    .from("staff")
    .select("*, department_id")
    .eq("auth_uid", user.id)
    .maybeSingle();

  if (!staffQuery.error && staffQuery.data) {
    return { type: "staff", profile: staffQuery.data };
  }

  const usersQuery = await supabaseClient
    .from("users")
    .select("id, full_name, email, role, department_id, status, phone, notes")
    .eq("auth_uid", user.id)
    .maybeSingle();

  if (!usersQuery.error && usersQuery.data) {
    return {
      type: usersQuery.data.role === "Administrator" ? "admin" : "staff",
      profile: usersQuery.data,
    };
  }

  return null;
}

function getLoginUrl() {
  return "/login.html";
}

function getRegisterUrl() {
  return "/register.html";
}

async function redirectToLoginIfUnauthenticated() {
  const user = await getCurrentAuthUser();
  if (!user) {
    window.location.href = getLoginUrl();
    return false;
  }
  return true;
}

async function isCurrentUserAdministrator(userId) {
  if (!supabaseClient || !userId) return false;

  const [userResult, staffResult] = await Promise.allSettled([
    supabaseClient
      .from("users")
      .select("role, status")
      .eq("auth_uid", userId)
      .maybeSingle(),
    supabaseClient
      .from("staff")
      .select("role, status")
      .eq("auth_uid", userId)
      .maybeSingle(),
  ]);

  if (userResult.status === "fulfilled" && userResult.value.data) {
    if (
      userResult.value.data.role === "Administrator" &&
      userResult.value.data.status !== "Inactive"
    ) {
      return true;
    }
  }

  if (staffResult.status === "fulfilled" && staffResult.value.data) {
    if (
      staffResult.value.data.role === "Administrator" &&
      staffResult.value.data.status !== "Inactive"
    ) {
      return true;
    }
  }

  return false;
}

async function determineRedirectTarget(userId) {
  if (!supabaseClient || !userId) return "patients/html/patients-dashboard.html";

  const { data: staff, error: staffError } = await supabaseClient
    .from("staff")
    .select("role")
    .eq("auth_uid", userId)
    .maybeSingle();
  if (!staffError && staff) {
    return staff.role === "Administrator" ? "admin/html/admin-dashboard.html" : "staff/html/staff-dashboard.html";
  }

  const { data: userRow, error: userError } = await supabaseClient
    .from("users")
    .select("role")
    .eq("auth_uid", userId)
    .maybeSingle();
  if (!userError && userRow) {
    return userRow.role === "Administrator"
      ? "admin/html/admin-dashboard.html"
      : "staff/html/staff-dashboard.html";
  }

  const { data: patient, error: patientError } = await supabaseClient
    .from("patients")
    .select("id")
    .eq("auth_uid", userId)
    .maybeSingle();
  if (!patientError && patient) {
    return "patients/html/patients-dashboard.html";
  }

  return "patients/html/patients-dashboard.html";
}

async function ensureDepartment(departmentName) {
  if (!supabaseClient || !departmentName) return null;

  const normalizedName = departmentName.trim();
  if (!normalizedName) return null;

  try {
    const { data, error } = await supabaseClient
      .from("departments")
      .select("id")
      .eq("name", normalizedName)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) {
      return data.id;
    }

    const { data: inserted, error: insertError } = await supabaseClient
      .from("departments")
      .insert({ name: normalizedName, description: normalizedName, status: "Active" })
      .select("id")
      .single();

    if (insertError) {
      console.error("Unable to create department:", insertError.message);
      return null;
    }

    return inserted?.id ?? null;
  } catch (error) {
    console.error("Department lookup failed:", error.message || error);
    return null;
  }
}

/* ==========================================================================
   HTML Escaping utility (XSS prevention)
   Also defined in shared/js/utils.js — both must stay until we
   refactor all pages to include the shared file.
   ========================================================================== */

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

/* ==========================================================================
   Date/time utilities
   ========================================================================== */

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfTodayIso() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

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

/* ==========================================================================
   Mobile sidebar toggle for patient pages
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function() {
  const toggleBtn = document.getElementById("mobileToggle");
  const sidebar = document.querySelector(".sidebar");
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", function() {
      sidebar.classList.toggle("open");
    });
    // Close sidebar when clicking a nav link
    document.querySelectorAll(".nav a").forEach(function(link) {
      link.addEventListener("click", function() {
        sidebar.classList.remove("open");
      });
    });
    // Close sidebar when clicking outside
    document.addEventListener("click", function(e) {
      if (sidebar.classList.contains("open") &&
          !sidebar.contains(e.target) &&
          !toggleBtn.contains(e.target)) {
        sidebar.classList.remove("open");
      }
    });
  }
});
