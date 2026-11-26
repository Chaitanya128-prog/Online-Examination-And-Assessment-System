// ExamDesk server: json-server API + the website, on one port.
// Works on your computer (http://localhost:3000) and on hosting sites
// such as Render or Railway, which give the port in process.env.PORT.
// Owner: Chaitanya Pandey
"use strict";

const path = require("path");
const jsonServer = require("json-server");

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, "db.json"));
const defaults = jsonServer.defaults({ static: __dirname });

// Always send fresh data (no browser cache)
server.use(require("./scripts/no-cache"));
server.use(defaults);
server.use(router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
  console.log("ExamDesk is running on http://localhost:" + PORT);
});
