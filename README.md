# ExamDesk 4.0 - Online Examination and Assessment System

A responsive online exam portal with **four roles**: Student, Examiner (teacher), Invigilator and Admin.
It is built with **HTML, CSS and plain JavaScript**, and every piece of data lives in **json-server** (`db.json`).

Highlights:
- MCQ questions are **checked automatically**.
- Written (text) answers are **marked by the examiner**.
- **Tab switching is detected** and shown to the invigilator live.

## How to run

```powershell
npm install
npm start
```

Open **http://localhost:3000**. `npm start` runs `server.js`: json-server gives the API and the website on one port (it uses `PORT` from the environment when deployed, e.g. on Render).

| Command | What it does |
|---|---|
| `npm start` | API + website on http://localhost:3000 |
| `npm run dev` | Same, but json-server watches `db.json` and reloads it when the file changes |
| `npm run api` | API only on port 3000 (if you open the pages with VS Code Live Server on port 5500) |
| `npm run reset` | Restore `db.json` from `db.seed.json` (clean demo data). Stop the server first, then start it again |
| `node scripts/build-seed.js` | Rebuild `db.seed.json` and `db.json` from the seed script |

### Demo accounts (one account per role; one sign-in page opens the right portal)
| Role | ID | Name | Password |
|---|---|---|---|
| Student | 2415000466 | Chaitanya Pandey | demo123 |
| Examiner (teacher) | 9001 | Akash Gupta | teach123 |
| Invigilator (proctor) | 7001 | Rahul Mehta | invig123 |
| Admin | 1001 | Priya Malhotra | admin123 |

The demo data starts with **no exam history**: no results, violations, incidents or activity. It contains 4 exams by the examiner:
- **DSA-301**: live, 8 MCQ + 2 written
- **CN-204**: upcoming
- **OS-301**: waiting for admin approval
- **CS-305**: draft

More students and staff can be added from the Admin panel, or students can use Register.

## The four roles

| Role | Page | What they do |
|---|---|---|
| **Student** | `dashboard.html`, `exam.html`, `result.html` | See live and upcoming exams. Take exams with MCQ and written questions (auto-save, resume, timer). See results, with written answers marked "Pending review" until graded. |
| **Examiner** (teacher) | `examiner.html` | Create exams and questions (MCQ or written, with a model answer). Send papers to the admin for approval, then open or close them. Grade written answers. Manage results and announcements. |
| **Invigilator** | `invigilator.html` | Live monitor of the exams assigned to them: progress, time left, online/offline status and tab-switch warnings for every student. Give 5 extra minutes or force-submit. Violations log and incident reports. |
| **Admin** | `admin.html` | Approve papers or request changes, and assign invigilators. Add, edit, block or delete teachers, invigilators, admins and students, and reset passwords. Announcements to any role, system settings, and the audit log. |

Exam flow: **Examiner creates paper → sends for approval → Admin approves and assigns an invigilator → Examiner makes it live → Students write while the Invigilator watches → MCQs are graded instantly → Examiner marks written answers → final result is published.**

## Team and work division

Each member owns **one role** end to end: its pages, JavaScript, CSS sections and json-server collections. Every JS file starts with an `Owner:` line. Shared files (`js/common.js`, `css/style.css`) have an owner tag such as `[Dev Sharma]` on each section.

| Member | Roll no. | Role module | Pages | JavaScript | Also owns | CRUD to demo |
|---|---|---|---|---|---|---|
| **Devang Kumar** | 2415000504 | **Student** | `dashboard.html`, `exam.html`, `result.html`, `register.html` | `dashboard.js`, `exam.js` (incl. tab-switch proctoring), `result.js`, `register.js` | `common.js`: Scoring (`scoreAnswers`, `answerReviewHtml`). CSS: Hero, Exam cards, Exam page, Result page, Written answers | **C** register, start attempt, submit result, violation records · **R** dashboard, results · **U** auto-save answers · **D** attempt removed after submit |
| **Chaitanya Pandey** | 2415000466 | **Examiner** + json-server setup | `examiner.html` | `examiner.js`, `examiner-exams.js`, `examiner-grading.js`, `notices.js`, `api.js` | `scripts/`, `package.json`, `db.json`. `common.js`: Formatting, Toasts, Dialogs, Pagination, Page tabs, Staff helpers. CSS: base, buttons, badges, dialogs, examiner, grading | **C** exams, MCQ and written questions, announcements · **R** grading queue · **U** edit exams and questions, marks and feedback, go live/close · **D** exams, questions, results |
| **Dev Singh Chauhan** | 2415000502 | **Admin** | `admin.html` | `admin.js`, `admin-exams.js`, `admin-users.js`, `admin-settings.js` | `common.js`: Settings, Password hashing, Sessions, Theme, Forms. CSS: Forms, Brand, Role badges | **C** staff and students · **R** audit log, papers · **U** approve or reject papers, assign invigilator, settings, passwords · **D** users, exams, expired sessions |
| **Dev Sharma** | 2415000500 | **Invigilator** + landing page + login / profile | `invigilator.html`, `index.html`, `login.html`, `profile.html` | `invigilator.js`, `landing.js`, `login.js`, `profile.js` | `common.js`: App header and notifications. CSS: Auth pages, theme tokens, App header, Stats, Tables, Landing page, Invigilator monitor | **C** incident reports · **R** live monitor, violations log · **U** extra time, force submit, edit incident · **D** dismiss violation, delete incident |

### Working together without clashes
- Edit only your own files and your own tagged sections. If you need something in someone else's file, ask the owner.
- Put new CSS under your own section in `css/style.css`, including your mobile rules in the Responsive block.
- Script order matters on the staff pages: the tab files load before the page's main file (see the `<script>` tags at the bottom of each HTML file).
- Talk to the owner before changing what a shared helper takes or returns: `api.*`, `toast`, `confirmDialog`, `openModal`, `escapeHtml`, `scoreAnswers`, `setupTabs`, `iconButton`.
- Run `npm run reset` before a demo so everyone starts from the same data.

## json-server collections (`db.json`)

| Collection | Used for |
|---|---|
| `users` | All 4 roles (id = roll no. or staff ID, salted SHA-256 password). Examiners also have `subjects`. |
| `exams` | Exam details, `status` (draft / upcoming / live / completed), `approval` (none / pending / approved / rejected), `createdBy`, `invigilatorId` |
| `questions` | `type: "mcq"` (options + `correctIndex`) or `type: "text"` (`marks` + `modelAnswer`) |
| `attempts` | Exams in progress: answers, review marks, deadline, `violations`, `extraMinutes`, `forceSubmit`, `lastSeenAt` |
| `results` | Graded submissions with a snapshot of each question. `status: "pending"` until the written answers are marked. |
| `violations` | One record per tab switch, window change, full-screen exit or copy/paste attempt |
| `incidents` | Invigilator reports |
| `announcements` | Notices with an audience (everyone, students, examiners, invigilators, admins) |
| `sessions`, `loginAttempts` | Sign-in sessions and wrong-password lockout |
| `activity` | Audit log shown to the admin |
| `settings` | Pass mark, default marks, tab-switch limit, approval switch, session length, lockout, registration |

json-server features used:
- filters
- `_like` search
- `_gte` / `_lte` ranges
- `_ne`
- repeated keys for OR (`examId=A&examId=B`)
- `_sort` / `_order`
- `_page` / `_limit` with `X-Total-Count`
- `_embed` / `_expand`

**Important json-server rule:** after every DELETE, json-server 0.17 also deletes any record whose `...Id` field points to a record that no longer exists. For example, deleting a user removes their results and sessions. That is why:
- violations store `attemptKey`, not `attemptId`, so they survive after the attempt is removed;
- an incident only gets a `userId` when a student is named.

## Proctoring (tab-switch detection)
In `js/exam.js`, owned by Devang Kumar:
- The exam opens in full screen.
- Leaving the tab (`visibilitychange`), switching windows (`blur`) and leaving full screen are each recorded as a violation. One Alt+Tab counts once.
- Copy, paste, cut and right-click are blocked and recorded.
- Each event is saved to `/violations`, and the student sees a warning.
- When the count reaches the admin's limit (`settings.maxTabSwitches`, default 3), the exam is submitted automatically.
- Every 8 seconds the exam page checks the server. This lets it pick up extra time or a force-submit from the invigilator.

Browsers cannot stop a student from switching tabs; they can only detect it. This is true of every online exam system.

## Limitations
This is a teaching project. json-server has no real authentication. Anyone who can reach port 3000 can read or change `db.json`, including the correct answers. Do not use it for real, supervised exams without a proper backend.

