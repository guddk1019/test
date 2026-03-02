import { PoolClient } from "pg";
import { query } from "../db";

export type NotificationType =
  | "SUBMISSION_SUBMITTED"
  | "SUBMISSION_REVIEWED"
  | "CHANGE_REQUEST_CREATED"
  | "CHANGE_REQUEST_REVIEWED"
  | "COMMENT_CREATED";

interface CreateNotificationInput {
  recipientUserId: number;
  actorUserId?: number | null;
  type: NotificationType;
  title: string;
  message: string;
  workItemId?: number | null;
  submissionId?: number | null;
  changeRequestId?: number | null;
  meta?: Record<string, unknown>;
}

const INSERT_SQL = `
  INSERT INTO notifications (
    recipient_user_id,
    actor_user_id,
    type,
    title,
    message,
    work_item_id,
    submission_id,
    change_request_id,
    meta_json
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
`;

async function runInsert(
  input: CreateNotificationInput,
  client?: PoolClient,
): Promise<void> {
  const params = [
    input.recipientUserId,
    input.actorUserId ?? null,
    input.type,
    input.title,
    input.message,
    input.workItemId ?? null,
    input.submissionId ?? null,
    input.changeRequestId ?? null,
    JSON.stringify(input.meta ?? {}),
  ];
  if (client) {
    await client.query(INSERT_SQL, params);
    return;
  }
  await query(INSERT_SQL, params);
}

export async function createNotification(
  input: CreateNotificationInput,
  client?: PoolClient,
): Promise<void> {
  await runInsert(input, client);
}

export async function createNotifications(
  inputs: CreateNotificationInput[],
  client?: PoolClient,
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }
  for (const input of inputs) {
    await runInsert(input, client);
  }
}

export async function listAdminUserIds(client?: PoolClient): Promise<number[]> {
  const sql = `
    SELECT id
    FROM users
    WHERE role = 'ADMIN'
      AND is_active = TRUE
  `;
  const result = client ? await client.query<{ id: number }>(sql) : await query<{ id: number }>(sql);
  return result.rows.map((row) => row.id);
}

export function normalizeRecipientIds(
  recipientIds: number[],
  actorUserId?: number | null,
): number[] {
  const actorId = actorUserId ?? null;
  return Array.from(new Set(recipientIds)).filter((id) => id > 0 && id !== actorId);
}
