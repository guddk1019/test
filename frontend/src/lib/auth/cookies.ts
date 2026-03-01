import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_DEPARTMENT_COOKIE,
  AUTH_EMPLOYEE_ID_COOKIE,
  AUTH_FULL_NAME_COOKIE,
  AUTH_ROLE_COOKIE,
  AUTH_TOKEN_COOKIE,
  AUTH_USER_ID_COOKIE,
} from "./constants";
import { AuthUser, LoginResponse, UserRole } from "../types";

interface BrowserSession {
  token: string;
  user: AuthUser;
}

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const parts = document.cookie.split("; ").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));
  if (!found) {
    return null;
  }
  return decodeURIComponent(found.slice(name.length + 1));
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

export function getAuthTokenFromBrowser(): string | null {
  return readCookieValue(AUTH_TOKEN_COOKIE);
}

export function setAuthCookies(payload: LoginResponse): void {
  if (typeof document === "undefined") {
    return;
  }
  writeCookie(AUTH_TOKEN_COOKIE, payload.token, AUTH_COOKIE_MAX_AGE_SECONDS);
  writeCookie(AUTH_ROLE_COOKIE, payload.user.role, AUTH_COOKIE_MAX_AGE_SECONDS);
  writeCookie(AUTH_USER_ID_COOKIE, String(payload.user.id), AUTH_COOKIE_MAX_AGE_SECONDS);
  writeCookie(AUTH_EMPLOYEE_ID_COOKIE, payload.user.employeeId, AUTH_COOKIE_MAX_AGE_SECONDS);
  writeCookie(AUTH_FULL_NAME_COOKIE, payload.user.fullName, AUTH_COOKIE_MAX_AGE_SECONDS);
  writeCookie(AUTH_DEPARTMENT_COOKIE, payload.user.department, AUTH_COOKIE_MAX_AGE_SECONDS);
}

export function clearAuthCookies(): void {
  if (typeof document === "undefined") {
    return;
  }
  const expired = -1;
  writeCookie(AUTH_TOKEN_COOKIE, "", expired);
  writeCookie(AUTH_ROLE_COOKIE, "", expired);
  writeCookie(AUTH_USER_ID_COOKIE, "", expired);
  writeCookie(AUTH_EMPLOYEE_ID_COOKIE, "", expired);
  writeCookie(AUTH_FULL_NAME_COOKIE, "", expired);
  writeCookie(AUTH_DEPARTMENT_COOKIE, "", expired);
}

export function readSessionFromBrowserCookies(): BrowserSession | null {
  const token = readCookieValue(AUTH_TOKEN_COOKIE);
  const role = readCookieValue(AUTH_ROLE_COOKIE) as UserRole | null;
  const id = readCookieValue(AUTH_USER_ID_COOKIE);
  const employeeId = readCookieValue(AUTH_EMPLOYEE_ID_COOKIE);
  const fullName = readCookieValue(AUTH_FULL_NAME_COOKIE);
  const department = readCookieValue(AUTH_DEPARTMENT_COOKIE);

  if (!token || !role || !id || !employeeId || !fullName || !department) {
    return null;
  }

  return {
    token,
    user: {
      id: Number(id),
      employeeId,
      fullName,
      department,
      role,
    },
  };
}
