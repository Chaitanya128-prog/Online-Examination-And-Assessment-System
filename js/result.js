"use strict";

/* =========================================================
   Result page - score, rank, class average, remarks, answer review
   Owner: Devang Kumar (Student module)
   json-server: /results
   ========================================================= */

const LETTERS = ["A", "B", "C", "D"];
let reviewFilter = "all";
let currentResult = null;

(async function () {
  const user = await requireRole("student");
  renderAppHeader(user, "results");
  renderFooter();

  const [settings, myResults] = await Promise.all([
    getSettings(),
    api.get("/results", { userId: user.id, _sort: "submittedAt", _order: "desc" })
  ]);

  if (!myResults.length) {
    document.getElementById("emptyBox").hidden = false;
    return;
  }
  document.getElementById("resultBox").hidden = false;

  const params = new URLSearchParams(location.search);
  const wanted = Number(params.get("id"));
  if (params.get("new")) toast("Your exam was submitted successfully.", "success");

  const select = document.getElementById("resultSelect");
  select.innerHTML = myResults.map(function (r) {
    return '<option value="' + r.id + '">' + escapeHtml(r.examTitle) + " · " + formatDate(r.date) + "</option>";
  }).join("");
  select.addEventListener("change", function () {
    const result = myResults.find(function (r) { return r.id === Number(select.value); });
    history.replaceState(null, "", "result.html?id=" + result.id);
    showResult(user, result, settings).catch(handlePageError);
  });

  document.getElementById("reviewFilter").addEventListener("click", function (event) {
    const chip = event.target.closest("[data-filter]");
    if (!chip) return;
    reviewFilter = chip.getAttribute("data-filter");
    document.querySelectorAll("#reviewFilter .chip").forEach(function (c) { c.classList.toggle("active", c === chip); });
    renderReview();
  });

  const result = myResults.find(function (r) { return r.id === wanted; }) || myResults[0];
  select.value = String(result.id);
  await showResult(user, result, settings);
})().catch(handlePageError);

async function showResult(user, result, settings) {
  currentResult = result;
  const pending = result.status === "pending";
  const pass = result.percentage >= settings.passMark;

  document.getElementById("examCode").textContent = result.examId;
  document.getElementById("examLine").textContent = result.examTitle + ", submitted " + formatDateTime(result.submittedAt);
  document.getElementById("studentLine").textContent = user.name + " (" + user.id + ")";
  document.getElementById("heroText").textContent = pending
    ? "Your MCQs are already checked. " + plural(result.pendingCount, "written answer") + " still need to be marked by your examiner, so this score is provisional."
    : pass
      ? "Well done! You cleared the " + settings.passMark + "% pass mark."
      : "You needed " + settings.passMark + "% to pass. Review the answers below to see where marks were lost.";
  document.getElementById("percentText").textContent = result.percentage + "%";
  const ring = document.getElementById("ring");
  ring.style.setProperty("--value", result.percentage);
  ring.classList.toggle("fail", !pending && !pass);
  const tag = document.getElementById("statusTag");
  tag.textContent = pending ? "Pending review" : pass ? "Passed" : "Failed";
  tag.className = "badge " + (pending ? "badge-review" : pass ? "badge-passed" : "badge-failed");

  document.getElementById("remarksCard").hidden = !result.remarks;
  if (result.remarks) {
    document.getElementById("remarksText").textContent = result.remarks;
    document.getElementById("remarksBy").textContent = (result.remarksBy || "Examiner") + (result.remarksAt ? " · " + formatDateTime(result.remarksAt) : "");
  }

  document.getElementById("scoreText").textContent = result.score;
  document.getElementById("totalText").textContent = "out of " + result.total;
  document.getElementById("correctText").textContent = result.correct;
  document.getElementById("wrongText").textContent = result.wrong;
  document.getElementById("skippedText").textContent = result.unattempted;

  // Class average and rank for the same exam (json-server filter by examId)
  const classResults = await api.get("/results", { examId: result.examId, _sort: "percentage", _order: "desc" });
  document.getElementById("classAvg").textContent = averagePercentage(classResults) + "%";
  const rank = classResults.findIndex(function (r) { return r.id === result.id; }) + 1;
  document.getElementById("rankText").textContent = "Your rank " + rank + " of " + classResults.length;

  renderChart(result);
  renderDetails(result);
  renderReview();
}

function renderChart(result) {
  const counts = { correct: 0, wrong: 0, skipped: 0, pending: 0 };
  if (result.answers && result.answers.length) {
    result.answers.forEach(function (a) { counts[answerKind(a)]++; });
  } else {
    counts.correct = result.correct; counts.wrong = result.wrong; counts.skipped = result.unattempted;
  }
  const rows = [["Correct", counts.correct, "correct"], ["Wrong", counts.wrong, "wrong"], ["Skipped", counts.skipped, "skipped"]];
  if (counts.pending) rows.push(["Pending", counts.pending, "brand"]);
  const total = Math.max(1, counts.correct + counts.wrong + counts.skipped + counts.pending);
  document.getElementById("resultChart").innerHTML = rows.map(function (row) {
    return '<div class="chart-row"><span>' + row[0] + '</span><div class="chart-track"><div class="chart-fill ' + row[2] +
      '" style="width:' + (row[1] / total * 100) + '%"></div></div><strong>' + row[1] + "</strong></div>";
  }).join("");
}

function renderDetails(result) {
  const items = [["Exam code", escapeHtml(result.examId)], ["Submitted", formatDateTime(result.submittedAt)]];
  if (result.startedAt) {
    const minutes = Math.max(1, Math.round((new Date(result.submittedAt) - new Date(result.startedAt)) / 60000));
    items.push(["Time taken", plural(minutes, "minute")]);
  }
  items.push(["Marking", "+" + (result.correctMarks || 2) + " / -" + (result.negativeMarks || 0.5)]);
  if (result.textScore !== undefined) items.push(["MCQ / written marks", result.mcqScore + " / " + result.textScore]);
  items.push(["Tab-switch warnings", String(result.violations || 0)]);
  items.push(["Submitted by", result.autoSubmitted ? "System (auto)" : "You"]);
  if (result.gradedBy) items.push(["Marked by", escapeHtml(result.gradedBy)]);
  document.getElementById("attemptDetails").innerHTML = items.map(function (item) {
    return "<div><span>" + item[0] + "</span><strong>" + item[1] + "</strong></div>";
  }).join("");
}

function renderReview() {
  const result = currentResult;
  const list = document.getElementById("reviewList");
  const answers = result.answers || [];
  if (!answers.length) {
    document.getElementById("reviewSummary").textContent = result.score + " / " + result.total + " marks";
    list.innerHTML = '<div class="empty"><i class="bi bi-file-earmark-lock" aria-hidden="true"></i>The question-wise answer key is not available for this older exam.</div>';
    return;
  }
  document.getElementById("reviewSummary").textContent = plural(answers.length, "question") + " · " + result.score + " / " + result.total + " marks";

  const rows = answers.map(function (a, i) {
    return { a: a, i: i, kind: answerKind(a) };
  }).filter(function (row) {
    if (reviewFilter === "written") return row.a.type === "text";
    return reviewFilter === "all" || row.kind === reviewFilter;
  });

  if (!rows.length) {
    list.innerHTML = '<div class="empty">No questions in this group.</div>';
    return;
  }
  // Model answers are shown only after the paper is fully marked
  list.innerHTML = rows.map(function (row) {
    return answerReviewHtml(row.a, row.i, result, result.status !== "pending");
  }).join("");
}
