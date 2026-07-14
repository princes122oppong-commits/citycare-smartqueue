/* ==========================================================================
   Walk-in Registration page logic — live Supabase patient + queue insert.
   Generates sequential tokens per department (e.g., G-001, G-002).
   ========================================================================== */

let selectedDepartmentId = null;
let selectedDepartmentName = "";
let staffProfile = null;

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("walkin-form");
  const tokenPreview = document.getElementById("token-preview");
  const deptSelect = document.getElementById("department");
  if (!form || !tokenPreview || !deptSelect) return;

  // Load staff profile for staff_id assignment
  const staffInfo = await getCurrentStaffProfile();
  if (staffInfo) staffProfile = staffInfo;

  // Load departments dynamically from Supabase
  await loadDepartments(deptSelect);

  // Update token preview live when department changes
  deptSelect.addEventListener("change", async () => {
    await updateTokenPreview();
  });

  // Initial token preview
  await updateTokenPreview();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      full_name: document.getElementById("full-name").value.trim(),
      gender: document.getElementById("gender").value,
      phone: document.getElementById("phone").value.trim(),
      email: document.getElementById("email").value.trim() || null,
      address: document.getElementById("address").value.trim() || null,
      department_id: selectedDepartmentId,
      department_name: selectedDepartmentName,
      reason: document.getElementById("reason").value.trim() || null,
    };

    if (!payload.full_name || !payload.gender || !payload.phone || !payload.department_id) {
      alert("Please fill in all required fields marked with *.");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Generating...";

    const { token, error } = await insertWalkinPatient(payload);

    submitBtn.disabled = false;
    submitBtn.innerHTML =
      'Generate Token <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

    if (error) {
      console.error("Failed to generate queue token:", error);
      alert(error.message || "Something went wrong generating the token. Please try again.");
      return;
    }

    tokenPreview.textContent = token;
    alert(`Token ${token} generated for ${payload.full_name}.`);
    form.reset();
    await updateTokenPreview();
  });
});

async function loadDepartments(selectEl) {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("departments")
    .select("id, name")
    .eq("status", "Active")
    .order("name", { ascending: true });

  if (error) {
    console.warn("Unable to load departments:", error.message);
    return;
  }

  if (!data?.length) {
    selectEl.innerHTML = '<option value="">No departments available</option>';
    return;
  }

  selectEl.innerHTML = data
    .map(
      (dept) =>
        `<option value="${escapeHtml(dept.name)}" data-dept-id="${dept.id}">${escapeHtml(dept.name)}</option>`
    )
    .join("");

  // Add change listener to ensure selectedDepartmentId is always updated
  selectEl.addEventListener("change", () => {
    updateSelectedDepartment(selectEl);
  });

  // Set initial selected department
  updateSelectedDepartment(selectEl);
}

function updateSelectedDepartment(selectEl) {
  const option = selectEl?.selectedOptions?.[0];
  selectedDepartmentName = selectEl?.value || "";
  selectedDepartmentId = option?.dataset?.deptId ? Number(option.dataset.deptId) : null;
}

async function updateTokenPreview() {
  const select = document.getElementById("department");
  const tokenPreview = document.getElementById("token-preview");
  const deptNameEl = document.querySelector(".dept-selected-name");
  const tokenDeptEl = document.querySelector(".token-dept");

  if (!select || !tokenPreview) return;

  updateSelectedDepartment(select);

  // Update department display
  if (deptNameEl) deptNameEl.textContent = selectedDepartmentName || "No department selected";
  if (tokenDeptEl) tokenDeptEl.textContent = selectedDepartmentName || "—";

  // Generate preview token
  if (selectedDepartmentId && selectedDepartmentName) {
    const nextToken = await generateNextToken(selectedDepartmentId, selectedDepartmentName);
    tokenPreview.textContent = nextToken || "—";
  } else {
    tokenPreview.textContent = "—";
  }
}

async function generateNextToken(departmentId, departmentName) {
  if (!supabaseClient || !departmentId) return null;

  try {
    // Use database function to atomically generate unique token
    const { data, error } = await supabaseClient
      .rpc('generate_next_queue_token', { p_department_id: departmentId });
    
    if (error) {
      console.warn("Failed to generate token via database function:", error.message);
      return null;
    }
    
    return data;
  } catch (e) {
    console.warn("Could not generate token:", e.message);
    return null;
  }
}

function getDepartmentPrefix(departmentName) {
  const words = departmentName.split(/\s+/).filter(Boolean);
  // Use first letter of first word (e.g., "General Medicine" -> "G", "Pediatrics" -> "P")
  return words[0]?.charAt(0).toUpperCase() || "Q";
}

async function insertWalkinPatient(payload) {
  if (!supabaseClient) {
    return { token: null, error: new Error("Supabase client is not configured.") };
  }

  const phone = payload.phone.trim();
  const email = (payload.email || `${phone.replace(/\D/g, "")}@citycare.local`).trim().toLowerCase();
  const departmentId = payload.department_id;
  const departmentName = payload.department_name;

  if (!departmentId) {
    return { token: null, error: new Error("Please select a valid department.") };
  }

  const { data: authUserData } = await supabaseClient.auth.getUser();
  const authUid = authUserData?.user?.id || null;

  // Look up existing patient by phone
  const { data: existingPatient, error: existingPatientError } = await supabaseClient
    .from("patients")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (existingPatientError) {
    return { token: null, error: existingPatientError };
  }

  let patientId = existingPatient?.id;

  if (!patientId) {
    const { data: insertedPatient, error: patientInsertError } = await supabaseClient
      .from("patients")
      .insert({
        auth_uid: authUid,
        full_name: payload.full_name,
        phone,
        email,
        gender: payload.gender,
        address: payload.address,
      })
      .select("id")
      .single();

    if (patientInsertError) {
      return { token: null, error: patientInsertError };
    }

    patientId = insertedPatient.id;
  }

  // Get staff_id from the logged-in staff profile
  const staffId = staffProfile?.profile?.id || null;

  // Count people ahead in the same department waiting
  const { count: aheadCount } = await supabaseClient
    .from("queue_entries")
    .select("*", { count: "exact", head: true })
    .eq("department_id", departmentId)
    .eq("status", "waiting");

  const expectedWaitMinutes = Math.max(5, (aheadCount || 0) * 5);

  // Try to insert with retry logic for token generation (max 3 attempts)
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    // Generate sequential token number
    const token = await generateNextToken(departmentId, departmentName);
    if (!token) {
      return { token: null, error: new Error("Unable to generate token number.") };
    }

    // Insert queue entry
    const { data: queueEntry, error: queueInsertError } = await supabaseClient
      .from("queue_entries")
      .insert({
        token_no: token,
        patient_id: patientId,
        department_id: departmentId,
        staff_id: staffId,
        status: "waiting",
        type: "walk-in",
        reason: payload.reason,
        expected_wait_minutes: expectedWaitMinutes,
      })
      .select("token_no")
      .single();

    if (!queueInsertError) {
      // Success! Create notification and return
      try {
        await supabaseClient.from("notifications").insert({
          patient_id: patientId,
          title: "Queue Token Generated",
          body: `Your token ${token} for ${departmentName} has been generated. Please wait for your turn.`,
          category: "queue",
          icon: "📡",
          unread: true,
        });
      } catch (notifErr) {
        console.warn("Failed to create notification:", notifErr.message);
        // Non-critical - don't abort the operation
      }

      return { token: queueEntry.token_no, error: null };
    }

    // If it's a duplicate key error, retry with next token
    if (queueInsertError.code === "23505") {
      console.warn(`Token ${token} already exists, retrying with next token (attempt ${attempt + 1}/3)...`);
      lastError = queueInsertError;
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }

    // Other error - return immediately
    return { token: null, error: queueInsertError };
  }

  // All retries failed
  return { 
    token: null, 
    error: new Error(`Failed to generate unique token after 3 attempts. Please try again. Original error: ${lastError?.message}`) 
  };
}
