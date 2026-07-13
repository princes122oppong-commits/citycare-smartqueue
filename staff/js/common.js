/* ==========================================================================
   Shared UI behavior for every staff page.
   ========================================================================== */

// Mobile sidebar toggle
function initSidebarToggle() {
  const toggleBtn = document.querySelector("[data-sidebar-toggle]");
  const sidebar = document.querySelector(".sidebar");
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      sidebar.classList.remove("open");
    });
  });

  document.addEventListener("click", (e) => {
    if (
      sidebar.classList.contains("open") &&
      !sidebar.contains(e.target) &&
      !toggleBtn.contains(e.target)
    ) {
      sidebar.classList.remove("open");
    }
  });
}

// Generic dropdown (notifications, hospital selector, filters, etc.)
function initDropdowns() {
  const triggers = document.querySelectorAll("[data-dropdown-trigger]");

  triggers.forEach((trigger) => {
    const targetId = trigger.getAttribute("data-dropdown-trigger");
    const panel = document.getElementById(targetId);
    if (!panel) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains("open");
      document
        .querySelectorAll(".dropdown-panel.open")
        .forEach((p) => p.classList.remove("open"));
      if (!isOpen) panel.classList.add("open");
    });
  });

  document.addEventListener("click", () => {
    document
      .querySelectorAll(".dropdown-panel.open")
      .forEach((p) => p.classList.remove("open"));
  });
}

// Formats a Date as "May 20, 2025"
function formatDateLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSidebarToggle();
  initDropdowns();

  const dateLabel = document.querySelector("[data-today-label]");
  if (dateLabel) dateLabel.textContent = formatDateLabel();
});
