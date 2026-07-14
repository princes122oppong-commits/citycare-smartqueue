/* Copy to supabase-config.js and fill in your Supabase project values.
   Do not commit real keys to version control.

   Setup Instructions:
   1. Create a Supabase project at https://supabase.com
   2. Go to Project Settings -> API
   3. Copy your Project URL and anon/public key below
   4. Run supabase-bootstrap.sql in the Supabase SQL Editor
   5. Save this file as supabase-config.js
   ========================================================================== */

const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabaseClient) {
  console.warn(
    "Supabase SDK not found. Make sure the CDN script is loaded before supabase-config.js"
  );
}

/* ==========================================================================
   Auth & Helper Functions
   ========================================================================== */

async function getCurrentAuthUser() {
  if (!supabaseClient) return null;
  var result = await supabaseClient.auth.getUser();
  var user = result.data ? result.data.user : null;
  var error = result.error;
  if (error) {
    if (!error.message.toLowerCase().includes("auth session missing") && error.status !== 401) {
      console.error("Failed to read Supabase auth user:", error.message);
    }
    return null;
  }
  return user;
}

async function getCurrentPatient() {
  var user = await getCurrentAuthUser();
  if (!user) return null;
  var result = await supabaseClient.from("patients").select("*").eq("auth_uid", user.id).single();
  if (result.error) {
    console.warn("Patient profile not found:", result.error.message);
    return null;
  }
  return result.data;
}

async function determineRedirectTarget(userId) {
  if (!supabaseClient || !userId) return "patients/html/patients-dashboard.html";
  var receptionistResult = await supabaseClient.from("receptionist").select("role").eq("auth_uid", userId).maybeSingle();
  if (!receptionistResult.error && receptionistResult.data) {
    return receptionistResult.data.role === "Administrator" ? "admin/html/admin-dashboard.html" : "receptionist/html/receptionist-dashboard.html";
  }
  var userResult = await supabaseClient.from("users").select("role").eq("auth_uid", userId).maybeSingle();
  if (!userResult.error && userResult.data) {
    return userResult.data.role === "Administrator" ? "admin/html/admin-dashboard.html" : "receptionist/html/receptionist-dashboard.html";
  }
  return "patients/html/patients-dashboard.html";
}

function getLoginUrl() { return "/login.html"; }
function getRegisterUrl() { return "/register.html"; }

/* ==========================================================================
   HTML Escaping utility (XSS prevention)
   ========================================================================== */
var REPLACE_ENTRIES = [
  ["&", "&" + "amp;"],
  ["<", "&" + "lt;"],
  [">", "&" + "gt;"],
  ['"', "&" + "quot;"],
  ["'", "&#" + "39;"]
];
function escapeHtml(value) {
  var str = String(value ?? "");
  for (var i = 0; i < REPLACE_ENTRIES.length; i++) {
    str = str.split(REPLACE_ENTRIES[i][0]).join(REPLACE_ENTRIES[i][1]);
  }
  return str;
}

/* ==========================================================================
   Date/time utilities
   ========================================================================== */
function startOfTodayIso() {
  var date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfTodayIso() {
  var date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function buildScheduledAt(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  var parts = timeStr.split(" ");
  var time = parts[0];
  var period = parts[1];
  var hm = time.split(":").map(Number);
  var hours = hm[0];
  var minutes = hm[1];
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  var scheduled = new Date(dateStr);
  scheduled.setHours(hours, minutes, 0, 0);
  return scheduled.toISOString();
}