"use strict";

const examiner = checkLogin("examiner");

let appData = null;
let addedQuestions = [];

if (examiner !== null) {
  document.getElementById("userName").textContent = examiner.name;
  document.getElementById("userAvatar").textContent = getInitials(examiner.name);
  document.getElementById("welcomeDate").textContent = todayText();
  document.getElementById("welcomeName").textContent = "Hello, " + examiner.name;

  document.getElementById("logoutBtn").addEventListener("click", function (event) {
    event.preventDefault();
    logout();
  });

  document.getElementById("searchBox").addEventListener("input", showStudentRows);
  document.getElementById("addQuestionBtn").addEventListener("click", addQuestion);
  document.getElementById("examForm").addEventListener("submit", saveExam);

  loadData()
    .then(function (data) {
      appData = data;
      showAll();
      setupNotifications(["Examiner dashboard ready", ...getAllExams(data).filter(e=>e.status==="live").map(e=>"Live exam: " + e.title)]);
    })
    .catch(function (error) {
      console.log(error);
      document.getElementById("welcomeText").textContent =
        "Could not load data.json. Please open the project with Live Server.";
    });
}

function showAll() {
  showStats();
  showStudentRows();
  showSummary();
  showExamRows();
}

function getStudents() {
  return getAllUsers(appData).filter(function (u) {
    return u.role === "student";
  });
}

function getStudentName(roll) {
  const users = getAllUsers(appData);
  for (let i = 0; i < users.length; i++) {
    if (users[i].roll === roll) {
      return users[i].name;
    }
  }
  return roll;
}

function showStats() {
  const exams = getAllExams(appData);
  const results = getAllResults(appData);
  const students = getStudents();

  const liveExams = exams.filter(function (e) {
    return e.status === "live";
  });

  document.getElementById("statStudents").textContent = students.length;
  document.getElementById("statActive").textContent = liveExams.length;
  document.getElementById("statSubmissions").textContent = results.length;
  document.getElementById("statAverage").textContent = averagePercentage(results) + "%";

  if (liveExams.length === 0) {
    document.getElementById("welcomeText").textContent = "No exam is running right now.";
  } else {
    const live = liveExams[0];
    const submitted = results.filter(function (r) {
      return r.exam === live.id;
    }).length;
    document.getElementById("welcomeText").textContent =
      live.id + " is running right now. " + submitted + " out of " + students.length +
      " students have submitted so far.";
  }
}

function showStudentRows() {
  const results = getAllResults(appData);
  const text = document.getElementById("searchBox").value.trim().toLowerCase();

  const sorted = results.slice().sort(function (a, b) {
    if (a.date < b.date) {
      return 1;
    }
    return -1;
  });

  let html = "";
  let shown = 0;

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const name = getStudentName(r.student);

    if (text !== "" && name.toLowerCase().indexOf(text) === -1 && r.student.indexOf(text) === -1) {
      continue;
    }
    if (text === "" && shown >= 8) {
      break;
    }

    html +=
      "<tr><td><strong>" + escapeHtml(name) + "</strong><small>B.Tech CSE</small></td>" +
      "<td>" + r.student + "</td>" +
      "<td>" + escapeHtml(r.exam) + "</td>" +
      "<td><strong>" + r.score + " / " + r.total + "</strong></td>" +
      '<td><span class="status upcoming">' + r.percentage + "%</span></td></tr>";
    shown++;
  }

  if (shown === 0) {
    html = '<tr><td colspan="5">No result found.</td></tr>';
  }
  document.getElementById("studentBody").innerHTML = html;
}

function showSummary() {
  const results = getAllResults(appData);

  if (results.length === 0) {
    return;
  }

  let best = results[0];
  let passed = 0;

  for (let i = 0; i < results.length; i++) {
    if (results[i].percentage > best.percentage) {
      best = results[i];
    }
    if (results[i].percentage >= 40) {
      passed++;
    }
  }

  document.getElementById("avgText").textContent = averagePercentage(results) + "%";
  document.getElementById("avgSmall").textContent = "Out of " + results.length + " submissions";
  document.getElementById("maxText").textContent = best.percentage + "%";
  document.getElementById("maxSmall").textContent = getStudentName(best.student) + " (" + best.exam + ")";
  document.getElementById("passText").textContent = Math.round((passed / results.length) * 100) + "%";
}

function showExamRows() {
  const exams = getAllExams(appData);
  const results = getAllResults(appData);
  const totalStudents = getStudents().length;

  let html = "";
  for (let i = 0; i < exams.length; i++) {
    const e = exams[i];

    const submissions = results.filter(function (r) {
      return r.exam === e.id;
    }).length;

    let questionText = e.questions.length;
    if (e.questions.length === 0) {
      questionText = "-";
    }

    const statusText = e.status.charAt(0).toUpperCase() + e.status.slice(1);

    html +=
      "<tr><td><strong>" + escapeHtml(e.title) + "</strong><small>" + escapeHtml(e.id) + "</small></td>" +
      "<td>" + formatDate(e.date) + "</td>" +
      "<td>" + questionText + "</td>" +
      "<td>" + submissions + " / " + totalStudents + "</td>" +
      '<td><span class="status ' + e.status + '">' + statusText + "</span></td></tr>";
  }
  document.getElementById("examBody").innerHTML = html;
}

function showExamError(message) {
  const box = document.getElementById("examError");
  box.textContent = message;
  if (message === "") {
    box.classList.remove("show");
  } else {
    box.classList.add("show");
  }
}

function addQuestion() {
  const text = document.getElementById("qText").value.trim();
  const options = [
    document.getElementById("optA").value.trim(),
    document.getElementById("optB").value.trim(),
    document.getElementById("optC").value.trim(),
    document.getElementById("optD").value.trim()
  ];
  const correctIndex = parseInt(document.getElementById("qCorrect").value);

  if (text === "" || options.indexOf("") !== -1) {
    showExamError("Please fill the question and all four options.");
    return;
  }

  for (let i = 0; i < options.length; i++) {
    if (options.indexOf(options[i]) !== i) {
      showExamError("All four options must be different.");
      return;
    }
  }

  addedQuestions.push({
    id: addedQuestions.length + 1,
    question: text,
    options: options,
    correctAnswer: options[correctIndex]
  });

  document.getElementById("qText").value = "";
  document.getElementById("optA").value = "";
  document.getElementById("optB").value = "";
  document.getElementById("optC").value = "";
  document.getElementById("optD").value = "";
  document.getElementById("qCorrect").value = "0";

  showExamError("");
  showAddedList();
}

function removeQuestion(index) {
  addedQuestions.splice(index, 1);
  for (let i = 0; i < addedQuestions.length; i++) {
    addedQuestions[i].id = i + 1;
  }
  showAddedList();
}

function showAddedList() {
  let html = "";
  for (let i = 0; i < addedQuestions.length; i++) {
    const q = addedQuestions[i];
    html +=
      "<li><span>" + escapeHtml(q.question) + " (Correct: " + escapeHtml(q.correctAnswer) + ")</span>" +
      '<button type="button" class="remove-btn" onclick="removeQuestion(' + i + ')">Remove</button></li>';
  }
  document.getElementById("addedList").innerHTML = html;
}

function saveExam(event) {
  event.preventDefault();

  const code = document.getElementById("newId").value.trim().toUpperCase();
  const title = document.getElementById("newTitle").value.trim();
  const date = document.getElementById("newDate").value;
  const duration = parseInt(document.getElementById("newDuration").value);
  const status = document.getElementById("newStatus").value;

  if (code === "" || title === "" || date === "" || isNaN(duration)) {
    showExamError("Please fill exam code, title, date and duration.");
    return;
  }

  if (!/^[A-Z0-9-]+$/.test(code)) {
    showExamError("Exam code can have only letters, numbers and hyphen.");
    return;
  }

  if (duration <= 0) {
    showExamError("Duration must be more than 0 minutes.");
    return;
  }

  const exams = getAllExams(appData);
  for (let i = 0; i < exams.length; i++) {
    if (exams[i].id === code) {
      showExamError("An exam with this code already exists.");
      return;
    }
  }

  if (addedQuestions.length === 0) {
    showExamError("Please add at least one question.");
    return;
  }

  const newExam = {
    id: code,
    title: title,
    date: date,
    duration: duration,
    status: status,
    correctMarks: 2,
    negativeMarks: 0.5,
    questions: addedQuestions
  };

  saveNewExam(newExam);

  document.getElementById("examForm").reset();
  addedQuestions = [];
  showAddedList();
  showExamError("");
  showAll();
  alert("Exam " + code + " saved successfully.");
}
