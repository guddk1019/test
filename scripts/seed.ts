import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function upsertUser(
  pool: Pool,
  input: {
    employeeId: string;
    fullName: string;
    department: string;
    role: "EMPLOYEE" | "ADMIN";
    password: string;
  },
): Promise<void> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  await pool.query(
    `
      INSERT INTO users (employee_id, full_name, department, role, is_active, password_hash)
      VALUES ($1, $2, $3, $4, TRUE, $5)
      ON CONFLICT (employee_id)
      DO UPDATE
      SET full_name = EXCLUDED.full_name,
          department = EXCLUDED.department,
          role = EXCLUDED.role,
          is_active = TRUE,
          password_hash = EXCLUDED.password_hash
    `,
    [input.employeeId, input.fullName, input.department, input.role, passwordHash],
  );
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: required("DATABASE_URL") });
  try {
    await upsertUser(pool, {
      employeeId: required("SEED_ADMIN_EMPLOYEE_ID"),
      fullName: required("SEED_ADMIN_NAME"),
      department: required("SEED_ADMIN_DEPARTMENT"),
      role: "ADMIN",
      password: required("SEED_ADMIN_PASSWORD"),
    });

    await upsertUser(pool, {
      employeeId: required("SEED_EMPLOYEE_EMPLOYEE_ID"),
      fullName: required("SEED_EMPLOYEE_NAME"),
      department: required("SEED_EMPLOYEE_DEPARTMENT"),
      role: "EMPLOYEE",
      password: required("SEED_EMPLOYEE_PASSWORD"),
    });

    console.log("Seed completed.");
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
