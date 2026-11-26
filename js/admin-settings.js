"use strict";

/* =========================================================
   Admin panel - Settings tab and maintenance
   Owner: Dev Singh Chauhan
   json-server: /settings (GET / PUT), /sessions, /loginAttempts, /attempts, /activity
   ========================================================= */

function bindSettings() {
  document.getElementById("settingsForm").addEventListener("submit", saveSettings);
  document.getElementById("clearSessionsBtn").addEventListener("click", function () { maintenance(this, clearExpiredSessions); });
  document.getElementById("clearLocksBtn").addEventListener("click", function () { maintenance(this, clearLockouts); });
  document.getElementById("clearAttemptsBtn").addEventListener("click", function () { maintenance(this, clearStaleAttempts); });
  document.getElementById("clearActivityBtn").addEventListener("click", function () { maintenance(this, trimActivity); });
}

async function loadSettings() {
  settings = await getSettings(true);
  document.getElementById("sInstitute").value = settings.instituteName;
  document.getElementById("sPassMark").value = settings.passMark;
  document.getElementById("sCorrect").value = settings.defaultCorrectMarks;
  document.getElementById("sNegative").value = settings.defaultNegativeMarks;
  document.getElementById("sTabs").value = settings.maxTabSwitches;
  document.getElementById("sSession").value = settings.sessionHours;
  document.getElementById("sAttempts").value = settings.maxLoginAttempts;
  document.getElementById("sLock").value = settings.lockSeconds;
  document.getElementById("sApproval").checked = settings.requireApproval !== false;
  document.getElementById("sRequireAll").checked = settings.requireAllAnswers;
  document.getElementById("sRegistration").checked = settings.allowRegistration;
  await loadMaintenance();
}

function saveSettings(event) {
  event.preventDefault();
  const alertBox = document.getElementById("settingsAlert");
  const next = {
    instituteName: document.getElementById("sInstitute").value.trim(),
    passMark: Number(document.getElementById("sPassMark").value),
    defaultCorrectMarks: Number(document.getElementById("sCorrect").value),
    defaultNegativeMarks: Number(document.getElementById("sNegative").value),
    maxTabSwitches: Number(document.getElementById("sTabs").value),
    sessionHours: Number(document.getElementById("sSession").value),
    maxLoginAttempts: Number(document.getElementById("sAttempts").value),
    lockSeconds: Number(document.getElementById("sLock").value),
    requireApproval: document.getElementById("sApproval").checked,
    requireAllAnswers: document.getElementById("sRequireAll").checked,
    allowRegistration: document.getElementById("sRegistration").checked
  };
  if (!next.instituteName) return setAlert(alertBox, "Institute name is required.");
  if (!(next.passMark >= 1 && next.passMark <= 100)) return setAlert(alertBox, "Pass mark must be between 1 and 100.");
  if (!(next.defaultCorrectMarks > 0) || !(next.defaultNegativeMarks >= 0)) return setAlert(alertBox, "Check the default MCQ marks.");
  if (!(next.maxTabSwitches >= 0 && next.maxTabSwitches <= 20)) return setAlert(alertBox, "Tab-switch limit must be 0 to 20.");
  if (!(next.sessionHours >= 1 && next.sessionHours <= 24)) return setAlert(alertBox, "Session length must be 1 to 24 hours.");
  if (!(next.maxLoginAttempts >= 1 && next.maxLoginAttempts <= 10)) return setAlert(alertBox, "Max wrong logins must be 1 to 10.");
  if (!(next.lockSeconds >= 5 && next.lockSeconds <= 3600)) return setAlert(alertBox, "Lockout must be 5 to 3600 seconds.");

  withBusy(document.getElementById("settingsBtn"), async function () {
    settings = await api.put("/settings", next);
    await getSettings(true);
    await logActivity(me, "settings", "Updated system settings");
    setAlert(alertBox, "");
    renderFooter();
    toast("Settings saved.", "success");
  }).catch(function (error) { setAlert(alertBox, error.message); });
}

async function loadMaintenance() {
  const [sessions, locks, attempts, activity] = await Promise.all([
    api.get("/sessions"), api.get("/loginAttempts"), api.get("/attempts"), api.page("/activity", { _limit: 1 })
  ]);
  const now = Date.now();
  const expired = sessions.filter(function (s) { return new Date(s.expiresAt).getTime() < now; }).length;
  const stale = attempts.filter(function (a) { return new Date(a.deadline).getTime() < now; }).length;
  document.getElementById("mSessions").textContent = sessions.length + " total, " + expired + " expired";
  document.getElementById("mLocks").textContent = plural(locks.length, "record");
  document.getElementById("mAttempts").textContent = (attempts.length - stale) + " active, " + stale + " past their deadline";
  document.getElementById("mActivity").textContent = activity.total + (activity.total === 1 ? " entry" : " entries");
}

function maintenance(button, task) {
  withBusy(button, async function () {
    const count = await task();
    toast(count === 0 ? "Nothing to clean up." : "Removed " + count + ".", "success");
    await loadMaintenance();
  }).catch(handlePageError);
}

async function removeAll(collection, records) {
  await Promise.all(records.map(function (r) { return api.remove(idPath(collection, r.id)); }));
  return records.length;
}

async function clearExpiredSessions() {
  const now = Date.now();
  const sessions = await api.get("/sessions");
  return removeAll("sessions", sessions.filter(function (s) { return new Date(s.expiresAt).getTime() < now; }));
}

async function clearLockouts() {
  return removeAll("loginAttempts", await api.get("/loginAttempts"));
}

async function clearStaleAttempts() {
  const now = Date.now();
  const stale = (await api.get("/attempts")).filter(function (a) { return new Date(a.deadline).getTime() < now; });
  if (!stale.length) return 0;
  const ok = await confirmDialog({
    title: "Discard " + plural(stale.length, "attempt") + "?",
    message: "These students ran out of time and never came back. Discarding lets them start the exam again from scratch.",
    confirmText: "Discard", danger: true
  });
  return ok ? removeAll("attempts", stale) : 0;
}

async function trimActivity() {
  const old = await api.get("/activity", { _sort: "createdAt", _order: "desc", _start: 50, _end: 100000 });
  return removeAll("activity", old);
}
