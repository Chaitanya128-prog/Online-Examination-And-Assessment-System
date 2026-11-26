// Builds db.seed.json (and db.json) - the demo data for all 4 roles.
// Run with: node scripts/build-seed.js        Restore later with: npm run reset
// Owner: Chaitanya Pandey
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");

// Must match hashPassword() in js/common.js
function hashPassword(userId, password) {
  return crypto.createHash("sha256").update("examdesk:" + userId + ":" + password).digest("hex");
}

const now = "2026-11-25T08:00:00.000Z";
const PASSWORDS = { student: "demo123", examiner: "teach123", admin: "admin123", invigilator: "invig123" };

function user(id, name, role, extra) {
  return Object.assign({
    id: id,
    name: name,
    email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@examdesk.edu",
    phone: "",
    role: role,
    password: hashPassword(id, PASSWORDS[role]),
    status: "active",
    createdAt: now,
    notificationsSeenAt: null
  }, extra || {});
}

const users = [
  user("2415000466", "Chaitanya Pandey", "student", { department: "B.Tech CSE" }),
  user("9001", "Akash Gupta", "examiner", { department: "Computer Science",
    subjects: ["Data Structures", "Networks", "Operating Systems", "Security", "Programming", "Web Technologies", "Databases"] }),
  user("7001", "Rahul Mehta", "invigilator", { department: "Exam Cell" }),
  user("1001", "Priya Malhotra", "admin", { department: "Controller of Examinations" })
];

function exam(id, title, subject, date, startTime, duration, status, approval, createdBy, invigilatorId) {
  return {
    id: id,
    title: title,
    subject: subject,
    description: "Assessment covering the core topics of " + title + ".",
    instructions: "MCQs are checked automatically. Written answers are marked by your examiner.",
    date: date,
    startTime: startTime,
    duration: duration,
    status: status,
    approval: approval,
    approvalNote: "",
    approvedBy: approval === "approved" ? "1001" : null,
    correctMarks: 2,
    negativeMarks: 0.5,
    createdBy: createdBy,
    invigilatorId: invigilatorId || null,
    createdAt: now,
    updatedAt: now
  };
}

const exams = [
  exam("DSA-301", "Data Structures & Algorithms", "Data Structures", "2026-11-25", "09:00", 20, "live", "approved", "9001", "7001"),
  exam("CN-204", "Computer Networks", "Networks", "2026-11-30", "10:00", 45, "upcoming", "approved", "9001", "7001"),
  exam("OS-301", "Operating Systems", "Operating Systems", "2026-12-04", "11:00", 60, "draft", "pending", "9001", null),
  exam("CS-305", "Cyber Security", "Security", "2026-12-09", "14:00", 40, "draft", "none", "9001", null)
];

let qid = 1;
const questions = [];
function mcq(examId, text, options, correctIndex) {
  questions.push({ id: qid++, examId: examId, type: "mcq", text: text, options: options, correctIndex: correctIndex });
}
function written(examId, text, marks, modelAnswer) {
  questions.push({ id: qid++, examId: examId, type: "text", text: text, marks: marks, modelAnswer: modelAnswer });
}

mcq("DSA-301", "Which data structure follows the LIFO principle?", ["Queue", "Stack", "Tree", "Graph"], 1);
mcq("DSA-301", "What is the average time complexity of Merge Sort?", ["O(n)", "O(log n)", "O(n log n)", "O(n²)"], 2);
mcq("DSA-301", "Which sorting algorithm uses a pivot?", ["Bubble Sort", "Quick Sort", "Selection Sort", "Insertion Sort"], 1);
mcq("DSA-301", "What is the time complexity of binary search?", ["O(n)", "O(log n)", "O(n log n)", "O(1)"], 1);
mcq("DSA-301", "Which traversal visits the root between left and right subtrees?", ["Preorder", "Inorder", "Postorder", "Level order"], 1);
mcq("DSA-301", "Which data structure is used for BFS of a graph?", ["Stack", "Queue", "Heap", "Array"], 1);
mcq("DSA-301", "What is the worst-case time complexity of Quick Sort?", ["O(n log n)", "O(n)", "O(n²)", "O(log n)"], 2);
mcq("DSA-301", "A complete binary tree with n nodes has height about:", ["n", "log n", "n/2", "√n"], 1);
written("DSA-301", "Explain the difference between a stack and a queue with one real-life example of each.", 4,
  "Stack is LIFO (last in, first out), e.g. a pile of plates. Queue is FIFO (first in, first out), e.g. a ticket line.");
written("DSA-301", "What is a hash collision and name one way to handle it?", 4,
  "Two keys map to the same index. Handled by chaining (linked lists) or open addressing (linear probing).");

mcq("CN-204", "Which OSI layer handles routing?", ["Data link", "Network", "Transport", "Session"], 1);
mcq("CN-204", "Which protocol resolves an IP address to a MAC address?", ["DNS", "DHCP", "ARP", "ICMP"], 2);
mcq("CN-204", "What is the default port of HTTPS?", ["80", "21", "443", "8080"], 2);
written("CN-204", "Compare TCP and UDP in two points.", 4, "TCP is connection-oriented and reliable; UDP is connectionless and faster with no delivery guarantee.");

mcq("OS-301", "Which scheduling algorithm can cause starvation?", ["Round robin", "FCFS", "Priority", "None of these"], 2);
mcq("OS-301", "What does a page fault mean?", ["Disk failure", "Page not in main memory", "Invalid pointer", "Stack overflow"], 1);
written("OS-301", "List the four necessary conditions for deadlock.", 4, "Mutual exclusion, hold and wait, no preemption, circular wait.");

mcq("CS-305", "Which of these is a symmetric encryption algorithm?", ["RSA", "AES", "ECC", "Diffie-Hellman"], 1);

// No exam history: results, violations, incidents and activity start empty.
const results = [];

const db = {
  settings: {
    instituteName: "ExamDesk University",
    passMark: 40,
    sessionHours: 2,
    defaultCorrectMarks: 2,
    defaultNegativeMarks: 0.5,
    requireAllAnswers: false,
    allowRegistration: true,
    requireApproval: true,
    maxTabSwitches: 3,
    maxLoginAttempts: 3,
    lockSeconds: 30
  },
  users: users,
  exams: exams,
  questions: questions,
  results: results,
  attempts: [],
  violations: [],
  incidents: [],
  sessions: [],
  loginAttempts: [],
  announcements: [
    { id: 1, title: "DSA-301 is live", message: "Data Structures & Algorithms is open today: 8 MCQs and 2 written questions, 20 minutes.", audience: "students", priority: "high", createdBy: "9001", createdAt: "2026-11-25T07:30:00.000Z", updatedAt: "2026-11-25T07:30:00.000Z" },
    { id: 2, title: "Exam rules", message: "Stay on the exam screen. Switching tabs 3 times submits your exam automatically.", audience: "all", priority: "normal", createdBy: "1001", createdAt: "2026-11-22T10:00:00.000Z", updatedAt: "2026-11-22T10:00:00.000Z" },
    { id: 3, title: "OS-301 waiting for approval", message: "Please review the Operating Systems paper before Friday.", audience: "admins", priority: "normal", createdBy: "9001", createdAt: "2026-11-24T12:00:00.000Z", updatedAt: "2026-11-24T12:00:00.000Z" }
  ],
  activity: []
};

const text = JSON.stringify(db, null, 2) + "\n";
fs.writeFileSync(path.join(root, "db.seed.json"), text);
fs.writeFileSync(path.join(root, "db.json"), text);
console.log("Seed written:", users.length, "users,", exams.length, "exams,", questions.length, "questions,", results.length, "results");
