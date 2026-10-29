## ExamDesk 2.0 upgrades

- Open `index.html` for the landing page, `login.html` to sign in.
- Start with VS Code Live Server (or `python -m http.server 5500`) for JSON fetch support.
- All JavaScript remains inside `js/`.
- Students must answer **every** question to submit manually; when time expires, the current attempt is automatically graded.
- Attempts are saved in browser localStorage for recovery after a refresh.
- Charts display actual per-result correct / incorrect / unanswered counts.
- Notifications display live and upcoming exam status (client-side, not push notifications).
- This is a localStorage demo, not a secure production exam backend; avoid using for real supervised assessments without server-side authentication, grading, and database storage.

# Online Examination And Assessment System

A responsive frontend for conducting objective exams online, built with HTML, CSS and JavaScript.

## Team
- Chaitanya Pandey - 2415000466
- Dev Sharma - 2415000500
- Dev Singh Chauhan - 2415000502
- Devang Kumar - 2415000504

## Technologies
- HTML5
- CSS3
- JavaScript (easy level, no libraries)
- JSON sample data

## Pages and their JavaScript files
| Page | JavaScript file |
|---|---|
| `index.html` - Login | `login.js` |
| `register.html` - Student Registration | `register.js` |
| `dashboard.html` - Student Dashboard | `dashboard.js` |
| `exam.html` - Examination Screen | `exam.js` |
| `result.html` - Result and Answer Review | `result.js` |
| `examiner.html` - Examiner Portal | `examiner.js` |

Shared helper functions are in `common.js`, sample data (used as the database) is in `data.json` and the shared stylesheet is `style.css`.

## How to run
Open the folder in VS Code and run `index.html` with Live Server (fetch needs a local server).

Demo logins: Student 2415000466 / demo, Examiner 9001 / admin. New students can register from the login page.

Data is read from `data.json`. New data (registered users, saved results, exams created by the examiner, session) is stored in the browser localStorage in JSON format.

## Modules

### 1. Login and Register (`index.html`, `login.js`, `register.html`, `register.js`) - Dev Singh Chauhan
- Student registration: name, 10 digit roll number, email, password and confirm password with full validation
- Duplicate roll number / email check, password strength meter, show password option
- Passwords are never saved as plain text (simple hash from `common.js`; a real project would hash on a server)
- Login checks roll number, role and password hash against `data.json` users and registered users
- After 3 wrong attempts the login button is locked for 30 seconds
- Session is saved in localStorage and expires after 2 hours; logged in users skip the login page
- Remember me keeps the roll number; role decides the next page (`switch`)

### 2. Student Dashboard (`dashboard.html`, `dashboard.js`) - Dev Sharma
- Login check: only a logged in student can open the page, others go back to the login page
- Name, avatar initials and today's date are filled with JavaScript
- Exams and results are read from `data.json` (and localStorage for newly saved data)
- Stat cards (live, upcoming, completed, average score) are calculated with array methods and Math.round
- Live exam card, upcoming exams table and recent results list are created with loops
- Start Exam saves the exam code in localStorage and opens the exam page
- Clicking a recent result opens that result on the result page

### 3. Exam Page (`exam.html`, `exam.js`) - Devang Kumar
- Questions are loaded from `data.json`; one question is shown at a time with options A-D
- Selected option is highlighted; Previous, Clear Answer, Mark for Review and Save & Next buttons work
- Question palette is created with a loop and shows answered, marked for review and current question
- Countdown timer uses `setInterval`; the exam is submitted automatically when time is over
- On submit, correct, wrong and unattempted answers are counted and the score is calculated (+2 / -0.5)
- Result is saved in localStorage in JSON format

### 4. Result Page (`result.html`, `result.js`) - Devang Kumar
- Percentage, marks, Passed / Failed status (40% needed) and counts are shown from the saved result
- Question-wise answer review is created with a loop; first 5 shown, Show all button shows the rest
- Message shown if the student has not attempted any exam yet

### 5. Examiner Portal (`examiner.html`, `examiner.js`) and shared `common.js`, `data.json` - Chaitanya Pandey
- `common.js` has the shared functions (load data.json, login check, logout, date and helper functions)
- `data.json` now has 4 students, 1 examiner, 6 exams (with 10 DSA questions) and sample results
- Examiner login check, name, avatar and date are filled with JavaScript
- Stat cards, class summary (average, highest, pass percentage) are calculated from all results
- Students table is built with a loop and can be searched by name or roll number
- Exam table shows questions, submissions and status for every exam
- Create Exam form: add questions with four options, validate everything and save the exam in localStorage
- A new Live exam created here appears on the student dashboard



## Updated JavaScript folder structure

All JavaScript files have been moved into `js/` (including `js/common.js`). Each HTML page now loads scripts using `js/<script-name>.js`. Keep `data.json` at the project root: `fetch("data.json")` is resolved relative to the HTML page URL, not the `js/` folder. Open `index.html` using a local web server such as VS Code Live Server (not by double-clicking the file).
