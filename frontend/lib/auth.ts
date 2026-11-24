// Phiên đăng nhập lưu trong trình duyệt: token (gửi kèm mỗi request) và tên người dùng.
export type User = { id: number; username: string };
const TOKEN = "token";
const USER = "user";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN); } catch { return null; }
}
export function currentUser(): User | null {
  try { return JSON.parse(localStorage.getItem(USER) || "null"); } catch { return null; }
}
export function saveSession(token: string, user: User) {
  try { localStorage.setItem(TOKEN, token); localStorage.setItem(USER, JSON.stringify(user)); } catch { /* ignore */ }
}
export function clearSession() {
  try { localStorage.removeItem(TOKEN); localStorage.removeItem(USER); } catch { /* ignore */ }
}
export function goLogin() {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/login")) return;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
}
