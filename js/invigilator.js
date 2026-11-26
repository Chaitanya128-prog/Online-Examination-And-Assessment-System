"use strict";

/* =========================================================
   Invigilator panel - live monitor, violations log, incident reports
   Owner: Dev Sharma
   json-server: /exams, /attempts (GET / PATCH), /results, /violations (GET / DELETE),
                /incidents (GET / POST / PATCH / DELETE), /users
   ========================================================= */

const REFRESH_SECONDS = 5;
const VIOLATION_LABELS = {
  "tab-switch": "Left the exam tab", "window-blur": "Switched window", "fullscreen-exit": "Exited full screen",
  copy: "Tried to copy", paste: "Tried to paste", cut: "Tried to cut", contextmenu: "Tried to right-click"
};

let me = null;
let settings = null;
const inv = { exams: [], examId: null, paused: false, timer: null, vPage: 1, editingIncident: null };

(async function () {
  me = await requireRole("invigilator");
  settings = await getSettings();
  renderAppHeader(me, "monitor");
  renderFooter();
  document.getElementById("welcomeDate").textContent = todayText();

  inv.exams = await api.get("/exams", { invigilatorId: me.id, status_ne: "draft", _sort: "date", _order: "desc" });
  const live = inv.exams.find(function (e) { return e.status === "live"; });
  inv.examId = (live || inv.exams[0] || {}).id || null;
  fillExamSelects();

  bindMonitor();
  bindViolations();
  bindIncidents();

  setupTabs({ monitor: loadMonitor, violations: loadViolations, incidents: loadIncidents }, "Invigilator");

  // Auto-refresh the monitor while it is on screen
  inv.timer = setInterval(function () {
    if (!inv.paused && location.hash.replace("#", "") !== "violations" && location.hash.replace("#", "") !== "incidents" &&
      !document.hidden && !document.querySelector("dialog[open]")) {
      loadMonitor().catch(function () {});
    }
  }, REFRESH_SECONDS * 1000);
})().catch(handlePageError);

function examLabel(e) {
  return e.id + " - " + e.title + " (" + (STATUS_LABELS[e.status] || e.status) + ")";
}

function fillExamSelects() {
  const options = inv.exams.map(function (e) { return '<option value="' + escapeHtml(e.id) + '">' + escapeHtml(examLabel(e)) + "</option>"; }).join("");
  document.getElementById("monitorExam").innerHTML = options || '<option value="">No exams assigned to you</option>';
  if (inv.examId) document.getElementById("monitorExam").value = inv.examId;
  document.getElementById("vExam").innerHTML = '<option value="">All my exams</option>' + options;
  document.getElementById("iExam").innerHTML = options;
}

function myExamCodes() {
  return inv.exams.map(function (e) { return e.id; });
}

function formatLeft(ms) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

/* =========================================================
   LIVE MONITOR
   ========================================================= */

function bindMonitor() {
  document.getElementById("monitorExam").addEventListener("change", function () {
    inv.examId = this.value;
    loadMonitor().catch(handlePageError);
  });
  document.getElementById("refreshBtn").addEventListener("click", function () {
    withBusy(this, loadMonitor).catch(handlePageError);
  });
  document.getElementById("pauseBtn").addEventListener("click", function () {
    inv.paused = !inv.paused;
    this.innerHTML = inv.paused ? '<i class="bi bi-play-fill" aria-hidden="true"></i> Resume' : '<i class="bi bi-pause-fill" aria-hidden="true"></i> Pause';
    const dot = document.getElementById("liveDot");
    dot.textContent = inv.paused ? "Paused" : "Live · refreshes every " + REFRESH_SECONDS + " s";
    dot.style.color = inv.paused ? "var(--muted)" : "";
  });
  onRowAction("monitorGrid", {
    extra: addExtraTime,
    force: forceSubmit,
    report: function (attemptId) {
      const parts = attemptId.split("__");
      return openIncidentDialog(null, parts[1], parts[0]);
    }
  });
  onRowAction("alertFeed", {
    report: function (key) {
      const parts = key.split("__");
      return openIncidentDialog(null, parts[1], parts[0]);
    }
  });
}

async function loadMonitor() {
  const grid = document.getElementById("monitorGrid");
  if (!inv.examId) {
    document.getElementById("monitorIntro").textContent = "No exam is assigned to you yet. The admin assigns invigilators from the Approvals tab.";
    grid.innerHTML = '<div class="empty"><i class="bi bi-display" aria-hidden="true"></i>Nothing to monitor.</div>';
    document.getElementById("alertFeed").innerHTML = '<div class="empty">No alerts.</div>';
    ["mWriting", "mSubmitted", "mNotStarted", "mAlerts"].forEach(function (id) { document.getElementById(id).textContent = "0"; });
    return;
  }
  const [exam, attempts, results, students, feed] = await Promise.all([
    api.get(idPath("exams", inv.examId)),
    api.get("/attempts", { examId: inv.examId, _sort: "startedAt", _order: "asc" }),
    api.get("/results", { examId: inv.examId, _expand: "user", _sort: "submittedAt", _order: "desc" }),
    api.page("/users", { role: "student", status: "active", _limit: 1 }),
    api.get("/violations", { examId: inv.examId, _expand: "user", _sort: "createdAt", _order: "desc", _limit: 8 })
  ]);
  const now = Date.now();
  const limit = settings.maxTabSwitches;
  const isLive = exam.status === "live";
  const offline = attempts.filter(function (a) { return now - new Date(a.lastSeenAt || a.updatedAt).getTime() > 25000; }).length;
  const alerts = attempts.reduce(function (s, a) { return s + (a.violations || 0); }, 0) + results.reduce(function (s, r) { return s + (r.violations || 0); }, 0);

  document.getElementById("monitorIntro").textContent = exam.title + " · " + formatExamTime(exam) + " · " + exam.duration + " min · " +
    (isLive ? "live now" : (STATUS_LABELS[exam.status] || exam.status).toLowerCase());
  document.getElementById("mWriting").textContent = attempts.length;
  document.getElementById("mOffline").textContent = offline ? offline + " not responding" : "All connected";
  document.getElementById("mSubmitted").textContent = results.length;
  document.getElementById("mAuto").textContent = results.filter(function (r) { return r.autoSubmitted; }).length + " auto-submitted";
  document.getElementById("mNotStarted").textContent = Math.max(0, students.total - attempts.length - results.length);
  document.getElementById("mAlerts").textContent = alerts;
  document.getElementById("mLimit").textContent = limit ? "Auto-submit at " + limit : "Warn only";

  const writingCards = attempts.map(function (a) {
    const left = new Date(a.deadline).getTime() - now;
    const seenAgo = Math.round((now - new Date(a.lastSeenAt || a.updatedAt).getTime()) / 1000);
    const online = seenAgo <= 25;
    const progress = a.totalQuestions ? Math.round((a.answeredCount || 0) / a.totalQuestions * 100) : 0;
    const bad = (a.violations || 0) > 0;
    let state = online ? '<span class="badge badge-active">Online</span>' : '<span class="badge badge-draft" title="Last seen ' + seenAgo + ' s ago">Offline</span>';
    if (a.forceSubmit) state = '<span class="badge badge-failed">Ending...</span>';
    else if (left <= 0) state = '<span class="badge badge-review">Time up</span>';
    return '<article class="monitor-card' + (bad ? " alert" : "") + '">' +
      '<div class="monitor-head"><span class="avatar">' + escapeHtml(getInitials(a.userName || a.userId)) + "</span><div><strong>" + escapeHtml(a.userName || a.userId) +
      "</strong><small>" + escapeHtml(a.userId) + (a.extraMinutes ? " &middot; +" + a.extraMinutes + " min given" : "") + "</small></div>" + state + "</div>" +
      '<div class="mini-progress" title="' + progress + '% answered"><span style="width:' + progress + '%"></span></div>' +
      '<div class="monitor-stats"><div><strong>' + (a.answeredCount || 0) + "/" + (a.totalQuestions || "?") + "</strong><small>Answered</small></div>" +
      "<div><strong>" + formatLeft(left) + "</strong><small>Time left</small></div>" +
      '<div class="' + (bad ? "bad" : "") + '"><strong>' + (a.violations || 0) + (limit ? "/" + limit : "") + "</strong><small>Warnings</small></div></div>" +
      (isLive && !a.forceSubmit ? '<div class="monitor-actions">' +
        '<button type="button" class="btn btn-sm btn-outline" data-action="extra" data-id="' + escapeHtml(a.id) + '"><i class="bi bi-plus-circle" aria-hidden="true"></i> 5 min</button>' +
        '<button type="button" class="btn btn-sm btn-outline" data-action="report" data-id="' + escapeHtml(a.id) + '"><i class="bi bi-journal-plus" aria-hidden="true"></i> Report</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-action="force" data-id="' + escapeHtml(a.id) + '"><i class="bi bi-stop-circle" aria-hidden="true"></i> End</button></div>' : "") +
      "</article>";
  });
  const doneCards = results.map(function (r) {
    const name = r.user ? r.user.name : r.userId;
    return '<article class="monitor-card done' + (r.violations ? " alert" : "") + '"><div class="monitor-head"><span class="avatar">' + escapeHtml(getInitials(name)) + "</span><div><strong>" +
      escapeHtml(name) + "</strong><small>" + escapeHtml(r.userId) + " &middot; submitted " + timeAgo(r.submittedAt) + (r.autoSubmitted ? " (auto)" : "") + "</small></div>" +
      '<span class="badge badge-completed">Submitted</span></div>' +
      '<div class="monitor-stats"><div><strong>' + (r.answers && r.answers.length ? r.answers.filter(function (x) { return answerKind(x) !== "skipped"; }).length + "/" + r.answers.length : "-") +
      "</strong><small>Answered</small></div><div><strong>" + (r.status === "pending" ? "Pending" : r.percentage + "%") + "</strong><small>Score</small></div>" +
      '<div class="' + (r.violations ? "bad" : "") + '"><strong>' + (r.violations || 0) + "</strong><small>Warnings</small></div></div></article>";
  });
  grid.innerHTML = writingCards.concat(doneCards).join("") ||
    '<div class="empty"><i class="bi bi-hourglass" aria-hidden="true"></i>' + (isLive ? "No student has started yet." : "This exam is not live.") + "</div>";

  document.getElementById("alertFeed").innerHTML = feed.map(function (v) {
    return '<div class="feed-item"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i><div><strong>' + escapeHtml(v.user ? v.user.name : v.userId) + "</strong>" +
      escapeHtml(VIOLATION_LABELS[v.type] || v.message) + " &middot; warning " + v.count + "<small>" + timeAgo(v.createdAt) + "</small></div>" +
      iconButton("report", v.userId + "__" + v.examId, "bi-journal-plus", "Write incident report") + "</div>";
  }).join("") || '<div class="empty"><i class="bi bi-shield-check" aria-hidden="true"></i>No alerts. Everyone is on the exam screen.</div>';
}

async function addExtraTime(attemptId, button) {
  await withBusy(button, async function () {
    const a = await api.get(idPath("attempts", attemptId));
    const base = Math.max(new Date(a.deadline).getTime(), Date.now());
    await api.patch(idPath("attempts", attemptId), {
      deadline: new Date(base + 5 * 60000).toISOString(),
      extraMinutes: (a.extraMinutes || 0) + 5
    });
    await logActivity(me, "proctor", "Gave 5 extra minutes to " + a.userId + " in " + a.examId);
    toast((a.userName || a.userId) + " got 5 extra minutes. Their timer updates within a few seconds.", "success");
  });
  await loadMonitor();
}

async function forceSubmit(attemptId) {
  const a = await api.get(idPath("attempts", attemptId));
  const ok = await confirmDialog({
    title: "End " + (a.userName || a.userId) + "'s exam?",
    message: "Their saved answers will be submitted and graded within a few seconds. This cannot be undone.",
    confirmText: "End exam", danger: true
  });
  if (!ok) return;
  await api.patch(idPath("attempts", attemptId), { forceSubmit: true, forcedBy: me.id });
  await logActivity(me, "proctor", "Force-submitted " + a.userId + " in " + a.examId);
  toast("Ending the exam. It will show as submitted shortly.", "success");
  await loadMonitor();
}

/* =========================================================
   VIOLATIONS LOG
   ========================================================= */

function bindViolations() {
  const reload = function () { inv.vPage = 1; loadViolations().catch(handlePageError); };
  document.getElementById("vExam").addEventListener("change", reload);
  document.getElementById("vType").addEventListener("change", reload);
  document.getElementById("vSearch").addEventListener("input", debounce(function () {
    const box = document.getElementById("vSearch");
    box.value = box.value.replace(/[^0-9]/g, "");
    reload();
  }, 300));
  onRowAction("violationBody", {
    report: function (key) {
      const parts = key.split("__");
      return openIncidentDialog(null, parts[1], parts[0]);
    },
    dismiss: dismissViolation
  });
}

async function loadViolations() {
  const codes = myExamCodes();
  const body = document.getElementById("violationBody");
  if (!codes.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="6">No exams are assigned to you.</td></tr>';
    return;
  }
  const params = {
    examId: document.getElementById("vExam").value || codes,
    type: document.getElementById("vType").value,
    _expand: "user", _sort: "createdAt", _order: "desc", _page: inv.vPage, _limit: 10
  };
  const roll = document.getElementById("vSearch").value.trim();
  if (roll) params.userId_like = "^" + roll;
  const { items, total } = await api.page("/violations", params);
  if (!items.length && inv.vPage > 1) {
    inv.vPage--;
    return loadViolations();
  }
  body.innerHTML = items.map(function (v) {
    return '<tr><td class="cell-main">' + userCell(v.user ? v.user.name : v.userId, v.userId) + "</td>" +
      '<td data-label="Exam">' + escapeHtml(v.examId) + "</td>" +
      '<td data-label="What happened">' + escapeHtml(VIOLATION_LABELS[v.type] || v.message) + "</td>" +
      '<td data-label="Warning" class="num"><span class="badge badge-failed">' + v.count + (settings.maxTabSwitches ? " / " + settings.maxTabSwitches : "") + "</span></td>" +
      '<td data-label="When">' + formatDateTime(v.createdAt) + "</td>" +
      '<td data-label=""><div class="actions">' + iconButton("report", v.userId + "__" + v.examId, "bi-journal-plus", "Write incident report") +
      iconButton("dismiss", v.id, "bi-x-circle", "Dismiss (delete) this alert", "danger") + "</div></td></tr>";
  }).join("") || '<tr class="table-empty"><td colspan="6">No violations recorded.</td></tr>';
  renderPagination(document.getElementById("violationPager"), inv.vPage, 10, total, function (page) {
    inv.vPage = page;
    loadViolations().catch(handlePageError);
  });
}

async function dismissViolation(id) {
  const ok = await confirmDialog({ title: "Dismiss this alert?", message: "Use this for false alarms, e.g. a notification popped up. The student's warning count is not changed.", confirmText: "Dismiss" });
  if (!ok) return;
  await api.remove(idPath("violations", id));
  toast("Alert dismissed.", "success");
  await loadViolations();
}

/* =========================================================
   INCIDENT REPORTS (full CRUD)
   ========================================================= */

function bindIncidents() {
  document.getElementById("newIncidentBtn").addEventListener("click", function () { openIncidentDialog(null).catch(handlePageError); });
  document.getElementById("incidentForm").addEventListener("submit", saveIncident);
  document.getElementById("iStudent").addEventListener("input", function () { this.value = this.value.replace(/[^0-9]/g, ""); });
  onRowAction("incidentBody", {
    edit: function (id) { return openIncidentDialog(Number(id)); },
    "delete": function (id) { return deleteIncident(Number(id)); }
  });
}

async function loadIncidents() {
  const list = await api.get("/incidents", { createdBy: me.id, _expand: ["user", "exam"], _sort: "createdAt", _order: "desc" });
  const severity = { low: "badge-normal", medium: "badge-review", high: "badge-high" };
  document.getElementById("incidentBody").innerHTML = list.map(function (i) {
    return '<tr><td class="cell-main"><strong>' + escapeHtml(i.examId) + "</strong><small>" + escapeHtml(i.exam ? i.exam.title : "") + "</small></td>" +
      '<td data-label="Student">' + (i.userId ? escapeHtml((i.user ? i.user.name + " " : "") + "(" + i.userId + ")") : '<span class="muted">Whole hall</span>') + "</td>" +
      '<td data-label="Severity"><span class="badge ' + severity[i.severity] + '">' + i.severity.charAt(0).toUpperCase() + i.severity.slice(1) + "</span></td>" +
      '<td data-label="Note">' + escapeHtml(i.note) + "</td>" +
      '<td data-label="Reported">' + formatDateTime(i.createdAt) + (i.updatedAt !== i.createdAt ? "<small>edited</small>" : "") + "</td>" +
      '<td data-label=""><div class="actions">' + iconButton("edit", i.id, "bi-pencil", "Edit report") + iconButton("delete", i.id, "bi-trash3", "Delete report", "danger") + "</div></td></tr>";
  }).join("") || '<tr class="table-empty"><td colspan="6">No incident reports yet.</td></tr>';
}

async function openIncidentDialog(id, examId, userId) {
  if (!inv.exams.length) {
    toast("No exams are assigned to you, so there is nothing to report on.", "info");
    return;
  }
  inv.editingIncident = id;
  document.getElementById("incidentForm").reset();
  if (id) {
    const i = await api.get(idPath("incidents", id));
    document.getElementById("incidentDialogTitle").textContent = "Edit incident report";
    document.getElementById("iExam").value = i.examId;
    document.getElementById("iStudent").value = i.userId || "";
    document.getElementById("iSeverity").value = i.severity;
    document.getElementById("iNote").value = i.note;
  } else {
    document.getElementById("incidentDialogTitle").textContent = "New incident report";
    document.getElementById("iExam").value = examId || inv.examId || inv.exams[0].id;
    document.getElementById("iStudent").value = userId || "";
  }
  openModal("incidentDialog");
  document.getElementById("iNote").focus();
}

function saveIncident(event) {
  event.preventDefault();
  const alertBox = document.getElementById("incidentAlert");
  const data = {
    examId: document.getElementById("iExam").value,
    severity: document.getElementById("iSeverity").value,
    note: document.getElementById("iNote").value.trim()
  };
  if (data.note.length < 5) return setAlert(alertBox, "Please describe what happened.");
  // Only add userId when a student is named: json-server deletes records whose
  // "...Id" field points to nothing (e.g. userId: null) on every DELETE.
  const roll = document.getElementById("iStudent").value.trim();
  if (roll) data.userId = roll;

  withBusy(document.getElementById("incidentSaveBtn"), async function () {
    if (data.userId) {
      const student = await api.find(idPath("users", data.userId));
      if (!student || student.role !== "student") {
        setAlert(alertBox, "No student with roll number " + data.userId + ".");
        return;
      }
    }
    const now = new Date().toISOString();
    if (inv.editingIncident) {
      // PUT replaces the whole record, so removing the student really removes userId
      const old = await api.get(idPath("incidents", inv.editingIncident));
      await api.put(idPath("incidents", inv.editingIncident), Object.assign(data, { createdBy: old.createdBy, createdAt: old.createdAt, updatedAt: now }));
      toast("Report updated.", "success");
    } else {
      await api.post("/incidents", Object.assign(data, { createdBy: me.id, createdAt: now, updatedAt: now }));
      await logActivity(me, "proctor", "Reported a " + data.severity + " incident in " + data.examId);
      toast("Report saved.", "success");
    }
    closeModal("incidentDialog");
    if (location.hash === "#incidents") await loadIncidents();
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

async function deleteIncident(id) {
  const ok = await confirmDialog({ title: "Delete this report?", message: "It will be removed permanently.", confirmText: "Delete", danger: true });
  if (!ok) return;
  await api.remove(idPath("incidents", id));
  toast("Report deleted.", "success");
  await loadIncidents();
}
