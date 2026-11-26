"use strict";

/* =========================================================
   Admin panel - Staff and Students tabs (full CRUD on /users)
   Staff = examiners (teachers), invigilators and admins.
   Owner: Dev Singh Chauhan
   json-server: /users, /sessions, /loginAttempts
   ========================================================= */

const userView = {
  staffPage: 1,
  studentPage: 1,
  mode: "staff",       // which kind of account the dialog is editing
  editingId: null,
  resetId: null
};

function bindUsers() {
  document.getElementById("newStaffBtn").addEventListener("click", function () { openUserDialog("staff", null).catch(handlePageError); });
  document.getElementById("newStudentBtn").addEventListener("click", function () { openUserDialog("student", null).catch(handlePageError); });
  document.getElementById("userForm").addEventListener("submit", saveUser);
  document.getElementById("resetForm").addEventListener("submit", resetPassword);
  document.getElementById("uRole").addEventListener("change", toggleSubjects);
  document.getElementById("uId").addEventListener("input", function () { this.value = this.value.replace(/[^0-9]/g, ""); });

  const reloadStaff = function () { userView.staffPage = 1; loadStaff().catch(handlePageError); };
  document.getElementById("staffSearch").addEventListener("input", debounce(reloadStaff, 300));
  document.getElementById("staffRoleFilter").addEventListener("change", reloadStaff);
  document.getElementById("staffStatusFilter").addEventListener("change", reloadStaff);
  const reloadStudents = function () { userView.studentPage = 1; loadStudents().catch(handlePageError); };
  document.getElementById("studentSearch").addEventListener("input", debounce(reloadStudents, 300));
  document.getElementById("studentStatusFilter").addEventListener("change", reloadStudents);

  const handlers = {
    edit: function (id) { return openUserDialog(null, id); },
    reset: openResetDialog,
    block: function (id, button) { return setUserStatus(id, "blocked", button); },
    unblock: function (id, button) { return setUserStatus(id, "active", button); },
    "delete": deleteUser
  };
  onRowAction("staffBody", handlers);
  onRowAction("studentBody", handlers);
}

function searchParams(search) {
  const params = {};
  if (/^[0-9]+$/.test(search)) params.id_like = "^" + search;
  else if (search.indexOf("@") !== -1) params.email_like = escapeRegex(search);
  else if (search) params.name_like = escapeRegex(search);
  return params;
}

function userActions(u) {
  const blocked = u.status === "blocked";
  const self = u.id === me.id;
  return '<div class="actions">' + iconButton("edit", u.id, "bi-pencil", "Edit") + iconButton("reset", u.id, "bi-key", "Reset password") +
    (self ? "" : (blocked ? iconButton("unblock", u.id, "bi-unlock", "Unblock") : iconButton("block", u.id, "bi-slash-circle", "Block")) +
      iconButton("delete", u.id, "bi-trash3", "Delete", "danger")) + "</div>";
}

function statusCell(u) {
  return '<span class="badge badge-' + (u.status === "blocked" ? "blocked" : "active") + '">' + (u.status === "blocked" ? "Blocked" : "Active") + "</span>";
}

/* ---------- Lists ---------- */

async function loadStaff() {
  const role = document.getElementById("staffRoleFilter").value;
  const params = Object.assign({
    role: role || ["examiner", "invigilator", "admin"],
    status: document.getElementById("staffStatusFilter").value,
    _sort: "name", _order: "asc", _page: userView.staffPage, _limit: PAGE_SIZE
  }, searchParams(document.getElementById("staffSearch").value.trim()));
  const { items, total } = await api.page("/users", params);
  if (!items.length && userView.staffPage > 1) {
    userView.staffPage--;
    return loadStaff();
  }
  document.getElementById("staffBody").innerHTML = items.map(function (u) {
    const duty = u.role === "examiner"
      ? '<div class="chips">' + (u.subjects || []).map(function (s) { return "<span>" + escapeHtml(s) + "</span>"; }).join("") + "</div>"
      : escapeHtml(u.department || "-");
    return '<tr><td class="cell-main">' + userCell(u.name + (u.id === me.id ? " (you)" : ""), u.email) + "</td>" +
      '<td data-label="Staff ID">' + escapeHtml(u.id) + "</td>" +
      '<td data-label="Role"><span class="badge badge-' + u.role + '">' + ROLE_LABELS[u.role] + "</span></td>" +
      '<td data-label="Subjects / duty">' + duty + "</td>" +
      '<td data-label="Status">' + statusCell(u) + "</td>" +
      '<td data-label="">' + userActions(u) + "</td></tr>";
  }).join("") || '<tr class="table-empty"><td colspan="6">No staff match your filters.</td></tr>';
  renderPagination(document.getElementById("staffPager"), userView.staffPage, PAGE_SIZE, total, function (page) {
    userView.staffPage = page;
    loadStaff().catch(handlePageError);
  });
}

async function loadStudents() {
  const params = Object.assign({
    role: "student",
    status: document.getElementById("studentStatusFilter").value,
    _embed: "results", _sort: "name", _order: "asc", _page: userView.studentPage, _limit: PAGE_SIZE
  }, searchParams(document.getElementById("studentSearch").value.trim()));
  const { items, total } = await api.page("/users", params);
  if (!items.length && userView.studentPage > 1) {
    userView.studentPage--;
    return loadStudents();
  }
  document.getElementById("studentBody").innerHTML = items.map(function (s) {
    const graded = s.results.filter(function (r) { return r.status !== "pending"; });
    return '<tr><td class="cell-main">' + userCell(s.name, s.email) + "</td>" +
      '<td data-label="Roll no.">' + escapeHtml(s.id) + "</td>" +
      '<td data-label="Programme">' + escapeHtml(s.department || "-") + "</td>" +
      '<td data-label="Exams" class="num">' + s.results.length + "</td>" +
      '<td data-label="Average" class="num">' + (graded.length ? averagePercentage(graded) + "%" : "-") + "</td>" +
      '<td data-label="Status">' + statusCell(s) + "</td>" +
      '<td data-label="">' + userActions(s) + "</td></tr>";
  }).join("") || '<tr class="table-empty"><td colspan="7">No students match your filters.</td></tr>';
  renderPagination(document.getElementById("studentPager"), userView.studentPage, PAGE_SIZE, total, function (page) {
    userView.studentPage = page;
    loadStudents().catch(handlePageError);
  });
}

/* ---------- Create / edit ---------- */

function toggleSubjects() {
  document.getElementById("uSubjectsField").hidden = userView.mode !== "staff" || document.getElementById("uRole").value !== "examiner";
}

async function openUserDialog(mode, id) {
  const form = document.getElementById("userForm");
  form.reset();
  userView.editingId = id;
  let user = null;
  if (id) {
    user = await api.get(idPath("users", id));
    mode = user.role === "student" ? "student" : "staff";
  }
  userView.mode = mode;
  const isStudent = mode === "student";
  const idInput = document.getElementById("uId");

  document.getElementById("userDialogTitle").textContent = (id ? "Edit " : "Add ") + (isStudent ? "student" : "staff member");
  document.getElementById("uIdLabel").textContent = isStudent ? "Roll number" : "Staff ID";
  document.getElementById("uIdHint").textContent = isStudent ? "Exactly 10 digits" : "4 to 6 digits";
  document.getElementById("uDeptLabel").textContent = isStudent ? "Programme" : "Department";
  document.getElementById("uRoleField").hidden = isStudent;
  document.getElementById("uPasswordField").hidden = Boolean(id);
  idInput.readOnly = Boolean(id);
  document.getElementById("uRole").disabled = Boolean(id && id === me.id); // cannot demote yourself

  if (user) {
    document.getElementById("uName").value = user.name;
    idInput.value = user.id;
    document.getElementById("uRole").value = isStudent ? "examiner" : user.role;
    document.getElementById("uEmail").value = user.email || "";
    document.getElementById("uPhone").value = user.phone || "";
    document.getElementById("uDept").value = user.department || "";
    document.getElementById("uStatus").value = user.status || "active";
    document.getElementById("uSubjects").value = (user.subjects || []).join(", ");
  } else {
    document.getElementById("uDept").value = isStudent ? "B.Tech CSE" : "Computer Science";
  }
  toggleSubjects();
  openModal("userDialog");
}

function saveUser(event) {
  event.preventDefault();
  const alertBox = document.getElementById("userAlert");
  const editing = userView.editingId;
  const isStudent = userView.mode === "student";
  const id = document.getElementById("uId").value.trim();
  const role = isStudent ? "student" : document.getElementById("uRole").value;
  const password = document.getElementById("uPassword").value;
  const data = {
    name: document.getElementById("uName").value.trim().replace(/\s+/g, " "),
    email: document.getElementById("uEmail").value.trim().toLowerCase(),
    phone: document.getElementById("uPhone").value.trim(),
    department: document.getElementById("uDept").value.trim(),
    status: document.getElementById("uStatus").value,
    role: role
  };
  if (role === "examiner") {
    data.subjects = document.getElementById("uSubjects").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  if (data.name.length < 3) return setAlert(alertBox, "Name must have at least 3 letters.");
  if (isStudent ? !/^[0-9]{10}$/.test(id) : !/^[0-9]{4,6}$/.test(id)) {
    return setAlert(alertBox, isStudent ? "Roll number must be exactly 10 digits." : "Staff ID must be 4 to 6 digits.");
  }
  if (!EMAIL_PATTERN.test(data.email)) return setAlert(alertBox, "Please enter a valid email address.");
  if (role === "examiner" && !data.subjects.length) return setAlert(alertBox, "Give the examiner at least one subject.");
  if (!editing) {
    const problem = validatePassword(password, id);
    if (problem) return setAlert(alertBox, problem);
  }
  if (editing === me.id) { data.role = "admin"; data.status = "active"; }

  withBusy(document.getElementById("userSaveBtn"), async function () {
    const sameEmail = await api.get("/users", { email: data.email, id_ne: id });
    if (sameEmail.length) {
      setAlert(alertBox, "Another account already uses this email.");
      return;
    }
    if (editing) {
      data.updatedAt = new Date().toISOString();
      await api.patch(idPath("users", editing), data);
      if (data.status === "blocked") await endSessionsFor(editing);
      await logActivity(me, "user", "Updated " + ROLE_LABELS[role].toLowerCase() + " " + editing);
      toast("Account updated.", "success");
    } else {
      if (await api.find(idPath("users", id))) {
        setAlert(alertBox, "ID " + id + " is already in use.");
        return;
      }
      await api.post("/users", Object.assign(data, {
        id: id,
        password: await hashPassword(id, password),
        createdAt: new Date().toISOString(),
        createdBy: me.id,
        notificationsSeenAt: null
      }));
      await logActivity(me, "user", "Added " + ROLE_LABELS[role].toLowerCase() + " " + id);
      toast(ROLE_LABELS[role] + " added. Share the initial password with them.", "success");
    }
    closeModal("userDialog");
    await (isStudent ? loadStudents() : loadStaff());
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

/* ---------- Block / reset / delete ---------- */

async function setUserStatus(id, status, button) {
  const user = await api.get(idPath("users", id));
  await withBusy(button, async function () {
    await api.patch(idPath("users", id), { status: status, updatedAt: new Date().toISOString() });
    if (status === "blocked") await endSessionsFor(id);
    await logActivity(me, "user", (status === "blocked" ? "Blocked " : "Unblocked ") + id);
  });
  toast(status === "blocked" ? user.name + " is blocked and signed out." : user.name + " is unblocked.", "success");
  await (user.role === "student" ? loadStudents() : loadStaff());
}

async function openResetDialog(id) {
  const user = await api.get(idPath("users", id));
  userView.resetId = id;
  document.getElementById("resetForm").reset();
  document.getElementById("resetFor").textContent = "Set a new password for " + user.name + " (" + user.id + "). They will be signed out everywhere.";
  openModal("resetDialog");
}

function resetPassword(event) {
  event.preventDefault();
  const alertBox = document.getElementById("resetAlert");
  const id = userView.resetId;
  const password = document.getElementById("resetPassword").value;
  const problem = validatePassword(password, id);
  if (problem) return setAlert(alertBox, problem);

  withBusy(document.getElementById("resetSaveBtn"), async function () {
    await api.patch(idPath("users", id), { password: await hashPassword(id, password), passwordChangedAt: new Date().toISOString() });
    if (id !== me.id) await endSessionsFor(id);
    if (await api.find(idPath("loginAttempts", "login-" + id))) await api.remove(idPath("loginAttempts", "login-" + id));
    await logActivity(me, "user", "Reset password for " + id);
    closeModal("resetDialog");
    toast("Password reset.", "success");
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

async function deleteUser(id) {
  const user = await api.get(idPath("users", id), { _embed: "results" });
  let message = "This removes " + user.name + "'s account. It cannot be undone.";
  if (user.role === "student") message = "This removes the account and " + plural(user.results.length, "result") + ". It cannot be undone.";
  if (user.role === "examiner") {
    const exams = await api.page("/exams", { createdBy: id, _limit: 1 });
    if (exams.total) message += " Their " + plural(exams.total, "exam") + " will stay, with no owner.";
  }
  const ok = await confirmDialog({ title: "Delete " + user.name + "?", message: message, confirmText: "Delete account", danger: true });
  if (!ok) return;
  await api.remove(idPath("users", id)); // json-server also removes records with userId = id
  await logActivity(me, "user", "Deleted " + ROLE_LABELS[user.role].toLowerCase() + " " + id);
  toast("Account deleted.", "success");
  await (user.role === "student" ? loadStudents() : loadStaff());
}
