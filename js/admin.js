"use strict";

/* =========================================================
   Admin panel - page start, tabs, Overview and audit log
   (tab code: admin-exams.js, admin-users.js, admin-settings.js, notices.js)
   Owner: Dev Singh Chauhan
   json-server: /users, /exams, /results, /violations, /incidents, /activity
   ========================================================= */

let me = null;
let settings = null;
const activityView = { page: 1 };

(async function () {
  me = await requireRole("admin");
  settings = await getSettings();
  renderAppHeader(me, "overview");
  renderFooter();

  document.getElementById("welcomeDate").textContent = todayText();
  document.getElementById("welcomeName").textContent = "Hello, " + me.name.split(" ")[0];
  document.getElementById("activityRole").addEventListener("change", function () {
    activityView.page = 1;
    loadActivity().catch(handlePageError);
  });

  bindAdminExams();
  bindUsers();
  bindSettings();
  setupNotices(me);

  setupTabs({
    overview: loadOverview,
    approvals: loadApprovals,
    staff: loadStaff,
    students: loadStudents,
    notices: loadNotices,
    settings: loadSettings
  }, "Admin");
})().catch(handlePageError);

async function loadOverview() {
  const [users, exams, results, violations, incidents] = await Promise.all([
    api.get("/users"),
    api.get("/exams", { _embed: "results" }),
    api.get("/results"),
    api.page("/violations", { _limit: 1 }),
    api.page("/incidents", { _limit: 1 })
  ]);
  const students = users.filter(function (u) { return u.role === "student"; });
  const staff = users.filter(function (u) { return u.role !== "student"; });
  const count = function (list, role) { return list.filter(function (u) { return u.role === role; }).length; };
  const pendingPapers = exams.filter(function (e) { return e.approval === "pending"; }).length;
  const live = exams.filter(function (e) { return e.status === "live"; }).length;
  const graded = results.filter(function (r) { return r.status !== "pending"; });
  const passed = graded.filter(function (r) { return r.percentage >= settings.passMark; }).length;

  document.getElementById("statStudents").textContent = students.length;
  document.getElementById("statBlocked").textContent = students.filter(function (s) { return s.status === "blocked"; }).length + " blocked";
  document.getElementById("statStaff").textContent = staff.length;
  document.getElementById("statStaffSplit").textContent = plural(count(staff, "examiner"), "examiner") + " · " + plural(count(staff, "invigilator"), "invigilator");
  document.getElementById("statApprovals").textContent = pendingPapers;
  document.getElementById("statLive").textContent = live + " live now";
  document.getElementById("statViolations").textContent = violations.total;
  document.getElementById("statIncidents").textContent = plural(incidents.total, "incident") + " reported";

  document.getElementById("welcomeText").textContent = pendingPapers
    ? plural(pendingPapers, "exam paper") + " " + (pendingPapers === 1 ? "is" : "are") + " waiting for your approval."
    : "No papers are waiting for approval. " + live + " exam" + (live === 1 ? " is" : "s are") + " live.";

  const withResults = exams.filter(function (e) { return e.results.length; });
  document.getElementById("examChart").innerHTML = withResults.length ? withResults.map(function (e) {
    const avg = averagePercentage(e.results);
    return '<div class="chart-row"><span title="' + escapeHtml(e.title) + '">' + escapeHtml(e.id) + '</span><div class="chart-track"><div class="chart-fill ' +
      (avg >= settings.passMark ? "brand" : "wrong") + '" style="width:' + avg + '%"></div></div><strong>' + avg + "%</strong></div>";
  }).join("") : '<div class="empty">No submissions yet.</div>';

  document.getElementById("summaryList").innerHTML =
    "<div><span>Total exams</span><strong>" + exams.length + "</strong></div>" +
    "<div><span>Submissions</span><strong>" + results.length + "</strong></div>" +
    "<div><span>Awaiting grading</span><strong>" + (results.length - graded.length) + "</strong></div>" +
    "<div><span>Pass rate</span><strong>" + (graded.length ? Math.round(passed / graded.length * 100) : 0) + "%</strong></div>" +
    "<div><span>Average score</span><strong>" + averagePercentage(graded) + "%</strong></div>";

  await loadActivity();
}

async function loadActivity() {
  const icons = { auth: "bi-box-arrow-in-right", exam: "bi-journal-text", result: "bi-check2-circle", user: "bi-person", settings: "bi-sliders", notice: "bi-megaphone", proctor: "bi-shield-exclamation" };
  const { items, total } = await api.page("/activity", {
    role: document.getElementById("activityRole").value,
    _sort: "createdAt", _order: "desc", _page: activityView.page, _limit: 8
  });
  document.getElementById("activityFeed").innerHTML = items.map(function (a) {
    return '<div class="activity-item"><i class="bi ' + (icons[a.type] || "bi-dot") + '" aria-hidden="true"></i><div><strong style="display:inline">' +
      escapeHtml(a.userName) + '</strong> <span class="badge badge-' + escapeHtml(a.role || "student") + '">' + escapeHtml(ROLE_LABELS[a.role] || a.role || "") + "</span> " +
      escapeHtml(a.message) + "<small>" + timeAgo(a.createdAt) + "</small></div></div>";
  }).join("") || '<div class="empty">No activity yet.</div>';
  renderPagination(document.getElementById("activityPager"), activityView.page, 8, total, function (page) {
    activityView.page = page;
    loadActivity().catch(handlePageError);
  });
}
