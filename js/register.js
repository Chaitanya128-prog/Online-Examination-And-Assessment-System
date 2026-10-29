"use strict";

redirectIfLoggedIn();

const registerForm = document.getElementById("registerForm");
const nameInput = document.getElementById("fullName");
const rollInput = document.getElementById("roll");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirmPassword");
const showPasswordBox = document.getElementById("showPassword");
const strengthText = document.getElementById("strengthText");
const errorBox = document.getElementById("error");
const successBox = document.getElementById("success");

function showError(message) {
  successBox.classList.remove("show");
  errorBox.textContent = message;
  errorBox.classList.add("show");
}

function hideError() {
  errorBox.textContent = "";
  errorBox.classList.remove("show");
}

function passwordScore(password) {
  let score = 0;
  if (password.length >= 6) {
    score++;
  }
  if (password.length >= 10) {
    score++;
  }
  if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) {
    score++;
  }
  if (/[^a-zA-Z0-9]/.test(password)) {
    score++;
  }
  return score;
}

rollInput.addEventListener("input", function () {
  rollInput.value = rollInput.value.replace(/[^0-9]/g, "");
  hideError();
});

nameInput.addEventListener("input", function () {
  nameInput.value = nameInput.value.replace(/[^a-zA-Z ]/g, "");
  hideError();
});

emailInput.addEventListener("input", hideError);
confirmInput.addEventListener("input", hideError);

passwordInput.addEventListener("input", function () {
  hideError();
  const password = passwordInput.value;

  if (password === "") {
    strengthText.textContent = "";
    return;
  }

  const score = passwordScore(password);
  if (score <= 1) {
    strengthText.textContent = "Strength: Weak";
    strengthText.className = "strength weak";
  } else if (score === 2) {
    strengthText.textContent = "Strength: Medium";
    strengthText.className = "strength medium";
  } else {
    strengthText.textContent = "Strength: Strong";
    strengthText.className = "strength strong";
  }
});

showPasswordBox.addEventListener("change", function () {
  let type = "password";
  if (showPasswordBox.checked) {
    type = "text";
  }
  passwordInput.type = type;
  confirmInput.type = type;
});

registerForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const name = nameInput.value.trim().replace(/\s+/g, " ");
  const roll = rollInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  if (name === "" || roll === "" || email === "" || password === "" || confirm === "") {
    showError("Please fill all the fields.");
    return;
  }

  if (name.length < 3) {
    showError("Name must have at least 3 letters.");
    return;
  }

  if (!/^[0-9]{10}$/.test(roll)) {
    showError("Roll number must be exactly 10 digits.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    showError("Please enter a valid email address.");
    return;
  }

  if (password.length < 6) {
    showError("Password must have at least 6 characters.");
    return;
  }

  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    showError("Password must have at least one letter and one number.");
    return;
  }

  if (password === roll) {
    showError("Password cannot be the same as the roll number.");
    return;
  }

  if (password !== confirm) {
    showError("Password and confirm password do not match.");
    return;
  }

  loadData()
    .then(function (data) {
      const users = getAllUsers(data);

      for (let i = 0; i < users.length; i++) {
        if (users[i].roll === roll) {
          showError("This roll number is already registered. Please login.");
          return;
        }
        if (users[i].email !== undefined && users[i].email === email) {
          showError("This email is already registered.");
          return;
        }
      }

      saveNewUser({
        roll: roll,
        name: name,
        email: email,
        password: hashPassword(password),
        role: "student"
      });

      localStorage.setItem("rememberRoll", roll);
      hideError();
      successBox.textContent = "Registration successful. Redirecting to login...";
      successBox.classList.add("show");
      registerForm.reset();
      strengthText.textContent = "";

      setTimeout(function () {
        window.location.href = "login.html";
      }, 1500);
    })
    .catch(function (error) {
      console.log(error);
      showError("Could not load data.json. Please open the project with Live Server.");
    });
});
