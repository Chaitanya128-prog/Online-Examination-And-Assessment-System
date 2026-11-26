"use strict";

/* =========================================================
   Examiner portal - page start, tabs and Overview
   (tab code: examiner-exams.js, examiner-grading.js, notices.js)
   Owner: Chaitanya Pandey
   json-server: /exams, /results, /attempts, /announcements
   ========================================================= */

let me = null;
let settings = null;

(async function () {
  me = await requireRole("examiner");
  settings = await getSettings();
  renderAppHeader(me, "overview");
  renderFooter();

  document.getElementById("welcomeDate").textContent = todayText();
  document.getElementById("welcomeName").textContent = "Hello, " + me.name.split(" ")[0];
  document.querySelectorAll("[data-new-exam]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (location.hash !== "#exams") location.hash = "exams";
      openExamDialog(null).catch(handlePageError);
    });
  });

  bindExams();
  bindQuestions();
  bindGrading();
  setupNotices(me);

  setupTabs({
    overview: loadOverview,
    exams: loadExams,
    grading: loadGrading,
    results: loadResults,
    notices: loadNotices
  }, "Examiner");
})().catch(handlePageError);

// Codes of the exams this examiner created (used to scope results)
async function myExamIds() {
  const exams = await api.get("/exams", { createdBy: me.id });
  return exams.map(function (e) { return e.id; });
}

async function loadOverview() {
  const exams = await api.get("/exams", { createdBy: me.id, _embed: ["results", "attempts"], _sort: "date", _order: "desc" });
  const results = [].concat.apply([], exams.map(function (e) { return e.results; }));
  const pending = results.filter(function (r) { return r.status === "pending"; }).length;
  const live = exams.filter(function (e) { return e.status === "live"; });
  const writing = [].concat.apply([], live.map(function (e) { return e.attempts; })).length;

  document.getElementById("statExams").textContent = exams.length;
  document.getElementById("statDraft").textContent = exams.filter(function (e) { return e.status === "draft"; }).length + " in draft";
  document.getElementById("statLive").textContent = live.length;
  document.getElementById("statWriting").textContent = writing + " writing now";
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statAverage").textContent = averagePercentage(results) + "%";
  document.getElementById("statSubmissions").textContent = plural(results.length, "submission");

  document.getElementById("welcomeText").textContent = pending
    ? plural(pending, "paper") + " with written answers " + (pending === 1 ? "is" : "are") + " waiting for your marks."
    : live.length ? live[0].id + " is live with " + writing + " students writing." : "Everything is marked. Create your next exam when you are ready.";

  const withResults = exams.filter(function (e) { return e.results.length; });
  document.getElementById("examChart").innerHTML = withResults.length ? withResults.map(function (e) {
    const avg = averagePercentage(e.results);
    return '<div class="chart-row"><span title="' + escapeHtml(e.title) + '">' + escapeHtml(e.id) + '</span><div class="chart-track"><div class="chart-fill ' +
      (avg >= settings.passMark ? "brand" : "wrong") + '" style="width:' + avg + '%"></div></div><strong>' + avg + "%</strong></div>";
  }).join("") : '<div class="empty">No submissions yet.</div>';

  document.getElementById("approvalList").innerHTML = exams.map(function (e) {
    return '<div class="list-item"><span class="list-icon">' + escapeHtml(e.id.split("-")[0]) + "</span><div><strong>" + escapeHtml(e.title) +
      "</strong><small>" + escapeHtml(e.id) + " &middot; " + (STATUS_LABELS[e.status] || e.status) +
      (e.approval === "rejected" && e.approvalNote ? " &middot; " + escapeHtml(e.approvalNote) : "") + "</small></div>" + approvalBadge(e.approval) + "</div>";
  }).join("") || '<div class="empty">You have not created any exams yet.</div>';
}
