import { Router } from "express";
import { pool, query } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { writeAuditLog } from "../services/audit";
import { asyncHandler } from "../utils/asyncHandler";
import { parseId } from "../utils/validators";

interface WorkItemListRow {
  id: number;
  title: string;
  due_date: string;
  status: string;
  owner_user_id: number;
  owner_employee_id: string;
  owner_name: string;
  owner_department: string;
  latest_submission_version: number;
  updated_at: string;
}

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN"));

const WORK_ITEM_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "EVALUATING",
  "DONE",
  "REJECTED",
]);
const REVIEW_STATUSES = new Set(["REJECTED", "EVALUATING", "DONE"]);
const MAX_QUERY_LENGTH = 100;
const MAX_DEPARTMENT_LENGTH = 100;
const MAX_EMPLOYEE_ID_LENGTH = 64;
const MAX_REVIEW_COMMENT_LENGTH = 2_000;

adminRouter.get(
  "/work-items",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "").trim().toUpperCase();
    const department = String(req.query.department ?? "").trim();
    const ownerEmployeeId = String(req.query.ownerEmployeeId ?? "").trim();
    const keyword = String(req.query.q ?? "").trim();
    if (status && !WORK_ITEM_STATUSES.has(status)) {
      throw new HttpError(400, "Invalid status filter.");
    }
    if (department.length > MAX_DEPARTMENT_LENGTH) {
      throw new HttpError(400, "department is too long.");
    }
    if (ownerEmployeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
      throw new HttpError(400, "ownerEmployeeId is too long.");
    }
    if (keyword.length > MAX_QUERY_LENGTH) {
      throw new HttpError(400, "Search keyword is too long.");
    }

    const values: unknown[] = [];
    const clauses: string[] = [];

    if (status) {
      values.push(status);
      clauses.push(`w.status = $${values.length}`);
    }
    if (department) {
      values.push(department);
      clauses.push(`u.department = $${values.length}`);
    }
    if (ownerEmployeeId) {
      values.push(ownerEmployeeId);
      clauses.push(`u.employee_id = $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      clauses.push(`(w.title ILIKE $${values.length} OR w.plan_text ILIKE $${values.length})`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const result = await query<WorkItemListRow>(
      `
        SELECT
          w.id,
          w.title,
          w.due_date,
          w.status,
          w.owner_user_id,
          u.employee_id AS owner_employee_id,
          u.full_name AS owner_name,
          u.department AS owner_department,
          COALESCE((SELECT MAX(s.version) FROM submissions s WHERE s.work_item_id = w.id), 0) AS latest_submission_version,
          w.updated_at
        FROM work_items w
        JOIN users u ON u.id = w.owner_user_id
        ${whereSql}
        ORDER BY w.updated_at DESC
      `,
      values,
    );

    res.json({
      items: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.due_date,
        status: row.status,
        ownerUserId: row.owner_user_id,
        ownerEmployeeId: row.owner_employee_id,
        ownerName: row.owner_name,
        ownerDepartment: row.owner_department,
        latestSubmissionVersion: row.latest_submission_version,
        updatedAt: row.updated_at,
      })),
    });
  }),
);

adminRouter.get(
  "/work-items/:workItemId",
  asyncHandler(async (req, res) => {
    const workItemId = parseId(req.params.workItemId);
    if (!workItemId) {
      throw new HttpError(400, "Invalid workItemId.");
    }

    const workItemResult = await query<{
      id: number;
      title: string;
      plan_text: string;
      due_date: string;
      status: string;
      owner_user_id: number;
      owner_employee_id: string;
      owner_name: string;
      owner_department: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT
          w.id,
          w.title,
          w.plan_text,
          w.due_date,
          w.status,
          w.owner_user_id,
          u.employee_id AS owner_employee_id,
          u.full_name AS owner_name,
          u.department AS owner_department,
          w.created_at,
          w.updated_at
        FROM work_items w
        JOIN users u ON u.id = w.owner_user_id
        WHERE w.id = $1
      `,
      [workItemId],
    );
    const workItem = workItemResult.rows[0];
    if (!workItem) {
      throw new HttpError(404, "Work item not found.");
    }

    const submissionResult = await query<{
      id: number;
      version: number;
      status: string;
      note_text: string | null;
      submitted_at: string | null;
      created_at: string;
      updated_at: string;
      file_count: number;
    }>(
      `
        SELECT
          s.id,
          s.version,
          s.status,
          s.note_text,
          s.submitted_at,
          s.created_at,
          s.updated_at,
          COUNT(f.id)::int AS file_count
        FROM submissions s
        LEFT JOIN file_artifacts f ON f.submission_id = s.id
        WHERE s.work_item_id = $1
        GROUP BY s.id
        ORDER BY s.version DESC
      `,
      [workItemId],
    );

    res.json({
      workItem: {
        id: workItem.id,
        title: workItem.title,
        planText: workItem.plan_text,
        dueDate: workItem.due_date,
        status: workItem.status,
        ownerUserId: workItem.owner_user_id,
        ownerEmployeeId: workItem.owner_employee_id,
        ownerName: workItem.owner_name,
        ownerDepartment: workItem.owner_department,
        createdAt: workItem.created_at,
        updatedAt: workItem.updated_at,
      },
      submissions: submissionResult.rows.map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        noteText: row.note_text,
        submittedAt: row.submitted_at,
        fileCount: row.file_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }),
);

adminRouter.post(
  "/submissions/:submissionId/review",
  asyncHandler(async (req, res) => {
    const actor = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }

    const status = String(req.body?.status ?? "").trim().toUpperCase();
    const commentRaw = req.body?.comment;
    const comment =
      typeof commentRaw === "string" && commentRaw.trim().length > 0
        ? commentRaw.trim()
        : null;
    if (comment && comment.length > MAX_REVIEW_COMMENT_LENGTH) {
      throw new HttpError(400, "comment is too long.");
    }

    if (!REVIEW_STATUSES.has(status)) {
      throw new HttpError(400, "status must be one of REJECTED, EVALUATING, DONE.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const rowResult = await client.query<{
        id: number;
        work_item_id: number;
      }>(
        `
          SELECT id, work_item_id
          FROM submissions
          WHERE id = $1
          FOR UPDATE
        `,
        [submissionId],
      );
      const row = rowResult.rows[0];
      if (!row) {
        throw new HttpError(404, "Submission not found.");
      }

      const updatedSubmission = await client.query<{
        id: number;
        work_item_id: number;
        version: number;
        status: string;
        note_text: string | null;
        submitted_at: string | null;
        updated_at: string;
      }>(
        `
          UPDATE submissions
          SET status = $2
          WHERE id = $1
          RETURNING id, work_item_id, version, status, note_text, submitted_at, updated_at
        `,
        [submissionId, status],
      );

      await client.query(
        `
          UPDATE work_items
          SET status = $2
          WHERE id = $1
        `,
        [row.work_item_id, status],
      );

      await writeAuditLog(
        {
          actorUserId: actor.id,
          action: "submission.review",
          targetType: "submission",
          targetId: submissionId,
          meta: { status, comment },
        },
        client,
      );

      await client.query("COMMIT");

      res.json({
        submission: {
          id: updatedSubmission.rows[0].id,
          workItemId: updatedSubmission.rows[0].work_item_id,
          version: updatedSubmission.rows[0].version,
          status: updatedSubmission.rows[0].status,
          noteText: updatedSubmission.rows[0].note_text,
          submittedAt: updatedSubmission.rows[0].submitted_at,
          updatedAt: updatedSubmission.rows[0].updated_at,
        },
        comment,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);
