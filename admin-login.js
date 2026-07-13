// Admin login script — similar to login.js but verifies Administrator role
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');

togglePassword?.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePassword.textContent = isHidden ? '🙈' : '👁';
  togglePassword.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const emailError = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function redirectIfAuthenticatedAdmin() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return;
  if (!data.user) return;

  if (await isCurrentUserAdministrator(data.user.id)) {
    window.location.href = 'admin/html/admin-dashboard.html';
  }
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  emailError.textContent = '';
  passwordError.textContent = '';

  let hasError = false;
  if (!isValidEmail(emailInput.value.trim())) {
    emailError.textContent = 'Please enter a valid email address.';
    hasError = true;
  }
  if (passwordInput.value.length < 6) {
    passwordError.textContent = 'Password must be at least 6 characters.';
    hasError = true;
  }
  if (hasError) return;

  const submitBtn = loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    if (!supabaseClient) throw new Error('Supabase is not configured.');

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) throw new Error('Unable to authenticate user.');

    if (!(await isCurrentUserAdministrator(userId))) {
      await supabaseClient.auth.signOut();
      throw new Error('Access denied — administrator credentials required.');
    }

    window.location.href = 'admin/html/admin-dashboard.html';
  } catch (err) {
    passwordError.textContent = err.message || 'Something went wrong. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('auto') === '1') {
    redirectIfAuthenticatedAdmin();
  }
});
