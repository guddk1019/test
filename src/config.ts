import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric env var: ${name}`);
  }
  return parsed;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function setFromCsv(value: string | undefined, fallback: string[]): Set<string> {
  const parsed = parseCsv(value);
  const source = parsed.length > 0 ? parsed : fallback;
  return new Set(source.map((item) => item.toLowerCase()));
}

const corsOriginsRaw = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const corsAllowedOrigins =
  corsOriginsRaw.trim() === "*" ? null : parseCsv(corsOriginsRaw);

export const config = {
  port: numberFromEnv("PORT", 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  jwtIssuer: process.env.JWT_ISSUER ?? "corp-perf",
  jwtAudience: process.env.JWT_AUDIENCE ?? "corp-perf-client",
  nasMountPath: path.resolve(process.cwd(), process.env.NAS_MOUNT_PATH ?? "./nas_mount"),
  uploadMaxBytes: numberFromEnv("UPLOAD_MAX_MB", 100) * 1024 * 1024,
  uploadMaxFilenameLength: numberFromEnv("UPLOAD_MAX_FILENAME_LEN", 180),
  uploadBlockedExtensions: setFromCsv(process.env.UPLOAD_BLOCKED_EXTENSIONS, [
    "exe",
    "msi",
    "dll",
    "bat",
    "cmd",
    "ps1",
    "vbs",
    "js",
    "jar",
    "scr",
    "com",
    "pif",
    "cpl",
    "sh",
  ]),
  corsAllowedOrigins,
  loginRateLimitWindowMs: numberFromEnv("LOGIN_RATE_LIMIT_WINDOW_MS", 10 * 60 * 1000),
  loginRateLimitMaxAttempts: numberFromEnv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 10),
} as const;
