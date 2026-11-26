"use strict";

/* =========================================================
   Profile page - edit details, change password, sessions, dark mode, delete account
   Owner: Dev Sharma (Invigilator module + sign-in / profile)
   json-server: /users, /sessions, /results, /activity
   ========================================================= */

let me = null;

(async function () {
  me = await requireRole(null);
  renderAppHeader(me, me.role === "student" ? "profile" : "");
  renderFooter();
  setupPasswordToggles();

  fillProfile();
  await Promise.all([loadStats(), loadSessions(), loadActivity()]);

  document.getElementById("detailsForm").addEventListener("submit", saveDetails);
  document.getElementById("passwordForm").addEventListener("submit", changePassword);
  document.getElementById("newPassword").addEventListener("input", function () {
    renderStrength(document.getElementById("strength"), this.value);
  });
  document.getElementById("fPhone").addEventListener("input", function () {
    this.value = this.value.replace(/[^0-9+ ]/g, "");
  });

  const dark = document.getElementById("darkSwitch");
  dark.checked = document.documentElement.getAttribute("data-theme") === "dark";
  dark.addEventListener("change", function () { toggleTheme(me); });

  const remember = document.getElementById("rememberSwitch");
  remember.checked = localStorage.getItem(REMEMBER_KEY) === me.id;
  remember.addEventListener("change", function () {
    if (remember.checked) localStorage.setItem(REMEMBER_KEY, me.id);
    else localStorage.removeItem(REMEMBER_KEY);
    toast(remember.checked ? "Your ID will be remembered on this device." : "Your ID will no longer be remembered.", "success");
  });

  document.getElementById("signOutOthersBtn").addEventListener("click", signOutOthers);

  if (me.role === "student") {
    document.getElementById("dangerZone").hidden = false;
    document.getElementById("deleteAccountBtn").addEventListener("click", function () { openModal("deleteDialog"); });
    document.getElementById("deleteForm").addEventListener("submit", deleteAccount);
  }
})().catch(handlePageError);

function fillProfile() {
  document.getElementById("pAvatar").textContent = getInitials(me.name);
  document.getElementById("pName").textContent = me.name;
  document.getElementById("pMeta").textContent = (me.role === "examiner" ? "Examiner" : "Student") + " · " + me.id + (me.department ? " · " + me.department : "");
  document.getElementById("pJoined").textContent = me.createdAt ? formatDate(me.createdAt) : "-";
  document.getElementById("pLastLogin").textContent = me.lastLoginAt ? timeAgo(me.lastLoginAt) : "-";
  document.getElementById("fName").value = me.name;
  document.getElementById("fId").value = me.id;
  document.getElementById("fDept").value = me.department || "";
  document.getElementById("fEmail").value = me.email || "";
  document.getElementById("fPhone").value = me.phone || "";
}

async function loadStats() {
  if (me.role === "student") {
    const results = await api.get("/results", { userId: me.id });
    document.getElementById("pStat1").textContent = results.length;
    document.getElementById("pStat2").textContent = results.length ? averagePercentage(results) + "%" : "-";
    return;
  }
  // Two counts per staff role, each straight from X-Total-Count
  const stats = {
    examiner: [["Exams created", "/exams", { createdBy: me.id }], ["Results awaiting grading", "/results", { status: "pending" }]],
    invigilator: [["Exams assigned", "/exams", { invigilatorId: me.id }], ["Incidents logged", "/incidents", { createdBy: me.id }]],
    admin: [["Staff accounts", "/users", { role_ne: "student" }], ["Papers to approve", "/exams", { approval: "pending" }]]
  }[me.role];
  const totals = await Promise.all(stats.map(function (s) {
    return api.page(s[1], Object.assign({ _limit: 1 }, s[2]));
  }));
  document.getElementById("pStat1Label").textContent = stats[0][0];
  document.getElementById("pStat1").textContent = totals[0].total;
  document.getElementById("pStat2Label").textContent = stats[1][0];
  document.getElementById("pStat2").textContent = totals[1].total;
}

/* ---------- Update (PATCH /users/:id) ---------- */

function saveDetails(event) {
  event.preventDefault();
  const alertBox = document.getElementById("detailsAlert");
  const name = document.getElementById("fName").value.trim().replace(/\s+/g, " ");
  const email = document.getElementById("fEmail").value.trim().toLowerCase();
  const phone = document.getElementById("fPhone").value.trim();
  const department = document.getElementById("fDept").value.trim();

  if (name.length < 3) return setAlert(alertBox, "Name must have at least 3 letters.");
  if (!EMAIL_PATTERN.test(email)) return setAlert(alertBox, "Please enter a valid email address.");
  if (phone && !/^\+?[0-9 ]{10,15}$/.test(phone)) return setAlert(alertBox, "Phone number should have 10 to 15 digits.");

  withBusy(document.getElementById("detailsBtn"), async function () {
    const sameEmail = await api.get("/users", { email: email, id_ne: me.id });
    if (sameEmail.length) {
      setAlert(alertBox, "Another account already uses this email.");
      return;
    }
    me = Object.assign(me, await api.patch(idPath("users", me.id), {
      name: name, email: email, phone: phone, department: department, updatedAt: new Date().toISOString()
    }));
    await logActivity(me, "user", "Updated profile details");
    fillProfile();
    renderAppHeader(me, me.role === "student" ? "profile" : "");
    setAlert(alertBox, "");
    toast("Profile updated.", "success");
    loadActivity();
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

function changePassword(event) {
  event.preventDefault();
  const alertBox = document.getElementById("passwordAlert");
  const current = document.getElementById("curPassword").value;
  const next = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmNew").value;

  if (!current || !next || !confirm) return setAlert(alertBox, "Please fill in all three fields.");
  const problem = validatePassword(next, me.id);
  if (problem) return setAlert(alertBox, problem);
  if (next !== confirm) return setAlert(alertBox, "The new passwords do not match.");
  if (next === current) return setAlert(alertBox, "The new password must be different.");

  withBusy(document.getElementById("passwordBtn"), async function () {
    const fresh = await api.get(idPath("users", me.id));
    if (fresh.password !== await hashPassword(me.id, current)) {
      setAlert(alertBox, "Your current password is wrong.");
      return;
    }
    await api.patch(idPath("users", me.id), { password: await hashPassword(me.id, next), passwordChangedAt: new Date().toISOString() });
    await removeOtherSessions();
    await logActivity(me, "auth", "Changed password");
    document.getElementById("passwordForm").reset();
    renderStrength(document.getElementById("strength"), "");
    setAlert(alertBox, "");
    toast("Password changed. Other devices were signed out.", "success");
    loadSessions();
    loadActivity();
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

/* ---------- Sessions (GET / DELETE /sessions) ---------- */

async function loadSessions() {
  const token = localStorage.getItem(SESSION_KEY);
  const sessions = await api.get("/sessions", { userId: me.id, _sort: "createdAt", _order: "desc" });
  const now = Date.now();
  const box = document.getElementById("sessionList");
  document.getElementById("signOutOthersBtn").disabled = sessions.length < 2;
  box.innerHTML = sessions.map(function (s) {
    const current = s.id === token;
    const expired = new Date(s.expiresAt).getTime() < now;
    const device = /Mobile|Android|iPhone/.test(s.userAgent || "") ? "bi-phone" : "bi-laptop";
    return '<div class="list-item"><span class="list-icon"><i class="bi ' + device + '" aria-hidden="true"></i></span>' +
      "<div><strong>" + (current ? "This device" : "Other device") + (expired ? " (expired)" : "") + "</strong><small>Signed in " +
      formatDateTime(s.createdAt) + " &middot; expires " + formatDateTime(s.expiresAt) + "</small></div>" +
      (current ? '<span class="badge badge-active">Current</span>'
        : '<button type="button" class="btn btn-sm btn-outline" data-session="' + escapeHtml(s.id) + '">Sign out</button>') + "</div>";
  }).join("") || '<div class="empty">No sessions.</div>';
  box.querySelectorAll("[data-session]").forEach(function (button) {
    button.addEventListener("click", function () {
      withBusy(button, async function () {
        await api.remove(idPath("sessions", button.getAttribute("data-session")));
        toast("That device was signed out.", "success");
        await loadSessions();
      }).catch(handlePageError);
    });
  });
}

async function removeOtherSessions() {
  const token = localStorage.getItem(SESSION_KEY);
  const sessions = await api.get("/sessions", { userId: me.id });
  await Promise.all(sessions.filter(function (s) { return s.id !== token; }).map(function (s) {
    return api.remove(idPath("sessions", s.id));
  }));
}

function signOutOthers() {
  withBusy(document.getElementById("signOutOthersBtn"), async function () {
    await removeOtherSessions();
    toast("All other devices were signed out.", "success");
    await loadSessions();
  }).catch(handlePageError);
}

async function loadActivity() {
  const items = await api.get("/activity", { userId: me.id, _sort: "createdAt", _order: "desc", _limit: 6 });
  const icons = { auth: "bi-box-arrow-in-right", exam: "bi-journal-text", result: "bi-check2-circle", user: "bi-person" };
  document.getElementById("activityList").innerHTML = items.map(function (a) {
    return '<div class="activity-item"><i class="bi ' + (icons[a.type] || "bi-dot") + '" aria-hidden="true"></i><div>' +
      escapeHtml(a.message) + "<small>" + timeAgo(a.createdAt) + "</small></div></div>";
  }).join("") || '<p class="muted small">No activity yet.</p>';
}

/* ---------- Delete (DELETE /users/:id, json-server also removes the user's results, attempts and sessions) ---------- */

function deleteAccount(event) {
  event.preventDefault();
  const alertBox = document.getElementById("deleteAlert");
  const password = document.getElementById("deletePassword").value;
  if (!password) return setAlert(alertBox, "Please enter your password.");

  withBusy(document.getElementById("confirmDeleteBtn"), async function () {
    const fresh = await api.get(idPath("users", me.id));
    if (fresh.password !== await hashPassword(me.id, password)) {
      setAlert(alertBox, "Wrong password.");
      return;
    }
    await api.remove(idPath("users", me.id));
    localStorage.removeItem(SESSION_KEY);
    if (localStorage.getItem(REMEMBER_KEY) === me.id) localStorage.removeItem(REMEMBER_KEY);
    location.replace("index.html");
  }).catch(function (error) { setAlert(alertBox, error.message); });
}
