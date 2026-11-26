"use strict";

/* =========================================================
   Examiner portal - My exams tab + question manager (MCQ and written)
   Owner: Chaitanya Pandey
   json-server: /exams, /questions  (GET / POST / PATCH / PUT / DELETE)
   Flow: draft -> send for approval -> admin approves -> upcoming / live -> completed
   ========================================================= */

const LETTERS = ["A", "B", "C", "D"];
const examView = { page: 1, editingId: null, questionsExam: null, editingQuestionId: null };

function needsApproval() {
  return settings.requireApproval !== false;
}

function canPublish(exam) {
  return !needsApproval() || exam.approval === "approved";
}

function bindExams() {
  const reload = function () { examView.page = 1; loadExams().catch(handlePageError); };
  document.getElementById("examSearch").addEventListener("input", debounce(reload, 300));
  document.getElementById("examStatusFilter").addEventListener("change", reload);
  document.getElementById("examApprovalFilter").addEventListener("change", reload);
  document.getElementById("examForm").addEventListener("submit", saveExam);
  document.getElementById("eId").addEventListener("input", function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  });

  onRowAction("examBody", {
    questions: function (id) { return openQuestionsDialog(id); },
    edit: function (id) { return openExamDialog(id); },
    submit: submitForApproval,
    golive: function (id, button) { return changeExamStatus(id, "live", button); },
    close: function (id, button) { return changeExamStatus(id, "completed", button); },
    "delete": deleteExam
  });
}

async function loadExams() {
  const { items, total } = await api.page("/exams", {
    createdBy: me.id,
    q: document.getElementById("examSearch").value.trim(),
    status: document.getElementById("examStatusFilter").value,
    approval: document.getElementById("examApprovalFilter").value,
    _embed: ["questions", "results"],
    _sort: "date",
    _order: "desc",
    _page: examView.page,
    _limit: PAGE_SIZE
  });
  if (!items.length && examView.page > 1) {
    examView.page--;
    return loadExams();
  }

  document.getElementById("examBody").innerHTML = items.map(function (e) {
    const mcq = e.questions.filter(function (q) { return q.type !== "text"; }).length;
    const written = e.questions.length - mcq;
    const actions = [iconButton("questions", e.id, "bi-list-check", "Questions"), iconButton("edit", e.id, "bi-pencil", "Edit exam")];
    if (needsApproval() && (e.approval === "none" || e.approval === "rejected" || !e.approval)) {
      actions.push(iconButton("submit", e.id, "bi-send-check", "Send for approval"));
    }
    if (e.status === "live") actions.push(iconButton("close", e.id, "bi-stop-circle", "Close exam (mark completed)"));
    else if (e.status !== "completed" && canPublish(e)) actions.push(iconButton("golive", e.id, "bi-broadcast", "Make live"));
    actions.push(iconButton("delete", e.id, "bi-trash3", "Delete exam", "danger"));

    return '<tr><td class="cell-main"><strong>' + escapeHtml(e.title) + "</strong><small>" + escapeHtml(e.id) + " &middot; " + escapeHtml(e.subject || "") + "</small></td>" +
      '<td data-label="Date">' + formatDate(e.date) + "<small>" + (e.startTime ? formatExamTime(e, false) : e.duration + " min") + "</small></td>" +
      '<td data-label="Questions" class="num">' + mcq + " MCQ" + (written ? "<small>" + written + " written</small>" : "") + "</td>" +
      '<td data-label="Approval">' + approvalBadge(e.approval) + (e.approval === "rejected" && e.approvalNote ? '<small title="' + escapeHtml(e.approvalNote) + '">' + escapeHtml(e.approvalNote) + "</small>" : "") + "</td>" +
      '<td data-label="Status">' + statusBadge(e.status) + "</td>" +
      '<td data-label="Submitted" class="num">' + e.results.length + "</td>" +
      '<td data-label=""><div class="actions">' + actions.join("") + "</div></td></tr>";
  }).join("") || '<tr class="table-empty"><td colspan="7">No exams yet. Press "New exam" to create one.</td></tr>';

  renderPagination(document.getElementById("examPager"), examView.page, PAGE_SIZE, total, function (page) {
    examView.page = page;
    loadExams().catch(handlePageError);
  });
}

/* ---------- Create / edit exam ---------- */

function fillStatusOptions(exam) {
  const allowed = ["draft"];
  if (exam && canPublish(exam)) allowed.push("upcoming", "live", "completed");
  document.getElementById("eStatus").innerHTML = allowed.map(function (s) {
    return '<option value="' + s + '">' + STATUS_LABELS[s] + (s === "draft" ? " (hidden from students)" : "") + "</option>";
  }).join("");
}

async function openExamDialog(examId) {
  examView.editingId = examId;
  const form = document.getElementById("examForm");
  form.reset();
  const subjects = me.subjects && me.subjects.length ? me.subjects : ["General"];
  document.getElementById("eSubject").innerHTML = subjects.map(function (s) { return "<option>" + escapeHtml(s) + "</option>"; }).join("");
  const idInput = document.getElementById("eId");

  if (examId) {
    const exam = await api.get(idPath("exams", examId));
    fillStatusOptions(exam);
    document.getElementById("examDialogTitle").textContent = "Edit " + exam.id;
    document.getElementById("examDialogHint").textContent = needsApproval() && !canPublish(exam)
      ? "This paper is not approved yet, so it can only stay in draft."
      : "Approved papers can be scheduled or opened for students.";
    idInput.value = exam.id;
    idInput.readOnly = true;
    if (subjects.indexOf(exam.subject) === -1) document.getElementById("eSubject").insertAdjacentHTML("afterbegin", "<option>" + escapeHtml(exam.subject) + "</option>");
    document.getElementById("eSubject").value = exam.subject;
    document.getElementById("eTitle").value = exam.title;
    document.getElementById("eDate").value = exam.date;
    document.getElementById("eTime").value = exam.startTime || "10:00";
    document.getElementById("eDuration").value = exam.duration;
    document.getElementById("eStatus").value = exam.status;
    document.getElementById("eCorrect").value = exam.correctMarks;
    document.getElementById("eNegative").value = exam.negativeMarks;
    document.getElementById("eDescription").value = exam.description || "";
    document.getElementById("eInstructions").value = exam.instructions || "";
  } else {
    fillStatusOptions(null);
    document.getElementById("examDialogTitle").textContent = "New exam";
    document.getElementById("examDialogHint").textContent = "Add questions after saving, then send the paper for approval.";
    idInput.readOnly = false;
    document.getElementById("eDate").value = todayISO();
    document.getElementById("eTime").value = "10:00";
    document.getElementById("eDuration").value = 30;
    document.getElementById("eCorrect").value = settings.defaultCorrectMarks;
    document.getElementById("eNegative").value = settings.defaultNegativeMarks;
  }
  openModal("examDialog");
}

function saveExam(event) {
  event.preventDefault();
  const alertBox = document.getElementById("examAlert");
  const data = {
    id: document.getElementById("eId").value.trim().toUpperCase(),
    title: document.getElementById("eTitle").value.trim(),
    subject: document.getElementById("eSubject").value,
    date: document.getElementById("eDate").value,
    startTime: document.getElementById("eTime").value,
    duration: parseInt(document.getElementById("eDuration").value, 10),
    status: document.getElementById("eStatus").value,
    correctMarks: parseFloat(document.getElementById("eCorrect").value),
    negativeMarks: parseFloat(document.getElementById("eNegative").value),
    description: document.getElementById("eDescription").value.trim(),
    instructions: document.getElementById("eInstructions").value.trim()
  };

  if (!data.id || !data.title || !data.date || !data.startTime || isNaN(data.duration)) return setAlert(alertBox, "Exam code, title, date, start time and duration are required.");
  if (!/^[A-Z0-9][A-Z0-9-]{1,11}$/.test(data.id)) return setAlert(alertBox, "Exam code must be 2-12 letters, numbers or hyphens.");
  if (data.duration < 1 || data.duration > 300) return setAlert(alertBox, "Duration must be between 1 and 300 minutes.");
  if (isNaN(data.correctMarks) || data.correctMarks <= 0) return setAlert(alertBox, "MCQ marks must be more than 0.");
  if (isNaN(data.negativeMarks) || data.negativeMarks < 0) return setAlert(alertBox, "Negative marks cannot be below 0.");

  withBusy(document.getElementById("examSaveBtn"), async function () {
    const now = new Date().toISOString();
    if (examView.editingId) {
      if (data.status === "live" && !(await examHasQuestions(data.id))) {
        setAlert(alertBox, "Add at least one question before making the exam live.");
        return;
      }
      delete data.id;
      data.updatedAt = now;
      await api.patch(idPath("exams", examView.editingId), data);
      await logActivity(me, "exam", "Updated exam " + examView.editingId);
      closeModal("examDialog");
      toast("Exam updated.", "success");
      await loadExams();
    } else {
      if (await api.find(idPath("exams", data.id))) {
        setAlert(alertBox, "An exam with code " + data.id + " already exists.");
        return;
      }
      Object.assign(data, {
        status: "draft",
        approval: needsApproval() ? "none" : "approved",
        approvalNote: "",
        approvedBy: null,
        invigilatorId: null,
        createdBy: me.id,
        createdAt: now,
        updatedAt: now
      });
      await api.post("/exams", data);
      await logActivity(me, "exam", "Created exam " + data.id);
      closeModal("examDialog");
      toast("Exam created. Now add its questions.", "success");
      await loadExams();
      await openQuestionsDialog(data.id);
    }
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

async function examHasQuestions(examId) {
  return (await api.page("/questions", { examId: examId, _limit: 1 })).total > 0;
}

async function submitForApproval(examId, button) {
  if (!(await examHasQuestions(examId))) {
    toast("Add questions before sending " + examId + " for approval.", "error");
    return;
  }
  await withBusy(button, async function () {
    await api.patch(idPath("exams", examId), { approval: "pending", approvalNote: "", updatedAt: new Date().toISOString() });
    await logActivity(me, "exam", "Sent " + examId + " for approval");
  });
  toast(examId + " was sent to the admin for approval.", "success");
  await loadExams();
}

async function changeExamStatus(examId, status, button) {
  if (status === "live" && !(await examHasQuestions(examId))) {
    toast("Add at least one question before making " + examId + " live.", "error");
    return;
  }
  await withBusy(button, async function () {
    await api.patch(idPath("exams", examId), { status: status, updatedAt: new Date().toISOString() });
    await logActivity(me, "exam", (status === "live" ? "Opened " : "Closed ") + examId);
  });
  toast(examId + (status === "live" ? " is now live for students." : " is closed."), "success");
  await loadExams();
}

async function deleteExam(examId) {
  const exam = await api.get(idPath("exams", examId), { _embed: ["questions", "results"] });
  if (exam.status === "live") {
    toast("Close the exam before deleting it.", "error");
    return;
  }
  const ok = await confirmDialog({
    title: "Delete " + exam.id + "?",
    message: "This permanently deletes \"" + exam.title + "\" with its " + plural(exam.questions.length, "question") +
      " and " + plural(exam.results.length, "result") + ".",
    confirmText: "Delete exam",
    danger: true
  });
  if (!ok) return;
  // json-server removes dependent records (questions, results, attempts, violations with this examId)
  await api.remove(idPath("exams", examId));
  await logActivity(me, "exam", "Deleted exam " + examId);
  toast("Exam deleted.", "success");
  await loadExams();
}

/* ---------- Questions: MCQ (auto-checked) and written (marked by hand) ---------- */

function bindQuestions() {
  document.getElementById("questionForm").addEventListener("submit", saveQuestion);
  document.getElementById("qCancelEdit").addEventListener("click", resetQuestionForm);
  document.querySelectorAll('input[name="qType"]').forEach(function (radio) {
    radio.addEventListener("change", showTypeFields);
  });
  onRowAction("questionList", {
    "edit-q": function (id) { return editQuestion(Number(id)); },
    "delete-q": function (id) { return deleteQuestion(Number(id)); }
  });
  document.getElementById("questionsDialog").addEventListener("close", function () {
    if (location.hash === "#exams") loadExams().catch(handlePageError);
  });
}

function questionType() {
  return document.querySelector('input[name="qType"]:checked').value;
}

function showTypeFields() {
  const isText = questionType() === "text";
  document.getElementById("mcqFields").hidden = isText;
  document.getElementById("textFields").hidden = !isText;
}

function questionsLocked() {
  const exam = examView.questionsExam;
  return exam.status === "live" || exam.status === "completed";
}

async function openQuestionsDialog(examId) {
  examView.questionsExam = await api.get(idPath("exams", examId));
  document.getElementById("qDialogTitle").textContent = examView.questionsExam.title;
  const locked = questionsLocked();
  document.getElementById("qLocked").hidden = !locked;
  document.getElementById("questionForm").hidden = locked;
  resetQuestionForm();
  await loadQuestions();
  openModal("questionsDialog");
  if (!locked) document.getElementById("qText").focus();
}

async function loadQuestions() {
  const exam = examView.questionsExam;
  const locked = questionsLocked();
  const questions = await api.get("/questions", { examId: exam.id, _sort: "id", _order: "asc" });
  const totalMarks = questions.reduce(function (sum, q) { return sum + (q.type === "text" ? Number(q.marks) : exam.correctMarks); }, 0);
  document.getElementById("qDialogMeta").textContent = exam.id + " · " + plural(questions.length, "question") +
    " · " + totalMarks + " marks total · " + APPROVAL_LABELS[exam.approval || "none"];

  document.getElementById("questionList").innerHTML = questions.map(function (q, i) {
    const body = q.type === "text"
      ? '<span class="qtype text">Written &middot; ' + q.marks + " marks</span>" +
        (q.modelAnswer ? '<div class="model-answer"><strong>Model answer:</strong> ' + escapeHtml(q.modelAnswer) + "</div>" : "")
      : '<ol>' + q.options.map(function (o, j) {
        return '<li class="' + (j === q.correctIndex ? "correct" : "") + '">' + LETTERS[j] + ". " + escapeHtml(o) +
          (j === q.correctIndex ? ' <i class="bi bi-check-lg" aria-label="correct"></i>' : "") + "</li>";
      }).join("") + "</ol>";
    return '<div class="q-item"><span class="review-num">' + (i + 1) + "</span><div><p>" + escapeHtml(q.text) + "</p>" + body + "</div>" +
      '<div class="actions">' + (locked ? "" : iconButton("edit-q", q.id, "bi-pencil", "Edit question") + iconButton("delete-q", q.id, "bi-trash3", "Delete question", "danger")) + "</div></div>";
  }).join("") || '<div class="empty"><i class="bi bi-patch-question" aria-hidden="true"></i>No questions yet. Add the first one above.</div>';
}

function resetQuestionForm() {
  examView.editingQuestionId = null;
  document.getElementById("questionForm").reset();
  showTypeFields();
  document.getElementById("qFormTitle").textContent = "Add a question";
  document.getElementById("qSaveBtn").innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i> Add question';
  document.getElementById("qCancelEdit").hidden = true;
  setAlert(document.getElementById("questionAlert"), "");
}

async function editQuestion(id) {
  const q = await api.get(idPath("questions", id));
  resetQuestionForm();
  examView.editingQuestionId = id;
  document.querySelector('input[name="qType"][value="' + (q.type === "text" ? "text" : "mcq") + '"]').checked = true;
  showTypeFields();
  document.getElementById("qText").value = q.text;
  if (q.type === "text") {
    document.getElementById("qMarks").value = q.marks;
    document.getElementById("qModel").value = q.modelAnswer || "";
  } else {
    q.options.forEach(function (o, i) { document.getElementById("qOpt" + i).value = o; });
    document.querySelector('input[name="qCorrect"][value="' + q.correctIndex + '"]').checked = true;
  }
  document.getElementById("qFormTitle").textContent = "Edit question";
  document.getElementById("qSaveBtn").innerHTML = '<i class="bi bi-check2" aria-hidden="true"></i> Save changes';
  document.getElementById("qCancelEdit").hidden = false;
  document.getElementById("questionForm").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("qText").focus();
}

function readQuestionForm(alertBox) {
  const text = document.getElementById("qText").value.trim();
  if (!text) { setAlert(alertBox, "Please type the question."); return null; }
  const exam = examView.questionsExam;
  if (questionType() === "text") {
    const marks = parseFloat(document.getElementById("qMarks").value);
    if (isNaN(marks) || marks <= 0 || marks > 50) { setAlert(alertBox, "Maximum marks must be between 0.5 and 50."); return null; }
    return { examId: exam.id, type: "text", text: text, marks: marks, modelAnswer: document.getElementById("qModel").value.trim() };
  }
  const options = [0, 1, 2, 3].map(function (i) { return document.getElementById("qOpt" + i).value.trim(); });
  if (options.indexOf("") !== -1) { setAlert(alertBox, "Please fill in all four options."); return null; }
  const lower = options.map(function (o) { return o.toLowerCase(); });
  if (lower.some(function (o, i) { return lower.indexOf(o) !== i; })) { setAlert(alertBox, "All four options must be different."); return null; }
  return { examId: exam.id, type: "mcq", text: text, options: options, correctIndex: Number(document.querySelector('input[name="qCorrect"]:checked').value) };
}

// Changing an approved paper sends it back to the admin
async function paperChanged() {
  const exam = examView.questionsExam;
  const patch = { updatedAt: new Date().toISOString() };
  let message = "";
  if (needsApproval() && exam.approval === "approved") {
    Object.assign(patch, { approval: "pending", status: "draft" });
    exam.approval = "pending";
    exam.status = "draft";
    message = "The paper changed, so it was sent back to the admin for approval.";
  }
  await api.patch(idPath("exams", exam.id), patch);
  return message;
}

function saveQuestion(event) {
  event.preventDefault();
  const alertBox = document.getElementById("questionAlert");
  const data = readQuestionForm(alertBox);
  if (!data) return;

  withBusy(document.getElementById("qSaveBtn"), async function () {
    if (examView.editingQuestionId) {
      // PUT replaces the whole record, so switching MCQ <-> written leaves no old fields behind
      await api.put(idPath("questions", examView.editingQuestionId), data);
    } else {
      await api.post("/questions", data);
    }
    const note = await paperChanged();
    toast(note || (examView.editingQuestionId ? "Question updated." : "Question added."), note ? "info" : "success");
    resetQuestionForm();
    await loadQuestions();
    document.getElementById("qText").focus();
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

async function deleteQuestion(id) {
  const ok = await confirmDialog({ title: "Delete this question?", message: "Results already submitted keep their own copy of the question.", confirmText: "Delete", danger: true });
  if (!ok) return;
  await api.remove(idPath("questions", id));
  if (examView.editingQuestionId === id) resetQuestionForm();
  const note = await paperChanged();
  toast(note || "Question deleted.", note ? "info" : "success");
  await loadQuestions();
}
