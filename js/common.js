"use strict";

/* =========================================================
   ExamDesk shared helpers: session, security, formatting, UI.
   Shared file - each section below is tagged with its owner.
   Needs js/api.js to be loaded first.
   ========================================================= */

const SESSION_KEY = "examdesk.session";   // only the session token lives in the browser
const THEME_KEY = "examdesk.theme";       // cached copy of the user's saved theme (avoids a flash)
const REMEMBER_KEY = "examdesk.rememberId";

applyTheme(localStorage.getItem(THEME_KEY) || "light");

/* ---------- Settings (singular json-server resource /settings) [Dev Singh Chauhan] ---------- */

let settingsPromise = null;
function getSettings(force) {
  if (!settingsPromise || force) settingsPromise = api.get("/settings");
  return settingsPromise;
}

/* ---------- Password hashing (SHA-256, salted with the user id) [Dev Singh Chauhan] ---------- */

async function hashPassword(userId, password) {
  const text = "examdesk:" + userId + ":" + password;
  if (window.crypto && crypto.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  return sha256Fallback(text); // e.g. when opened over a LAN IP (no secure context)
}

function sha256Fallback(ascii) {
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  const utf8 = unescape(encodeURIComponent(ascii));
  const k = [];
  const hash = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * 4294967296) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * 4294967296) | 0;
    }
  }
  let message = utf8 + "\x80";
  while (message.length % 64 - 56) message += "\x00";
  const words = [];
  for (let i = 0; i < message.length; i++) {
    words[i >> 2] |= message.charCodeAt(i) << ((3 - i) % 4) * 8;
  }
  const bitLength = utf8.length * 8;
  words[words.length] = (bitLength / 4294967296) | 0;
  words[words.length] = bitLength;
  let h = hash.slice(0, 8);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const old = h;
    h = h.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = h[0], e = h[4];
      const temp1 = h[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & h[5]) ^ (~e & h[6])) + k[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
      h = [(temp1 + temp2) | 0].concat(h);
      h[4] = (h[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) h[i] = (h[i] + old[i]) | 0;
  }
  return h.slice(0, 8).map(function (n) { return (n >>> 0).toString(16).padStart(8, "0"); }).join("");
}

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

/* ---------- Sessions (stored in json-server /sessions) [Dev Singh Chauhan] ---------- */

class RedirectSignal extends Error {
  constructor() { super("redirecting"); this.redirecting = true; }
}

async function createSession(user) {
  const settings = await getSettings();
  const now = Date.now();
  const session = await api.post("/sessions", {
    id: randomToken(),
    userId: user.id,
    role: user.role,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + settings.sessionHours * 3600000).toISOString(),
    userAgent: navigator.userAgent.slice(0, 120)
  });
  localStorage.setItem(SESSION_KEY, session.id);
  return session;
}

async function getCurrentUser() {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return null;
  const session = await api.find(idPath("sessions", token), { _expand: "user" });
  if (!session || !session.user) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    api.remove(idPath("sessions", token)).catch(function () {});
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  if (session.user.status === "blocked") {
    api.remove(idPath("sessions", token)).catch(function () {});
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  applyTheme(session.user.theme || "light");
  return session.user;
}

// Use at the top of a protected page. Redirects (and stops the page) if the role does not match.
async function requireRole(role) {
  const user = await getCurrentUser();
  if (!user) {
    location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search + location.hash));
    throw new RedirectSignal();
  }
  if (role && user.role !== role) {
    location.replace(homeFor(user));
    throw new RedirectSignal();
  }
  return user;
}

const ROLE_HOME = { student: "dashboard.html", examiner: "examiner.html", admin: "admin.html", invigilator: "invigilator.html" };
const ROLE_LABELS = { student: "Student", examiner: "Examiner", admin: "Admin", invigilator: "Invigilator" };

function homeFor(user) {
  return ROLE_HOME[user.role] || "dashboard.html";
}

async function redirectIfLoggedIn() {
  const user = await getCurrentUser();
  if (user) {
    location.replace(homeFor(user));
    throw new RedirectSignal();
  }
}

async function logout(user) {
  const token = localStorage.getItem(SESSION_KEY);
  if (user) await logActivity(user, "auth", "Logged out");
  if (token) await api.remove(idPath("sessions", token)).catch(function () {});
  localStorage.removeItem(SESSION_KEY);
  location.href = "login.html";
}

function logActivity(user, type, message) {
  return api.post("/activity", {
    userId: user.id,
    userName: user.name,
    role: user.role,
    type: type,
    message: message,
    createdAt: new Date().toISOString()
  }).catch(function () { /* activity logging must never break the page */ });
}

/* ---------- Formatting [Chaitanya Pandey] ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitials(name) {
  const words = String(name || "?").trim().split(/\s+/);
  let initials = words[0].charAt(0);
  if (words.length > 1) initials += words[words.length - 1].charAt(0);
  return initials.toUpperCase();
}

function formatDate(text) {
  if (!text) return "-";
  const parts = String(text).slice(0, 10).split("-");
  return Number(parts[2]) + " " + MONTHS[Number(parts[1]) - 1] + " " + parts[0];
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " +
    String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// "14:30" -> "2:30 PM"
function formatTime(hhmm) {
  if (!hhmm) return "";
  const parts = String(hhmm).split(":");
  const h = Number(parts[0]);
  return ((h + 11) % 12 + 1) + ":" + parts[1] + (h < 12 ? " AM" : " PM");
}

// When an exam opens, as a Date in local time (exam.date + exam.startTime)
function examStart(exam) {
  const p = String(exam.date).split("-").map(Number);
  const t = String(exam.startTime || "00:00").split(":").map(Number);
  return new Date(p[0], p[1] - 1, p[2], t[0], t[1]);
}

// "25 Nov 2026, 10:00 AM - 10:20 AM"  (just the date for exams without a start time)
function formatExamTime(exam, withDate) {
  const date = withDate === false ? "" : formatDate(exam.date);
  if (!exam.startTime) return date;
  const start = examStart(exam);
  const end = new Date(start.getTime() + exam.duration * 60000);
  const endText = formatTime(String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0"));
  return (date ? date + ", " : "") + formatTime(exam.startTime) + " - " + endText;
}

// true while a live exam is still waiting for its start time
function examNotOpenYet(exam) {
  return Boolean(exam.startTime) && Date.now() < examStart(exam).getTime();
}

function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + " h ago";
  const days = Math.round(hours / 24);
  if (days < 30) return days + " d ago";
  return formatDate(iso);
}

// Local date (not UTC) as YYYY-MM-DD
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function todayText() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function plural(count, word) {
  return count + " " + word + (count === 1 ? "" : "s");
}

function averagePercentage(list) {
  if (!list.length) return 0;
  return Math.round(list.reduce(function (sum, r) { return sum + Number(r.percentage || 0); }, 0) / list.length);
}

const STATUS_LABELS = { live: "Live", upcoming: "Upcoming", draft: "Draft", completed: "Completed" };

function statusBadge(status) {
  return '<span class="badge badge-' + escapeHtml(status) + '">' + escapeHtml(STATUS_LABELS[status] || status) + "</span>";
}

function resultBadge(percentage, passMark, status) {
  if (status === "pending") return '<span class="badge badge-review">Pending review</span>';
  return percentage >= passMark
    ? '<span class="badge badge-passed">Passed</span>'
    : '<span class="badge badge-failed">Failed</span>';
}

const APPROVAL_LABELS = { none: "Not submitted", pending: "Awaiting approval", approved: "Approved", rejected: "Changes requested" };

function approvalBadge(approval) {
  const cls = { none: "draft", pending: "review", approved: "active", rejected: "failed" }[approval || "none"];
  return '<span class="badge badge-' + cls + '">' + APPROVAL_LABELS[approval || "none"] + "</span>";
}

/* ---------- Scoring: MCQ auto-check + written answers [Devang Kumar] ---------- */

// answers: [{ type: "mcq", chosen, correctIndex } | { type: "text", answerText, maxMarks, awarded }]
// A written answer with awarded === null is still waiting for the examiner.
function scoreAnswers(answers, correctMarks, negativeMarks) {
  const t = { correct: 0, wrong: 0, unattempted: 0, mcqScore: 0, textScore: 0, total: 0, pendingCount: 0 };
  answers.forEach(function (a) {
    if (a.type === "text") {
      t.total += Number(a.maxMarks) || 0;
      if (!a.answerText || !String(a.answerText).trim()) { t.unattempted++; a.awarded = 0; }
      if (a.awarded === null || a.awarded === undefined) t.pendingCount++;
      else t.textScore += Number(a.awarded);
    } else {
      t.total += correctMarks;
      if (a.chosen === null || a.chosen === undefined) t.unattempted++;
      else if (a.chosen === a.correctIndex) { t.correct++; t.mcqScore += correctMarks; }
      else { t.wrong++; t.mcqScore -= negativeMarks; }
    }
  });
  t.score = Math.max(0, Math.round((t.mcqScore + t.textScore) * 100) / 100);
  t.percentage = t.total ? Math.round(t.score / t.total * 100) : 0;
  t.status = t.pendingCount ? "pending" : "graded";
  return t;
}

// "correct" | "wrong" | "skipped" | "pending" for one saved answer
function answerKind(a) {
  if (a.type === "text") {
    if (!a.answerText) return "skipped";
    if (a.awarded === null || a.awarded === undefined) return "pending";
    return a.awarded >= a.maxMarks / 2 ? "correct" : "wrong";
  }
  if (a.chosen === null || a.chosen === undefined) return "skipped";
  return a.chosen === a.correctIndex ? "correct" : "wrong";
}

// Review row for one answer - used by the student result page and staff result dialogs
function answerReviewHtml(a, index, result, showModel) {
  const kind = answerKind(a);
  let body = "";
  let marks = "";
  if (a.type === "text") {
    body = '<span class="qtype text">Written &middot; ' + a.maxMarks + " marks</span>" +
      (a.answerText ? '<div class="written-answer">' + escapeHtml(a.answerText) + "</div>" : '<small class="muted">Not attempted</small>') +
      (showModel && a.modelAnswer ? '<div class="model-answer"><strong>Model answer:</strong> ' + escapeHtml(a.modelAnswer) + "</div>" : "") +
      (a.feedback ? '<p class="feedback-note"><i class="bi bi-chat-left-quote" aria-hidden="true"></i> ' + escapeHtml(a.feedback) + "</p>" : "");
    marks = kind === "pending" ? '<span class="badge badge-review">Pending</span>' : (a.awarded || 0) + " / " + a.maxMarks;
  } else {
    const letters = ["A", "B", "C", "D"];
    body = '<div class="review-options">' + a.options.map(function (option, i) {
      let cls = "review-opt";
      let icon = "";
      if (i === a.correctIndex) { cls += " is-correct"; icon = ' <i class="bi bi-check-circle-fill" aria-label="correct answer"></i>'; }
      else if (i === a.chosen) { cls += " is-wrong"; icon = ' <i class="bi bi-x-circle-fill" aria-label="chosen answer"></i>'; }
      return '<div class="' + cls + '"><b>' + letters[i] + "</b> " + escapeHtml(option) + icon + "</div>";
    }).join("") + "</div>" + (kind === "skipped" ? '<small class="muted">Not attempted</small>' : "");
    marks = kind === "correct" ? "+" + result.correctMarks : kind === "wrong" ? "-" + result.negativeMarks : "0";
  }
  return '<article class="review-row ' + kind + '"><div class="review-num">' + (index + 1) + "</div>" +
    "<div><strong>" + escapeHtml(a.text) + "</strong>" + body + "</div>" +
    '<span class="review-marks">' + marks + "</span></article>";
}

/* ---------- Staff console helpers (tables, row buttons) [Chaitanya Pandey] ---------- */

const PAGE_SIZE = 8;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function iconButton(action, id, icon, label, extraClass) {
  return '<button type="button" class="icon-btn sm' + (extraClass ? " " + extraClass : "") + '" data-action="' + action +
    '" data-id="' + escapeHtml(id) + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"><i class="bi ' + icon + '" aria-hidden="true"></i></button>';
}

// Event delegation: one listener per table body, handlers keyed by data-action
function onRowAction(containerId, handlers) {
  document.getElementById(containerId).addEventListener("click", function (event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const handler = handlers[button.getAttribute("data-action")];
    if (handler) Promise.resolve(handler(button.getAttribute("data-id"), button)).catch(handlePageError);
  });
}

function userCell(name, sub) {
  return '<div class="cell-user"><span class="avatar">' + escapeHtml(getInitials(name)) + "</span><div><strong>" +
    escapeHtml(name) + "</strong><small>" + escapeHtml(sub || "") + "</small></div></div>";
}

function downloadCsv(filename, rows) {
  const lines = rows.map(function (cols) {
    return cols.map(function (c) { return '"' + String(c === undefined || c === null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
  });
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}

async function endSessionsFor(userId) {
  const sessions = await api.get("/sessions", { userId: userId });
  await Promise.all(sessions.map(function (s) { return api.remove(idPath("sessions", s.id)); }));
}

/* ---------- Page tabs (hash based, used by examiner/admin/invigilator) [Chaitanya Pandey] ---------- */

// loaders: { tabName: async function }  - the matching <section data-tab="tabName"> is shown
function setupTabs(loaders, titleSuffix) {
  const tabs = Object.keys(loaders);
  function show() {
    let tab = location.hash.slice(1);
    if (tabs.indexOf(tab) === -1) tab = tabs[0];
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-tab") !== tab;
    });
    document.querySelectorAll("dialog[open]").forEach(function (d) { d.close(); });
    setActiveNav(tab);
    document.title = tab.charAt(0).toUpperCase() + tab.slice(1) + " | " + titleSuffix + " | ExamDesk";
    Promise.resolve(loaders[tab]()).catch(handlePageError);
  }
  window.addEventListener("hashchange", show);
  show();
}

function debounce(fn, wait) {
  let timer = null;
  return function () {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(null, args); }, wait);
  };
}

/* ---------- Theme [Dev Singh Chauhan] ---------- */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  localStorage.setItem(THEME_KEY, theme === "dark" ? "dark" : "light");
  const icon = document.querySelector("#themeToggle i");
  if (icon) icon.className = theme === "dark" ? "bi bi-sun" : "bi bi-moon-stars";
}

async function toggleTheme(user) {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  if (user) {
    user.theme = next;
    await api.patch(idPath("users", user.id), { theme: next }).catch(function () {});
  }
}

/* ---------- Toasts [Chaitanya Pandey] ---------- */

function toast(message, type) {
  let region = document.getElementById("toastRegion");
  if (!region) {
    region = document.createElement("div");
    region.id = "toastRegion";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  const icons = { success: "bi-check-circle-fill", error: "bi-exclamation-octagon-fill", info: "bi-info-circle-fill" };
  const item = document.createElement("div");
  item.className = "toast toast-" + (type || "info");
  item.innerHTML = '<i class="bi ' + (icons[type] || icons.info) + '" aria-hidden="true"></i><span></span>';
  item.querySelector("span").textContent = message;
  region.appendChild(item);
  setTimeout(function () { item.classList.add("hide"); }, 4000);
  setTimeout(function () { item.remove(); }, 4400);
}

function handlePageError(error) {
  if (error && error.redirecting) return;
  console.error(error);
  toast((error && error.message) || "Something went wrong.", "error");
}

/* ---------- Dialogs [Chaitanya Pandey] ---------- */

function openModal(dialog) {
  if (typeof dialog === "string") dialog = document.getElementById(dialog);
  const error = dialog.querySelector(".form-alert");
  if (error) setAlert(error, "");
  dialog.showModal();
  const first = dialog.querySelector("input:not([type=hidden]):not([readonly]), select, textarea");
  if (first) first.focus();
  return dialog;
}

function closeModal(dialog) {
  if (typeof dialog === "string") dialog = document.getElementById(dialog);
  dialog.close();
}

// Close buttons and backdrop clicks for every <dialog class="modal">
document.addEventListener("click", function (event) {
  const closer = event.target.closest("[data-close]");
  if (closer) {
    closer.closest("dialog").close();
    return;
  }
  if (event.target.tagName === "DIALOG" && event.target.classList.contains("modal")) {
    const rect = event.target.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) event.target.close();
  }
});

function confirmDialog(options) {
  return new Promise(function (resolve) {
    const dialog = document.createElement("dialog");
    dialog.className = "modal modal-sm";
    dialog.innerHTML =
      '<div class="modal-body confirm-body">' +
      '<div class="confirm-icon ' + (options.danger ? "danger" : "") + '"><i class="bi ' +
      (options.danger ? "bi-exclamation-triangle" : "bi-question-circle") + '" aria-hidden="true"></i></div>' +
      "<h2></h2><p></p></div>" +
      '<div class="modal-foot"><button type="button" class="btn btn-outline" value="cancel">Cancel</button>' +
      '<button type="button" class="btn ' + (options.danger ? "btn-danger" : "btn-primary") + '" value="ok"></button></div>';
    dialog.querySelector("h2").textContent = options.title || "Are you sure?";
    dialog.querySelector("p").textContent = options.message || "";
    dialog.querySelector('[value="ok"]').textContent = options.confirmText || "Confirm";
    document.body.appendChild(dialog);
    let answer = false;
    dialog.addEventListener("click", function (event) {
      const button = event.target.closest("button");
      if (!button) return;
      answer = button.value === "ok";
      dialog.close();
    });
    dialog.addEventListener("close", function () {
      dialog.remove();
      resolve(answer);
    });
    dialog.showModal();
    dialog.querySelector('[value="cancel"]').focus();
  });
}

/* ---------- Forms [Dev Singh Chauhan] ---------- */

function setAlert(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = "form-alert" + (message ? " show " + (type === "success" ? "success" : "error") : "");
}

// Disable a button while an async action runs
async function withBusy(button, task) {
  const label = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Please wait';
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}

function setupPasswordToggles(root) {
  (root || document).querySelectorAll("[data-toggle-password]").forEach(function (button) {
    button.addEventListener("click", function () {
      const input = document.getElementById(button.getAttribute("data-toggle-password"));
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.innerHTML = '<i class="bi ' + (show ? "bi-eye-slash" : "bi-eye") + '" aria-hidden="true"></i>';
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

function passwordScore(password) {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}

function renderStrength(element, password) {
  if (!password) {
    element.innerHTML = "";
    return;
  }
  const score = passwordScore(password);
  const level = score <= 1 ? "weak" : score === 2 ? "medium" : "strong";
  element.innerHTML = '<span class="strength-bar ' + level + '"><span style="width:' + Math.max(score, 1) * 25 + '%"></span></span>' +
    '<span class="strength-label ' + level + '">' + level.charAt(0).toUpperCase() + level.slice(1) + " password</span>";
}

function validatePassword(password, userId) {
  if (password.length < 6) return "Password must have at least 6 characters.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain at least one letter and one number.";
  if (password === userId) return "Password cannot be the same as the ID.";
  return "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- Pagination [Chaitanya Pandey] ---------- */

function renderPagination(container, page, limit, total, onChange) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) {
    container.innerHTML = total ? '<span class="page-info">' + plural(total, "record") + "</span>" : "";
    return;
  }
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  container.innerHTML =
    '<span class="page-info">' + from + "-" + to + " of " + total + "</span>" +
    '<div class="page-buttons">' +
    '<button type="button" class="btn btn-sm btn-outline" data-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") +
    ' aria-label="Previous page"><i class="bi bi-chevron-left"></i></button>' +
    '<span class="page-current">' + page + " / " + pages + "</span>" +
    '<button type="button" class="btn btn-sm btn-outline" data-page="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") +
    ' aria-label="Next page"><i class="bi bi-chevron-right"></i></button></div>';
  container.querySelectorAll("[data-page]").forEach(function (button) {
    button.addEventListener("click", function () { onChange(Number(button.getAttribute("data-page"))); });
  });
}

/* ---------- App header (shared by every signed-in page) [Dev Sharma] ---------- */

const NAV_LINKS = {
  student: [
    { key: "dashboard", href: "dashboard.html", icon: "bi-grid-1x2", label: "Dashboard" },
    { key: "results", href: "result.html", icon: "bi-bar-chart-line", label: "Results" },
    { key: "profile", href: "profile.html", icon: "bi-person", label: "Profile" }
  ],
  examiner: [
    { key: "overview", href: "examiner.html#overview", icon: "bi-grid-1x2", label: "Overview" },
    { key: "exams", href: "examiner.html#exams", icon: "bi-journal-text", label: "My exams" },
    { key: "grading", href: "examiner.html#grading", icon: "bi-pencil-square", label: "Grading" },
    { key: "results", href: "examiner.html#results", icon: "bi-bar-chart-line", label: "Results" },
    { key: "notices", href: "examiner.html#notices", icon: "bi-megaphone", label: "Notices" }
  ],
  admin: [
    { key: "overview", href: "admin.html#overview", icon: "bi-grid-1x2", label: "Overview" },
    { key: "approvals", href: "admin.html#approvals", icon: "bi-patch-check", label: "Approvals" },
    { key: "staff", href: "admin.html#staff", icon: "bi-person-badge", label: "Staff" },
    { key: "students", href: "admin.html#students", icon: "bi-people", label: "Students" },
    { key: "notices", href: "admin.html#notices", icon: "bi-megaphone", label: "Notices" },
    { key: "settings", href: "admin.html#settings", icon: "bi-sliders", label: "Settings" }
  ],
  invigilator: [
    { key: "monitor", href: "invigilator.html#monitor", icon: "bi-display", label: "Live monitor" },
    { key: "violations", href: "invigilator.html#violations", icon: "bi-exclamation-triangle", label: "Violations" },
    { key: "incidents", href: "invigilator.html#incidents", icon: "bi-journal-medical", label: "Incidents" }
  ]
};

function renderAppHeader(user, active) {
  const holder = document.getElementById("appHeader");
  if (!holder) return;
  const links = NAV_LINKS[user.role] || [];
  holder.className = "app-header";
  holder.innerHTML =
    '<div class="app-header-inner">' +
    '<a class="brand" href="' + homeFor(user) + '" aria-label="ExamDesk home"><span class="brand-mark"><i class="bi bi-layers-half" aria-hidden="true"></i></span>' +
    '<span class="brand-name">examdesk<span class="brand-dot">.</span></span></a>' +
    '<nav class="app-nav" id="appNav" aria-label="Main">' +
    links.map(function (link) {
      return '<a href="' + link.href + '" data-nav="' + link.key + '"' + (link.key === active ? ' class="active" aria-current="page"' : "") +
        '><i class="bi ' + link.icon + '" aria-hidden="true"></i><span>' + link.label + "</span></a>";
    }).join("") +
    "</nav>" +
    '<div class="header-actions">' +
    '<button type="button" class="icon-btn" id="themeToggle" aria-label="Toggle dark mode"><i class="bi bi-moon-stars" aria-hidden="true"></i></button>' +
    '<div class="popover-wrap">' +
    '<button type="button" class="icon-btn" id="notifBell" aria-label="Notifications" aria-expanded="false" aria-controls="notifPanel">' +
    '<i class="bi bi-bell" aria-hidden="true"></i><span class="notif-count" id="notifCount" hidden></span></button>' +
    '<div class="popover notif-panel" id="notifPanel" hidden><div class="popover-head"><strong>Notifications</strong>' +
    '<span class="muted small" id="notifSummary"></span></div><div id="notifItems" class="notif-items"><div class="notif-empty">Loading...</div></div></div>' +
    "</div>" +
    '<div class="popover-wrap">' +
    '<button type="button" class="user-btn" id="userMenuBtn" aria-expanded="false" aria-controls="userMenu">' +
    '<span class="avatar">' + escapeHtml(getInitials(user.name)) + "</span>" +
    '<span class="user-meta"><strong>' + escapeHtml(user.name) + "</strong><small>" + (ROLE_LABELS[user.role] || user.role) + " &middot; " + escapeHtml(user.id) + "</small></span>" +
    '<i class="bi bi-chevron-down" aria-hidden="true"></i></button>' +
    '<div class="popover user-menu" id="userMenu" hidden>' +
    '<div class="user-menu-head"><strong>' + escapeHtml(user.name) + '</strong><small>' + escapeHtml(user.email || "") + "</small></div>" +
    '<a href="profile.html"><i class="bi bi-person-gear" aria-hidden="true"></i> Profile &amp; security</a>' +
    '<button type="button" id="logoutBtn"><i class="bi bi-box-arrow-right" aria-hidden="true"></i> Log out</button>' +
    "</div></div>" +
    '<button type="button" class="icon-btn nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="appNav"><i class="bi bi-list" aria-hidden="true"></i></button>' +
    "</div></div>";

  applyTheme(document.documentElement.getAttribute("data-theme"));
  document.getElementById("themeToggle").addEventListener("click", function () { toggleTheme(user); });
  document.getElementById("logoutBtn").addEventListener("click", function () { logout(user); });

  const nav = document.getElementById("appNav");
  const navToggle = document.getElementById("navToggle");
  navToggle.addEventListener("click", function () {
    const open = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.innerHTML = '<i class="bi ' + (open ? "bi-x-lg" : "bi-list") + '" aria-hidden="true"></i>';
  });
  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      nav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.innerHTML = '<i class="bi bi-list" aria-hidden="true"></i>';
    }
  });

  setupPopover("notifBell", "notifPanel", function () { markNotificationsSeen(user); });
  setupPopover("userMenuBtn", "userMenu");
  loadNotifications(user).catch(function () {});
}

function setActiveNav(key) {
  document.querySelectorAll("#appNav a").forEach(function (link) {
    const isActive = link.getAttribute("data-nav") === key;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function setupPopover(buttonId, panelId, onOpen) {
  const button = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  button.addEventListener("click", function (event) {
    event.stopPropagation();
    const willOpen = panel.hidden;
    document.querySelectorAll(".popover").forEach(function (p) { p.hidden = true; });
    document.querySelectorAll("[aria-controls]").forEach(function (b) {
      if (b.id !== "navToggle") b.setAttribute("aria-expanded", "false");
    });
    panel.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    if (willOpen && onOpen) onOpen();
  });
  panel.addEventListener("click", function (event) { event.stopPropagation(); });
  document.addEventListener("click", function () {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }
  });
}

async function fetchAnnouncements(user, limit) {
  const audience = ["all", user.role + "s"];
  return api.get("/announcements", { audience: audience, _sort: "createdAt", _order: "desc", _limit: limit || 20 });
}

async function loadNotifications(user) {
  const list = await fetchAnnouncements(user, 10);
  const liveExams = user.role === "admin" ? [] : await api.get("/exams", { status: "live" });
  const seen = user.notificationsSeenAt ? new Date(user.notificationsSeenAt).getTime() : 0;
  const unread = list.filter(function (a) { return new Date(a.createdAt).getTime() > seen; }).length;

  const items = [];
  liveExams.forEach(function (exam) {
    items.push('<div class="notif-item live"><i class="bi bi-broadcast" aria-hidden="true"></i><div><strong>' + escapeHtml(exam.title) +
      " is live</strong><small>" + escapeHtml(exam.id) + " &middot; " + exam.duration + " min</small></div></div>");
  });
  list.forEach(function (a) {
    const isNew = new Date(a.createdAt).getTime() > seen;
    items.push('<div class="notif-item' + (isNew ? " unread" : "") + (a.priority === "high" ? " high" : "") + '"><i class="bi bi-megaphone" aria-hidden="true"></i><div><strong>' +
      escapeHtml(a.title) + "</strong><p>" + escapeHtml(a.message) + "</p><small>" + timeAgo(a.createdAt) + "</small></div></div>");
  });

  document.getElementById("notifItems").innerHTML = items.length ? items.join("") : '<div class="notif-empty">You are all caught up.</div>';
  document.getElementById("notifSummary").textContent = unread ? unread + " new" : "";
  const count = document.getElementById("notifCount");
  count.hidden = unread === 0;
  count.textContent = unread > 9 ? "9+" : String(unread);
}

async function markNotificationsSeen(user) {
  const count = document.getElementById("notifCount");
  if (count.hidden) return;
  const now = new Date().toISOString();
  user.notificationsSeenAt = now;
  count.hidden = true;
  document.getElementById("notifSummary").textContent = "";
  await api.patch(idPath("users", user.id), { notificationsSeenAt: now }).catch(function () {});
}

function renderFooter() {
  const holder = document.getElementById("appFooter");
  if (!holder) return;
  holder.className = "app-footer";
  getSettings().then(function (settings) {
    holder.innerHTML = "<span><strong>examdesk.</strong> &middot; " + escapeHtml(settings.instituteName) + "</span>" +
      "<span>&copy; " + new Date().getFullYear() + " ExamDesk</span>";
  }).catch(function () {});
}
