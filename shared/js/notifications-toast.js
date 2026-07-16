/* ==========================================================================
   Shared Toast Notification System
   Shows real-time popup notifications using Supabase Realtime subscriptions.
   Include this script on any page that needs live popup notifications.
   ========================================================================== */

// Toast container - ensures it exists on the page
function ensureToastContainer() {
  if (!document.getElementById('toast-container')) {
    var container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText =
      'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:380px;width:100%;pointer-events:none;';
    document.body.appendChild(container);
  }
  return document.getElementById('toast-container');
}

// Show a toast notification
function showToast(title, body, type) {
  var container = ensureToastContainer();
  var toast = document.createElement('div');
  type = type || 'info';

  var colors = {
    info: { bg: '#eef4ff', border: '#2f5fe0', icon: 'ℹ️' },
    success: { bg: '#e7f8ef', border: '#1c9a5b', icon: '✅' },
    warning: { bg: '#fff3dc', border: '#b6790a', icon: '⚠️' },
    error: { bg: '#fdeaea', border: '#d0393f', icon: '❌' },
    queue: { bg: '#eef4ff', border: '#2f5fe0', icon: '📋' },
    appointment: { bg: '#eef4ff', border: '#2f5fe0', icon: '📅' },
    system: { bg: '#fefce8', border: '#ca8a04', icon: '⚙️' }
  };

  var c = colors[type] || colors.info;

  toast.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:' + c.bg + ';border-left:4px solid ' + c.border + ';border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);pointer-events:auto;">' +
      '<span style="font-size:20px;flex-shrink:0;">' + c.icon + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:13px;color:#17213d;margin-bottom:2px;">' + escapeHtml(title) + '</div>' +
        '<div style="font-size:12.5px;color:#526078;line-height:1.4;">' + escapeHtml(body) + '</div>' +
      '</div>' +
      '<button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#97a1b8;cursor:pointer;font-size:16px;padding:0;line-height:1;flex-shrink:0;">✕</button>' +
    '</div>';

  toast.style.cssText = 'animation:slideIn 0.3s ease;';

  container.appendChild(toast);

  // Auto-remove after 20 seconds
  setTimeout(function() {
    if (toast.parentElement) {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(function() { if (toast.parentElement) toast.remove(); }, 300);
    }
  }, 20000);
}

// Add slide-in animation
var style = document.createElement('style');
style.textContent =
  '@keyframes slideIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}';
document.head.appendChild(style);

// Test function to verify toast is working
function testToast() {
  showToast('✅ Toast Working!', 'This is a test notification to verify the popup system is functioning correctly.', 'success');
  setTimeout(function() {
    showToast('📋 Queue Test', 'You would see walk-in patient notifications here.', 'queue');
  }, 1500);
  setTimeout(function() {
    showToast('⚠️ Works!', 'All notification types are working properly.', 'info');
  }, 3000);
  return 'Toast test initiated - check top-right corner';
}

// ==========================================================================
// receptionist/Department: Subscribe to new queue entries and appointments
// Call this on receptionist/department pages
// ==========================================================================

function subscribereceptionistNotifications(departmentId) {
  if (!supabaseClient || !departmentId) return;

  // Listen for new queue entries for this department
  supabaseClient
    .channel('receptionist-queue-notifications')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'queue_entries', filter: 'department_id=eq.' + departmentId },
      function(payload) {
        var entry = payload.new;
        // Fetch patient name
        supabaseClient.from('patients').select('full_name').eq('id', entry.patient_id).single().then(function(res) {
          var name = res.data ? res.data.full_name : 'A patient';
          showToast('New Walk-in Patient', name + ' has joined the queue — Token ' + (entry.token_no || ''), 'queue');
        });
      }
    )
    .subscribe();

  // Listen for new appointments for this department
  supabaseClient
    .channel('receptionist-appointment-notifications')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'appointments', filter: 'department_id=eq.' + departmentId },
      function(payload) {
        var appt = payload.new;
        supabaseClient.from('patients').select('full_name').eq('id', appt.patient_id).single().then(function(res) {
          var name = res.data ? res.data.full_name : 'A patient';
          showToast('New Appointment Booked', name + ' booked a ' + (appt.type || 'Consultation') + ' appointment', 'appointment');
        });
      }
    )
    .subscribe();

  // Listen for queue status changes (when patient is served)
  supabaseClient
    .channel('receptionist-queue-status-notifications')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'queue_entries', filter: 'department_id=eq.' + departmentId },
      function(payload) {
        var entry = payload.new;
        var oldStatus = payload.old ? payload.old.status : '';
        if (entry.status === 'served' && oldStatus !== 'served') {
          showToast('Patient Served', 'Token ' + (entry.token_no || '') + ' has been served. Next patient please!', 'success');
        } else if (entry.status === 'now_serving' && oldStatus !== 'now_serving') {
          showToast('Now Serving', 'Token ' + (entry.token_no || '') + ' — Please call the patient.', 'queue');
        }
      }
    )
    .subscribe();
}

// ==========================================================================
// Patient: Subscribe to appointment and queue status changes
// Call this on patient dashboard pages
// ==========================================================================

function subscribePatientNotifications(patientId) {
  if (!supabaseClient || !patientId) return;

  // Listen for appointment status changes
  supabaseClient
    .channel('patient-appt-notifications')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'appointments', filter: 'patient_id=eq.' + patientId },
      function(payload) {
        var appt = payload.new;
        var oldStatus = payload.old ? payload.old.status : '';
        if (appt.status !== oldStatus) {
          if (appt.status === 'Confirmed') {
            showToast('Appointment Confirmed', 'Your ' + (appt.type || 'Consultation') + ' appointment has been confirmed!', 'success');
          } else if (appt.status === 'Cancelled') {
            showToast('Appointment Cancelled', 'Your appointment has been cancelled.', 'warning');
          } else if (appt.status === 'Completed') {
            showToast('Appointment Completed', 'Your appointment is complete. Thank you!', 'success');
          }
        }
      }
    )
    .subscribe();

  // Listen for queue status changes
  supabaseClient
    .channel('patient-queue-notifications')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries', filter: 'patient_id=eq.' + patientId },
      function(payload) {
        var entry = payload.new;
        var eventType = payload.eventType;
        if (entry.status === 'now_serving') {
          showToast('Your Turn Now!', 'Token ' + (entry.token_no || '') + ' — It\'s your turn! Please proceed to the department.', 'queue');
        } else if (entry.status === 'served') {
          showToast('Service Complete', 'Your consultation is complete. Thank you for visiting!', 'success');
        } else if (eventType === 'INSERT' && entry.status === 'waiting') {
          showToast('Queue Joined', 'You\'ve joined the queue. Token: ' + (entry.token_no || '') + '. Please wait for your turn.', 'queue');
        }
      }
    )
    .subscribe();
}

// ==========================================================================
// Admin: Subscribe to all system notifications
// Call this on admin pages for system-wide notifications
// ==========================================================================

function subscribeAdminNotifications() {
  if (!supabaseClient) return;

  // Listen for all notifications
  supabaseClient
    .channel('admin-notifications')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      function(payload) {
        var notif = payload.new;
        if (payload.eventType === 'INSERT') {
          showToast(notif.title || 'New Notification', notif.body || '', notif.category || 'info');
        }
      }
    )
    .subscribe();
}