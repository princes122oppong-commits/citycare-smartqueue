const receptionistLoginForm = document.getElementById("receptionistLoginForm");
const receptionistEmailInput = document.getElementById("receptionistEmail");
const receptionistPasswordInput = document.getElementById("receptionistPassword");
const receptionistEmailError = document.getElementById("receptionistEmailError");
const receptionistPasswordError = document.getElementById("receptionistPasswordError");
const togglereceptionistPassword = document.getElementById("togglereceptionistPassword");

const isValidreceptionistEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

togglereceptionistPassword?.addEventListener("click", () => {
  const isHidden = receptionistPasswordInput.type === "password";
  receptionistPasswordInput.type = isHidden ? "text" : "password";
  togglereceptionistPassword.textContent = isHidden ? "Hide" : "Show";
  togglereceptionistPassword.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});

async function findreceptionistProfile(userId, email) {
  const receptionistByAuth = await supabaseClient
    .from("receptionist")
    .select("id, full_name, email, role, status, auth_uid")
    .eq("auth_uid", userId)
    .maybeSingle();

  if (!receptionistByAuth.error && receptionistByAuth.data) {
    return { table: "receptionist", profile: receptionistByAuth.data };
  }

  const userByAuth = await supabaseClient
    .from("users")
    .select("id, full_name, email, role, status, auth_uid")
    .eq("auth_uid", userId)
    .maybeSingle();

  if (!userByAuth.error && userByAuth.data && ["receptionist", "Administrator"].includes(userByAuth.data.role)) {
    return { table: "users", profile: userByAuth.data };
  }

  const receptionistByEmail = await supabaseClient
    .from("receptionist")
    .select("id, full_name, email, role, status, auth_uid")
    .eq("email", email)
    .maybeSingle();

  if (!receptionistByEmail.error && receptionistByEmail.data) {
    if (!receptionistByEmail.data.auth_uid) {
      await supabaseClient.from("receptionist").update({ auth_uid: userId }).eq("id", receptionistByEmail.data.id);
    }
    return { table: "receptionist", profile: receptionistByEmail.data };
  }

  return null;
}

async function redirectIfreceptionistAlreadySignedIn() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data.user) return;
  const receptionist = await findreceptionistProfile(data.user.id, data.user.email);
  if (receptionist) window.location.href = "receptionist/html/receptionist-dashboard.html";
}

receptionistLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  receptionistEmailError.textContent = "";
  receptionistPasswordError.textContent = "";

  const email = receptionistEmailInput.value.trim();
  let hasError = false;

  if (!isValidreceptionistEmail(email)) {
    receptionistEmailError.textContent = "Please enter a valid receptionist email address.";
    hasError = true;
  }

  if (receptionistPasswordInput.value.length < 6) {
    receptionistPasswordError.textContent = "Password must be at least 6 characters.";
    hasError = true;
  }

  if (hasError) return;

  const submitBtn = receptionistLoginForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  try {
    if (!supabaseClient) throw new Error("Supabase is not configured.");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: receptionistPasswordInput.value,
    });

    if (error) throw error;
    if (!data.user?.id) throw new Error("Unable to authenticate receptionist account.");

    const receptionist = await findreceptionistProfile(data.user.id, email);
    if (!receptionist) {
      await supabaseClient.auth.signOut();
      throw new Error("No receptionist profile is linked to this email.");
    }

    if (receptionist.profile.status && receptionist.profile.status !== "Active") {
      await supabaseClient.auth.signOut();
      throw new Error("This receptionist account is not active.");
    }

    window.location.href = "receptionist/html/receptionist-dashboard.html";
  } catch (error) {
    receptionistPasswordError.textContent = error.message || "Unable to sign in. Please try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Login to Receptionist Portal";
  }
});

document.addEventListener("DOMContentLoaded", redirectIfreceptionistAlreadySignedIn);
