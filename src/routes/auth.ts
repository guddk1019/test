import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../db";
import { HttpError } from "../middleware/error";
import { issueToken } from "../middleware/auth";
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

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const employeeId = String(req.body?.employeeId ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!employeeId || !password) {
      throw new HttpError(400, "employeeId and password are required.");
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
      throw new HttpError(401, "Invalid credentials.");
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
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
