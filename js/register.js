"use strict";

/* =========================================================
   Register page - student sign-up with duplicate checks (Create user)
   Owner: Devang Kumar (Student module)
   json-server: /users
   ========================================================= */

const registerForm = document.getElementById("registerForm");
const nameInput = document.getElementById("fullName");
const rollInput = document.getElementById("roll");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirmPassword");
const registerAlert = document.getElementById("registerAlert");
const registerBtn = document.getElementById("registerBtn");

document.getElementById("themeToggle").addEventListener("click", function () { toggleTheme(null); });
applyTheme(document.documentElement.getAttribute("data-theme"));
setupPasswordToggles();

rollInput.addEventListener("input", function () {
  rollInput.value = rollInput.value.replace(/[^0-9]/g, "");
});
nameInput.addEventListener("input", function () {
  nameInput.value = nameInput.value.replace(/[^a-zA-Z .'-]/g, "");
});
passwordInput.addEventListener("input", function () {
  renderStrength(document.getElementById("strength"), passwordInput.value);
});
registerForm.addEventListener("input", function () { setAlert(registerAlert, ""); });

registerForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const name = nameInput.value.trim().replace(/\s+/g, " ");
  const roll = rollInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  let message = "";
  if (!name || !roll || !email || !password || !confirm) message = "Please fill in all the fields.";
  else if (name.length < 3) message = "Name must have at least 3 letters.";
  else if (!/^[0-9]{10}$/.test(roll)) message = "Roll number must be exactly 10 digits.";
  else if (!EMAIL_PATTERN.test(email)) message = "Please enter a valid email address.";
  else message = validatePassword(password, roll);
  if (!message && password !== confirm) message = "The two passwords do not match.";
  if (message) {
    setAlert(registerAlert, message);
    return;
  }

  withBusy(registerBtn, async function () {
    // Server-side duplicate checks through json-server filters
    const [byId, byEmail] = await Promise.all([
      api.find(idPath("users", roll)),
      api.get("/users", { email: email })
    ]);
    if (byId) {
      setAlert(registerAlert, "This roll number is already registered. Please sign in.");
      return;
    }
    if (byEmail.length) {
      setAlert(registerAlert, "This email is already registered.");
      return;
    }

    const user = await api.post("/users", {
      id: roll,
      name: name,
      email: email,
      phone: "",
      department: document.getElementById("department").value,
      role: "student",
      password: await hashPassword(roll, password),
      status: "active",
      theme: document.documentElement.getAttribute("data-theme"),
      createdAt: new Date().toISOString(),
      notificationsSeenAt: null
    });
    await logActivity(user, "user", "Registered a new student account");

    localStorage.setItem(REMEMBER_KEY, roll);
    registerForm.reset();
    renderStrength(document.getElementById("strength"), "");
    setAlert(registerAlert, "Account created. Taking you to sign in...", "success");
    setTimeout(function () { location.href = "login.html"; }, 1300);
  }).catch(function (error) {
    setAlert(registerAlert, error.message);
  });
});

(async function () {
  await redirectIfLoggedIn();
  const settings = await getSettings();
  if (!settings.allowRegistration) {
    document.getElementById("closedAlert").hidden = false;
    registerForm.querySelectorAll("input, select, button").forEach(function (el) { el.disabled = true; });
  }
})().catch(handlePageError);
