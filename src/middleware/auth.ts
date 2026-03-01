import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
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
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ message: "Authorization token is required." });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = {
      id: Number(payload.sub),
      employeeId: payload.employeeId,
      fullName: payload.fullName,
      department: payload.department,
      role: payload.role,
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
