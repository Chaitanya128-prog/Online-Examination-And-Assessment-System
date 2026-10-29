"use strict";

redirectIfLoggedIn();

const MAX_ATTEMPTS = 3;
const LOCK_SECONDS = 30;

const loginForm = document.getElementById("loginForm");
const roleSelect = document.getElementById("role");
const rollInput = document.getElementById("roll");
const passwordInput = document.getElementById("password");
const rememberBox = document.getElementById("remember");
const showPasswordBox = document.getElementById("showPassword");
const errorBox = document.getElementById("error");
const forgotLink = document.getElementById("forgotLink");
const loginButton = loginForm.querySelector("button[type='submit']");

let lockTimer = null;

const savedRoll = localStorage.getItem("rememberRoll");
if (savedRoll !== null) {
  rollInput.value = savedRoll;
  rememberBox.checked = true;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add("show");
}

function hideError() {
  errorBox.textContent = "";
  errorBox.classList.remove("show");
}

function getAttempts() {
  const text = localStorage.getItem("loginAttempts");
  if (text === null) {
    return { count: 0, lockUntil: 0 };
  }
  return JSON.parse(text);
}

function saveAttempts(attempts) {
  localStorage.setItem("loginAttempts", JSON.stringify(attempts));
}

function checkLock() {
  const attempts = getAttempts();
  const secondsLeft = Math.ceil((attempts.lockUntil - Date.now()) / 1000);

  if (secondsLeft > 0) {
    loginButton.disabled = true;
    showError("Too many wrong attempts. Try again in " + secondsLeft + " seconds.");
    if (lockTimer === null) {
      lockTimer = setInterval(checkLock, 1000);
    }
    return true;
  }

  loginButton.disabled = false;
  if (lockTimer !== null) {
    clearInterval(lockTimer);
    lockTimer = null;
    hideError();
  }
  return false;
}

function wrongAttempt() {
  const attempts = getAttempts();
  attempts.count = attempts.count + 1;

  if (attempts.count >= MAX_ATTEMPTS) {
    attempts.count = 0;
    attempts.lockUntil = Date.now() + LOCK_SECONDS * 1000;
    saveAttempts(attempts);
    checkLock();
    return;
  }

  saveAttempts(attempts);
  const left = MAX_ATTEMPTS - attempts.count;
  showError("Wrong roll number, password or login type. " + left + " attempt(s) left.");
}

rollInput.addEventListener("input", function () {
  rollInput.value = rollInput.value.replace(/[^0-9]/g, "");
  if (!checkLock()) {
    hideError();
  }
});

passwordInput.addEventListener("input", function () {
  if (!checkLock()) {
    hideError();
  }
});

showPasswordBox.addEventListener("change", function () {
  if (showPasswordBox.checked) {
    passwordInput.type = "text";
  } else {
    passwordInput.type = "password";
  }
});

forgotLink.addEventListener("click", function (event) {
  event.preventDefault();
  alert("Please contact the exam cell to reset your password.");
});

loginForm.addEventListener("submit", function (event) {
  event.preventDefault();

  if (checkLock()) {
    return;
  }

  const role = roleSelect.value;
  const roll = rollInput.value.trim();
  const password = passwordInput.value;

  if (roll === "" || password === "") {
    showError("Please fill all the fields.");
    return;
  }

  if (roll.length < 4) {
    showError("Roll number or employee ID is too short.");
    return;
  }

  if (password.length < 4) {
    showError("Password is too short.");
    return;
  }

  loadData()
    .then(function (data) {
      const users = getAllUsers(data);
      const passwordHash = hashPassword(password);
      let foundUser = null;

      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        if (u.roll === roll && u.role === role && u.password === passwordHash) {
          foundUser = u;
          break;
        }
      }

      if (foundUser === null) {
        wrongAttempt();
        return;
      }

      saveAttempts({ count: 0, lockUntil: 0 });

      if (rememberBox.checked) {
        localStorage.setItem("rememberRoll", roll);
      } else {
        localStorage.removeItem("rememberRoll");
      }

      saveLoggedUser({ roll: foundUser.roll, name: foundUser.name, role: foundUser.role });

      switch (foundUser.role) {
        case "student":
          window.location.href = "dashboard.html";
          break;
        case "examiner":
          window.location.href = "examiner.html";
          break;
        default:
          showError("Unknown user type.");
      }
    })
    .catch(function (error) {
      console.log(error);
      showError("Could not load data.json. Please open the project with Live Server.");
    });
});

checkLock();
