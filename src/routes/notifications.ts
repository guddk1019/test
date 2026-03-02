import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { writeAuditLog } from "../services/audit";
import { asyncHandler } from "../utils/asyncHandler";
import { parseId } from "../utils/validators";

interface NotificationRow {
  id: number;
  recipient_user_id: number;
  actor_user_id: number | null;
  actor_employee_id: string | null;
  actor_name: string | null;
  type:
    | "SUBMISSION_SUBMITTED"
    | "SUBMISSION_REVIEWED"
    | "CHANGE_REQUEST_CREATED"
    | "CHANGE_REQUEST_REVIEWED"
    | "COMMENT_CREATED";
  title: string;
  message: string;
  work_item_id: number | null;
  submission_id: number | null;
  change_request_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  meta_json: Record<string, unknown> | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseBooleanFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") {
    return raw;
  }
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {
    throw new HttpError(400, `limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }
  return parsed;
}

function buildTargetPath(
  row: NotificationRow,
  role: "EMPLOYEE" | "ADMIN",
): string | null {
  if (!row.work_item_id) {
    return null;
  }
  if (role === "ADMIN") {
    return `/admin/work-items/${row.work_item_id}`;
  }
  return `/work-items/${row.work_item_id}`;
}

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const onlyUnread = parseBooleanFlag(req.query.onlyUnread);
    const limit = parseLimit(req.query.limit);

    const result = await query<NotificationRow>(
      `
        SELECT
          n.id,
          n.recipient_user_id,
          n.actor_user_id,
          u.employee_id AS actor_employee_id,
          u.full_name AS actor_name,
          n.type,
          n.title,
          n.message,
          n.work_item_id,
          n.submission_id,
          n.change_request_id,
          n.is_read,
          n.read_at,
          n.created_at,
          n.meta_json
        FROM notifications n
        LEFT JOIN users u ON u.id = n.actor_user_id
        WHERE n.recipient_user_id = $1
          AND ($2::boolean = FALSE OR n.is_read = FALSE)
        ORDER BY n.created_at DESC
        LIMIT $3
      `,
      [user.id, onlyUnread, limit],
    );

    const unreadCountResult = await query<{ unread_count: number }>(
      `
        SELECT COUNT(*)::int AS unread_count
        FROM notifications
        WHERE recipient_user_id = $1
          AND is_read = FALSE
      `,
      [user.id],
    );

    res.json({
      unreadCount: unreadCountResult.rows[0]?.unread_count ?? 0,
      items: result.rows.map((row) => ({
        id: row.id,
        recipientUserId: row.recipient_user_id,
        actorUserId: row.actor_user_id,
        actorEmployeeId: row.actor_employee_id,
        actorName: row.actor_name,
        type: row.type,
        title: row.title,
        message: row.message,
        workItemId: row.work_item_id,
        submissionId: row.submission_id,
        changeRequestId: row.change_request_id,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
        meta: row.meta_json ?? {},
        targetPath: buildTargetPath(row, user.role),
      })),
    });
  }),
);

notificationsRouter.post(
  "/:notificationId/read",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const notificationId = parseId(req.params.notificationId);
    if (!notificationId) {
      throw new HttpError(400, "Invalid notificationId.");
    }

    const result = await query<{
      id: number;
      is_read: boolean;
      read_at: string | null;
    }>(
      `
        UPDATE notifications
        SET
          is_read = TRUE,
          read_at = COALESCE(read_at, NOW())
        WHERE id = $1
          AND recipient_user_id = $2
        RETURNING id, is_read, read_at
      `,
      [notificationId, user.id],
    );

    const row = result.rows[0];
    if (!row) {
      throw new HttpError(404, "Notification not found.");
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "notification.read",
      targetType: "notification",
      targetId: notificationId,
    });

    res.json({
      notification: {
        id: row.id,
        isRead: row.is_read,
        readAt: row.read_at,
      },
    });
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const user = req.user!;

    const result = await query<{ id: number }>(
      `
        UPDATE notifications
        SET
          is_read = TRUE,
          read_at = COALESCE(read_at, NOW())
        WHERE recipient_user_id = $1
          AND is_read = FALSE
        RETURNING id
      `,
      [user.id],
    );

    await writeAuditLog({
      actorUserId: user.id,
      action: "notification.read_all",
      targetType: "notification",
      targetId: user.id,
      meta: { updatedCount: result.rowCount ?? 0 },
    });

    res.json({
      updatedCount: result.rowCount ?? 0,
    });
  }),
);
