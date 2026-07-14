/* ============================================================
   users.js - live Supabase users across patients, receptionist, admins
   ============================================================ */

let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const PAGE_SIZE = 7;
let editingUserKey = null;
let departmentsList = [];
let editingUserreceptionistId = null;

function needsAuthAccount(role) {
  return role === "receptionist" || role === "Department" || role === "Administrator";
}

function needsDepartment(role) {
  return role === "Department";
}

function normalizeUser(row, source, roleOverride = null) {
  const joinedAt = row.joined_at || row.created_at || null;
  const role = roleOverride || row.role || "Patient";
  return {
    key: `${source}:${row.id}`,
    source,
    id: row.id,
    name: row.full_name || row.name || "Unnamed",
    email: row.email || "",
    role,
    status: row.status || "Active",
    joined: joinedAt ? new Date(joinedAt).toLocaleDateString() : "",
    department_id: row.department_id || null,
  };
}

async function loadUsers() {
  const [adminRows, receptionistRows, patientRows] = await Promise.all([
    fetchTable("users", { order: { column: "joined_at", ascending: false } }),
    fetchTable("receptionist", { order: { column: "created_at", ascending: false } }),
    fetchTable("patients", { order: { column: "created_at", ascending: false } }),
  ]);

  const adminUsers = adminRows.map((row) => normalizeUser(row, "users"));
  const receptionistUsers = receptionistRows.map((row) => normalizeUser(row, "receptionist", row.role || "receptionist"));
  const patientUsers = patientRows.map((row) => normalizeUser(row, "patients", "Patient"));
  // Map "Department" role from receptionist table to display as "Department"
  receptionistUsers.forEach(function(u) {
    if (u.role === "receptionist" && u.department_id) {
      u.role = "Department";
    }
  });

  allUsers = [...adminUsers, ...receptionistUsers, ...patientUsers].sort((a, b) => {
    const aDate = new Date(a.joined || 0).getTime();
    const bDate = new Date(b.joined || 0).getTime();
    return bDate - aDate;
  });
  applyFilters();
}

function applyFilters() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const role = document.getElementById("roleFilter").value;
  const status = document.getElementById("statusFilter").value;

  filteredUsers = allUsers.filter((u) => {
    const matchesSearch = !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search) || u.id.toLowerCase().includes(search);
    const matchesRole = !role || u.role === role || (role === "receptionist" && ["Doctor", "Nurse", "receptionist"].includes(u.role)) || (role === "Department" && u.role === "Department");
    const matchesStatus = !status || u.status === status;
    return matchesSearch && matchesRole && matchesStatus;
  });

  currentPage = 1;
  renderTable();
}

function renderTable() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredUsers.slice(start, start + PAGE_SIZE);

  const body = document.getElementById("usersTableBody");
  body.innerHTML = pageRows.length
    ? pageRows.map((u) => `
      <tr data-key="${escapeHtml(u.key)}">
        <td>${escapeHtml(u.id)}</td>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td><span class="pill pill--${statusClass(u.status)}">${escapeHtml(u.status)}</span></td>
        <td>${escapeHtml(u.joined)}</td>
        <td class="row-actions">
          <button data-action="edit" title="Edit">Edit</button>
          <button data-action="delete" title="Delete">Delete</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">No users found.</td></tr>`;

  const total = filteredUsers.length;
  const shownStart = total === 0 ? 0 : start + 1;
  const shownEnd = Math.min(start + PAGE_SIZE, total);
  document.getElementById("paginationInfo").textContent = `Showing ${shownStart} to ${shownEnd} of ${total} users`;
  renderPaginationControls(total);
}

function renderPaginationControls(total) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const controls = document.getElementById("paginationControls");
  let html = `<button data-page="prev">Prev</button>`;
  for (let i = 1; i <= pageCount; i++) {
    html += `<button data-page="${i}" class="${i === currentPage ? "active" : ""}">${i}</button>`;
  }
  html += `<button data-page="next">Next</button>`;
  controls.innerHTML = html;
}

function handlePaginationClick(e) {
  const btn = e.target.closest("button[data-page]");
  if (!btn) return;
  const val = btn.dataset.page;
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  if (val === "prev") currentPage = Math.max(1, currentPage - 1);
  else if (val === "next") currentPage = Math.min(pageCount, currentPage + 1);
  else currentPage = Number(val);
  renderTable();
}

function openModal(user = null) {
  editingUserKey = user ? user.key : null;
  document.getElementById("modalTitle").textContent = user ? "Edit User" : "Add User";
  document.getElementById("fieldName").value = user?.name || "";
  document.getElementById("fieldEmail").value = user?.email || "";
  document.getElementById("fieldRole").value = user?.role === "Patient" ? "Patient" : user?.role === "Administrator" ? "Administrator" : user?.role === "Department" ? "Department" : "receptionist";
  document.getElementById("fieldStatus").value = user?.status || "Active";
  document.getElementById("fieldPassword").value = "";
  document.getElementById("fieldDepartment").value = user?.department_id || "";
  syncPasswordField();
  syncDepartmentField();
  document.getElementById("userModal").hidden = false;
}

function closeModal() {
  document.getElementById("userModal").hidden = true;
  document.getElementById("userForm").reset();
}

function syncPasswordField() {
  const role = document.getElementById("fieldRole").value;
  const passwordWrap = document.getElementById("fieldPasswordWrap");
  const passwordInput = document.getElementById("fieldPassword");
  const showPassword = !editingUserKey && needsAuthAccount(role);
  passwordWrap.hidden = !showPassword;
  passwordInput.required = showPassword;
}

function syncDepartmentField() {
  const role = document.getElementById("fieldRole").value;
  const deptWrap = document.getElementById("fieldDepartmentWrap");
  deptWrap.hidden = !needsDepartment(role);
}

function tableForRole(role) {
  if (role === "Patient") return "patients";
  return "users";
}

function payloadForTable(table, formValues) {
  if (table === "patients") {
    return {
      full_name: formValues.name,
      email: formValues.email,
      phone: "",
    };
  }
  return {
    full_name: formValues.name,
    email: formValues.email,
    role: formValues.role,
    status: formValues.status,
    auth_uid: formValues.authUid || null,
  };
}

async function createAuthAccountForUser(formValues) {
  if (!needsAuthAccount(formValues.role)) return null;
  if (!formValues.password || formValues.password.length < 6) {
    throw new Error("Enter a login password of at least 6 characters for receptionist/admin users.");
  }
  if (!window.supabase || typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
    throw new Error("Supabase Auth is not configured.");
  }

  const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Try to sign up first
  const { data, error } = await authClient.auth.signUp({
    email: formValues.email,
    password: formValues.password,
    options: {
      data: {
        full_name: formValues.name,
        role: formValues.role,
      },
    },
  });

  // If sign up succeeds, return the new user id
  if (!error && data?.user?.id) {
    return data.user.id;
  }

  // If user already exists, try to sign in with the provided password
  // This handles the case where the auth user exists but the database records were deleted
  if (error && error.message && error.message.toLowerCase().includes("already registered")) {
    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email: formValues.email,
      password: formValues.password,
    });

    if (signInError) {
      throw new Error("An account with this email already exists but the password is different. Please use a different email or contact support.");
    }

    if (signInData?.user?.id) {
      return signInData.user.id;
    }
  }

  // If it's a different error, throw it
  if (error) throw error;
  return null;
}

async function handleUserFormSubmit(e) {
  e.preventDefault();
  const formValues = {
    name: document.getElementById("fieldName").value.trim(),
    email: document.getElementById("fieldEmail").value.trim(),
    role: document.getElementById("fieldRole").value,
    status: document.getElementById("fieldStatus").value,
    password: document.getElementById("fieldPassword").value,
    department_id: document.getElementById("fieldDepartment").value ? Number(document.getElementById("fieldDepartment").value) : null,
  };
  if (!formValues.name || !formValues.email) return;

  const existing = allUsers.find((user) => user.key === editingUserKey);
  const isreceptionistUser = formValues.role === "receptionist";
  const isDeptUser = formValues.role === "Department";

  // For new receptionist/department users, save to "receptionist" table with department_id (not the "users" table)
  const targetTable = existing?.source || (isreceptionistUser || isDeptUser ? "receptionist" : tableForRole(formValues.role));

  // Create auth account for new receptionist or admin users
  if (!existing && needsAuthAccount(formValues.role)) {
    try {
      formValues.authUid = await createAuthAccountForUser(formValues);
    } catch (error) {
      console.error(error.message);
      alert(`Unable to create login account: ${error.message}`);
      return;
    }
  }

  // Build payload based on target table
  let payload;
  if (targetTable === "receptionist") {
    payload = {
      full_name: formValues.name,
      email: formValues.email,
      role: isDeptUser ? "receptionist" : formValues.role,
      status: formValues.status,
      department_id: isDeptUser ? formValues.department_id : (isreceptionistUser ? null : null),
      auth_uid: formValues.authUid || null,
    };
  } else if (targetTable === "patients") {
    payload = {
      full_name: formValues.name,
      email: formValues.email,
      phone: "",
    };
  } else {
    payload = {
      full_name: formValues.name,
      email: formValues.email,
      role: formValues.role,
      status: formValues.status,
      auth_uid: formValues.authUid || null,
    };
  }

  const request = existing
    ? supabaseClient.from(targetTable).update(payload).eq("id", existing.id)
    : supabaseClient.from(targetTable).insert([payload]);

  const { error } = await request;
  if (error) {
    console.error(error.message);
    alert(`Unable to save user: ${error.message}`);
    return;
  }



  closeModal();
  await loadUsers();
  if (!existing && targetTable === "receptionist" && isDeptUser) {
    alert("Department account created. They can now log in via the Department Portal.");
  } else if (!existing && targetTable === "receptionist") {
    alert("receptionist login account created and saved.");
  } else if (!existing && targetTable === "users") {
    alert("receptionist login account created and saved.");
  }
}

async function handleTableClick(e) {
  const row = e.target.closest("tr[data-key]");
  if (!row) return;
  const key = row.dataset.key;
  const user = allUsers.find((u) => u.key === key);
  if (!user) return;

  if (e.target.dataset.action === "edit") {
    openModal(user);
  } else if (e.target.dataset.action === "delete") {
    if (!confirm(`Remove ${user.name} from the system?`)) return;

    // Look up the auth_uid before deleting the record
    let authUid = null;
    try {
      const { data: record } = await supabaseClient
        .from(user.source)
        .select("auth_uid")
        .eq("id", user.id)
        .maybeSingle();
      if (record?.auth_uid) {
        authUid = record.auth_uid;
      }
    } catch (e) {
      console.warn("Could not look up auth_uid:", e.message);
    }

    // If deleting from receptionist table, first nullify any queue_entries references
    if (user.source === "receptionist") {
      await supabaseClient.from("queue_entries").update({ receptionist_id: null }).eq("receptionist_id", user.id);
    }

    // Delete from the source table (receptionist, patients, or users)
    const { error } = await supabaseClient.from(user.source).delete().eq("id", user.id);
    if (error) {
      console.error(error.message);
      alert(`Unable to delete user: ${error.message}`);
      return;
    }

    // Also try to delete from the users table if it was a receptionist record
    if (user.source === "receptionist") {
      await supabaseClient.from("users").delete().eq("email", user.email);
    }

    // Delete the auth user if we found an auth_uid
    if (authUid) {
      try {
        await supabaseClient.rpc("delete_auth_user", { user_id: authUid });
      } catch (e) {
        console.warn("Could not delete auth user (may need to run the SQL function first):", e.message);
      }
    }

    await loadUsers();
  }
}

async function loadDepartmentsDropdown() {
  const depts = await fetchTable("departments", {
    eq: { status: "Active" },
    order: { column: "name", ascending: true },
  });
  departmentsList = depts || [];
  const select = document.getElementById("fieldDepartment");
  select.innerHTML = '<option value="">-- Select Department --</option>';
  departmentsList.forEach(function(dept) {
    var opt = document.createElement("option");
    opt.value = dept.id;
    opt.textContent = dept.name;
    select.appendChild(opt);
  });
}

function initUsersPage() {
  // Password visibility toggle
  var toggleBtn = document.getElementById("togglePassword");
  var passwordField = document.getElementById("fieldPassword");
  if (toggleBtn && passwordField) {
    toggleBtn.addEventListener("click", function() {
      var isHidden = passwordField.type === "password";
      passwordField.type = isHidden ? "text" : "password";
      toggleBtn.textContent = isHidden ? "🙈" : "👁";
      toggleBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  }

  loadUsers();
  loadDepartmentsDropdown();
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("roleFilter").addEventListener("change", applyFilters);
  document.getElementById("statusFilter").addEventListener("change", applyFilters);
  document.getElementById("paginationControls").addEventListener("click", handlePaginationClick);
  document.getElementById("usersTableBody").addEventListener("click", handleTableClick);
  document.getElementById("addUserBtn").addEventListener("click", () => openModal());
  document.getElementById("fieldRole").addEventListener("change", function() {
    syncPasswordField();
    syncDepartmentField();
  });
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  document.getElementById("cancelModalBtn").addEventListener("click", closeModal);
  document.getElementById("userForm").addEventListener("submit", handleUserFormSubmit);
}

document.addEventListener("DOMContentLoaded", initUsersPage);
