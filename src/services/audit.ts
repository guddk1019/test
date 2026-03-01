import { PoolClient } from "pg";
import { query } from "../db";

interface AuditInput {
  actorUserId?: number | null;
  action: string;
  targetType: string;
  targetId: string | number;
  meta?: Record<string, unknown>;
}

export async function writeAuditLog(
  input: AuditInput,
  client?: PoolClient,
): Promise<void> {
  const sql = `
    INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, meta_json)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `;
  const params = [
    input.actorUserId ?? null,
    input.action,
    input.targetType,
    String(input.targetId),
    JSON.stringify(input.meta ?? {}),
  ];
  if (client) {
    await client.query(sql, params);
    return;
  }
  await query(sql, params);
}
