/* ==========================================================================
   Profile page logic — live Supabase profile load + update.
   ========================================================================== */

let currentProfileSource = null;
let currentProfileId = null;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("profile-form");
  const passwordBtn = document.getElementById("update-password-btn");

  if (!form || !passwordBtn) return;

  loadCurrentProfile();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      full_name: document.getElementById("p-fullname").value.trim(),
      role: document.getElementById("p-role").value,
      email: document.getElementById("p-email").value.trim(),
      department: document.getElementById("p-department").value,
      phone: document.getElementById("p-phone").value.trim(),
    };

    if (!payload.full_name || !payload.email || !payload.phone) {
      alert("Name, email, and phone are required.");
      return;
    }

    const departmentId = await ensureDepartment(payload.department);
    if (!departmentId) {
      alert("Unable to resolve the selected department.");
      return;
    }

    const tablePayload = {
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      department_id: departmentId,
      role: payload.role,
    };

    const { error } = currentProfileSource === "users"
      ? await supabaseClient.from("users").update(tablePayload).eq("id", currentProfileId)
      : await supabaseClient.from("receptionist").update(tablePayload).eq("id", currentProfileId);

    if (error) {
      console.error("Failed to save profile:", error);
      alert(error.message || "Unable to save profile changes.");
      return;
    }

    document.querySelector(".profile-summary-name").textContent = payload.full_name;
    document.querySelector(".profile-summary-role").textContent = payload.role;
    document.querySelector(".profile-summary-email").textContent = payload.email;

    alert("Profile changes saved.");
  });

  passwordBtn.addEventListener("click", async () => {
    const newPassword = prompt("Enter a new password:");
    if (!newPassword) return;

    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      console.error("Password update failed:", error);
      alert(error.message || "Unable to update password.");
      return;
    }

    alert("Password updated.");
  });
});

async function loadCurrentProfile() {
  const info = await getCurrentreceptionistProfile();
  if (!info?.profile) {
    console.warn("No receptionist profile found for the signed-in user.");
    return;
  }

  currentProfileSource = info.source;
  currentProfileId = info.profile.id;

  const fullName = info.profile.full_name || "receptionist User";
  const email = info.profile.email || info.authUser.email || "";
  const phone = info.profile.phone || "";
  const role = info.profile.role || "receptionist";
  const department = info.profile.departments?.name || "General Medicine";

  document.querySelector(".profile-summary-name").textContent = fullName;
  document.querySelector(".profile-summary-role").textContent = role;
  document.querySelector(".profile-summary-email").textContent = email;

  document.getElementById("p-fullname").value = fullName;
  document.getElementById("p-email").value = email;
  document.getElementById("p-phone").value = phone;
  document.getElementById("p-role").value = role;
  document.getElementById("p-department").value = department;
}
