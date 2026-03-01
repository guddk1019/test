import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_ROLE_COOKIE,
  AUTH_TOKEN_COOKIE,
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

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function parseUserFromToken(token: string): AuthUser | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) {
    return null;
  }

  try {
    const payload = JSON.parse(decoded) as Partial<AuthUser> & { sub?: string };
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    if (
      typeof payload.employeeId !== "string" ||
      typeof payload.fullName !== "string" ||
      typeof payload.department !== "string" ||
      (payload.role !== "EMPLOYEE" && payload.role !== "ADMIN")
    ) {
      return null;
    }
    return {
      id,
      employeeId: payload.employeeId,
      fullName: payload.fullName,
      department: payload.department,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=strict${secure ? "; secure" : ""}`;
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
}

export function clearAuthCookies(): void {
  if (typeof document === "undefined") {
    return;
  }
  const expired = -1;
  writeCookie(AUTH_TOKEN_COOKIE, "", expired);
  writeCookie(AUTH_ROLE_COOKIE, "", expired);
}

export function readSessionFromBrowserCookies(): BrowserSession | null {
  const token = readCookieValue(AUTH_TOKEN_COOKIE);
  const roleCookie = readCookieValue(AUTH_ROLE_COOKIE) as UserRole | null;
  if (!token) {
    return null;
  }

  const user = parseUserFromToken(token);
  if (!user) {
    return null;
  }
  if (roleCookie && roleCookie !== user.role) {
    return null;
  }

  return {
    token,
    user,
  };
}
