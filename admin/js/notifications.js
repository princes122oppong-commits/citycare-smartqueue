/* ============================================================
   Admin Notifications Page Logic
   - Loads all system notifications
   - Provides admin-wide view and management
   ============================================================ */

let notifications = [];

function formatTime(timestamp) {
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

  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*, patients!inner(full_name)')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Failed to load notifications:', error.message);
    const body = document.getElementById('notifBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 32px; color: #6b7280;">Error loading notifications.</td></tr>';
    }
    notifications = [];
  } else {
    notifications = data || [];
  }

  renderNotifications();
  updateStats();
}

function updateStats() {
  const total = notifications.length;
  const unread = notifications.filter(n => n.unread).length;
  const today = new Date().toISOString().slice(0, 10);
  const readToday = notifications.filter(n => !n.unread && (n.created_at || '').startsWith(today)).length;
  const queueCount = notifications.filter(n => n.category === 'queue' && (n.created_at || '').startsWith(today)).length;
  const apptCount = notifications.filter(n => n.category === 'appointments' && (n.created_at || '').startsWith(today)).length;
  const systemCount = notifications.filter(n => (n.category === 'system' || !n.category) && (n.created_at || '').startsWith(today)).length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statUnread').textContent = unread;
  document.getElementById('statReadToday').textContent = readToday;
  document.getElementById('notifCount').textContent = unread;
  document.getElementById('notifCount').style.display = unread > 0 ? '' : 'none';
  document.getElementById('queueCount').textContent = queueCount + ' today';
  document.getElementById('apptCount').textContent = apptCount + ' today';
  document.getElementById('systemCount').textContent = systemCount + ' today';
}

function renderNotifications() {
  const body = document.getElementById('notifBody');
  if (!body) return;

  if (notifications.length === 0) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 32px; color: #6b7280;">No notifications found.</td></tr>';
    return;
  }

  body.innerHTML = notifications.slice(0, 50).map(n => {
    const icon = n.icon || (n.category === 'queue' ? '📋' : n.category === 'appointments' ? '📅' : '🔔');
    const time = formatTime(n.created_at);
    const statusClass = n.unread ? 'pill pill--info' : 'pill pill--success';
    const statusText = n.unread ? 'Unread' : 'Read';
    const patientName = n.patients?.full_name || 'Unknown Patient';
    
    return '<tr>' +
      '<td style="font-size:18px; text-align:center;">' + icon + '</td>' +
      '<td><div style="font-weight:600;">' + escapeHtml(n.title) + '</div><div style="font-size:12px; color:#6b7280; margin-top:2px;">' + escapeHtml(n.body || '') + '</div></td>' +
      '<td>' + escapeHtml(patientName) + '</td>' +
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
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!supabaseClient) return;

  // Auth guard - ensure admin
  const authResult = await supabaseClient.auth.getUser();
  if (authResult.error || !authResult.data.user) {
    window.location.href = '../../login.html';
    return;
  }

  // Load admin profile
  const { data: admin } = await supabaseClient.from('users')
    .select('full_name, email')
    .eq('auth_uid', authResult.data.user.id)
    .maybeSingle();

  if (admin) {
    const nameEl = document.getElementById('admin-name');
    const emailEl = document.getElementById('admin-email');
    const avatarEl = document.querySelector('.user__avatar');
    
    if (nameEl) nameEl.textContent = admin.full_name || 'Admin';
    if (emailEl) emailEl.textContent = admin.email || '';
    if (avatarEl && admin.full_name) {
      avatarEl.textContent = admin.full_name.charAt(0).toUpperCase();
    }
  }

  // Sign out handler
  document.getElementById('signoutBtn')?.addEventListener('click', async () => {
    if (!confirm('Sign out?')) return;
    await supabaseClient.auth.signOut();
    window.location.href = '../../login.html';
  });

  // Mark all read button
  const markAllBtn = document.getElementById('mark-all-read');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', markAllAsRead);
  }

  // Initial load
  loadNotifications();
});