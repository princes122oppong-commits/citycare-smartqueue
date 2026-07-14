// --- Gender segmented control ---
const genderGroup = document.getElementById("genderGroup");
const genderInput = document.getElementById("gender");

genderGroup?.addEventListener("click", (e) => {
  const btn = e.target.closest(".segment");
  if (!btn) return;

  genderGroup
    .querySelectorAll(".segment")
    .forEach((s) => s.classList.remove("active"));

  btn.classList.add("active");
  genderInput.value = btn.dataset.value;
});

// --- Form validation ---
const form = document.getElementById("registerForm");

const fields = {
  fullName: document.getElementById("fullName"),
  email: document.getElementById("email"),
  mobile: document.getElementById("mobile"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
  agreeTerms: document.getElementById("agreeTerms"),
};

const errors = {
  fullName: document.getElementById("fullNameError"),
  email: document.getElementById("emailError"),
  mobile: document.getElementById("mobileError"),
  password: document.getElementById("passwordError"),
  confirmPassword: document.getElementById("confirmPasswordError"),
  terms: document.getElementById("termsError"),
};

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isValidPhone = (value) =>
  /^[+]?[\d\s-]{7,15}$/.test(value);

const clearErrors = () =>
  Object.values(errors).forEach((el) => (el.textContent = ""));

function isExistingUserError(error) {
  const message = (error?.message || "").toLowerCase();
  return (
    error?.code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("already in use") ||
    message.includes("user already")
  );
}

function addPasswordToggle(toggleId, inputId) {
  const toggleBtn = document.getElementById(toggleId);
  const input = document.getElementById(inputId);

  if (!toggleBtn || !input) return;

  toggleBtn.addEventListener("click", () => {
    const hidden = input.type === "password";

    input.type = hidden ? "text" : "password";
    toggleBtn.textContent = hidden ? "🙈" : "👁";
  });
}

addPasswordToggle("toggleRegisterPassword", "password");
addPasswordToggle(
  "toggleRegisterConfirmPassword",
  "confirmPassword"
);

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  clearErrors();

  let hasError = false;

  if (fields.fullName.value.trim().length < 2) {
    errors.fullName.textContent = "Enter your full name.";
    hasError = true;
  }

  if (!isValidEmail(fields.email.value.trim())) {
    errors.email.textContent = "Enter a valid email.";
    hasError = true;
  }

  if (!isValidPhone(fields.mobile.value.trim())) {
    errors.mobile.textContent = "Enter a valid phone number.";
    hasError = true;
  }

  if (fields.password.value.length < 6) {
    errors.password.textContent =
      "Password must be at least 6 characters.";
    hasError = true;
  }

  if (fields.password.value !== fields.confirmPassword.value) {
    errors.confirmPassword.textContent =
      "Passwords do not match.";
    hasError = true;
  }

  if (!fields.agreeTerms.checked) {
    errors.terms.textContent =
      "You must agree to the Terms.";
    hasError = true;
  }

  if (hasError) return;

  const submitBtn = form.querySelector(
    'button[type="submit"]'
  );

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  try {
    if (!supabaseClient) {
      throw new Error("Supabase client not found.");
    }

    // =============================
    // Create or recover Auth User
    // =============================
    let authUser = null;
    let wasExistingAccount = false;

    const redirectTo = `${window.location.origin}/login.html`;

    const { data: signUpData, error: signUpError } =
      await supabaseClient.auth.signUp({
        email: fields.email.value.trim(),
        password: fields.password.value,
        options: {
          data: {
            full_name: fields.fullName.value.trim(),
            phone: fields.mobile.value.trim(),
            gender: genderInput.value,
          },
          emailRedirectTo: redirectTo,
        },
      });

    if (signUpError) {
      if (isExistingUserError(signUpError)) {
        wasExistingAccount = true;
        const { data: signInData, error: signInError } =
          await supabaseClient.auth.signInWithPassword({
            email: fields.email.value.trim(),
            password: fields.password.value,
          });

        if (signInError) {
          throw new Error(
            "That email is already registered. Please sign in with your existing account instead."
          );
        }
        authUser = signInData.user;
      } else if (signUpError.message.includes('rate limit') || signUpError.message.includes('429')) {
        throw new Error('Too many signup attempts. Please wait a few minutes and try again. This is a security measure to prevent spam.');
      } else {
        throw signUpError;
      }
    } else {
      authUser = signUpData.user;
    }

    console.log("Auth User:", authUser);

    if (!authUser) {
      throw new Error("User was not created or found.");
    }

    // =============================
    // Create or update patient profile
    // =============================

    const patientPayload = {
      auth_uid: authUser.id,
      full_name: fields.fullName.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.mobile.value.trim(),
      gender: genderInput.value,
    };

    console.log("Patient Payload:", patientPayload);

    // Check if patient with this email already exists
    const { data: existingPatient } = await supabaseClient
      .from("patients")
      .select("id")
      .eq("email", fields.email.value.trim())
      .maybeSingle();

    let patientData, patientError;

    if (existingPatient) {
      // Update existing patient record
      var updateResult = await supabaseClient
        .from("patients")
        .update(patientPayload)
        .eq("id", existingPatient.id)
        .select()
        .single();
      patientData = updateResult.data;
      patientError = updateResult.error;
    } else {
      // Insert new patient record
      var insertResult = await supabaseClient
        .from("patients")
        .insert(patientPayload)
        .select()
        .single();
      patientData = insertResult.data;
      patientError = insertResult.error;
    }

    console.log("Patient Record:", patientData);
    console.log("Patient Insert Error:", patientError);

    if (patientError) {
      throw patientError;
    }

    console.log("✅ Patient profile ready.");

    if (wasExistingAccount) {
      alert("Your account already existed, so we signed you in and linked your profile.");
      window.location.href = "login.html";
    } else {
      // Show confirmation message
      document.getElementById('registerForm').innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
          <div style="font-size:64px; margin-bottom:20px;">📧</div>
          <h2 style="color:var(--text-900); margin-bottom:12px;">Check Your Email</h2>
          <p style="color:var(--text-600); font-size:14px; line-height:1.6; margin-bottom:24px;">
            We've sent a confirmation link to:<br>
            <strong>${escapeHtml(fields.email.value.trim())}</strong>
          </p>
          <p style="color:var(--text-600); font-size:13px; line-height:1.6; margin-bottom:32px;">
            Please click the link in the email to verify your account before logging in.
            The link will expire in 24 hours.
          </p>
          <div style="background:var(--blue-50); border:1px solid var(--blue-100); border-radius:var(--r-md); padding:16px; margin-bottom:24px;">
            <p style="color:var(--blue-600); font-size:13px; font-weight:600; margin-bottom:8px;">Didn't receive the email?</p>
            <button type="button" id="resendEmailBtn" style="background:var(--blue-600); color:#fff; border:none; border-radius:var(--r-sm); padding:10px 20px; font-size:13px; font-weight:600; cursor:pointer;">
              Resend Confirmation Email
            </button>
          </div>
          <a href="login.html" style="color:var(--blue-600); font-size:14px; font-weight:600;">Back to Login</a>
        </div>
      `;

      // Add resend email functionality
      const resendBtn = document.getElementById('resendEmailBtn');
      if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
          resendBtn.disabled = true;
          resendBtn.textContent = 'Sending...';
          
          try {
            await supabaseClient.auth.resend({
              type: 'signup',
              email: fields.email.value.trim()
            });
            alert('Confirmation email sent! Please check your inbox.');
            resendBtn.textContent = 'Resend Confirmation Email';
            resendBtn.disabled = false;
          } catch (err) {
            alert('Failed to resend email: ' + err.message);
            resendBtn.textContent = 'Resend Confirmation Email';
            resendBtn.disabled = false;
          }
        });
      }
    }
  } catch (err) {
    console.error("Registration Error:", err);

    const message = err?.message || "Registration failed.";
    if (message.includes("row-level security policy")) {
      errors.email.textContent =
        "The patients table is missing its Supabase insert policy. Please run the bootstrap SQL in Supabase and try again.";
    } else {
      errors.email.textContent = message;
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML =
      'Register <span class="arrow">→</span>';
  }
});