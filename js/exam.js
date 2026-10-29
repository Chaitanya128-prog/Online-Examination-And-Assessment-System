"use strict";

const user = checkLogin("student");

let exam = null;
let questions = [];
let currentIndex = 0;
let answers = {};
let reviewList = [];
let secondsLeft = 0;
let timerId = null;
let submitted = false;

const letters = ["A", "B", "C", "D"];

if (user !== null) {
  loadData()
    .then(function (data) {
      beginExam(data);
    })
    .catch(function (error) {
      console.log(error);
      alert("Could not load data.json. Please open the project with Live Server.");
    });
}

function beginExam(data) {
  const exams = getAllExams(data);
  const results = getAllResults(data);

  const attemptedIds = results
    .filter(function (r) {
      return r.student === user.roll;
    })
    .map(function (r) {
      return r.exam;
    });

  const wantedId = localStorage.getItem("currentExamId");
  exam = null;

  for (let i = 0; i < exams.length; i++) {
    if (exams[i].id === wantedId) {
      exam = exams[i];
    }
  }

  if (exam === null || exam.status !== "live") {
    exam = null;
    for (let i = 0; i < exams.length; i++) {
      if (exams[i].status === "live" && attemptedIds.indexOf(exams[i].id) === -1) {
        exam = exams[i];
        break;
      }
    }
  }

  if (exam === null) {
    alert("No live exam is available right now.");
    window.location.href = "dashboard.html";
    return;
  }

  if (attemptedIds.indexOf(exam.id) !== -1) {
    alert("You have already submitted this exam.");
    window.location.href = "dashboard.html";
    return;
  }

  if (exam.questions.length === 0) {
    alert("This exam has no questions yet.");
    window.location.href = "dashboard.html";
    return;
  }

  questions = exam.questions;
  const attemptKey = "examAttempt:" + user.roll + ":" + exam.id;
  const savedAttempt = JSON.parse(localStorage.getItem(attemptKey) || "null");
  if (savedAttempt && savedAttempt.deadline > Date.now()) { answers = savedAttempt.answers || {}; reviewList = savedAttempt.reviewList || []; }
  window.examAttemptKey = attemptKey;
  window.examDeadline = savedAttempt?.deadline || Date.now() + exam.duration * 60000;
  persistAttempt();
  secondsLeft = Math.max(0, Math.ceil((window.examDeadline - Date.now()) / 1000));

  document.getElementById("examTitle").textContent = exam.title;
  document.getElementById("examInfo").textContent = exam.id + " | Roll No. " + user.roll;
  document.getElementById("questionTotal").textContent = questions.length;
  document.getElementById("marksInfo").textContent =
    "+" + exam.correctMarks + " for correct, -" + exam.negativeMarks + " for wrong";

  buildPalette();
  showQuestion(0);
  showTime();
  timerId = setInterval(tick, 1000);
}

function tick() {
  secondsLeft = Math.max(0, Math.ceil((window.examDeadline - Date.now()) / 1000));
  showTime();

  if (secondsLeft <= 0) {
    clearInterval(timerId);
    alert("Time is over. Your exam will be submitted now.");
    submitExam();
  }
}

function showTime() {
  const minutes = Math.floor(Math.max(0, secondsLeft) / 60);
  const seconds = secondsLeft % 60;
  let text = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  document.getElementById("timerText").textContent = text;
}

function buildPalette() {
  let html = "";
  for (let i = 0; i < questions.length; i++) {
    html += '<button type="button" class="p" onclick="goTo(' + i + ')">' + (i + 1) + "</button>";
  }
  document.getElementById("paletteGrid").innerHTML = html;
}

function showQuestion(index) {
  currentIndex = index;
  const q = questions[index];

  document.getElementById("questionNo").textContent = index + 1;
  document.getElementById("questionLabel").textContent = "Question " + (index + 1);
  document.getElementById("questionText").textContent = q.question;

  let html = "";
  for (let i = 0; i < q.options.length; i++) {
    let className = "option";
    if (answers[q.id] === q.options[i]) {
      className += " selected";
    }
    html +=
      '<label class="' + className + '" onclick="chooseOption(' + i + ')">' +
      '<span class="option-letter">' + letters[i] + "</span>" +
      "<span>" + escapeHtml(q.options[i]) + "</span></label>";
  }
  document.getElementById("optionsBox").innerHTML = html;

  if (reviewList.indexOf(q.id) !== -1) {
    document.getElementById("reviewBtn").textContent = "Remove Review";
  } else {
    document.getElementById("reviewBtn").textContent = "Mark for Review";
  }

  if (index === questions.length - 1) {
    document.getElementById("nextBtn").textContent = "Save";
  } else {
    document.getElementById("nextBtn").textContent = "Save & Next";
  }

  updatePalette();
}

function updatePalette() {
  const buttons = document.getElementById("paletteGrid").children;

  for (let i = 0; i < buttons.length; i++) {
    const q = questions[i];
    let className = "p";

    if (i === currentIndex) {
      className += " current";
    } else if (reviewList.indexOf(q.id) !== -1) {
      className += " review";
    } else if (answers[q.id] !== undefined) {
      className += " answered";
    }
    buttons[i].className = className;
  }

  const answeredCount = Object.keys(answers).length;
  document.getElementById("paletteCount").textContent = currentIndex + 1 + " / " + questions.length;
  document.getElementById("submitBtn").disabled = answeredCount !== questions.length;
  document.getElementById("submitBtn").title = answeredCount !== questions.length ? "Answer every question to submit" : "Submit exam";
  document.getElementById("paletteInfo").innerHTML =
    "Answered: " + answeredCount + " &nbsp; Marked: " + reviewList.length +
    " &nbsp; Left: " + (questions.length - answeredCount);
}

function goTo(index) {
  showQuestion(index);
}

function chooseOption(optionIndex) {
  const q = questions[currentIndex];
  answers[q.id] = q.options[optionIndex];
  persistAttempt();
  showQuestion(currentIndex);
}

document.getElementById("nextBtn").addEventListener("click", function () {
  if (currentIndex < questions.length - 1) {
    showQuestion(currentIndex + 1);
  } else {
    showQuestion(currentIndex);
  }
});

document.getElementById("prevBtn").addEventListener("click", function () {
  if (currentIndex > 0) {
    showQuestion(currentIndex - 1);
  }
});

document.getElementById("clearBtn").addEventListener("click", function () {
  const q = questions[currentIndex];
  delete answers[q.id];
  persistAttempt();
  showQuestion(currentIndex);
});

document.getElementById("reviewBtn").addEventListener("click", function () {
  const q = questions[currentIndex];
  const position = reviewList.indexOf(q.id);

  if (position === -1) {
    reviewList.push(q.id);
    if (currentIndex < questions.length - 1) {
      showQuestion(currentIndex + 1);
      return;
    }
  } else {
    reviewList.splice(position, 1);
  }
  persistAttempt();
  showQuestion(currentIndex);
});

document.getElementById("submitBtn").addEventListener("click", function () {
  const left = questions.length - Object.keys(answers).length;
  if (left > 0) { showToast("Please answer all " + left + " remaining question(s) before submitting.", "error"); return; }
  let message = "Submit your completed exam?";
  if (confirm(message)) {
    submitExam();
  }
});

function submitExam() {
  if (submitted) {
    return;
  }
  submitted = true;
  clearInterval(timerId);

  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  const answerList = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const chosen = answers[q.id];

    if (chosen === undefined) {
      unattempted++;
      answerList.push({ id: q.id, chosen: null });
    } else if (chosen === q.correctAnswer) {
      correct++;
      answerList.push({ id: q.id, chosen: chosen });
    } else {
      wrong++;
      answerList.push({ id: q.id, chosen: chosen });
    }
  }

  let score = correct * exam.correctMarks - wrong * exam.negativeMarks;
  if (score < 0) {
    score = 0;
  }
  const total = questions.length * exam.correctMarks;
  const percentage = Math.round((score / total) * 100);

  const result = {
    student: user.roll,
    exam: exam.id,
    examTitle: exam.title,
    date: todayISO(),
    score: score,
    total: total,
    percentage: percentage,
    correct: correct,
    wrong: wrong,
    unattempted: unattempted,
    answers: answerList
  };

  if (window.examAttemptKey) localStorage.removeItem(window.examAttemptKey);
  saveNewResult(result);
  localStorage.setItem("resultExamId", exam.id);
  window.location.href = "result.html";
}

function persistAttempt() {
  if (window.examAttemptKey && !submitted) localStorage.setItem(window.examAttemptKey, JSON.stringify({answers, reviewList, deadline:window.examDeadline}));
}
