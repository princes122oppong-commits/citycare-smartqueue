/* ============================================================
   Department Notifications Page Logic
   - Loads notifications for queue_entries related to this department
   ============================================================ */

let deptId = null;
let notifications = [];

function formatNotificationTime(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function loadNotifications() {
  if (!supabaseClient || !deptId) return;

  // Get notifications for this department staff
  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*, patients(full_name)')
    .eq('recipient_role', 'department_staff')
    .eq('department_id', deptId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Failed to load notifications:', error.message);
    const body = document.getElementById('notif-body');
    if (body) {
      body.innerHTML = '<tr><td colspan="4" class="cell-muted">Error loading notifications.</td></tr>';
    }
    notifications = [];
  } else {
    notifications = data || [];
  }

  renderNotifications();
  updateStats();
  updateUnreadBadge();
}

function updateStats() {
  const total = notifications.length;
  const unread = notifications.filter(n => n.unread).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = notifications.filter(n => (n.created_at || '').startsWith(today)).length;

  const statTotal = document.getElementById('stat-total');
  const statUnread = document.getElementById('stat-unread');
  const statToday = document.getElementById('stat-today');

  if (statTotal) statTotal.textContent = total;
  if (statUnread) statUnread.textContent = unread;
  if (statToday) statToday.textContent = todayCount;
}

function updateUnreadBadge() {
  const count = notifications.filter(n => n.unread).length;
  const badge = document.getElementById('unread-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }
}

function renderNotifications() {
  const body = document.getElementById('notif-body');
  if (!body) return;

  if (notifications.length === 0) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 32px; color: var(--text-400);">No notifications found.</td></tr>';
    return;
  }

  body.innerHTML = notifications.map(n => {
    const icon = n.icon || (n.category === 'queue' ? '📋' : n.category === 'appointments' ? '📅' : '🔔');
    const time = formatNotificationTime(n.created_at);
    const statusClass = n.unread ? 'badge blue' : 'badge green';
    const statusText = n.unread ? 'Unread' : 'Read';
    
    return '<tr>' +
      '<td style="font-size:18px; text-align:center;">' + icon + '</td>' +
      '<td><div class="cell-primary">' + escapeHtml(n.title) + '</div><div style="font-size:12px; color:#6b7280; margin-top:2px;">' + escapeHtml(n.body || '') + '</div></td>' +
      '<td style="color:#6b7280;">' + time + '</td>' +
      '<td><span class="' + statusClass + '">' + statusText + '</span></td>' +
      '</tr>';
  }).join('');
}

// Mark all notifications as read
async function markAllAsRead() {
  if (!supabaseClient) return;

  const unreadIds = notifications.filter(n => n.unread).map(n => n.id);
  if (unreadIds.length === 0) return;

  const { error } = await supabaseClient.from('notifications')
    .update({ unread: false })
    .in('id', unreadIds);

  if (error) {
    console.warn('Failed to mark notifications read:', error.message);
    return;
  }

  notifications = notifications.map(n => ({ ...n, unread: false }));
  renderNotifications();
  updateStats();
  updateUnreadBadge();
}

// Subscribe to real-time notification changes
function subscribeToNotifications() {
  if (!supabaseClient?.channel) return;

  // Listen for notifications for this department
  supabaseClient
    .channel('department-notifications')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      () => loadNotifications()
    )
    .subscribe();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!supabaseClient) {
    window.location.href = '../department_staff-login.html';
    return;
  }

  // Auth guard
  const authResult = await supabaseClient.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    window.location.href = '../department_staff-login.html';
    return;
  }

  // Get department staff profile
  const deptStaffResult = await supabaseClient
    .from('department_staff')
    .select('department_id')
    .eq('auth_uid', authResult.data.user.id)
    .maybeSingle();

  if (deptStaffResult.error || !deptStaffResult.data) {
    window.location.href = '../department_staff-login.html';
    return;
  }

  deptId = deptStaffResult.data.department_id;

  // Load department name
  if (deptId) {
    const { data: dept } = await supabaseClient
      .from('departments')
      .select('name')
      .eq('id', deptId)
      .single();
    
    const nameEl = document.getElementById('dept-name');
    const titleEl = document.getElementById('pageTitle');
    if (nameEl && dept) nameEl.textContent = dept.name;
    if (titleEl && dept) titleEl.textContent = dept.name + ' Notifications';
  }

  // Sign out handler
  const signoutBtn = document.getElementById('signoutBtn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      if (!confirm('Sign out?')) return;
      await supabaseClient.auth.signOut();
      window.location.href = '../department_staff-login.html';
    });
  }

  // Mark all read button
  const markAllBtn = document.getElementById('mark-all-read');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', markAllAsRead);
  }

  // Initial load
  loadNotifications();
  subscribeToNotifications();
});