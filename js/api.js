"use strict";

/* =========================================================
   API layer - every read and write goes to json-server (npm start, port 3000)
   Owner: Chaitanya Pandey
   json-server: all collections
   ========================================================= */

// Normally the same server gives both the pages and the API (npm start, or the deployed site),
// so the API is on the same origin. Only when the pages are opened as a file or with
// VS Code Live Server (port 5500/5501) do we call the API on port 3000.
const API_BASE = location.protocol === "file:" ? "http://localhost:3000"
  : (location.port === "5500" || location.port === "5501") ? location.protocol + "//" + location.hostname + ":3000"
    : "";

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function buildQuery(params) {
  if (!params) return "";
  const parts = [];
  Object.keys(params).forEach(function (key) {
    const value = params[key];
    if (value === undefined || value === null || value === "") return;
    const values = Array.isArray(value) ? value : [value];
    values.forEach(function (v) {
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
    });
  });
  return parts.length ? "?" + parts.join("&") : "";
}

async function apiRequest(method, path, body, params) {
  const options = { method: method, cache: "no-store", headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  // json-server --watch briefly drops connections while it reloads db.json,
  // so safe requests (everything except POST) are retried a couple of times.
  const tries = method === "POST" ? 1 : 3;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      response = await fetch(API_BASE + path + buildQuery(params), options);
      break;
    } catch (networkError) {
      if (attempt === tries) {
        showServerDownBanner();
        throw new ApiError(0, "Cannot connect to the server. Please try again.");
      }
      await new Promise(function (resolve) { setTimeout(resolve, 400 * attempt); });
    }
  }

  if (!response.ok) {
    const message = response.status === 404 ? "Record not found." : "Server error (" + response.status + ").";
    throw new ApiError(response.status, message);
  }

  const text = await response.text();
  return {
    data: text ? JSON.parse(text) : null,
    total: Number(response.headers.get("X-Total-Count") || 0)
  };
}

const api = {
  // GET a list or a single record
  get: async function (path, params) {
    return (await apiRequest("GET", path, undefined, params)).data;
  },
  // GET a record, or null when it does not exist.
  // "/users/123" is fetched as "/users?id=123" so a missing record is an empty list, not a 404.
  find: async function (path, params) {
    const match = path.match(/^\/([^/?]+)\/([^/?]+)$/);
    if (!match) return api.get(path, params);
    const query = Object.assign({}, params, { id: decodeURIComponent(match[2]) });
    const list = await api.get("/" + match[1], query);
    return list.length ? list[0] : null;
  },
  // GET a paginated list: returns { items, total } using json-server's X-Total-Count
  page: async function (path, params) {
    const result = await apiRequest("GET", path, undefined, params);
    return { items: result.data, total: result.total };
  },
  post: async function (path, body) {
    return (await apiRequest("POST", path, body)).data;
  },
  put: async function (path, body) {
    return (await apiRequest("PUT", path, body)).data;
  },
  patch: async function (path, body) {
    return (await apiRequest("PATCH", path, body)).data;
  },
  remove: async function (path) {
    return (await apiRequest("DELETE", path)).data;
  }
};

function idPath(collection, id) {
  return "/" + collection + "/" + encodeURIComponent(id);
}

function showServerDownBanner() {
  if (document.getElementById("serverDown")) return;
  const banner = document.createElement("div");
  banner.id = "serverDown";
  banner.className = "server-down";
  banner.setAttribute("role", "alert");
  banner.innerHTML =
    '<i class="bi bi-plug" aria-hidden="true"></i>' +
    "<span><strong>Cannot connect to the server.</strong> Please check your connection and try again.</span>" +
    '<button type="button" class="btn btn-sm btn-outline" onclick="location.reload()">Retry</button>';
  document.body.prepend(banner);
}
