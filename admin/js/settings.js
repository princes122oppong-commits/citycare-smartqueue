/* ============================================================
   settings.js — logic for settings.html only
   ============================================================ */

const TAB_TITLES = {
  general: "General Settings",
  notifications: "Notifications",
  queue: "Queue Settings",
  appointments: "Appointment Settings",
  system: "System Preferences",
  security: "Security Settings",
  backup: "Backup & Restore",
};

async function loadSettings() {
  const rows = await fetchTable("settings", { limit: 1 });
  const s = rows[0];
  if (!s) return; // keep the defaults already in the HTML
  document.getElementById("hospitalName").value = s.hospital_name ?? document.getElementById("hospitalName").value;
  document.getElementById("hospitalEmail").value = s.hospital_email ?? document.getElementById("hospitalEmail").value;
  document.getElementById("phoneNumber").value = s.phone_number ?? document.getElementById("phoneNumber").value;
  document.getElementById("address").value = s.address ?? document.getElementById("address").value;
  document.getElementById("emailNotifications").checked = s.email_notifications ?? true;
  document.getElementById("smsNotifications").checked = s.sms_notifications ?? true;
  document.getElementById("maintenanceMode").checked = s.maintenance_mode ?? false;
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const payload = {
    hospital_name: document.getElementById("hospitalName").value,
    hospital_email: document.getElementById("hospitalEmail").value,
    phone_number: document.getElementById("phoneNumber").value,
    address: document.getElementById("address").value,
    email_notifications: document.getElementById("emailNotifications").checked,
    sms_notifications: document.getElementById("smsNotifications").checked,
    maintenance_mode: document.getElementById("maintenanceMode").checked,
  };

  const { error } = await supabaseClient.from("settings").upsert([{ id: 1, ...payload, updated_at: new Date().toISOString() }]);
  if (error) {
    console.error(error.message);
    const missingColumn = error.message.includes("schema cache") || error.message.includes("column");
    alert(
      missingColumn
        ? "Could not save settings because the Supabase settings table is missing one or more columns. Run the updated supabase-rls.sql in Supabase SQL Editor, then refresh this page."
        : `Could not save settings: ${error.message}`
    );
    return;
  }
  alert("Settings saved.");
}

function initSettingsTabs() {
  const items = document.querySelectorAll(".settings-nav__item");
  items.forEach(item => {
    item.addEventListener("click", () => {
      items.forEach(i => i.classList.remove("settings-nav__item--active"));
      item.classList.add("settings-nav__item--active");
      const tab = item.dataset.tab;
      document.getElementById("panelTitle").textContent = TAB_TITLES[tab] || "General Settings";
      // Only the General Settings form is wired to Supabase in this build;
      // other tabs share the panel shell and can be filled in with their own fields.
    });
  });
}

function initSettingsPage() {
  loadSettings();
  initSettingsTabs();
  document.getElementById("settingsForm").addEventListener("submit", handleSettingsSubmit);
}

document.addEventListener("DOMContentLoaded", initSettingsPage);
