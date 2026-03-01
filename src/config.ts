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

export const config = {
  port: numberFromEnv("PORT", 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  nasMountPath: path.resolve(process.cwd(), process.env.NAS_MOUNT_PATH ?? "./nas_mount"),
  uploadMaxBytes: numberFromEnv("UPLOAD_MAX_MB", 100) * 1024 * 1024,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
} as const;
