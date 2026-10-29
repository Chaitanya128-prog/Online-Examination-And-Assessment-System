"use strict";

const user = checkLogin("student");

let showAll = false;
let rowsHtml = [];

if (user !== null) {
  document.getElementById("userName").textContent = user.name;
  document.getElementById("userAvatar").textContent = getInitials(user.name);

  document.getElementById("logoutBtn").addEventListener("click", function (event) {
    event.preventDefault();
    logout();
  });

  document.getElementById("moreLink").addEventListener("click", function (event) {
    event.preventDefault();
    showAll = !showAll;
    showRows();
  });

  loadData()
    .then(function (data) {
      showResult(data);
    })
    .catch(function (error) {
      console.log(error);
      alert("Could not load data.json. Please open the project with Live Server.");
    });
}

function showResult(data) {
  const exams = getAllExams(data);
  const myResults = getAllResults(data).filter(function (r) {
    return r.student === user.roll;
  });

  if (myResults.length === 0) {
    document.getElementById("resultBox").style.display = "none";
    document.getElementById("emptyBox").style.display = "block";
    return;
  }

  const select = document.getElementById("resultExamSelect");
  select.innerHTML = myResults.map((r, i) => '<option value="' + i + '">' + escapeHtml(r.examTitle || r.exam) + ' · ' + escapeHtml(r.date || '') + '</option>').join("");
  select.onchange = function () { localStorage.setItem("resultExamId", myResults[Number(select.value)].exam); showResult(data); };
  const wantedId = localStorage.getItem("resultExamId");
  let result = null;

  for (let i = 0; i < myResults.length; i++) {
    if (myResults[i].exam === wantedId) {
      result = myResults[i];
    }
  }

  if (result === null) {
    result = myResults[myResults.length - 1];
  }

  select.value = String(myResults.indexOf(result));
  let exam = null;
  for (let i = 0; i < exams.length; i++) {
    if (exams[i].id === result.exam) {
      exam = exams[i];
    }
  }

  document.getElementById("examCode").textContent = result.exam;
  document.getElementById("examLine").textContent =
    result.examTitle + ", attempted on " + formatDate(result.date);
  document.getElementById("studentLine").textContent = user.name + " (" + user.roll + ")";
  document.getElementById("percentText").textContent = result.percentage + "%";
  document.getElementById("percentText2").textContent = result.percentage + "%";
  document.getElementById("scoreText").textContent = result.score;
  document.getElementById("totalText").textContent = "out of " + result.total;
  document.getElementById("correctText").textContent = result.correct;
  document.getElementById("wrongText").textContent = result.wrong;
  document.getElementById("skippedText").textContent = result.unattempted;

  const tag = document.getElementById("statusTag");
  if (result.percentage >= 40) {
    tag.textContent = "Passed";
    tag.className = "tag passed";
  } else {
    tag.textContent = "Failed";
    tag.className = "tag failed";
  }

  renderResultChart(result);
  buildReview(result, exam);
}

function buildReview(result, exam) {
  const summary = document.getElementById("reviewSummary");

  if (exam === null || exam.questions.length === 0 || result.answers === undefined) {
    summary.textContent = result.score + " / " + result.total;
    document.getElementById("reviewList").innerHTML =
      '<div class="empty-result">Question-wise answer key is not available for this exam.</div>';
    document.getElementById("moreLink").style.display = "none";
    return;
  }

  summary.textContent = exam.questions.length + " questions, " + result.score + " / " + result.total;
  rowsHtml = [];

  for (let i = 0; i < exam.questions.length; i++) {
    const q = exam.questions[i];
    let chosen = null;

    for (let j = 0; j < result.answers.length; j++) {
      if (result.answers[j].id === q.id) {
        chosen = result.answers[j].chosen;
      }
    }

    let rowClass = "";
    let detail = "";
    let marks = "";
    let sign = "";

    if (chosen === null) {
      rowClass = "skipped";
      detail = "Not attempted. Correct answer: " + q.correctAnswer;
      marks = "0";
      sign = "-";
    } else if (chosen === q.correctAnswer) {
      rowClass = "correct";
      detail = "Your answer: " + chosen;
      marks = "+" + exam.correctMarks;
      sign = "R";
    } else {
      rowClass = "wrong";
      detail = "Your answer: " + chosen + ". Correct answer: " + q.correctAnswer;
      marks = "-" + exam.negativeMarks;
      sign = "W";
    }

    rowsHtml.push(
      '<article class="review-row ' + rowClass + '"><div class="review-num">' + (i + 1) + "</div>" +
      "<div><strong>" + escapeHtml(q.question) + "</strong><small>" + escapeHtml(detail) + "</small></div>" +
      "<span>" + marks + "</span><b>" + sign + "</b></article>"
    );
  }

  showRows();
}

function showRows() {
  let count = rowsHtml.length;
  if (!showAll && count > 5) {
    count = 5;
  }

  let html = "";
  for (let i = 0; i < count; i++) {
    html += rowsHtml[i];
  }
  document.getElementById("reviewList").innerHTML = html;

  const link = document.getElementById("moreLink");
  if (rowsHtml.length <= 5) {
    link.style.display = "none";
  } else if (showAll) {
    link.textContent = "Show less";
  } else {
    link.textContent = "Show all " + rowsHtml.length + " questions";
  }
}

function renderResultChart(result) {
  const values = [Number(result.correct)||0, Number(result.wrong)||0, Number(result.unattempted)||0];
  const total = Math.max(1, values.reduce((a,b)=>a+b,0));
  const labels = ["Correct", "Incorrect", "Unanswered"];
  const root = document.getElementById("resultChart");
  if (!root) return;
  root.replaceChildren();
  values.forEach((value, index) => {
    const row = document.createElement("div"); row.className = "chart-row";
    const label = document.createElement("span"); label.textContent = labels[index];
    const track = document.createElement("div"); track.className = "chart-track";
    const bar = document.createElement("div"); bar.className = "chart-fill chart-" + index;
    bar.style.width = (100 * value / total) + "%";
    track.appendChild(bar);
    const count = document.createElement("strong"); count.textContent = value;
    row.append(label, track, count); root.appendChild(row);
  });
}
