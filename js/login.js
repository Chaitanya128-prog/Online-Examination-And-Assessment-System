"use strict";

/* =========================================================
   Login page - sign in, lockout after wrong passwords, remember me
   Owner: Dev Sharma (Invigilator module + sign-in / profile)
   json-server: /users, /sessions, /loginAttempts, /activity
   ========================================================= */

const loginForm = document.getElementById("loginForm");
const userIdInput = document.getElementById("userId");
const passwordInput = document.getElementById("password");
const rememberBox = document.getElementById("remember");
const loginAlert = document.getElementById("loginAlert");
const loginBtn = document.getElementById("loginBtn");

let lockTimer = null;

document.getElementById("themeToggle").addEventListener("click", function () { toggleTheme(null); });
applyTheme(document.documentElement.getAttribute("data-theme"));
setupPasswordToggles();

const remembered = localStorage.getItem(REMEMBER_KEY);
if (remembered) {
  userIdInput.value = remembered;
  rememberBox.checked = true;
}

userIdInput.addEventListener("input", function () {
  userIdInput.value = userIdInput.value.replace(/[^0-9]/g, "");
  setAlert(loginAlert, "");
});
userIdInput.addEventListener("change", checkLock);
passwordInput.addEventListener("input", function () { if (!lockTimer) setAlert(loginAlert, ""); });

document.getElementById("forgotLink").addEventListener("click", function (event) {
  event.preventDefault();
  openModal("forgotDialog");
});

document.querySelectorAll("[data-demo]").forEach(function (button) {
  button.addEventListener("click", function () {
    userIdInput.value = button.getAttribute("data-demo");
    passwordInput.value = button.getAttribute("data-pass");
    setAlert(loginAlert, "");
    checkLock();
    loginBtn.focus();
  });
});

/* ----- Lockout after too many wrong passwords: stored in json-server /loginAttempts ----- */

function attemptId() {
  return "login-" + userIdInput.value.trim();
}

async function checkLock() {
  if (!userIdInput.value.trim()) return false;
  const record = await api.find(idPath("loginAttempts", attemptId())).catch(function () { return null; });
  const secondsLeft = record ? Math.ceil((record.lockUntil - Date.now()) / 1000) : 0;
  if (secondsLeft > 0) {
    loginBtn.disabled = true;
    setAlert(loginAlert, "Too many wrong attempts. Try again in " + secondsLeft + " s.");
    clearTimeout(lockTimer);
    lockTimer = setTimeout(checkLock, 1000);
    return true;
  }
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
    setAlert(loginAlert, "");
  }
  loginBtn.disabled = false;
  return false;
}

async function recordWrongAttempt(settings) {
  const id = attemptId();
  const existing = await api.find(idPath("loginAttempts", id));
  const count = (existing ? existing.count : 0) + 1;
  const record = { id: id, count: count, lockUntil: 0, lastAttemptAt: new Date().toISOString() };
  if (count >= settings.maxLoginAttempts) {
    record.count = 0;
    record.lockUntil = Date.now() + settings.lockSeconds * 1000;
  }
  if (existing) await api.put(idPath("loginAttempts", id), record);
  else await api.post("/loginAttempts", record);

  if (record.lockUntil) {
    await checkLock();
  } else {
    const left = settings.maxLoginAttempts - count;
    setAlert(loginAlert, "Wrong ID or password. " + plural(left, "attempt") + " left.");
  }
}

async function clearAttempts() {
  if (await api.find(idPath("loginAttempts", attemptId()))) {
    await api.remove(idPath("loginAttempts", attemptId())).catch(function () {});
  }
}

/* ----- Submit ----- */

loginForm.addEventListener("submit", function (event) {
  event.preventDefault();
  const userId = userIdInput.value.trim();
  const password = passwordInput.value;

  if (!userId || !password) {
    setAlert(loginAlert, "Please enter your ID and password.");
    return;
  }
  if (userId.length < 4) {
    setAlert(loginAlert, "That ID looks too short.");
    return;
  }

  withBusy(loginBtn, async function () {
    if (await checkLock()) return;
    const settings = await getSettings();
    const user = await api.find(idPath("users", userId));
    const hash = await hashPassword(userId, password);

    if (!user || user.password !== hash) {
      await recordWrongAttempt(settings);
      return;
    }
    if (user.status === "blocked") {
      setAlert(loginAlert, "This account has been blocked. Please contact the exam cell.");
      return;
    }

    await clearAttempts();
    if (rememberBox.checked) localStorage.setItem(REMEMBER_KEY, userId);
    else localStorage.removeItem(REMEMBER_KEY);

    await createSession(user);
    await api.patch(idPath("users", user.id), { lastLoginAt: new Date().toISOString() });
    await logActivity(user, "auth", "Signed in");
    applyTheme(user.theme || "light");

    const next = new URLSearchParams(location.search).get("next");
    const safeNext = next && /^[a-z]+\.html([?#].*)?$/.test(next) && next.indexOf("login") !== 0 ? next : null;
    const rolePages = { student: ["dashboard", "exam.", "result"], examiner: ["examiner"], admin: ["admin"], invigilator: ["invigilator"] };
    const allowed = safeNext && (safeNext.indexOf("profile") === 0 || (rolePages[user.role] || []).some(function (page) {
      return safeNext.indexOf(page) === 0;
    }));
    location.href = allowed ? safeNext : homeFor(user);
  }).catch(function (error) {
    setAlert(loginAlert, error.message);
  });
});

(async function () {
  await redirectIfLoggedIn();
  const settings = await getSettings();
  if (!settings.allowRegistration) document.getElementById("registerLine").hidden = true;
  await checkLock();
})().catch(handlePageError);
