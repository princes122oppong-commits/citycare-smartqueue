const staffLoginForm = document.getElementById("staffLoginForm");
const staffEmailInput = document.getElementById("staffEmail");
const staffPasswordInput = document.getElementById("staffPassword");
const staffEmailError = document.getElementById("staffEmailError");
const staffPasswordError = document.getElementById("staffPasswordError");
const toggleStaffPassword = document.getElementById("toggleStaffPassword");

const isValidStaffEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

toggleStaffPassword?.addEventListener("click", () => {
  const isHidden = staffPasswordInput.type === "password";
  staffPasswordInput.type = isHidden ? "text" : "password";
  toggleStaffPassword.textContent = isHidden ? "Hide" : "Show";
  toggleStaffPassword.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});

async function findStaffProfile(userId, email) {
  const staffByAuth = await supabaseClient
    .from("staff")
    .select("id, full_name, email, role, status, auth_uid")
    .eq("auth_uid", userId)
    .maybeSingle();

  if (!staffByAuth.error && staffByAuth.data) {
    return { table: "staff", profile: staffByAuth.data };
  }

  const userByAuth = await supabaseClient
    .from("users")
    .select("id, full_name, email, role, status, auth_uid")
    .eq("auth_uid", userId)
    .maybeSingle();

  if (!userByAuth.error && userByAuth.data && ["Staff", "Administrator"].includes(userByAuth.data.role)) {
    return { table: "users", profile: userByAuth.data };
  }

  const staffByEmail = await supabaseClient
    .from("staff")
    .select("id, full_name, email, role, status, auth_uid")
    .eq("email", email)
    .maybeSingle();

  if (!staffByEmail.error && staffByEmail.data) {
    if (!staffByEmail.data.auth_uid) {
      await supabaseClient.from("staff").update({ auth_uid: userId }).eq("id", staffByEmail.data.id);
    }
    return { table: "staff", profile: staffByEmail.data };
  }

  return null;
}

async function redirectIfStaffAlreadySignedIn() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data.user) return;
  const staff = await findStaffProfile(data.user.id, data.user.email);
  if (staff) window.location.href = "staff/html/staff-dashboard.html";
}

staffLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  staffEmailError.textContent = "";
  staffPasswordError.textContent = "";

  const email = staffEmailInput.value.trim();
  let hasError = false;

  if (!isValidStaffEmail(email)) {
    staffEmailError.textContent = "Please enter a valid staff email address.";
    hasError = true;
  }

  if (staffPasswordInput.value.length < 6) {
    staffPasswordError.textContent = "Password must be at least 6 characters.";
    hasError = true;
  }

  if (hasError) return;

  const submitBtn = staffLoginForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  try {
    if (!supabaseClient) throw new Error("Supabase is not configured.");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password: staffPasswordInput.value,
    });

    if (error) throw error;
    if (!data.user?.id) throw new Error("Unable to authenticate staff account.");

    const staff = await findStaffProfile(data.user.id, email);
    if (!staff) {
      await supabaseClient.auth.signOut();
      throw new Error("No staff profile is linked to this email.");
    }

    if (staff.profile.status && staff.profile.status !== "Active") {
      await supabaseClient.auth.signOut();
      throw new Error("This staff account is not active.");
    }

    window.location.href = "staff/html/staff-dashboard.html";
  } catch (error) {
    staffPasswordError.textContent = error.message || "Unable to sign in. Please try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Login to Staff Portal";
  }
});

document.addEventListener("DOMContentLoaded", redirectIfStaffAlreadySignedIn);
