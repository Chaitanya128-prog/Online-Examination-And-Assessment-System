"use strict";

/* =========================================================
   Exam page - instructions, timer, palette, MCQ + written answers,
   auto-save, resume, tab-switch proctoring, grading
   Owner: Devang Kumar (Student module)
   json-server: /exams, /questions, /attempts, /violations, /results
   ========================================================= */

const LETTERS = ["A", "B", "C", "D"];
const SYNC_SECONDS = 8; // how often we check the server for extra time / force submit

const state = {
  user: null,
  settings: null,
  exam: null,
  questions: [],
  attempt: null,       // json-server /attempts record (answers, review list, deadline, violations)
  index: 0,
  timerId: null,
  syncId: null,
  submitted: false,
  saveChain: Promise.resolve(),
  pendingSaves: 0
};

(async function () {
  state.user = await requireRole("student");
  state.settings = await getSettings();

  const examId = new URLSearchParams(location.search).get("id");
  if (!examId) return block("No exam selected", "Open an exam from your dashboard.");

  const exam = await api.find(idPath("exams", examId), { _embed: "questions" });
  if (!exam || exam.status === "draft") return block("Exam not found", "This exam does not exist or is not published.");

  const existing = await api.get("/results", { userId: state.user.id, examId: exam.id });
  if (existing.length) {
    location.replace("result.html?id=" + existing[0].id);
    return;
  }
  if (exam.status !== "live") return block("Exam is not live", exam.title + " is " + (STATUS_LABELS[exam.status] || exam.status).toLowerCase() + ". You can only attempt live exams.");
  if (!exam.questions.length) return block("No questions yet", "The examiner has not added questions to this exam.");
  if (examNotOpenYet(exam)) return waitForStart(exam);

  state.exam = exam;
  state.questions = exam.questions.slice().sort(function (a, b) { return a.id - b.id; });
  document.title = exam.title + " | ExamDesk";
  document.getElementById("examTitle").textContent = exam.title;
  document.getElementById("examInfo").textContent = exam.id + " · Roll No. " + state.user.id;

  state.attempt = await api.find(idPath("attempts", attemptId()));
  if (state.attempt) {
    if (state.attempt.forceSubmit || new Date(state.attempt.deadline).getTime() <= Date.now()) {
      toast("Your time is over. Submitting your saved answers.", "info");
      await submitExam(true);
      return;
    }
    beginExam();
  } else {
    showIntro();
  }
})().catch(handlePageError);

function attemptId() {
  return state.user.id + "__" + state.exam.id;
}

// Live exam whose start time has not come yet: show a countdown, open by itself at start time
function waitForStart(exam) {
  block("Exam opens at " + formatTime(exam.startTime), exam.title + " (" + exam.id + ") is scheduled for " + formatExamTime(exam) + ".");
  const text = document.getElementById("blockedText");
  document.querySelector("#blockedScreen .bi").className = "bi bi-hourglass-split";
  const timerId = setInterval(function () {
    const left = examStart(exam).getTime() - Date.now();
    if (left <= 0) {
      clearInterval(timerId);
      location.reload();
      return;
    }
    const s = Math.ceil(left / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    text.textContent = exam.title + " (" + exam.id + ") is scheduled for " + formatExamTime(exam) + ". Opens in " +
      (h ? h + " h " : "") + String(m).padStart(2, "0") + " min " + String(s % 60).padStart(2, "0") + " s.";
  }, 1000);
}

function block(title, text) {
  document.getElementById("examTitle").textContent = "ExamDesk";
  document.getElementById("timer").hidden = true;
  document.getElementById("blockedTitle").textContent = title;
  document.getElementById("blockedText").textContent = text;
  document.getElementById("blockedScreen").hidden = false;
}

/* ---------- Intro ---------- */

function showIntro() {
  const exam = state.exam;
  const mcqCount = state.questions.filter(function (q) { return q.type !== "text"; }).length;
  const textCount = state.questions.length - mcqCount;
  document.getElementById("timer").hidden = true;
  document.getElementById("introTitle").textContent = exam.title;
  document.getElementById("introDescription").textContent = exam.description || "";
  document.getElementById("introQuestions").textContent = mcqCount + " MCQ" + (textCount ? " + " + textCount + " written" : "");
  document.getElementById("introDuration").textContent = exam.duration + " min";
  document.getElementById("introCorrect").textContent = "+" + exam.correctMarks;
  document.getElementById("introWrong").textContent = "-" + exam.negativeMarks;

  const limit = state.settings.maxTabSwitches;
  const rules = [];
  if (exam.startTime) rules.push("Scheduled: " + formatExamTime(exam) + ". Your own " + exam.duration + "-minute timer starts when you press Start.");
  if (exam.instructions) rules.push(exam.instructions);
  rules.push("MCQs are checked automatically (+" + exam.correctMarks + " / -" + exam.negativeMarks + "). Written answers are marked by your examiner later.");
  rules.push("The exam opens in full screen. Leaving the tab, switching windows or exiting full screen is recorded and shown to the invigilator.");
  if (limit) rules.push("After " + plural(limit, "warning") + " your exam is submitted automatically.");
  rules.push("Copy, paste and right-click are disabled during the exam.");
  rules.push("Answers are saved automatically, so you can refresh or come back later. The timer keeps running.");
  rules.push(state.settings.requireAllAnswers ? "You must answer every question before you can submit." : "Unanswered questions get zero marks.");
  rules.push("Pass mark: " + state.settings.passMark + "%.");
  document.getElementById("introList").innerHTML = rules.map(function (r) { return "<li>" + escapeHtml(r) + "</li>"; }).join("");

  const agree = document.getElementById("agreeBox");
  const startBtn = document.getElementById("startBtn");
  agree.addEventListener("change", function () { startBtn.disabled = !agree.checked; });
  startBtn.addEventListener("click", function () {
    enterFullScreen(); // must run inside the click
    withBusy(startBtn, async function () {
      const now = Date.now();
      state.attempt = await api.post("/attempts", {
        id: attemptId(),
        userId: state.user.id,
        userName: state.user.name,
        examId: state.exam.id,
        answers: {},
        review: [],
        currentIndex: 0,
        answeredCount: 0,
        totalQuestions: state.questions.length,
        violations: 0,
        extraMinutes: 0,
        forceSubmit: false,
        startedAt: new Date(now).toISOString(),
        deadline: new Date(now + state.exam.duration * 60000).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString()
      });
      await logActivity(state.user, "exam", "Started " + state.exam.id);
      document.getElementById("introScreen").hidden = true;
      beginExam();
    }).catch(handlePageError);
  });
  document.getElementById("introScreen").hidden = false;
}

/* ---------- Exam ---------- */

function beginExam() {
  document.getElementById("timer").hidden = false;
  document.getElementById("examScreen").hidden = false;
  document.getElementById("questionTotal").textContent = state.questions.length;

  document.getElementById("paletteGrid").innerHTML = state.questions.map(function (q, i) {
    return '<button type="button" class="p-btn" data-index="' + i + '" aria-label="Question ' + (i + 1) + (q.type === "text" ? " (written)" : "") + '">' + (i + 1) + "</button>";
  }).join("");
  document.getElementById("paletteGrid").addEventListener("click", function (event) {
    const button = event.target.closest("[data-index]");
    if (button) showQuestion(Number(button.getAttribute("data-index")));
  });

  document.getElementById("prevBtn").addEventListener("click", function () { if (state.index > 0) showQuestion(state.index - 1); });
  document.getElementById("nextBtn").addEventListener("click", nextQuestion);
  document.getElementById("clearBtn").addEventListener("click", clearAnswer);
  document.getElementById("reviewBtn").addEventListener("click", toggleReview);
  document.getElementById("submitBtn").addEventListener("click", openSubmitDialog);
  document.getElementById("confirmSubmitBtn").addEventListener("click", function () {
    withBusy(this, function () { return submitExam(false); }).catch(handlePageError);
  });
  document.getElementById("textAnswer").addEventListener("input", onTextInput);
  document.addEventListener("keydown", handleKeys);
  window.addEventListener("beforeunload", function (event) {
    if (!state.submitted && state.pendingSaves > 0) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  const start = Math.min(Number(state.attempt.currentIndex) || 0, state.questions.length - 1);
  showQuestion(start);
  updateProctorStrip();
  startProctoring();
  tick();
  state.timerId = setInterval(tick, 1000);
  state.syncId = setInterval(syncWithServer, SYNC_SECONDS * 1000);
}

function currentQuestion() {
  return state.questions[state.index];
}

function answerOf(question) {
  const value = state.attempt.answers[String(question.id)];
  if (value === undefined || value === null) return null;
  return question.type === "text" ? String(value) : Number(value);
}

function isAnswered(question) {
  const value = answerOf(question);
  return question.type === "text" ? Boolean(value && value.trim()) : value !== null;
}

function answeredCount() {
  return state.questions.filter(isAnswered).length;
}

function isReview(question) {
  return state.attempt.review.indexOf(question.id) !== -1;
}

function showQuestion(index) {
  state.index = index;
  const q = currentQuestion();
  const isText = q.type === "text";

  document.getElementById("questionNo").textContent = index + 1;
  document.getElementById("questionText").textContent = q.text;
  document.getElementById("marksInfo").innerHTML = isText
    ? '<span class="qtype text"><i class="bi bi-textarea-t" aria-hidden="true"></i> Written &middot; ' + q.marks + " marks</span>"
    : '<span class="qtype"><i class="bi bi-ui-checks" aria-hidden="true"></i> MCQ &middot; +' + state.exam.correctMarks + " / -" + state.exam.negativeMarks + "</span>";

  const optionsBox = document.getElementById("optionsBox");
  const textBox = document.getElementById("textAnswerBox");
  optionsBox.hidden = isText;
  textBox.hidden = !isText;

  if (isText) {
    const area = document.getElementById("textAnswer");
    area.value = answerOf(q) || "";
    updateWordCount();
    optionsBox.innerHTML = "";
  } else {
    const chosen = answerOf(q);
    optionsBox.innerHTML = q.options.map(function (option, i) {
      const selected = chosen === i;
      return '<button type="button" class="option' + (selected ? " selected" : "") + '" role="radio" aria-checked="' + selected + '" data-option="' + i + '">' +
        '<span class="option-letter">' + LETTERS[i] + '</span><span class="option-text">' + escapeHtml(option) + "</span></button>";
    }).join("");
    optionsBox.querySelectorAll("[data-option]").forEach(function (button) {
      button.addEventListener("click", function () { chooseOption(Number(button.getAttribute("data-option"))); });
    });
  }

  document.querySelector("#reviewBtn span").textContent = isReview(q) ? "Unmark review" : "Mark for review";
  document.getElementById("prevBtn").disabled = index === 0;
  document.getElementById("nextBtn").innerHTML = index === state.questions.length - 1
    ? 'Review &amp; submit <i class="bi bi-send" aria-hidden="true"></i>'
    : 'Save &amp; next <i class="bi bi-chevron-right" aria-hidden="true"></i>';

  updatePalette();
  queueSave({ currentIndex: index });
}

function updatePalette() {
  const answered = answeredCount();
  document.querySelectorAll("#paletteGrid [data-index]").forEach(function (button, i) {
    const q = state.questions[i];
    button.className = "p-btn" + (isAnswered(q) ? " answered" : "") + (isReview(q) ? " review" : "") + (i === state.index ? " current" : "");
    button.setAttribute("aria-current", i === state.index ? "step" : "false");
  });
  document.getElementById("answeredCount").textContent = answered;
  document.getElementById("reviewCount").textContent = state.attempt.review.length;
  document.getElementById("leftCount").textContent = state.questions.length - answered;
  document.getElementById("paletteCount").textContent = answered + " / " + state.questions.length + " answered";
  document.getElementById("progressBar").style.width = (answered / state.questions.length * 100) + "%";
}

function chooseOption(optionIndex) {
  const q = currentQuestion();
  state.attempt.answers[String(q.id)] = optionIndex;
  showQuestion(state.index);
  queueSave({ answers: state.attempt.answers, answeredCount: answeredCount() });
}

// Written answers: save shortly after the student stops typing
const saveTextAnswer = debounce(function () {
  queueSave({ answers: state.attempt.answers, answeredCount: answeredCount() });
}, 700);

function onTextInput() {
  const q = currentQuestion();
  state.attempt.answers[String(q.id)] = document.getElementById("textAnswer").value;
  updateWordCount();
  updatePalette();
  saveTextAnswer();
}

function updateWordCount() {
  const text = document.getElementById("textAnswer").value.trim();
  document.getElementById("wordCount").textContent = plural(text ? text.split(/\s+/).length : 0, "word");
}

function clearAnswer() {
  const q = currentQuestion();
  delete state.attempt.answers[String(q.id)];
  showQuestion(state.index);
  queueSave({ answers: state.attempt.answers, answeredCount: answeredCount() });
}

function toggleReview() {
  const q = currentQuestion();
  const position = state.attempt.review.indexOf(q.id);
  if (position === -1) state.attempt.review.push(q.id);
  else state.attempt.review.splice(position, 1);
  queueSave({ review: state.attempt.review });
  if (position === -1 && state.index < state.questions.length - 1) showQuestion(state.index + 1);
  else showQuestion(state.index);
}

function nextQuestion() {
  if (state.index < state.questions.length - 1) showQuestion(state.index + 1);
  else openSubmitDialog();
}

function handleKeys(event) {
  if (state.submitted || document.querySelector("dialog[open]")) return;
  if (event.target.closest("input, textarea, select") || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toUpperCase();
  const q = currentQuestion();
  const letter = LETTERS.indexOf(key);
  const digit = ["1", "2", "3", "4"].indexOf(key);
  if (q.type !== "text" && (letter !== -1 || digit !== -1)) {
    const option = letter !== -1 ? letter : digit;
    if (option < q.options.length) chooseOption(option);
  } else if (event.key === "ArrowRight") {
    if (state.index < state.questions.length - 1) showQuestion(state.index + 1);
  } else if (event.key === "ArrowLeft") {
    if (state.index > 0) showQuestion(state.index - 1);
  } else if (key === "M") {
    toggleReview();
  }
}

/* ---------- Saving to json-server (PATCH /attempts/:id) ---------- */

function setSaveState(kind) {
  const el = document.getElementById("saveState");
  if (kind === "saving") el.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving...';
  else if (kind === "error") el.innerHTML = '<i class="bi bi-cloud-slash" aria-hidden="true" style="color:var(--red)"></i> Not saved - retrying';
  else el.innerHTML = '<i class="bi bi-cloud-check" aria-hidden="true"></i> All answers saved';
}

function queueSave(changes) {
  if (state.submitted || !state.attempt) return;
  state.pendingSaves++;
  setSaveState("saving");
  const payload = Object.assign({}, changes, { updatedAt: new Date().toISOString() });
  state.saveChain = state.saveChain.then(function save(attemptNo) {
    return api.patch(idPath("attempts", state.attempt.id), payload).catch(function () {
      setSaveState("error");
      const tries = (typeof attemptNo === "number" ? attemptNo : 0) + 1;
      if (tries > 5) return;
      return new Promise(function (resolve) { setTimeout(resolve, 1500 * tries); }).then(function () { return save(tries); });
    });
  }).finally(function () {
    state.pendingSaves--;
    if (state.pendingSaves === 0 && document.getElementById("saveState").textContent.indexOf("retrying") === -1) setSaveState("ok");
  });
}

/* ---------- Sync with the invigilator (extra time / force submit / heartbeat) ---------- */

async function syncWithServer() {
  if (state.submitted) return;
  const fresh = await api.patch(idPath("attempts", state.attempt.id), { lastSeenAt: new Date().toISOString() }).catch(function () { return null; });
  if (!fresh) return;
  if (fresh.deadline !== state.attempt.deadline) {
    const added = Math.round((new Date(fresh.deadline) - new Date(state.attempt.deadline)) / 60000);
    state.attempt.deadline = fresh.deadline;
    if (added > 0) toast("The invigilator gave you " + plural(added, "extra minute") + ".", "success");
  }
  if (fresh.forceSubmit) {
    stopProctoring();
    toast("The invigilator has ended your exam. Submitting now.", "error");
    submitExam(true).catch(handlePageError);
  }
}

/* ---------- Tab-switch detection / proctoring ---------- */

const proctor = { active: false, lastAt: 0, listening: false };

// Called once from beginExam(), after the exam screen is shown
function startProctoring() {
  proctor.active = true;
  if (proctor.listening) return;
  proctor.listening = true;

  // Switched browser tab or minimised the window
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) recordViolation("tab-switch", "Left the exam tab");
  });

  // Clicked another app / window (Alt+Tab) without hiding the tab
  window.addEventListener("blur", function () {
    recordViolation("window-blur", "Switched to another window");
  });

  // Left full screen (full screen is requested when the student presses Start)
  document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement) recordViolation("fullscreen-exit", "Exited full screen");
  });

  // Block copy, paste and right-click inside the exam
  ["copy", "paste", "cut", "contextmenu"].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (!proctor.active) return;
      event.preventDefault();
      recordViolation(type, type === "contextmenu" ? "Tried to right-click" : "Tried to " + type);
    });
  });
}

function stopProctoring() {
  proctor.active = false;
}

async function recordViolation(type, message) {
  if (!proctor.active || state.submitted) return;

  // One Alt+Tab fires both "blur" and "visibilitychange" - count it once
  const now = Date.now();
  if (now - proctor.lastAt < 1500) return;
  proctor.lastAt = now;

  const count = (state.attempt.violations || 0) + 1;
  const limit = state.settings.maxTabSwitches; // set by Admin, 0 = warn only
  state.attempt.violations = count;
  updateProctorStrip();

  // Save to json-server: the Invigilator panel reads /violations live
  api.post("/violations", {
    attemptKey: state.attempt.id, // not "attemptId": json-server would delete these when the attempt is removed
    userId: state.user.id,
    examId: state.exam.id,
    type: type,
    message: message,
    count: count,
    createdAt: new Date(now).toISOString()
  }).catch(function () {});
  queueSave({ violations: count });

  if (limit && count >= limit) {
    stopProctoring();
    toast("Warning limit reached. Your exam is being submitted.", "error");
    submitExam(true).catch(handlePageError);
    return;
  }
  showViolationWarning(message, count, limit);
}

function showViolationWarning(message, count, limit) {
  document.getElementById("violationText").textContent = message + ".";
  document.getElementById("violationCount").textContent = limit
    ? "Warning " + count + " of " + limit + ". At " + limit + " your exam is submitted automatically."
    : "Warning " + count + ". This has been reported to the invigilator.";
  const dialog = document.getElementById("violationDialog");
  if (!dialog.open) dialog.showModal();
}

function updateProctorStrip() {
  const count = state.attempt.violations || 0;
  const strip = document.getElementById("proctorStrip");
  strip.classList.toggle("warn", count > 0);
  strip.querySelector("span").textContent = "Proctoring on · " + plural(count, "warning");
}

// Called from the Start button and the "Return to exam" button (needs a user click)
function enterFullScreen() {
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(function () {});
}

/* ---------- Timer ---------- */

function tick() {
  const secondsLeft = Math.max(0, Math.ceil((new Date(state.attempt.deadline).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  document.getElementById("timerText").textContent = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  const timer = document.getElementById("timer");
  timer.classList.toggle("warn", secondsLeft <= 300 && secondsLeft > 60);
  timer.classList.toggle("danger", secondsLeft <= 60);
  if (secondsLeft === 300) toast("5 minutes left.", "info");
  if (secondsLeft === 60) toast("1 minute left!", "error");

  if (secondsLeft <= 0 && !state.submitted) {
    clearInterval(state.timerId);
    toast("Time is over. Submitting your exam...", "info");
    submitExam(true).catch(handlePageError);
  }
}

/* ---------- Submit ---------- */

function openSubmitDialog() {
  const answered = answeredCount();
  const left = state.questions.length - answered;
  document.getElementById("sumAnswered").textContent = answered;
  document.getElementById("sumReview").textContent = state.attempt.review.length;
  document.getElementById("sumLeft").textContent = left;
  openModal("submitDialog");
  const blocked = state.settings.requireAllAnswers && left > 0;
  setAlert(document.getElementById("submitAlert"), blocked ? "Answer the remaining " + plural(left, "question") + " before you submit." : "");
  document.getElementById("confirmSubmitBtn").disabled = blocked;
}

async function submitExam(automatic) {
  if (state.submitted) return;
  state.submitted = true;
  stopProctoring();
  clearInterval(state.timerId);
  clearInterval(state.syncId);
  try {
    await gradeAndSave(automatic);
  } catch (error) {
    state.submitted = false; // let the student try again
    if (!document.getElementById("examScreen").hidden) {
      proctor.active = true;
      state.timerId = setInterval(tick, 1000);
      state.syncId = setInterval(syncWithServer, SYNC_SECONDS * 1000);
    }
    throw error;
  }
}

async function gradeAndSave(automatic) {
  await state.saveChain;

  // A result may already exist (e.g. submitted from another tab)
  const existing = await api.get("/results", { userId: state.user.id, examId: state.exam.id });
  if (existing.length) {
    location.replace("result.html?id=" + existing[0].id);
    return;
  }

  // Latest violation count from the server (another tab may have added some)
  const latest = await api.find(idPath("attempts", state.attempt.id));
  if (latest) state.attempt.violations = Math.max(state.attempt.violations || 0, latest.violations || 0);

  const exam = state.exam;
  // Snapshot each question so the review stays correct even if the examiner edits it later
  const answers = state.questions.map(function (q) {
    if (q.type === "text") {
      return { questionId: q.id, type: "text", text: q.text, maxMarks: q.marks, modelAnswer: q.modelAnswer || "",
        answerText: (answerOf(q) || "").trim(), awarded: null, feedback: "" };
    }
    return { questionId: q.id, type: "mcq", text: q.text, options: q.options, correctIndex: q.correctIndex, chosen: answerOf(q) };
  });
  const totals = scoreAnswers(answers, exam.correctMarks, exam.negativeMarks);

  const result = await api.post("/results", Object.assign({
    userId: state.user.id,
    examId: exam.id,
    examTitle: exam.title,
    date: todayISO(),
    submittedAt: new Date().toISOString(),
    startedAt: state.attempt.startedAt,
    correctMarks: exam.correctMarks,
    negativeMarks: exam.negativeMarks,
    autoSubmitted: Boolean(automatic),
    violations: state.attempt.violations || 0,
    answers: answers
  }, totals));

  await api.remove(idPath("attempts", state.attempt.id)).catch(function () {});
  await logActivity(state.user, "result", (automatic ? "Auto-submitted " : "Submitted ") + exam.id +
    (totals.status === "pending" ? " (written answers pending)" : " (" + totals.percentage + "%)"));
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  location.replace("result.html?id=" + result.id + "&new=1");
}
