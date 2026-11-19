// Small fetch wrapper for the SafeInbox backend.
// Locally and in Docker, requests go to /api on the same site (proxied by Vite / nginx).
// On Vercel, VITE_API_BASE_URL points at the backend on Render (e.g. https://safeinbox-backend.onrender.com).
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const SESSION_KEY = "safeinbox.session";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token) {
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable (private mode) - the session simply won't survive a page reload
  }
}

export async function api(path, { method = "GET", body, raw = false } = {}) {
  const headers = {};
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the SafeInbox server. Is the backend running?");
  }

  if (raw && response.ok) return response;

  let data = null;
  try {
    data = await response.json();
  } catch {
    // not JSON (e.g. the dev proxy couldn't reach the backend)
  }
  if (!response.ok) {
    if (!data && response.status >= 500) {
      throw new ApiError(response.status, "network", "Can't reach the SafeInbox server. Is the backend running?");
    }
    throw new ApiError(response.status, data?.error || "error", data?.message || `Request failed (${response.status})`);
  }
  return data;
}
