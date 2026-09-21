# Online Examination And Assessement System

A responsive frontend prototype for the Online Examination and Assessment System described in the project synopsis.

## Technologies
- HTML5
- CSS3
- JSON sample data

## Pages
1. `index.html` — Login
2. `dashboard.html` — Student Dashboard
3. `exam.html` — Examination Screen
4. `result.html` — Result & Answer Review
5. `data.json` — Sample structured data
6. `style.css` — Shared responsive stylesheet

## How to run
No installation is required.

Open `index.html` in a browser, or use VS Code Live Server.

### Demo flow
`index.html` → Sign In → `dashboard.html` → Start Exam → `exam.html` → Submit Exam → `result.html`

## Important
This version intentionally uses HTML and CSS only. The timer, score calculation, login validation and database operations are static UI demonstrations and can be made functional later using JavaScript and a backend.

## Examiner Portal

`examiner.html` provides a frontend-only examiner dashboard with:
- Student marks and recent results
- Exam submission counts
- Average score and pass-rate summary
- Examination management table
- Examiner quick actions

The current HTML/CSS version uses sample data. Actual result calculation, authentication and exam management can be connected to JavaScript/backend functionality later.

## Integrated portal flow

The project now contains one common login/entry page with two frontend portal paths:

- **Student:** Login → Student Dashboard → Exam → Result
- **Examiner:** Login → Examiner Portal → Student Marks → Exam Analytics

Both portals use the same `style.css` and `data.json` structure. The current implementation is intentionally HTML/CSS-only, so the login credentials and role selection are demonstration UI; real authentication and dynamic data require JavaScript/backend integration.
