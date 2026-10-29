"use strict";

const user = checkLogin("student");

if (user !== null) {
  document.getElementById("userName").textContent = user.name;
  document.getElementById("userAvatar").textContent = getInitials(user.name);
  document.getElementById("welcomeDate").textContent = todayText();
  document.getElementById("welcomeName").textContent = "Hello, " + user.name.split(" ")[0];

  document.getElementById("logoutBtn").addEventListener("click", function (event) {
    event.preventDefault();
    logout();
  });

  loadData()
    .then(function (data) {
      showDashboard(data);
    })
    .catch(function (error) {
      console.log(error);
      document.getElementById("liveExamBox").innerHTML =
        '<div class="empty-live">Could not load data.json. Please open the project with Live Server.</div>';
    });
}

function startExam(examId) {
  localStorage.setItem("currentExamId", examId);
  window.location.href = "exam.html";
}

function openResult(examId) {
  localStorage.setItem("resultExamId", examId);
  window.location.href = "result.html";
}

function showDashboard(data) {
  const exams = getAllExams(data);
  const allResults = getAllResults(data);

  const myResults = allResults.filter(function (r) {
    return r.student === user.roll;
  });

  const attemptedIds = myResults.map(function (r) {
    return r.exam;
  });

  const liveExams = exams.filter(function (e) {
    return e.status === "live" && attemptedIds.indexOf(e.id) === -1;
  });

  const upcomingExams = exams.filter(function (e) {
    return e.status === "upcoming";
  });

  document.getElementById("statLive").textContent = liveExams.length;
  document.getElementById("statUpcoming").textContent = upcomingExams.length;
  document.getElementById("statCompleted").textContent = myResults.length;
  document.getElementById("statAverage").textContent = averagePercentage(myResults) + "%";

  document.getElementById("quickCount").textContent = liveExams.length;
  if (liveExams.length > 0) {
    document.getElementById("quickExam").textContent = liveExams[0].id;
    document.getElementById("welcomeText").textContent =
      "You have " + liveExams.length + " exam available today. Check the details below before starting.";
  } else {
    document.getElementById("quickExam").textContent = "None";
    document.getElementById("welcomeText").textContent = "You have no live exam right now.";
  }

  setupNotifications([...liveExams.map(e => "Live now: " + e.title), ...upcomingExams.map(e => "Upcoming: " + e.title), ...(myResults.length ? ["Your latest exam result is available."] : [])]);
  showLiveExams(liveExams);
  showUpcoming(upcomingExams);
  showRecentResults(myResults);
}

function showLiveExams(liveExams) {
  const box = document.getElementById("liveExamBox");

  if (liveExams.length === 0) {
    box.innerHTML = '<div class="empty-live">No live exam is available right now.</div>';
    return;
  }

  let html = "";
  for (let i = 0; i < liveExams.length; i++) {
    const exam = liveExams[i];
    html +=
      '<article class="exam-live-card">' +
      '<div class="exam-logo">' + escapeHtml(exam.id.split("-")[0]) + "</div>" +
      '<div class="exam-info">' +
      '<div class="tag live">LIVE</div>' +
      "<h3>" + escapeHtml(exam.title) + "</h3>" +
      "<p>Read all the instructions carefully before you start the exam.</p>" +
      '<div class="meta-row"><span>' + exam.duration + " Minutes</span><span>" +
      exam.questions.length + " Questions</span><span>+" + exam.correctMarks +
      " correct, -" + exam.negativeMarks + " wrong</span></div>" +
      "</div>" +
      '<button class="btn btn-primary" onclick="startExam(\'' + exam.id + '\')">Start Exam</button>' +
      "</article>";
  }
  box.innerHTML = html;
}

function showUpcoming(upcomingExams) {
  const body = document.getElementById("upcomingBody");

  if (upcomingExams.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No upcoming exams.</td></tr>';
    return;
  }

  let html = "";
  for (let i = 0; i < upcomingExams.length; i++) {
    const exam = upcomingExams[i];
    html +=
      "<tr><td><strong>" + escapeHtml(exam.title) + "</strong><small>" + escapeHtml(exam.id) + "</small></td>" +
      "<td>" + formatDate(exam.date) + "</td>" +
      "<td>" + exam.duration + " min</td>" +
      '<td><span class="status upcoming">Upcoming</span></td></tr>';
  }
  body.innerHTML = html;
}

function showRecentResults(myResults) {
  const box = document.getElementById("recentResults");

  if (myResults.length === 0) {
    box.innerHTML = '<div class="empty-live">You have not attempted any exam yet.</div>';
    return;
  }

  const sorted = myResults.slice().sort(function (a, b) {
    if (a.date < b.date) {
      return 1;
    }
    return -1;
  });

  let html = "";
  const count = Math.min(sorted.length, 4);
  for (let i = 0; i < count; i++) {
    const r = sorted[i];
    html +=
      '<div class="result-item clickable" onclick="openResult(\'' + r.exam + '\')">' +
      '<div class="subject-icon">' + escapeHtml(r.exam.split("-")[0]) + "</div>" +
      "<div><strong>" + escapeHtml(r.examTitle) + "</strong><small>" + formatDate(r.date) + "</small></div>" +
      "<b>" + r.percentage + "%</b></div>";
  }
  box.innerHTML = html;
}
