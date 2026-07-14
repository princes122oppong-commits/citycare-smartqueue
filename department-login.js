/* ==========================================================================
   department-login.js
   Login handler for department receptionist (doctors, nurses).
   After login, redirects to department dashboard.
   ========================================================================== */

var deptLoginForm = document.getElementById("deptLoginForm");
var deptEmail = document.getElementById("deptEmail");
var deptPassword = document.getElementById("deptPassword");
var deptEmailError = document.getElementById("deptEmailError");
var deptPasswordError = document.getElementById("deptPasswordError");
var togglePassword = document.getElementById("toggleDeptPassword");

// Password toggle
if (togglePassword && deptPassword) {
  togglePassword.addEventListener("click", function() {
    var isHidden = deptPassword.type === "password";
    deptPassword.type = isHidden ? "text" : "password";
    togglePassword.textContent = isHidden ? "Hide" : "Show";
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Auto-redirect if already authenticated
async function redirectIfDepartmentAuth() {
  if (!supabaseClient) return;

  try {
    var authResult = await supabaseClient.auth.getUser();
    if (authResult.error || !authResult.data.user) return;

    var userId = authResult.data.user.id;

    // Check if user is in receptionist table with a department_id
    var receptionistResult = await supabaseClient
      .from("receptionist")
      .select("id, department_id, role")
      .eq("auth_uid", userId)
      .maybeSingle();

    if (!receptionistResult.error && receptionistResult.data && receptionistResult.data.department_id) {
      window.location.href = "department/dashboard.html";
      return;
    }

    // Not a department receptionist - sign out
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.warn("Auto-redirect check failed:", err.message);
  }
}

if (deptLoginForm) {
  deptLoginForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    // Clear errors
    if (deptEmailError) deptEmailError.textContent = "";
    if (deptPasswordError) deptPasswordError.textContent = "";

    // Validate
    var hasError = false;
    if (!isValidEmail(deptEmail.value.trim())) {
      if (deptEmailError) deptEmailError.textContent = "Please enter a valid email address.";
      hasError = true;
    }
    if (deptPassword.value.length < 6) {
      if (deptPasswordError) deptPasswordError.textContent = "Password must be at least 6 characters.";
      hasError = true;
    }
    if (hasError) return;

    var submitBtn = deptLoginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {
      if (!supabaseClient) throw new Error("Supabase is not configured.");

      // Authenticate
      var authResult = await supabaseClient.auth.signInWithPassword({
        email: deptEmail.value.trim(),
        password: deptPassword.value,
      });

      if (authResult.error) throw authResult.error;

      var userId = authResult.data.user.id;

      // Verify this user is in the receptionist table with a department_id
      var receptionistResult = await supabaseClient
        .from("receptionist")
        .select("id, department_id, role, full_name")
        .eq("auth_uid", userId)
        .maybeSingle();

      if (receptionistResult.error || !receptionistResult.data) {
        await supabaseClient.auth.signOut();
        throw new Error("No department receptionist account found for this email.");
      }

      if (!receptionistResult.data.department_id) {
        await supabaseClient.auth.signOut();
        throw new Error("This account is not assigned to any department. Please contact an administrator.");
      }

      window.location.href = "department/dashboard.html";
    } catch (err) {
      if (deptPasswordError) deptPasswordError.textContent = err.message || "Login failed. Please try again.";
      await supabaseClient.auth.signOut();
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Login to Department Portal";
    }
  });
}

// Check auto-redirect on load
document.addEventListener("DOMContentLoaded", function() {
  redirectIfDepartmentAuth();
});