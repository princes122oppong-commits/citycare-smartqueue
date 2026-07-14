/* ==========================================================================
   patient-login.js - Patient-only Google sign-in
   After Google auth, ensures user has a patient profile and redirects to patient dashboard.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function() {
  var googleBtn = document.getElementById('googleSignIn');
  if (!googleBtn) return;

  googleBtn.addEventListener('click', async function() {
    if (!supabaseClient) {
      alert('Supabase is not configured.');
      return;
    }

    googleBtn.disabled = true;
    googleBtn.textContent = 'Signing in...';

    try {
      // Sign in with Google OAuth
      var result = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/patient-login.html'
        }
      });

      if (result.error) {
        throw result.error;
      }

      // The OAuth flow will redirect, so this code may not execute
      // If it does, it means the auth was successful without redirect
    } catch (err) {
      alert(err.message || 'Google sign-in failed. Please try again.');
      googleBtn.disabled = false;
      googleBtn.textContent = 'Continue with Google';
    }
  });

  // Handle the OAuth callback - check if user just returned from Google
  handleOAuthCallback();
});

async function handleOAuthCallback() {
  if (!supabaseClient) return;

  try {
    // Check if user is authenticated (returned from OAuth)
    var authResult = await supabaseClient.auth.getUser();
    if (authResult.error || !authResult.data.user) return;

    var user = authResult.data.user;
    var userId = user.id;
    var userEmail = user.email;

    // Check if user has a patient profile
    var patientResult = await supabaseClient
      .from('patients')
      .select('id, full_name, phone')
      .eq('auth_uid', userId)
      .maybeSingle();

    // If no patient profile exists, create one
    if (patientResult.error || !patientResult.data) {
      console.log('No patient profile found, creating one...');

      // Extract name from Google profile
      var fullName = user.user_metadata?.full_name || user.user_metadata?.name || 'Patient';
      var phone = user.phone || '';

      // Create patient profile
      var insertResult = await supabaseClient
        .from('patients')
        .insert({
          auth_uid: userId,
          full_name: fullName,
          email: userEmail,
          phone: phone,
          gender: null,
          address: null
        })
        .select('id')
        .single();

      if (insertResult.error) {
        console.error('Failed to create patient profile:', insertResult.error);
        alert('Unable to create patient profile. Please contact support.');
        await supabaseClient.auth.signOut();
        return;
      }

      console.log('Patient profile created successfully');
    }

    // Redirect to patient dashboard
    window.location.href = 'patients/html/patients-dashboard.html';
  } catch (err) {
    console.error('OAuth callback error:', err);
    // Don't show alert on callback - just redirect to login
  }
}