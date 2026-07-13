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

    const {
      data: patientData,
      error: patientError,
    } = await supabaseClient
      .from("patients")
      .upsert(patientPayload, { onConflict: "email" })
      .select()
      .single();

    console.log("Patient Record:", patientData);
    console.log("Patient Insert Error:", patientError);

    if (patientError) {
      throw patientError;
    }

    console.log("✅ Patient profile ready.");

    alert(
      wasExistingAccount
        ? "Your account already existed, so we signed you in and linked your profile."
        : "Registration successful! Please check your email to verify your account."
    );

    window.location.href = "login.html";
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