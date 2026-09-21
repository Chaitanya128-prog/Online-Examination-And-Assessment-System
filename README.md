# Online Examination And Assessment System

A responsive frontend for conducting objective exams online, built with HTML and CSS.

## Team
- Chaitanya Pandey - 2415000466
- Dev Sharma - 2415000500
- Dev Singh Chauhan - 2415000502
- Devang Kumar - 2415000504

## Technologies
- HTML5
- CSS3
- JSON sample data

## Pages
1. `index.html` - Login (Student / Examiner)
2. `dashboard.html` - Student Dashboard
3. `exam.html` - Examination Screen with question palette and timer
4. `result.html` - Result and Answer Review
5. `examiner.html` - Examiner Portal
6. `data.json` - Sample structured data
7. `style.css` - Shared responsive stylesheet

## How to run
No installation is required. Open `index.html` in a browser.

Demo flow: `index.html` -> Login as Student -> `dashboard.html` -> Start Exam -> `exam.html` -> Submit -> `result.html`

## Note
This version uses HTML and CSS only. Timer, score calculation, login validation and database operations are static UI demonstrations and will be made functional later using JavaScript and a backend.

## Modules

### 1. Login Page (`index.html`) - Dev Singh Chauhan
- Two-column layout: brand panel with logo on the left, login card on the right
- Role selection (Student / Examiner) using a select dropdown
- Roll Number / Employee ID and password fields with required validation
- Remember me checkbox and Forgot password link
- Separate buttons for Login as Student and Login as Examiner
- Login card becomes full width on mobile screens
