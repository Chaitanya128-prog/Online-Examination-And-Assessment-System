"use strict";

/* =========================================================
   Examiner portal - Grading queue + Results tabs
   Marks written answers, recalculates the score with scoreAnswers(),
   and manages results of this examiner's exams.
   Owner: Chaitanya Pandey
   json-server: /results (GET / PATCH / DELETE), /exams
   ========================================================= */

const gradeView = { page: 1, openId: null, result: null };

function bindGrading() {
  document.getElementById("gradeForm").addEventListener("submit", saveGrades);
  onRowAction("gradingBody", { grade: function (id) { return openGradeDialog(Number(id)); } });
  onRowAction("resultBody", {
    grade: function (id) { return openGradeDialog(Number(id)); },
    "delete": function (id) { return deleteResult(Number(id)); }
  });

  const reload = function () { gradeView.page = 1; loadResults().catch(handlePageError); };
  document.getElementById("resultSearch").addEventListener("input", debounce(function () {
    const box = document.getElementById("resultSearch");
    box.value = box.value.replace(/[^0-9]/g, "");
    reload();
  }, 300));
  document.getElementById("resultExamFilter").addEventListener("change", reload);
  document.getElementById("resultOutcomeFilter").addEventListener("change", reload);
  document.getElementById("exportBtn").addEventListener("click", function () {
    withBusy(this, exportResults).catch(handlePageError);
  });
}

/* ---------- Grading queue ---------- */

async function loadGrading() {
  const ids = await myExamIds();
  const pending = ids.length ? await api.get("/results", { examId: ids, status: "pending", _expand: "user", _sort: "submittedAt", _order: "asc" }) : [];
  document.getElementById("gradingBody").innerHTML = pending.map(function (r) {
    return '<tr><td class="cell-main">' + userCell(r.user ? r.user.name : r.userId, r.userId) + "</td>" +
      '<td data-label="Exam"><strong>' + escapeHtml(r.examId) + "</strong><small>" + escapeHtml(r.examTitle) + "</small></td>" +
      '<td data-label="Submitted">' + formatDateTime(r.submittedAt) + "</td>" +
      '<td data-label="To mark" class="num"><span class="badge badge-review">' + plural(r.pendingCount, "answer") + "</span></td>" +
      '<td data-label="MCQ score" class="num">' + r.mcqScore + "</td>" +
      '<td data-label=""><div class="actions"><button type="button" class="btn btn-sm btn-primary" data-action="grade" data-id="' + r.id + '"><i class="bi bi-pencil-square" aria-hidden="true"></i> Grade</button></div></td></tr>';
  }).join("") || '<tr class="table-empty"><td colspan="6"><i class="bi bi-check2-all" aria-hidden="true"></i> Nothing to grade. All written answers are marked.</td></tr>';
}

async function openGradeDialog(id) {
  const r = await api.get(idPath("results", id), { _expand: "user" });
  gradeView.openId = id;
  gradeView.result = r;
  document.getElementById("gdTitle").textContent = (r.user ? r.user.name : r.userId) + " · " + r.examId;
  document.getElementById("gdMeta").textContent = r.examTitle + " · submitted " + formatDateTime(r.submittedAt) +
    (r.autoSubmitted ? " (auto)" : "") + " · " + plural(r.violations || 0, "tab-switch warning");
  document.getElementById("gdStats").innerHTML =
    "<div><small>MCQ score</small><strong>" + r.mcqScore + "</strong></div>" +
    "<div><small>Written score</small><strong>" + (r.textScore || 0) + "</strong></div>" +
    "<div><small>Total</small><strong>" + r.score + " / " + r.total + "</strong></div>" +
    "<div><small>Status</small><strong>" + (r.status === "pending" ? "Pending" : r.percentage + "%") + "</strong></div>";
  document.getElementById("gdRemarks").value = r.remarks || "";
  setAlert(document.getElementById("gradeAlert"), "");

  const answers = r.answers || [];
  const written = answers.map(function (a, i) { return { a: a, i: i }; }).filter(function (x) { return x.a.type === "text"; });
  document.getElementById("gdWritten").innerHTML = written.length ? written.map(function (x) {
    const a = x.a;
    return '<div class="grade-card"><div><span class="qtype text">Q' + (x.i + 1) + " &middot; Written &middot; " + a.maxMarks + " marks</span>" +
      '<p style="margin-top:6px"><strong>' + escapeHtml(a.text) + "</strong></p></div>" +
      (a.answerText ? '<div class="written-answer">' + escapeHtml(a.answerText) + "</div>" : '<p class="muted small">Not attempted (0 marks).</p>') +
      (a.modelAnswer ? '<div class="model-answer"><strong>Model answer:</strong> ' + escapeHtml(a.modelAnswer) + "</div>" : "") +
      (a.answerText ? '<div class="grade-inputs"><div class="field"><label for="mark' + x.i + '">Marks</label><div class="marks-input">' +
        '<input id="mark' + x.i + '" type="number" min="0" max="' + a.maxMarks + '" step="0.5" data-mark="' + x.i + '" value="' + (a.awarded === null || a.awarded === undefined ? "" : a.awarded) + '">' +
        "<span class=\"muted\">/ " + a.maxMarks + "</span></div></div>" +
        '<div class="field"><label for="fb' + x.i + '">Feedback for the student</label><input id="fb' + x.i + '" type="text" maxlength="300" data-feedback="' + x.i + '" value="' + escapeHtml(a.feedback || "") + '"></div></div>' : "") +
      "</div>";
  }).join("") : '<div class="empty">This paper has no written questions. You can still add remarks.</div>';

  const mcq = answers.map(function (a, i) { return a.type === "text" ? "" : answerReviewHtml(a, i, r, true); }).join("");
  document.getElementById("gdMcq").innerHTML = mcq || '<p class="muted small">No MCQ data for this result.</p>';
  openModal("gradeDialog");
}

function saveGrades(event) {
  event.preventDefault();
  const r = gradeView.result;
  const alertBox = document.getElementById("gradeAlert");
  const answers = JSON.parse(JSON.stringify(r.answers || []));

  for (const input of document.querySelectorAll("#gdWritten [data-mark]")) {
    const i = Number(input.getAttribute("data-mark"));
    const raw = input.value.trim();
    if (raw === "") { answers[i].awarded = null; continue; }
    const value = Number(raw);
    if (isNaN(value) || value < 0 || value > answers[i].maxMarks) {
      setAlert(alertBox, "Marks for Q" + (i + 1) + " must be between 0 and " + answers[i].maxMarks + ".");
      input.focus();
      return;
    }
    answers[i].awarded = Math.round(value * 2) / 2;
  }
  document.querySelectorAll("#gdWritten [data-feedback]").forEach(function (input) {
    answers[Number(input.getAttribute("data-feedback"))].feedback = input.value.trim();
  });

  withBusy(document.getElementById("gradeSaveBtn"), async function () {
    const totals = r.answers && r.answers.length
      ? scoreAnswers(answers, r.correctMarks, r.negativeMarks)
      : { score: r.score, total: r.total, percentage: r.percentage, status: "graded", pendingCount: 0 };
    const remarks = document.getElementById("gdRemarks").value.trim();
    const patch = Object.assign({ answers: answers, remarks: remarks }, totals);
    if (remarks !== (r.remarks || "")) Object.assign(patch, { remarksBy: me.name, remarksAt: new Date().toISOString() });
    if (totals.status === "graded") Object.assign(patch, { gradedBy: me.name, gradedAt: new Date().toISOString() });

    await api.patch(idPath("results", r.id), patch);
    await logActivity(me, "result", (totals.status === "graded" ? "Graded " : "Saved partial marks for ") + r.userId + " in " + r.examId);
    closeModal("gradeDialog");
    toast(totals.status === "graded" ? "Marks saved. The result is now published (" + totals.percentage + "%)." : "Marks saved. Some answers are still unmarked.", "success");
    const tab = location.hash.slice(1);
    if (tab === "results") await loadResults();
    else await loadGrading();
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

/* ---------- Results ---------- */

async function resultFilters() {
  const ids = await myExamIds();
  const exam = document.getElementById("resultExamFilter").value;
  const params = { examId: exam || ids, _expand: "user", _sort: "submittedAt", _order: "desc" };
  const roll = document.getElementById("resultSearch").value.trim();
  const outcome = document.getElementById("resultOutcomeFilter").value;
  if (roll) params.userId_like = "^" + roll;
  if (outcome === "pending") params.status = "pending";
  if (outcome === "pass") { params.status = "graded"; params.percentage_gte = settings.passMark; }
  if (outcome === "fail") { params.status = "graded"; params.percentage_lte = settings.passMark - 1; }
  return { params: params, ids: ids };
}

async function loadResults() {
  const filters = await resultFilters();
  const select = document.getElementById("resultExamFilter");
  const chosen = select.value;
  select.innerHTML = '<option value="">All my exams</option>' + filters.ids.map(function (id) {
    return '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + "</option>";
  }).join("");
  select.value = chosen;

  if (!filters.ids.length) {
    document.getElementById("resultBody").innerHTML = '<tr class="table-empty"><td colspan="6">You have no exams yet.</td></tr>';
    document.getElementById("resultPager").innerHTML = "";
    return;
  }
  const { items, total } = await api.page("/results", Object.assign(filters.params, { _page: gradeView.page, _limit: PAGE_SIZE }));
  if (!items.length && gradeView.page > 1) {
    gradeView.page--;
    return loadResults();
  }

  document.getElementById("resultBody").innerHTML = items.map(function (r) {
    return '<tr><td class="cell-main">' + userCell(r.user ? r.user.name : "Deleted user", r.userId) + "</td>" +
      '<td data-label="Exam"><strong>' + escapeHtml(r.examId) + "</strong><small>" + escapeHtml(r.examTitle) + "</small></td>" +
      '<td data-label="Submitted">' + formatDateTime(r.submittedAt) + (r.autoSubmitted ? ' <span class="badge badge-review">Auto</span>' : "") + "</td>" +
      '<td data-label="Score" class="num"><strong>' + r.score + " / " + r.total + "</strong><small>" + r.percentage + "%</small></td>" +
      '<td data-label="Outcome">' + resultBadge(r.percentage, settings.passMark, r.status) +
      (r.violations ? ' <span class="badge badge-failed" title="Tab-switch warnings"><i class="bi bi-exclamation-triangle"></i> ' + r.violations + "</span>" : "") + "</td>" +
      '<td data-label=""><div class="actions">' + iconButton("grade", r.id, "bi-pencil-square", "Grade / remarks") +
      iconButton("delete", r.id, "bi-trash3", "Delete result (allow re-attempt)", "danger") + "</div></td></tr>";
  }).join("") || '<tr class="table-empty"><td colspan="6">No results match your filters.</td></tr>';

  renderPagination(document.getElementById("resultPager"), gradeView.page, PAGE_SIZE, total, function (page) {
    gradeView.page = page;
    loadResults().catch(handlePageError);
  });
}

async function deleteResult(id) {
  const r = await api.get(idPath("results", id), { _expand: "user" });
  const ok = await confirmDialog({
    title: "Delete this result?",
    message: (r.user ? r.user.name : r.userId) + "'s " + r.examId + " result will be removed. If the exam is live they can attempt it again.",
    confirmText: "Delete result",
    danger: true
  });
  if (!ok) return;
  await api.remove(idPath("results", id));
  await logActivity(me, "result", "Deleted " + r.userId + "'s result for " + r.examId);
  toast("Result deleted.", "success");
  await loadResults();
}

async function exportResults() {
  const filters = await resultFilters();
  const rows = filters.ids.length ? await api.get("/results", filters.params) : [];
  downloadCsv("examdesk-results-" + todayISO() + ".csv", [["Roll No", "Name", "Exam", "Title", "Date", "MCQ", "Written", "Score", "Total", "Percentage", "Status", "Outcome", "Tab warnings", "Remarks"]].concat(rows.map(function (r) {
    return [r.userId, r.user ? r.user.name : "", r.examId, r.examTitle, r.date, r.mcqScore, r.textScore, r.score, r.total, r.percentage,
      r.status, r.status === "pending" ? "Pending" : r.percentage >= settings.passMark ? "Passed" : "Failed", r.violations || 0, r.remarks || ""];
  })));
  toast("Exported " + plural(rows.length, "result") + ".", "success");
}
