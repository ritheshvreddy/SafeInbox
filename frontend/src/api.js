// Small fetch wrapper for the SafeInbox backend. All requests go to /api (proxied by Vite / nginx).
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
    response = await fetch(path, {
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
