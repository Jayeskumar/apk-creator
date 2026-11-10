// Thin wrapper around the REST API with token handling.
const TOKEN_KEY = "apkc.token";

export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set token(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  },
  user: null,
  system: null,
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(method, url, body, opts = {}) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error || res.statusText);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session.token && !url.startsWith("/api/auth/login")) {
    session.token = null;
    session.user = null;
    location.hash = "#/login";
  }
  if (!res.ok) throw new ApiError(res.status, data.error || res.statusText);
  return data;
}

export const get = (u) => api("GET", u);
export const post = (u, b) => api("POST", u, b ?? {});
export const put = (u, b) => api("PUT", u, b);
export const patch = (u, b) => api("PATCH", u, b);
export const del = (u) => api("DELETE", u);

export async function upload(url, file) {
  const fd = new FormData();
  fd.append("file", file);
  return api("POST", url, fd);
}

/** Download an authenticated resource as a file. */
export async function downloadAuthed(url, filename) {
  const res = await api("GET", url, undefined, { raw: true });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
