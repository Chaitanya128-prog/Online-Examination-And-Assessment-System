"use strict";

/* =========================================================
   Landing page (index.html) - feature tabs and live counts from the API
   Owner: Dev Sharma (Invigilator module + landing page)
   json-server: /exams, /questions, /users, /settings
   ========================================================= */

document.getElementById("themeToggle").addEventListener("click", function () { toggleTheme(null); });
applyTheme(document.documentElement.getAttribute("data-theme"));
document.getElementById("footerYear").textContent = new Date().getFullYear();

const FEATURES = [
  { icon: "bi-laptop", caption: "Timed exams that work on any device.", items: [
    ["bi-ui-checks", "MCQ questions", "Checked automatically the moment the student submits."],
    ["bi-textarea-t", "Written answers", "A text box for descriptive answers, marked by the teacher."],
    ["bi-cloud-check", "Auto-save and resume", "Every answer is saved as you go. Refresh and continue."]
  ] },
  { icon: "bi-shield-check", caption: "Every tab switch is recorded and shown live.", items: [
    ["bi-window-stack", "Tab-switch detection", "Leaving the tab, Alt+Tab and exiting full screen are all caught."],
    ["bi-exclamation-octagon", "Warnings and auto-submit", "After the limit set by the admin the exam submits itself."],
    ["bi-display", "Live invigilation", "Invigilators see progress, time left and alerts for every student."]
  ] },
  { icon: "bi-pencil-square", caption: "Fair marks, fast.", items: [
    ["bi-lightning-charge", "Instant MCQ score", "Positive and negative marking applied automatically."],
    ["bi-journal-check", "Grading queue", "Teachers mark written answers with a model answer beside them."],
    ["bi-chat-left-text", "Feedback", "Students see marks and comments for every written answer."]
  ] },
  { icon: "bi-sliders", caption: "The exam cell stays in charge.", items: [
    ["bi-patch-check", "Paper approval", "No exam goes live until the admin approves it."],
    ["bi-person-badge", "Staff management", "Add teachers and invigilators and assign their subjects."],
    ["bi-gear", "Rules in one place", "Pass mark, tab-switch limit, sessions and sign-up control."]
  ] }
];

function showFeature(index) {
  const feature = FEATURES[index];
  document.querySelectorAll("[data-feature]").forEach(function (button) {
    button.setAttribute("aria-selected", String(Number(button.getAttribute("data-feature")) === index));
  });
  document.getElementById("featureVisual").innerHTML = '<div><i class="bi ' + feature.icon + '" aria-hidden="true"></i><p>' + feature.caption + "</p></div>";
  document.getElementById("featureList").innerHTML = feature.items.map(function (item) {
    return '<div class="platform-item"><i class="bi ' + item[0] + '" aria-hidden="true"></i><div><h3>' + item[1] + "</h3><p>" + item[2] + "</p></div></div>";
  }).join("");
}

document.querySelectorAll("[data-feature]").forEach(function (button) {
  button.addEventListener("click", function () { showFeature(Number(button.getAttribute("data-feature"))); });
});
showFeature(0);

(async function () {
  // X-Total-Count gives each count without downloading the records
  const [exams, questions, students, settings, user] = await Promise.all([
    api.page("/exams", { status_ne: "draft", _limit: 1 }),
    api.page("/questions", { _limit: 1 }),
    api.page("/users", { role: "student", _limit: 1 }),
    getSettings(),
    getCurrentUser()
  ]);
  document.getElementById("statExams").textContent = exams.total;
  document.getElementById("statQuestions").textContent = questions.total;
  document.getElementById("statStudents").textContent = students.total;
  document.getElementById("instituteName").textContent = settings.instituteName;

  if (!settings.allowRegistration) document.getElementById("heroRegister").hidden = true;
  if (user) {
    const link = document.getElementById("navSignIn");
    link.textContent = "My portal";
    link.title = "Open the " + ROLE_LABELS[user.role].toLowerCase() + " portal";
    link.href = homeFor(user);
  }
})().catch(handlePageError);
