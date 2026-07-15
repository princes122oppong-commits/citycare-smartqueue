/* ============================================================
   Notifications page logic
   Replace mockNotifications with a real Supabase query, e.g.:

   const { data } = await supabase
     .from('notifications')
     .select('*')
     .eq('patient_id', currentUser.id)
     .order('created_at', { ascending: false });
   ============================================================ */

let activeFilter = 'all';
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

function renderNotifications() {
  const list = document.getElementById('notif-list');
  const filtered = notifications.filter((n) => activeFilter === 'all' || n.category === activeFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="n-empty" style="padding:32px 4px; text-align:center; color:var(--text-400); font-size:13.5px;">No notifications here yet.</div>`;
    return;
  }

  list.innerHTML = filtered
    .map(
      (n) => `
    <div class="notif-item" data-id="${escapeHtml(n.id)}">
      <div class="n-icon ${escapeHtml(n.category)}">${n.icon || '🔔'}</div>
      <div class="n-body">
        <div class="n-title">${escapeHtml(n.title)}</div>
        <div class="n-desc">${escapeHtml(n.body || n.desc || '')}</div>
      </div>
      <div class="n-time">${formatNotificationTime(n.created_at || n.time)}</div>
      ${n.unread ? '<span class="unread-dot"></span>' : ''}
    </div>
  `
    )
    .join('');
}

function updateUnreadCount() {
  const count = notifications.filter((n) => n.unread).length;
  const badge = document.getElementById('unread-count');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

async function loadNotifications() {
  if (!supabaseClient) return;
  const patient = await getCurrentPatient();
  if (!patient) {
    window.location.href = getLoginUrl();
    return;
  }

  const { data, error } = await supabaseClient
    .from('notifications')
    .select('*')
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.warn('Failed to load notifications:', error.message);
    // Show error in the list for debugging
    const list = document.getElementById('notif-list');
    if (list) {
      list.innerHTML = `<div class="n-empty" style="padding:32px 4px; text-align:center; color:#d0393f; font-size:13.5px;">Error loading notifications: ${escapeHtml(error.message)}</div>`;
    }
    notifications = [];
  } else {
    console.log('Loaded', (data || []).length, 'notifications for patient', patient.id);
    notifications = data.map((n) => ({
      ...n,
      icon: n.icon || (n.category === 'queue' ? '📡' : n.category === 'appointments' ? '📅' : '🔔'),
    }));
  }

  renderNotifications();
  updateUnreadCount();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadNotifications();

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      renderNotifications();
    });
  });

  document.getElementById('mark-all')?.addEventListener('click', async () => {
    const patient = await getCurrentPatient();
    if (!patient) return;

    const { error } = await supabaseClient
      .from('notifications')
      .update({ unread: false })
      .eq('patient_id', patient.id);

    if (error) {
      console.warn('Unable to mark notifications read:', error.message);
      return;
    }

    notifications = notifications.map((n) => ({ ...n, unread: false }));
    renderNotifications();
    updateUnreadCount();
  });
});
