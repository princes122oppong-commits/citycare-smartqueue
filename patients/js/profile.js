/* ============================================================
   Profile page logic
   Replace handleSave's mock update with a real Supabase call:

   const { error } = await supabase
     .from('patients')
     .update({ full_name, phone, email, dob, gender, address })
     .eq('id', currentUser.id);
   ============================================================ */

async function loadProfile() {
  if (!supabaseClient) return;
  const patient = await getCurrentPatient();
  if (!patient) {
    window.location.href = getLoginUrl();
    return;
  }

  // Get auth user for username - use full name from patient record
  var username = patient.full_name || 'Patient';
  var memberSince = patient.created_at ? new Date(patient.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

  // Personal information
  document.getElementById('full-name').value = patient.full_name || '';
  document.getElementById('phone').value = patient.phone || '';
  document.getElementById('email').value = patient.email || '';
  document.getElementById('gender').value = patient.gender || 'Male';
  document.getElementById('address').value = patient.address || '';

  // Account information
  var usernameEl = document.getElementById('username');
  var memberSinceEl = document.getElementById('member-since');
  if (usernameEl) usernameEl.textContent = username;
  if (memberSinceEl) memberSinceEl.textContent = memberSince;
}

async function handleSave(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const original = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    if (!supabaseClient) throw new Error('Supabase is not configured.');
    const patient = await getCurrentPatient();
    if (!patient) {
      window.location.href = getLoginUrl();
      return;
    }

    const payload = {
      full_name: document.getElementById('full-name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim(),
      gender: document.getElementById('gender').value,
      address: document.getElementById('address').value.trim(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseClient.from('patients').update(payload).eq('id', patient.id);
    if (error) throw error;

    btn.textContent = 'Changes Saved ✓';
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1600);
  } catch (err) {
    alert(err.message || 'Could not save profile.');
    btn.textContent = original;
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  document.getElementById('profile-form').addEventListener('submit', handleSave);

  document.getElementById('change-password').addEventListener('click', async () => {
    if (!supabaseClient) return;
    const newPassword = prompt('Enter your new password:');
    if (!newPassword) return;
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      alert('Unable to update password: ' + error.message);
      return;
    }
    alert('Password updated successfully.');
  });
});
