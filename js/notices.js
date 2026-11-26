"use strict";

/* =========================================================
   Announcements tab - shared by the Examiner and Admin pages
   Owner: Chaitanya Pandey
   json-server: /announcements  (GET / POST / PATCH / DELETE)
   Needs on the page: #noticeList and #newNoticeBtn. The dialog is added by this file.
   ========================================================= */

const AUDIENCE_LABELS = { all: "Everyone", students: "Students", examiners: "Examiners", invigilators: "Invigilators", admins: "Admins" };

const noticeState = { user: null, editingId: null };

function setupNotices(user) {
  noticeState.user = user;
  const isAdmin = user.role === "admin";
  const audiences = isAdmin ? Object.keys(AUDIENCE_LABELS) : ["students", "all", "invigilators", "admins"];

  const dialog = document.createElement("dialog");
  dialog.className = "modal";
  dialog.id = "noticeDialog";
  dialog.innerHTML =
    '<form id="noticeForm" novalidate>' +
    '<div class="modal-head"><h2 id="noticeDialogTitle">New announcement</h2><button type="button" class="icon-btn sm" data-close aria-label="Close"><i class="bi bi-x-lg"></i></button></div>' +
    '<div class="modal-body">' +
    '<div class="field"><label for="nTitle">Title</label><input id="nTitle" type="text" maxlength="80" required></div>' +
    '<div class="field"><label for="nMessage">Message</label><textarea id="nMessage" rows="4" maxlength="600" required></textarea></div>' +
    '<div class="field-row"><div class="field"><label for="nAudience">Audience</label><select id="nAudience">' +
    audiences.map(function (a) { return '<option value="' + a + '">' + AUDIENCE_LABELS[a] + "</option>"; }).join("") +
    '</select></div><div class="field"><label for="nPriority">Priority</label><select id="nPriority"><option value="normal">Normal</option><option value="high">Important</option></select></div></div>' +
    '<p class="form-alert" id="noticeAlert"></p></div>' +
    '<div class="modal-foot"><button type="button" class="btn btn-outline" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="noticeSaveBtn">Publish</button></div>' +
    "</form>";
  document.body.appendChild(dialog);

  document.getElementById("newNoticeBtn").addEventListener("click", function () { openNoticeDialog(null).catch(handlePageError); });
  document.getElementById("noticeForm").addEventListener("submit", saveNotice);
  onRowAction("noticeList", {
    "edit-n": function (id) { return openNoticeDialog(Number(id)); },
    "delete-n": function (id) { return deleteNotice(Number(id)); }
  });
}

async function loadNotices() {
  const me = noticeState.user;
  // Admins see every notice; examiners see and manage only their own
  const params = { _sort: "createdAt", _order: "desc" };
  if (me.role !== "admin") params.createdBy = me.id;
  const [list, users] = await Promise.all([api.get("/announcements", params), api.get("/users", { role_ne: "student" })]);
  const names = {};
  users.forEach(function (u) { names[u.id] = u.name; });

  document.getElementById("noticeList").innerHTML = list.map(function (a) {
    return '<article class="announcement"><div class="announcement-head"><h3>' + escapeHtml(a.title) + "</h3>" +
      '<div style="display:flex;gap:6px">' + iconButton("edit-n", a.id, "bi-pencil", "Edit announcement") +
      iconButton("delete-n", a.id, "bi-trash3", "Delete announcement", "danger") + "</div></div>" +
      "<p>" + escapeHtml(a.message) + '</p><div class="meta">' +
      '<span class="badge badge-' + (a.priority === "high" ? "high" : "normal") + '">' + (a.priority === "high" ? "Important" : "Normal") + "</span>" +
      '<span><i class="bi bi-people" aria-hidden="true"></i> ' + (AUDIENCE_LABELS[a.audience] || a.audience) + "</span>" +
      '<span><i class="bi bi-person" aria-hidden="true"></i> ' + escapeHtml(names[a.createdBy] || a.createdBy) + "</span>" +
      '<span><i class="bi bi-clock" aria-hidden="true"></i> ' + formatDateTime(a.createdAt) + (a.updatedAt && a.updatedAt !== a.createdAt ? " (edited)" : "") + "</span></div></article>";
  }).join("") || '<div class="empty"><i class="bi bi-megaphone" aria-hidden="true"></i>No announcements yet.</div>';
}

async function openNoticeDialog(id) {
  noticeState.editingId = id;
  document.getElementById("noticeForm").reset();
  if (id) {
    const a = await api.get(idPath("announcements", id));
    document.getElementById("noticeDialogTitle").textContent = "Edit announcement";
    document.getElementById("noticeSaveBtn").textContent = "Save changes";
    document.getElementById("nTitle").value = a.title;
    document.getElementById("nMessage").value = a.message;
    document.getElementById("nAudience").value = a.audience;
    document.getElementById("nPriority").value = a.priority;
  } else {
    document.getElementById("noticeDialogTitle").textContent = "New announcement";
    document.getElementById("noticeSaveBtn").textContent = "Publish";
  }
  openModal("noticeDialog");
}

function saveNotice(event) {
  event.preventDefault();
  const me = noticeState.user;
  const alertBox = document.getElementById("noticeAlert");
  const data = {
    title: document.getElementById("nTitle").value.trim(),
    message: document.getElementById("nMessage").value.trim(),
    audience: document.getElementById("nAudience").value,
    priority: document.getElementById("nPriority").value
  };
  if (data.title.length < 3) return setAlert(alertBox, "Title must have at least 3 characters.");
  if (data.message.length < 5) return setAlert(alertBox, "Please write a message.");

  withBusy(document.getElementById("noticeSaveBtn"), async function () {
    const now = new Date().toISOString();
    if (noticeState.editingId) {
      data.updatedAt = now;
      await api.patch(idPath("announcements", noticeState.editingId), data);
      toast("Announcement updated.", "success");
    } else {
      await api.post("/announcements", Object.assign(data, { createdBy: me.id, createdAt: now, updatedAt: now }));
      await logActivity(me, "notice", "Published \"" + data.title + "\"");
      toast("Announcement published.", "success");
    }
    closeModal("noticeDialog");
    await loadNotices();
    loadNotifications(me).catch(function () {});
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

async function deleteNotice(id) {
  const ok = await confirmDialog({ title: "Delete announcement?", message: "It will disappear from every dashboard.", confirmText: "Delete", danger: true });
  if (!ok) return;
  await api.remove(idPath("announcements", id));
  toast("Announcement deleted.", "success");
  await loadNotices();
  loadNotifications(noticeState.user).catch(function () {});
}
