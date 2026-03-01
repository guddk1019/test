export type UserRole = "EMPLOYEE" | "ADMIN";

export interface AuthUser {
  id: number;
  employeeId: string;
  fullName: string;
  department: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  employeeId: string;
  fullName: string;
  department: string;
  role: UserRole;
}
