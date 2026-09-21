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

### 2. Student Dashboard (`dashboard.html`) - Dev Sharma
- Topbar with logo, navigation links and student profile
- Welcome section with quick action for the live exam
- Four stat cards: live exams, upcoming exams, completed exams and average score
- Live exam card with subject, duration, total questions and Start Exam button
- Upcoming exams table with date, time and status
- Recent results list with subject and score
- Grid collapses to a single column on small screens

### 3. Exam Page (`exam.html`) - Devang Kumar
- Exam topbar with exam title and countdown timer box
- Question card with question number, marks and four options (A-D)
- Selected option is highlighted
- Question palette on the side showing answered, marked for review and not answered
- Previous, Mark for Review, Next and Submit buttons
- Palette moves below the question on mobile

### 4. Result Page (`result.html`) - Devang Kumar
- Score card with percentage circle, marks obtained and pass status
- Stat cards for total questions, correct, wrong and unattempted
- Answer review list with question, your answer and correct / wrong indicator
- Back to Dashboard button

### 5. Examiner Portal (`examiner.html`) - Chaitanya Pandey
- Topbar with examiner profile
- Quick action cards: create exam, add questions, view results
- Class stats: total students, exams conducted, average score and pass percentage
- Upcoming exams table and recent results panel
- Uses the shared dashboard layout and styles
