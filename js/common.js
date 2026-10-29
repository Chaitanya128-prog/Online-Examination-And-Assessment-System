"use strict";

function loadData() {
  return fetch("data.json").then(function (response) {
    if (!response.ok) throw new Error("Could not load exam data");
    return response.json();
  });
}

const SESSION_HOURS = 2;

function hashPassword(text) {
  let hash = 5381;
  const salted = "examdesk:" + text;
  for (let i = 0; i < salted.length; i++) {
    hash = (hash * 33 + salted.charCodeAt(i)) % 4294967296;
  }
  return hash.toString(16);
}

function getLoggedUser() {
  const text = localStorage.getItem("loggedUser");
  if (text === null) {
    return null;
  }
  const user = JSON.parse(text);
  const hoursPassed = (Date.now() - user.loginTime) / (1000 * 60 * 60);
  if (hoursPassed > SESSION_HOURS) {
    localStorage.removeItem("loggedUser");
    return null;
  }
  return user;
}

function saveLoggedUser(user) {
  user.loginTime = Date.now();
  localStorage.setItem("loggedUser", JSON.stringify(user));
}

function redirectIfLoggedIn() {
  const user = getLoggedUser();
  if (user === null) {
    return;
  }
  if (user.role === "examiner") {
    window.location.href = "examiner.html";
  } else {
    window.location.href = "dashboard.html";
  }
}

function getAllUsers(data) {
  const saved = localStorage.getItem("newUsers");
  if (saved === null) {
    return data.users;
  }
  return data.users.concat(JSON.parse(saved));
}

function saveNewUser(user) {
  let list = [];
  const saved = localStorage.getItem("newUsers");
  if (saved !== null) {
    list = JSON.parse(saved);
  }
  list.push(user);
  localStorage.setItem("newUsers", JSON.stringify(list));
}

function logout() {
  localStorage.removeItem("loggedUser");
  window.location.href = "login.html";
}

function checkLogin(role) {
  const user = getLoggedUser();
  if (user === null || user.role !== role) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

function getAllExams(data) {
  const saved = localStorage.getItem("newExams");
  if (saved === null) {
    return data.exams;
  }
  return data.exams.concat(JSON.parse(saved));
}

function getAllResults(data) {
  const saved = localStorage.getItem("newResults");
  if (saved === null) {
    return data.results;
  }
  return data.results.concat(JSON.parse(saved));
}

function saveNewExam(exam) {
  let list = [];
  const saved = localStorage.getItem("newExams");
  if (saved !== null) {
    list = JSON.parse(saved);
  }
  list.push(exam);
  localStorage.setItem("newExams", JSON.stringify(list));
}

function saveNewResult(result) {
  let list = [];
  const saved = localStorage.getItem("newResults");
  if (saved !== null) {
    list = JSON.parse(saved);
  }
  list.push(result);
  localStorage.setItem("newResults", JSON.stringify(list));
}

function getInitials(name) {
  const words = name.trim().split(" ");
  let initials = words[0].charAt(0);
  if (words.length > 1) {
    initials = initials + words[words.length - 1].charAt(0);
  }
  return initials.toUpperCase();
}

function formatDate(text) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = text.split("-");
  return parts[2] + " " + months[Number(parts[1]) - 1] + " " + parts[0];
}

function todayText() {
  const today = new Date();
  return today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function averagePercentage(list) {
  if (list.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    sum = sum + list[i].percentage;
  }
  return Math.round(sum / list.length);
}

// Shared UI: notification popover and toast messages.
function showToast(message, type) {
  const region = document.getElementById("toastRegion");
  if (!region) { alert(message); return; }
  const item = document.createElement("div");
  item.className = "toast " + (type || "info");
  item.textContent = message;
  region.appendChild(item);
  setTimeout(() => item.remove(), 4500);
}
function setupNotifications(items) {
  const bell = document.getElementById("notificationBell");
  const panel = document.getElementById("notificationPanel");
  const content = document.getElementById("notificationItems");
  if (!bell || !panel || !content) return;
  content.replaceChildren();
  if (!items.length) content.textContent = "You're all caught up!";
  items.slice(0, 8).forEach(item => {
    const div = document.createElement("div");
    div.className = "notification-item";
    div.textContent = item;
    content.appendChild(div);
  });
  bell.onclick = () => { panel.hidden = !panel.hidden; bell.setAttribute("aria-expanded", String(!panel.hidden)); };
  document.addEventListener("click", e => { if (!e.target.closest(".notification-wrap")) {panel.hidden = true; bell.setAttribute("aria-expanded", "false");} });
}
