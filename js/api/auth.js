/**
 * js/api/auth.js —— 注册 / 登录 / 当前用户
 */

import {
  request,
  setSession,
  clearSession,
  getToken,
  getCurrentUser,
} from "./client.js";

export async function register(username, password) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { username: username, password: password },
  });
  if (result.ok && result.data && result.data.token) {
    setSession(result.data.token, result.data.user);
  }
  return result;
}

export async function login(username, password) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: { username: username, password: password },
  });
  if (result.ok && result.data && result.data.token) {
    setSession(result.data.token, result.data.user);
  }
  return result;
}

export function me() {
  return request("/api/auth/me");
}

export function logout() {
  clearSession();
}

export { getToken, getCurrentUser };
