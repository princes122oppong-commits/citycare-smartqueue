/* ==========================================================================
   Shared Common Functions
   Mobile sidebar toggle and other shared utilities
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function() {
  // Mobile sidebar toggle functionality
  var sidebarToggleButtons = document.querySelectorAll('[data-sidebar-toggle]');
  sidebarToggleButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.classList.toggle('open');
      }
    });
  });

  // Close sidebar when clicking outside (mobile only)
  document.addEventListener('click', function(e) {
    var sidebar = document.querySelector('.sidebar');
    var toggleBtn = document.querySelector('[data-sidebar-toggle]');
    
    if (sidebar && sidebar.classList.contains('open')) {
      var isClickInside = sidebar.contains(e.target) || (toggleBtn && toggleBtn.contains(e.target));
      if (!isClickInside) {
        sidebar.classList.remove('open');
      }
    }
  });
});

// Helper function to escape HTML (used in toast notifications)
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}