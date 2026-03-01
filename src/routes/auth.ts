import { Router } from "express";
import bcrypt from "bcryptjs";
import { config } from "../config";
import { query } from "../db";
import { HttpError } from "../middleware/error";
import { issueToken } from "../middleware/auth";
import { createRateLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../utils/asyncHandler";

interface UserRow {
  id: number;
  employee_id: string;
  full_name: string;
  department: string;
  role: "EMPLOYEE" | "ADMIN";
  is_active: boolean;
  password_hash: string;
}

export const authRouter = Router();

const MAX_EMPLOYEE_ID_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;

function readClientIp(raw: string): string {
  return raw.replace(/^::ffff:/, "");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const loginRateLimiter = createRateLimiter({
  maxRequests: config.loginRateLimitMaxAttempts,
  windowMs: config.loginRateLimitWindowMs,
  message: "Too many login attempts. Please wait and try again.",
  keyGenerator: (req) => {
    const employeeId = String(req.body?.employeeId ?? "").trim().toLowerCase();
    const ip = readClientIp(req.ip || req.socket.remoteAddress || "unknown");
    return `${ip}:${employeeId || "unknown"}`;
  },
});

authRouter.post(
  "/login",
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const employeeId = String(req.body?.employeeId ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!employeeId || !password) {
      throw new HttpError(400, "employeeId and password are required.");
    }
    if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
      throw new HttpError(400, "employeeId is too long.");
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new HttpError(400, "password is too long.");
    }

    const result = await query<UserRow>(
      `
        SELECT id, employee_id, full_name, department, role, is_active, password_hash
        FROM users
        WHERE employee_id = $1
      `,
      [employeeId],
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      await wait(300);
      throw new HttpError(401, "Invalid credentials.");
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await wait(300);
      throw new HttpError(401, "Invalid credentials.");
    }

    const token = issueToken({
      id: user.id,
      employeeId: user.employee_id,
      fullName: user.full_name,
      department: user.department,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        employeeId: user.employee_id,
        fullName: user.full_name,
        department: user.department,
        role: user.role,
      },
    });
  }),
);
