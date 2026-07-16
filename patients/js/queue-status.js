/* ============================================================
   Queue Status page logic
   Uses Supabase realtime updates and patient queue state.
   ============================================================ */

function statusPillClass(status) {
  if (/served/i.test(status)) return 'pill-served';
  if (/you/i.test(status)) return 'pill-you';
  if (/waiting/i.test(status)) return 'pill-waiting';
  return 'pill-neutral';
}

function renderTokenSummary(token) {
  if (!token) {
    document.getElementById('token-number').textContent = '\u2014';
    document.getElementById('token-dept').textContent = 'No active queue';
    document.getElementById('people-ahead').textContent = '\u2014';
    document.getElementById('wait-time').textContent = '\u2014';
    document.getElementById('status-pill').innerHTML = '<span class="dot"></span>Idle';
    return;
  }

  document.getElementById('token-number').textContent = token.token_no;
  document.getElementById('token-dept').textContent = typeof escapeHtml === 'function'
    ? escapeHtml(token.departments?.name || 'Unknown')
    : token.departments?.name || 'Unknown';
  document.getElementById('people-ahead').textContent = token.people_ahead ?? '\u2014';
  document.getElementById('wait-time').textContent = (token.people_ahead ?? 0) > 0 ? (token.people_ahead * 20) + ' mins' : '< 1 min';
  document.getElementById('status-pill').innerHTML = '<span class="dot"></span>' + (typeof escapeHtml === 'function' ? escapeHtml(token.status) : token.status);
}

function renderQueueTable(rows, currentToken) {
  const body = document.getElementById('queue-table-body');
  body.innerHTML = rows
    .map((row) => {
      const isYou = currentToken && row.token_no === currentToken.token_no;
      return '<tr class="' + (isYou ? 'you' : '') + '">' +
        '<td>' + (typeof escapeHtml === 'function' ? escapeHtml(row.token_no) : row.token_no) + '</td>' +
        '<td><span class="pill ' + statusPillClass(row.status) + '"><span class="dot"></span>' +
        (typeof escapeHtml === 'function' ? escapeHtml(row.status) : row.status) +
        (isYou ? ' (You)' : '') + '</span></td>' +
        '<td>' + new Date(row.joined_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</td>' +
        '</tr>';
    })
    .join('');
}

async function loadCurrentToken(patient) {
  if (!patient) return null;
  const [tokenResult, departmentResult] = await Promise.all([
    supabaseClient
      .from('queue_entries')
      .select('token_no, status, joined_at, department_id, expected_wait_minutes')
      .eq('patient_id', patient.id)
      .in('status', ['waiting', 'now_serving'])
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseClient.from('departments').select('id, name'),
  ]);

  if (tokenResult.error) {
    console.warn('Unable to load current token:', tokenResult.error.message);
    return null;
  }

  const departmentMap = Object.fromEntries((departmentResult.data || []).map((row) => [row.id, row.name]));
  const token = tokenResult.data;
  if (!token) return null;

  // Calculate people ahead in same department
  const { count } = await supabaseClient
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('department_id', token.department_id)
    .eq('status', 'waiting')
    .lt('joined_at', token.joined_at);

  return {
    ...token,
    departments: { name: departmentMap[token.department_id] || 'Unknown' },
    people_ahead: count || 0,
    estimated_wait_minutes: (count || 0) * 20,
  };
}

async function loadQueueRows(currentToken) {
  // Filter queue by the same department as the patient's current token
  const departmentId = currentToken?.department_id || null;

  let query = supabaseClient
    .from('queue_entries')
    .select('token_no, status, joined_at, department_id')
    .order('joined_at', { ascending: true })
    .limit(10);

  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }

  const [queueResult, departmentResult] = await Promise.all([
    query,
    supabaseClient.from('departments').select('id, name'),
  ]);

  if (queueResult.error) {
    console.warn('Unable to load queue rows:', queueResult.error.message);
    return [];
  }

  const departmentMap = Object.fromEntries((departmentResult.data || []).map((row) => [row.id, row.name]));
  return (queueResult.data || []).map((row) => ({
    ...row,
    department_name: departmentMap[row.department_id] || 'Unknown',
  }));
}

async function subscribeToQueueUpdates(patient) {
  if (!supabaseClient) return;

  const channel = supabaseClient
    .channel('queue-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries' },
      async () => {
        const token = await loadCurrentToken(patient);
        const rows = await loadQueueRows(token);
        renderTokenSummary(token);
        renderQueueTable(rows, token);
      }
    )
    .subscribe();

  window.addEventListener('beforeunload', () => {
    channel.unsubscribe();
  });
}

async function initQueueStatusPage() {
  if (!supabaseClient) return;
  const patient = await getCurrentPatient();
  if (!patient) {
    window.location.href = getLoginUrl();
    return;
  }

  const token = await loadCurrentToken(patient);
  const rows = await loadQueueRows(token);
  renderTokenSummary(token);
  renderQueueTable(rows, token);
  subscribeToQueueUpdates(patient);
}

document.addEventListener('DOMContentLoaded', initQueueStatusPage);