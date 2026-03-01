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

interface ChangeRequestRow {
  id: number;
  work_item_id: number;
  requester_user_id: number;
  requester_employee_id: string;
  requester_name: string;
  version: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED";
  change_text: string;
  proposed_plan_text: string | null;
  proposed_due_date: string | null;
  reviewer_user_id: number | null;
  reviewer_name: string | null;
  reviewer_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
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
const CHANGE_REVIEW_STATUSES = new Set(["APPROVED", "REJECTED"]);

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
      change_request_id: number | null;
      change_request_version: number | null;
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
          s.change_request_id,
          c.version AS change_request_version,
          s.note_text,
          s.submitted_at,
          s.created_at,
          s.updated_at,
          COUNT(f.id)::int AS file_count
        FROM submissions s
        LEFT JOIN change_requests c ON c.id = s.change_request_id
        LEFT JOIN file_artifacts f ON f.submission_id = s.id
        WHERE s.work_item_id = $1
        GROUP BY s.id, c.version
        ORDER BY s.version DESC
      `,
      [workItemId],
    );

    const changeRequestResult = await query<ChangeRequestRow>(
      `
        SELECT
          c.id,
          c.work_item_id,
          c.requester_user_id,
          ru.employee_id AS requester_employee_id,
          ru.full_name AS requester_name,
          c.version,
          c.status,
          c.change_text,
          c.proposed_plan_text,
          c.proposed_due_date,
          c.reviewer_user_id,
          rv.full_name AS reviewer_name,
          c.reviewer_comment,
          c.reviewed_at,
          c.created_at,
          c.updated_at
        FROM change_requests c
        JOIN users ru ON ru.id = c.requester_user_id
        LEFT JOIN users rv ON rv.id = c.reviewer_user_id
        WHERE c.work_item_id = $1
        ORDER BY c.version DESC
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
        changeRequestId: row.change_request_id,
        changeRequestVersion: row.change_request_version,
        noteText: row.note_text,
        submittedAt: row.submitted_at,
        fileCount: row.file_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      changeRequests: changeRequestResult.rows.map((row) => ({
        id: row.id,
        workItemId: row.work_item_id,
        requesterUserId: row.requester_user_id,
        requesterEmployeeId: row.requester_employee_id,
        requesterName: row.requester_name,
        version: row.version,
        status: row.status,
        changeText: row.change_text,
        proposedPlanText: row.proposed_plan_text,
        proposedDueDate: row.proposed_due_date,
        reviewerUserId: row.reviewer_user_id,
        reviewerName: row.reviewer_name,
        reviewerComment: row.reviewer_comment,
        reviewedAt: row.reviewed_at,
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

adminRouter.post(
  "/change-requests/:changeRequestId/review",
  asyncHandler(async (req, res) => {
    const actor = req.user!;
    const changeRequestId = parseId(req.params.changeRequestId);
    if (!changeRequestId) {
      throw new HttpError(400, "Invalid changeRequestId.");
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
    if (!CHANGE_REVIEW_STATUSES.has(status)) {
      throw new HttpError(400, "status must be one of APPROVED, REJECTED.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const rowResult = await client.query<{
        id: number;
        work_item_id: number;
        version: number;
        status: "REQUESTED" | "APPROVED" | "REJECTED";
        change_text: string;
        proposed_plan_text: string | null;
        proposed_due_date: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT
            id,
            work_item_id,
            version,
            status,
            change_text,
            proposed_plan_text,
            proposed_due_date,
            created_at,
            updated_at
          FROM change_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [changeRequestId],
      );
      const row = rowResult.rows[0];
      if (!row) {
        throw new HttpError(404, "Change request not found.");
      }
      if (row.status !== "REQUESTED") {
        throw new HttpError(400, "Only REQUESTED change request can be reviewed.");
      }

      const updatedResult = await client.query<{
        id: number;
        work_item_id: number;
        version: number;
        status: "REQUESTED" | "APPROVED" | "REJECTED";
        change_text: string;
        proposed_plan_text: string | null;
        proposed_due_date: string | null;
        reviewer_user_id: number | null;
        reviewer_comment: string | null;
        reviewed_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `
          UPDATE change_requests
          SET
            status = $2,
            reviewer_user_id = $3,
            reviewer_comment = $4,
            reviewed_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            work_item_id,
            version,
            status,
            change_text,
            proposed_plan_text,
            proposed_due_date,
            reviewer_user_id,
            reviewer_comment,
            reviewed_at,
            created_at,
            updated_at
        `,
        [changeRequestId, status, actor.id, comment],
      );
      const updated = updatedResult.rows[0];

      if (status === "APPROVED") {
        await client.query(
          `
            UPDATE work_items
            SET
              plan_text = COALESCE($2, plan_text),
              due_date = COALESCE($3, due_date)
            WHERE id = $1
          `,
          [row.work_item_id, row.proposed_plan_text, row.proposed_due_date],
        );
      }

      await writeAuditLog(
        {
          actorUserId: actor.id,
          action: "change_request.review",
          targetType: "change_request",
          targetId: changeRequestId,
          meta: {
            workItemId: row.work_item_id,
            status,
            comment,
          },
        },
        client,
      );

      await client.query("COMMIT");

      res.json({
        changeRequest: {
          id: updated.id,
          workItemId: updated.work_item_id,
          version: updated.version,
          status: updated.status,
          changeText: updated.change_text,
          proposedPlanText: updated.proposed_plan_text,
          proposedDueDate: updated.proposed_due_date,
          reviewerUserId: updated.reviewer_user_id,
          reviewerComment: updated.reviewer_comment,
          reviewedAt: updated.reviewed_at,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
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
