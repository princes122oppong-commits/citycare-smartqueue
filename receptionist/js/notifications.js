/* ============================================================
   Receptionist Notifications Page Logic
   - Loads all system notifications (for admin view)
   - For staff, shows notifications for their department
   ============================================================ */

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
  if (!supabaseClient) return;

  // Get current staff to determine department scope
  const { data: staff } = await supabaseClient.from('receptionist')
    .select('department_id')
    .eq('auth_uid', (await supabaseClient.auth.getUser()).data?.user?.id)
    .maybeSingle();

  let query = supabaseClient.from('notifications')
    .select('*, patients!inner(full_name)')
    .order('created_at', { ascending: false });

  // If staff has a department, filter to show relevant notifications
  // For now, show all notifications since the table is patient-centric
  const { data, error } = await query;

  if (error) {
    console.warn('Failed to load notifications:', error.message);
    const body = document.getElementById('notif-body');
    if (body) {
      body.innerHTML = '<tr><td colspan="5" class="cell-muted">Error loading notifications.</td></tr>';
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
  const readToday = notifications.filter(n => !n.unread && (n.created_at || '').startsWith(today)).length;

  const statTotal = document.getElementById('stat-total');
  const statUnread = document.getElementById('stat-unread');
  const statRead = document.getElementById('stat-read');

  if (statTotal) statTotal.textContent = total;
  if (statUnread) statUnread.textContent = unread;
  if (statRead) statRead.textContent = readToday;
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
    body.innerHTML = '<tr><td colspan="5" class="cell-muted" style="text-align:center; padding: 32px;">No notifications found.</td></tr>';
    return;
  }

  body.innerHTML = notifications.map(n => {
    const icon = n.icon || (n.category === 'queue' ? '📋' : n.category === 'appointments' ? '📅' : '🔔');
    const time = formatNotificationTime(n.created_at);
    const statusClass = n.unread ? 'badge blue' : 'badge green';
    const statusText = n.unread ? 'Unread' : 'Read';
    const patientName = n.patients?.full_name || 'Unknown Patient';
    
    return '<tr>' +
      '<td class="notif-icon">' + icon + '</td>' +
      '<td><div class="cell-primary">' + escapeHtml(n.title) + '</div><div class="cell-muted" style="font-size:12px; margin-top:2px;">' + escapeHtml(n.body || '') + '</div></td>' +
      '<td><span class="pill pill-waiting">' + escapeHtml(n.category) + '</span></td>' +
      '<td class="cell-muted">' + time + '</td>' +
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

  supabaseClient
    .channel('receptionist-notifications')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      () => loadNotifications()
    )
    .subscribe();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!supabaseClient) return;

  // Load profile info
  const { data: profile } = await supabaseClient.from('receptionist')
    .select('full_name, email')
    .eq('auth_uid', (await supabaseClient.auth.getUser()).data?.user?.id)
    .maybeSingle();

  if (profile) {
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const avatarEl = document.querySelector('.profile-avatar');
    
    if (nameEl) nameEl.textContent = profile.full_name || 'Receptionist';
    if (emailEl) emailEl.textContent = profile.email || '';
    if (avatarEl && profile.full_name) {
      avatarEl.textContent = profile.full_name.charAt(0).toUpperCase();
    }
  }

  // Sign out handler
  const signoutBtn = document.getElementById('signoutBtn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      if (!confirm('Sign out?')) return;
      await supabaseClient.auth.signOut();
      window.location.href = '../../login.html';
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