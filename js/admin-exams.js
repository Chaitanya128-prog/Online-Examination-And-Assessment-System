"use strict";

/* =========================================================
   Admin panel - Approvals tab: review papers, approve / request changes,
   assign invigilators, see and delete any exam
   Owner: Dev Singh Chauhan
   json-server: /exams (GET / PATCH / DELETE), /questions, /users
   ========================================================= */

const adminExamView = { page: 1, reviewId: null, assignId: null };

function bindAdminExams() {
  const reload = function () { adminExamView.page = 1; loadExamTable().catch(handlePageError); };
  document.getElementById("examSearch").addEventListener("input", debounce(reload, 300));
  document.getElementById("examStatusFilter").addEventListener("change", reload);
  document.getElementById("examApprovalFilter").addEventListener("change", reload);
  document.getElementById("paperForm").addEventListener("submit", function (event) {
    event.preventDefault();
    decidePaper("approved");
  });
  document.getElementById("rejectBtn").addEventListener("click", function () { decidePaper("rejected"); });
  document.getElementById("assignForm").addEventListener("submit", saveAssignment);

  const handlers = {
    review: function (id) { return openPaperDialog(id); },
    assign: function (id) { return openAssignDialog(id); },
    "delete": deleteAnyExam
  };
  onRowAction("pendingList", handlers);
  onRowAction("examBody", handlers);
}

async function invigilatorOptions(selected) {
  const invigilators = await api.get("/users", { role: "invigilator", status: "active", _sort: "name" });
  return '<option value="">Not assigned</option>' + invigilators.map(function (u) {
    return '<option value="' + escapeHtml(u.id) + '"' + (u.id === selected ? " selected" : "") + ">" + escapeHtml(u.name + " (" + u.id + ")") + "</option>";
  }).join("");
}

async function staffNames() {
  const staff = await api.get("/users", { role_ne: "student" });
  const names = {};
  staff.forEach(function (u) { names[u.id] = u.name; });
  return names;
}

async function loadApprovals() {
  const [pending, names] = await Promise.all([
    api.get("/exams", { approval: "pending", _embed: "questions", _sort: "updatedAt", _order: "asc" }),
    staffNames()
  ]);
  document.getElementById("pendingSummary").textContent = pending.length ? plural(pending.length, "paper") + " waiting" : "Nothing waiting";
  document.getElementById("pendingList").innerHTML = pending.map(function (e) {
    const written = e.questions.filter(function (q) { return q.type === "text"; }).length;
    return '<div class="list-item"><span class="list-icon">' + escapeHtml(e.id.split("-")[0]) + "</span><div><strong>" + escapeHtml(e.title) + "</strong><small>" +
      escapeHtml(e.id) + " &middot; by " + escapeHtml(names[e.createdBy] || e.createdBy) + " &middot; " + (e.questions.length - written) + " MCQ, " + written + " written &middot; " +
      formatExamTime(e) + '</small></div><button type="button" class="btn btn-sm btn-primary" data-action="review" data-id="' + escapeHtml(e.id) + '">Review</button></div>';
  }).join("") || '<div class="empty"><i class="bi bi-patch-check" aria-hidden="true"></i>All papers are reviewed.</div>';
  await loadExamTable(names);
}

async function loadExamTable(names) {
  names = names || await staffNames();
  const { items, total } = await api.page("/exams", {
    q: document.getElementById("examSearch").value.trim(),
    status: document.getElementById("examStatusFilter").value,
    approval: document.getElementById("examApprovalFilter").value,
    _sort: "date", _order: "desc", _page: adminExamView.page, _limit: PAGE_SIZE
  });
  if (!items.length && adminExamView.page > 1) {
    adminExamView.page--;
    return loadExamTable(names);
  }
  document.getElementById("examBody").innerHTML = items.map(function (e) {
    return '<tr><td class="cell-main"><strong>' + escapeHtml(e.title) + "</strong><small>" + escapeHtml(e.id) + " &middot; " + escapeHtml(e.subject || "") + "</small></td>" +
      '<td data-label="Examiner">' + escapeHtml(names[e.createdBy] || e.createdBy) + "</td>" +
      '<td data-label="Date &amp; time">' + formatDate(e.date) + (e.startTime ? "<small>" + formatExamTime(e, false) + "</small>" : "") + "</td>" +
      '<td data-label="Approval">' + approvalBadge(e.approval) + "</td>" +
      '<td data-label="Status">' + statusBadge(e.status) + "</td>" +
      '<td data-label="Invigilator">' + (e.invigilatorId ? escapeHtml(names[e.invigilatorId] || e.invigilatorId) : '<span class="muted">-</span>') + "</td>" +
      '<td data-label=""><div class="actions">' + iconButton("review", e.id, "bi-eye", "Review paper") +
      iconButton("assign", e.id, "bi-person-video2", "Assign invigilator") +
      iconButton("delete", e.id, "bi-trash3", "Delete exam", "danger") + "</div></td></tr>";
  }).join("") || '<tr class="table-empty"><td colspan="7">No exams match your filters.</td></tr>';
  renderPagination(document.getElementById("examPager"), adminExamView.page, PAGE_SIZE, total, function (page) {
    adminExamView.page = page;
    loadExamTable().catch(handlePageError);
  });
}

async function openPaperDialog(examId) {
  const [exam, names] = await Promise.all([api.get(idPath("exams", examId), { _embed: "questions" }), staffNames()]);
  adminExamView.reviewId = examId;
  const questions = exam.questions.sort(function (a, b) { return a.id - b.id; });
  const written = questions.filter(function (q) { return q.type === "text"; });
  const totalMarks = written.reduce(function (s, q) { return s + Number(q.marks); }, 0) + (questions.length - written.length) * exam.correctMarks;

  document.getElementById("pdTitle").textContent = exam.title;
  document.getElementById("pdMeta").textContent = exam.id + " · by " + (names[exam.createdBy] || exam.createdBy) + " · " + APPROVAL_LABELS[exam.approval || "none"];
  document.getElementById("pdStats").innerHTML =
    "<div><small>Date &amp; time</small><strong>" + formatDate(exam.date) + (exam.startTime ? "<br>" + formatTime(exam.startTime) : "") + "</strong></div>" +
    "<div><small>Duration</small><strong>" + exam.duration + " min</strong></div>" +
    "<div><small>Questions</small><strong>" + (questions.length - written.length) + " + " + written.length + "</strong></div>" +
    "<div><small>Total marks</small><strong>" + totalMarks + "</strong></div>";
  document.getElementById("pdQuestions").innerHTML = questions.map(function (q, i) {
    const body = q.type === "text"
      ? '<span class="qtype text">Written &middot; ' + q.marks + " marks</span>" + (q.modelAnswer ? '<div class="model-answer"><strong>Model answer:</strong> ' + escapeHtml(q.modelAnswer) + "</div>" : "")
      : "<ol>" + q.options.map(function (o, j) {
        return '<li class="' + (j === q.correctIndex ? "correct" : "") + '">' + ["A", "B", "C", "D"][j] + ". " + escapeHtml(o) + "</li>";
      }).join("") + "</ol>";
    return '<div class="q-item"><span class="review-num">' + (i + 1) + "</span><div><p>" + escapeHtml(q.text) + "</p>" + body + "</div><div></div></div>";
  }).join("") || '<div class="empty">This paper has no questions yet.</div>';
  document.getElementById("pdInvigilator").innerHTML = await invigilatorOptions(exam.invigilatorId);
  document.getElementById("pdNote").value = exam.approvalNote || "";
  const decided = exam.approval === "approved";
  document.getElementById("approveBtn").hidden = decided;
  document.getElementById("rejectBtn").hidden = exam.approval !== "pending" && !decided;
  openModal("paperDialog");
}

function decidePaper(decision) {
  const alertBox = document.getElementById("paperAlert");
  const note = document.getElementById("pdNote").value.trim();
  if (decision === "rejected" && note.length < 5) {
    setAlert(alertBox, "Write a short note so the examiner knows what to change.");
    document.getElementById("pdNote").focus();
    return;
  }
  const button = document.getElementById(decision === "approved" ? "approveBtn" : "rejectBtn");
  withBusy(button, async function () {
    const examId = adminExamView.reviewId;
    const patch = {
      approval: decision,
      approvalNote: note,
      approvedBy: decision === "approved" ? me.id : null,
      invigilatorId: document.getElementById("pdInvigilator").value || null,
      updatedAt: new Date().toISOString()
    };
    if (decision === "rejected") patch.status = "draft";
    await api.patch(idPath("exams", examId), patch);
    await logActivity(me, "exam", (decision === "approved" ? "Approved " : "Requested changes to ") + examId);
    closeModal("paperDialog");
    toast(decision === "approved" ? examId + " approved. The examiner can now open it." : "Sent back to the examiner with your note.", "success");
    await loadApprovals();
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

async function openAssignDialog(examId) {
  const exam = await api.get(idPath("exams", examId));
  adminExamView.assignId = examId;
  document.getElementById("assignFor").textContent = exam.title + " (" + exam.id + ") on " + formatExamTime(exam);
  document.getElementById("assignSelect").innerHTML = await invigilatorOptions(exam.invigilatorId);
  openModal("assignDialog");
}

function saveAssignment(event) {
  event.preventDefault();
  withBusy(document.getElementById("assignSaveBtn"), async function () {
    const id = document.getElementById("assignSelect").value || null;
    await api.patch(idPath("exams", adminExamView.assignId), { invigilatorId: id, updatedAt: new Date().toISOString() });
    await logActivity(me, "exam", (id ? "Assigned invigilator " + id + " to " : "Removed invigilator from ") + adminExamView.assignId);
    closeModal("assignDialog");
    toast("Invigilator saved.", "success");
    await loadExamTable();
  }).catch(handlePageError);
}

async function deleteAnyExam(examId) {
  const exam = await api.get(idPath("exams", examId), { _embed: ["questions", "results"] });
  const ok = await confirmDialog({
    title: "Delete " + exam.id + "?",
    message: "This permanently deletes \"" + exam.title + "\" with its " + plural(exam.questions.length, "question") + " and " +
      plural(exam.results.length, "result") + (exam.status === "live" ? ". It is LIVE right now." : "."),
    confirmText: "Delete exam",
    danger: true
  });
  if (!ok) return;
  await api.remove(idPath("exams", examId));
  await logActivity(me, "exam", "Deleted exam " + examId);
  toast("Exam deleted.", "success");
  await loadApprovals();
}
