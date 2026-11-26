"use strict";

/* =========================================================
   Student dashboard - live/upcoming exams, recent results, announcements, progress
   Owner: Devang Kumar (Student module)
   json-server: /exams, /results, /attempts, /announcements
   ========================================================= */

(async function () {
  const user = await requireRole("student");
  renderAppHeader(user, "dashboard");
  renderFooter();

  document.getElementById("welcomeDate").textContent = todayText();
  document.getElementById("welcomeName").textContent = "Hello, " + user.name.split(" ")[0];

  const [settings, exams, results, attempts, announcements] = await Promise.all([
    getSettings(),
    api.get("/exams", { status_ne: "draft", _embed: "questions", _sort: "date", _order: "asc" }),
    api.get("/results", { userId: user.id, _sort: "submittedAt", _order: "desc" }),
    api.get("/attempts", { userId: user.id }),
    fetchAnnouncements(user, 5)
  ]);

  const doneIds = results.map(function (r) { return r.examId; });
  const attemptIds = attempts.map(function (a) { return a.examId; });
  const live = exams.filter(function (e) { return e.status === "live" && doneIds.indexOf(e.id) === -1; });
  const upcoming = exams.filter(function (e) { return e.status === "upcoming"; });

  document.getElementById("statLive").textContent = live.length;
  document.getElementById("statUpcoming").textContent = upcoming.length;
  document.getElementById("statCompleted").textContent = results.length;
  document.getElementById("statAverage").textContent = results.length ? averagePercentage(results) + "%" : "-";
  if (results.length) {
    const best = Math.max.apply(null, results.map(function (r) { return r.percentage; }));
    document.getElementById("statBest").textContent = "Best score " + best + "%";
  }

  const inProgress = live.filter(function (e) { return attemptIds.indexOf(e.id) !== -1; }).length;
  const openNow = live.filter(function (e) { return !examNotOpenYet(e); }).length;
  const later = live.length - openNow;
  document.getElementById("welcomeText").textContent = openNow
    ? "You have " + plural(openNow, "exam") + " open right now" + (inProgress ? ", " + inProgress + " already in progress." : ". Read the instructions before you start.")
    : later ? plural(later, "exam") + " will open later today. Check the time on the card below."
      : "No exam is open for you right now. Check the schedule below.";

  renderLive(live, attemptIds);
  renderUpcoming(upcoming);
  renderRecent(results, settings.passMark);
  renderAnnouncements(announcements);
  renderProgress(results, settings.passMark);
})().catch(handlePageError);

function renderLive(live, attemptIds) {
  const box = document.getElementById("liveExams");
  if (!live.length) {
    box.innerHTML = '<div class="empty"><i class="bi bi-cup-hot" aria-hidden="true"></i>No live exam right now. You will see it here as soon as an examiner opens one.</div>';
    return;
  }
  box.innerHTML = live.map(function (exam) {
    const resuming = attemptIds.indexOf(exam.id) !== -1;
    const ready = exam.questions.length > 0;
    const notOpen = examNotOpenYet(exam);
    return '<article class="exam-card highlight">' +
      '<div class="exam-code">' + escapeHtml(exam.id) + "</div>" +
      "<div>" + statusBadge("live") + (resuming ? ' <span class="badge badge-review">In progress</span>' : "") +
      "<h3>" + escapeHtml(exam.title) + "</h3><p>" + escapeHtml(exam.description || "") + "</p>" +
      '<div class="meta"><span><i class="bi bi-calendar-event" aria-hidden="true"></i> ' + formatExamTime(exam) + "</span>" +
      '<span><i class="bi bi-clock" aria-hidden="true"></i> ' + exam.duration + " min</span>" +
      '<span><i class="bi bi-list-ol" aria-hidden="true"></i> ' + plural(exam.questions.length, "question") + "</span>" +
      '<span><i class="bi bi-plus-slash-minus" aria-hidden="true"></i> +' + exam.correctMarks + " / -" + exam.negativeMarks + "</span></div></div>" +
      (!ready ? '<button class="btn btn-outline" disabled>No questions yet</button>'
        : notOpen ? '<button class="btn btn-outline" disabled><i class="bi bi-hourglass-split" aria-hidden="true"></i> Opens at ' + formatTime(exam.startTime) + "</button>"
        : '<a class="btn btn-primary" href="exam.html?id=' + encodeURIComponent(exam.id) + '">' + (resuming ? "Resume exam" : "Start exam") + ' <i class="bi bi-arrow-right" aria-hidden="true"></i></a>'
      ) +
      "</article>";
  }).join("");
}

function renderUpcoming(upcoming) {
  const body = document.getElementById("upcomingBody");
  if (!upcoming.length) {
    body.innerHTML = '<tr class="table-empty"><td colspan="4">Nothing scheduled yet.</td></tr>';
    return;
  }
  body.innerHTML = upcoming.map(function (exam) {
    return '<tr><td class="cell-main"><strong>' + escapeHtml(exam.title) + "</strong><small>" + escapeHtml(exam.id) + "</small></td>" +
      '<td data-label="Date &amp; time">' + formatDate(exam.date) + (exam.startTime ? "<small>" + formatExamTime(exam, false) + "</small>" : "") + "</td>" +
      '<td data-label="Duration">' + exam.duration + " min</td>" +
      '<td data-label="Questions" class="num">' + exam.questions.length + "</td></tr>";
  }).join("");
}

function renderRecent(results, passMark) {
  const box = document.getElementById("recentResults");
  if (!results.length) {
    box.innerHTML = '<div class="empty"><i class="bi bi-journal" aria-hidden="true"></i>You have not attempted any exam yet.</div>';
    return;
  }
  box.innerHTML = results.slice(0, 5).map(function (r) {
    const pass = r.percentage >= passMark;
    return '<a class="list-item" href="result.html?id=' + r.id + '">' +
      '<span class="list-icon">' + escapeHtml(r.examId.split("-")[0]) + "</span>" +
      "<div><strong>" + escapeHtml(r.examTitle) + "</strong><small>" + formatDate(r.date) + " &middot; " + r.score + " / " + r.total + "</small></div>" +
      (r.status === "pending" ? '<span class="badge badge-review">Pending</span>' : '<span class="score-pill ' + (pass ? "pass" : "fail") + '">' + r.percentage + "%</span>") + "</a>";
  }).join("");
}

function renderAnnouncements(list) {
  const box = document.getElementById("announcements");
  if (!list.length) {
    box.innerHTML = '<div class="empty"><i class="bi bi-megaphone" aria-hidden="true"></i>No announcements.</div>';
    return;
  }
  box.innerHTML = list.map(function (a) {
    return '<article class="announcement"><div class="announcement-head"><h3>' + escapeHtml(a.title) + "</h3>" +
      (a.priority === "high" ? '<span class="badge badge-high">Important</span>' : "") + "</div>" +
      "<p>" + escapeHtml(a.message) + "</p><small>" + timeAgo(a.createdAt) + "</small></article>";
  }).join("");
}

function renderProgress(results, passMark) {
  const box = document.getElementById("progressChart");
  if (!results.length) {
    box.innerHTML = '<div class="empty"><i class="bi bi-graph-up" aria-hidden="true"></i>Your scores will appear here.</div>';
    return;
  }
  box.innerHTML = results.slice(0, 6).map(function (r) {
    return '<div class="chart-row"><span title="' + escapeHtml(r.examTitle) + '">' + escapeHtml(r.examId) + "</span>" +
      '<div class="chart-track"><div class="chart-fill ' + (r.percentage >= passMark ? "correct" : "wrong") + '" style="width:' + r.percentage + '%"></div></div>' +
      "<strong>" + r.percentage + "%</strong></div>";
  }).join("") + '<p class="muted small">Pass mark: ' + passMark + "%</p>";
}
