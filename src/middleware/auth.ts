import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { query } from "../db";
import { AuthUser, JwtPayload, UserRole } from "../types/auth";

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

export function issueToken(user: AuthUser): string {
  const payload: JwtPayload = {
    sub: String(user.id),
    employeeId: user.employeeId,
    fullName: user.fullName,
    department: user.department,
    role: user.role,
  };
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: "HS256",
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ message: "Authorization token is required." });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }) as JwtPayload;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(401).json({ message: "Invalid token." });
      return;
    }

    const result = await query<{
      id: number;
      employee_id: string;
      full_name: string;
      department: string;
      role: UserRole;
      is_active: boolean;
    }>(
      `
        SELECT id, employee_id, full_name, department, role, is_active
        FROM users
        WHERE id = $1
      `,
      [userId],
    );
    const dbUser = result.rows[0];
    if (!dbUser || !dbUser.is_active) {
      res.status(401).json({ message: "Invalid token." });
      return;
    }

    req.user = {
      id: dbUser.id,
      employeeId: dbUser.employee_id,
      fullName: dbUser.full_name,
      department: dbUser.department,
      role: dbUser.role,
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token." });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden." });
      return;
    }
    next();
  };
}
