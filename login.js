/* ==========================================================================
   login.js - Unified login for patients, staff, and administrators.
   Routes users to the appropriate dashboard after authentication.
   ========================================================================== */

// --- Password visibility toggle ---
var togglePassword = document.getElementById('togglePassword');
var passwordInput = document.getElementById('password');

if (togglePassword && passwordInput) {
  togglePassword.addEventListener('click', function() {
    var isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePassword.textContent = isHidden ? '🙈' : '👁';
    togglePassword.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });
}

// --- Form validation elements ---
var loginForm = document.getElementById('loginForm');
var emailInput = document.getElementById('email');
var emailError = document.getElementById('emailError');
var passwordError = document.getElementById('passwordError');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// --- Auto-redirect if already authenticated ---
async function redirectIfAuthenticated() {
  if (!supabaseClient) return;

  try {
    var authResult = await supabaseClient.auth.getUser();
    if (authResult.error || !authResult.data.user) return;

    var target = await determineRedirectTarget(authResult.data.user.id);
    window.location.href = target;
  } catch (err) {
    console.warn('Auto-redirect check failed:', err.message);
  }
}

// --- Main login handler ---
if (loginForm) {
  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Clear previous errors
    if (emailError) emailError.textContent = '';
    if (passwordError) passwordError.textContent = '';

    // Validate inputs
    var hasError = false;
    if (!isValidEmail(emailInput.value.trim())) {
      if (emailError) emailError.textContent = 'Please enter a valid email address.';
      hasError = true;
    }
    if (passwordInput.value.length < 6) {
      if (passwordError) passwordError.textContent = 'Password must be at least 6 characters.';
      hasError = true;
    }
    if (hasError) return;

    // Show loading state
    var submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      if (!supabaseClient) throw new Error('Supabase is not configured.');

      // Authenticate with Supabase
      var authResult = await supabaseClient.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value,
      });

      if (authResult.error) throw authResult.error;

      var userId = authResult.data.user.id;
      if (!userId) throw new Error('Unable to authenticate user.');

      // Determine where to redirect based on role
      var redirectTarget = await determineRedirectTarget(userId);

      // Check if user has a patient profile - if not, that's OK (they may be staff/admin)
      var patientCheck = await supabaseClient
        .from('patients')
        .select('id')
        .eq('auth_uid', userId)
        .maybeSingle();

      // If user is only a patient (no staff/admin role), ensure they have a patient profile
      var isStaffOrAdmin = redirectTarget.indexOf('staff') >= 0 || redirectTarget.indexOf('admin') >= 0;
      if (!isStaffOrAdmin && (patientCheck.error || !patientCheck.data)) {
        await supabaseClient.auth.signOut();
        throw new Error('No patient profile found for this account. Please register first.');
      }

      window.location.href = redirectTarget;
    } catch (err) {
      if (passwordError) passwordError.textContent = err.message || 'Something went wrong. Please try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  });
}

// --- Auto-redirect on page load if already authenticated ---
document.addEventListener('DOMContentLoaded', function() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('auto') === '1') {
    redirectIfAuthenticated();
  }
});
