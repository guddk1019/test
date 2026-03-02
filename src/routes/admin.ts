import { Router } from "express";
import { pool, query } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { writeAuditLog } from "../services/audit";
import { createNotifications, normalizeRecipientIds } from "../services/notifications";
import { asyncHandler } from "../utils/asyncHandler";
import { isIsoDate, parseId } from "../utils/validators";

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

interface ChangeRequestListRow {
  id: number;
  work_item_id: number;
  work_item_title: string;
  requester_user_id: number;
  requester_employee_id: string;
  requester_name: string;
  version: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED";
  change_text: string;
  proposed_due_date: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DashboardSubmissionRow {
  submission_id: number;
  submission_version: number;
  submission_status: "UPLOADING" | "SUBMITTED" | "EVALUATING" | "DONE" | "REJECTED";
  submitted_at: string | null;
  updated_at: string;
  work_item_id: number;
  work_item_title: string;
  owner_user_id: number;
  owner_employee_id: string;
  owner_name: string;
  owner_department: string;
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
const CHANGE_REQUEST_STATUSES = new Set(["REQUESTED", "APPROVED", "REJECTED"]);
const SUBMISSION_STATUSES = new Set([
  "UPLOADING",
  "SUBMITTED",
  "EVALUATING",
  "DONE",
  "REJECTED",
]);
const MAX_DATE_LENGTH = 10;

function normalizeReviewComment(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function normalizeDateFilter(raw: unknown, fieldName: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) {
    return null;
  }
  if (value.length > MAX_DATE_LENGTH || !isIsoDate(value)) {
    throw new HttpError(400, `${fieldName} must be YYYY-MM-DD.`);
  }
  return value;
}

function calculateHours(startIso: string | null, endIso: string): number | null {
  if (!startIso) {
    return null;
  }
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }
  return (end - start) / (1000 * 60 * 60);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return Number(sorted[mid].toFixed(2));
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

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
  "/dashboard",
  asyncHandler(async (req, res) => {
    const fromDate = normalizeDateFilter(req.query.fromDate, "fromDate");
    const toDate = normalizeDateFilter(req.query.toDate, "toDate");
    const department = String(req.query.department ?? "").trim();
    const ownerEmployeeId = String(req.query.ownerEmployeeId ?? "").trim();
    const submissionStatus = String(req.query.submissionStatus ?? "").trim().toUpperCase();
    if (fromDate && toDate && fromDate > toDate) {
      throw new HttpError(400, "fromDate must be earlier than or equal to toDate.");
    }

    if (department.length > MAX_DEPARTMENT_LENGTH) {
      throw new HttpError(400, "department is too long.");
    }
    if (ownerEmployeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
      throw new HttpError(400, "ownerEmployeeId is too long.");
    }
    if (submissionStatus && !SUBMISSION_STATUSES.has(submissionStatus)) {
      throw new HttpError(400, "Invalid submissionStatus filter.");
    }

    const values: unknown[] = [];
    const clauses: string[] = [];

    if (fromDate) {
      values.push(fromDate);
      clauses.push(`COALESCE(s.submitted_at, s.created_at)::date >= $${values.length}`);
    }
    if (toDate) {
      values.push(toDate);
      clauses.push(`COALESCE(s.submitted_at, s.created_at)::date <= $${values.length}`);
    }
    if (department) {
      values.push(department);
      clauses.push(`u.department = $${values.length}`);
    }
    if (ownerEmployeeId) {
      values.push(ownerEmployeeId);
      clauses.push(`u.employee_id = $${values.length}`);
    }
    if (submissionStatus) {
      values.push(submissionStatus);
      clauses.push(`s.status = $${values.length}`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const result = await query<DashboardSubmissionRow>(
      `
        SELECT
          s.id AS submission_id,
          s.version AS submission_version,
          s.status AS submission_status,
          s.submitted_at,
          s.updated_at,
          w.id AS work_item_id,
          w.title AS work_item_title,
          w.owner_user_id,
          u.employee_id AS owner_employee_id,
          u.full_name AS owner_name,
          u.department AS owner_department
        FROM submissions s
        JOIN work_items w ON w.id = s.work_item_id
        JOIN users u ON u.id = w.owner_user_id
        ${whereSql}
        ORDER BY COALESCE(s.submitted_at, s.created_at) DESC, s.id DESC
        LIMIT 2000
      `,
      values,
    );

    const statusDistribution = {
      UPLOADING: 0,
      SUBMITTED: 0,
      EVALUATING: 0,
      DONE: 0,
      REJECTED: 0,
    };

    const processingHours: number[] = [];
    const employeeMap = new Map<
      string,
      {
        ownerEmployeeId: string;
        ownerName: string;
        ownerDepartment: string;
        total: number;
        done: number;
        rejected: number;
        processingHours: number[];
      }
    >();

    for (const row of result.rows) {
      statusDistribution[row.submission_status] += 1;

      const employeeKey = row.owner_employee_id;
      const employee =
        employeeMap.get(employeeKey) ?? {
          ownerEmployeeId: row.owner_employee_id,
          ownerName: row.owner_name,
          ownerDepartment: row.owner_department,
          total: 0,
          done: 0,
          rejected: 0,
          processingHours: [] as number[],
        };

      employee.total += 1;
      if (row.submission_status === "DONE") {
        employee.done += 1;
      }
      if (row.submission_status === "REJECTED") {
        employee.rejected += 1;
      }

      const hours = calculateHours(row.submitted_at, row.updated_at);
      if (hours !== null && (row.submission_status === "DONE" || row.submission_status === "REJECTED")) {
        processingHours.push(hours);
        employee.processingHours.push(hours);
      }

      employeeMap.set(employeeKey, employee);
    }

    const approvedCount = statusDistribution.DONE;
    const rejectedCount = statusDistribution.REJECTED;
    const reviewingCount = statusDistribution.SUBMITTED + statusDistribution.EVALUATING;

    const employeePerformance = Array.from(employeeMap.values())
      .map((row) => ({
        ownerEmployeeId: row.ownerEmployeeId,
        ownerName: row.ownerName,
        ownerDepartment: row.ownerDepartment,
        total: row.total,
        done: row.done,
        rejected: row.rejected,
        avgProcessingHours: average(row.processingHours),
      }))
      .sort((a, b) => {
        if (b.done !== a.done) {
          return b.done - a.done;
        }
        return b.total - a.total;
      });

    res.json({
      summary: {
        totalSubmissions: result.rows.length,
        approvedCount,
        rejectedCount,
        reviewingCount,
        uploadingCount: statusDistribution.UPLOADING,
        avgProcessingHours: average(processingHours),
        medianProcessingHours: median(processingHours),
      },
      statusDistribution,
      processingHours,
      employeePerformance,
      submissions: result.rows.map((row) => ({
        submissionId: row.submission_id,
        submissionVersion: row.submission_version,
        submissionStatus: row.submission_status,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
        processingHours: calculateHours(row.submitted_at, row.updated_at),
        workItemId: row.work_item_id,
        workItemTitle: row.work_item_title,
        ownerUserId: row.owner_user_id,
        ownerEmployeeId: row.owner_employee_id,
        ownerName: row.owner_name,
        ownerDepartment: row.owner_department,
      })),
    });
  }),
);

adminRouter.get(
  "/change-requests",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "").trim().toUpperCase();
    const requesterEmployeeId = String(req.query.requesterEmployeeId ?? "").trim();
    const fromDate = String(req.query.fromDate ?? "").trim();
    const toDate = String(req.query.toDate ?? "").trim();
    const keyword = String(req.query.q ?? "").trim();

    if (status && !CHANGE_REQUEST_STATUSES.has(status)) {
      throw new HttpError(400, "Invalid change request status filter.");
    }
    if (requesterEmployeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
      throw new HttpError(400, "requesterEmployeeId is too long.");
    }
    if (keyword.length > MAX_QUERY_LENGTH) {
      throw new HttpError(400, "Search keyword is too long.");
    }
    if (fromDate.length > MAX_DATE_LENGTH || toDate.length > MAX_DATE_LENGTH) {
      throw new HttpError(400, "Invalid date length.");
    }
    if (fromDate && !isIsoDate(fromDate)) {
      throw new HttpError(400, "fromDate must be YYYY-MM-DD.");
    }
    if (toDate && !isIsoDate(toDate)) {
      throw new HttpError(400, "toDate must be YYYY-MM-DD.");
    }

    const values: unknown[] = [];
    const clauses: string[] = [];

    if (status) {
      values.push(status);
      clauses.push(`c.status = $${values.length}`);
    }
    if (requesterEmployeeId) {
      values.push(`%${requesterEmployeeId}%`);
      clauses.push(`ru.employee_id ILIKE $${values.length}`);
    }
    if (fromDate) {
      values.push(fromDate);
      clauses.push(`c.created_at::date >= $${values.length}`);
    }
    if (toDate) {
      values.push(toDate);
      clauses.push(`c.created_at::date <= $${values.length}`);
    }
    if (keyword) {
      values.push(`%${keyword}%`);
      clauses.push(
        `(w.title ILIKE $${values.length} OR c.change_text ILIKE $${values.length})`,
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const result = await query<ChangeRequestListRow>(
      `
        SELECT
          c.id,
          c.work_item_id,
          w.title AS work_item_title,
          c.requester_user_id,
          ru.employee_id AS requester_employee_id,
          ru.full_name AS requester_name,
          c.version,
          c.status,
          c.change_text,
          c.proposed_due_date,
          c.reviewed_at,
          c.created_at,
          c.updated_at
        FROM change_requests c
        JOIN work_items w ON w.id = c.work_item_id
        JOIN users ru ON ru.id = c.requester_user_id
        ${whereSql}
        ORDER BY c.created_at DESC
      `,
      values,
    );

    res.json({
      items: result.rows.map((row) => ({
        id: row.id,
        workItemId: row.work_item_id,
        workItemTitle: row.work_item_title,
        requesterUserId: row.requester_user_id,
        requesterEmployeeId: row.requester_employee_id,
        requesterName: row.requester_name,
        version: row.version,
        status: row.status,
        changeText: row.change_text,
        proposedDueDate: row.proposed_due_date,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
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
    const comment = normalizeReviewComment(req.body?.comment);
    if (comment && comment.length > MAX_REVIEW_COMMENT_LENGTH) {
      throw new HttpError(400, "comment is too long.");
    }

    if (!REVIEW_STATUSES.has(status)) {
      throw new HttpError(400, "status must be one of REJECTED, EVALUATING, DONE.");
    }
    if (status === "REJECTED" && !comment) {
      throw new HttpError(400, "comment is required when status is REJECTED.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const rowResult = await client.query<{
        id: number;
        work_item_id: number;
        work_item_title: string;
        owner_user_id: number;
      }>(
        `
          SELECT
            s.id,
            s.work_item_id,
            w.title AS work_item_title,
            w.owner_user_id
          FROM submissions s
          JOIN work_items w ON w.id = s.work_item_id
          WHERE s.id = $1
          FOR UPDATE OF s
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
      const submission = updatedSubmission.rows[0];
      if (!submission) {
        throw new HttpError(500, "Failed to update submission status.");
      }

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

      const recipientUserIds = normalizeRecipientIds([row.owner_user_id], actor.id);
      await createNotifications(
        recipientUserIds.map((recipientUserId) => ({
          recipientUserId,
          actorUserId: actor.id,
          type: "SUBMISSION_REVIEWED",
          title:
            status === "DONE"
              ? "제출이 승인되었습니다."
              : status === "REJECTED"
                ? "제출이 반려되었습니다."
                : "제출이 검토 중입니다.",
          message: `${row.work_item_title} / v${String(submission.version).padStart(3, "0")}${comment ? ` / ${comment}` : ""}`,
          workItemId: row.work_item_id,
          submissionId,
          meta: {
            status,
            comment,
          },
        })),
        client,
      );

      await client.query("COMMIT");

      res.json({
        submission: {
          id: submission.id,
          workItemId: submission.work_item_id,
          version: submission.version,
          status: submission.status,
          noteText: submission.note_text,
          submittedAt: submission.submitted_at,
          updatedAt: submission.updated_at,
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
    const comment = normalizeReviewComment(req.body?.comment);
    if (comment && comment.length > MAX_REVIEW_COMMENT_LENGTH) {
      throw new HttpError(400, "comment is too long.");
    }
    if (!CHANGE_REVIEW_STATUSES.has(status)) {
      throw new HttpError(400, "status must be one of APPROVED, REJECTED.");
    }
    if (status === "REJECTED" && !comment) {
      throw new HttpError(400, "comment is required when status is REJECTED.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const rowResult = await client.query<{
        id: number;
        work_item_id: number;
        work_item_title: string;
        requester_user_id: number;
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
            c.id,
            c.work_item_id,
            w.title AS work_item_title,
            c.requester_user_id,
            c.version,
            c.status,
            c.change_text,
            c.proposed_plan_text,
            c.proposed_due_date,
            c.created_at,
            c.updated_at
          FROM change_requests c
          JOIN work_items w ON w.id = c.work_item_id
          WHERE c.id = $1
          FOR UPDATE OF c
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
      if (!updated) {
        throw new HttpError(500, "Failed to update change request status.");
      }

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

      const recipientUserIds = normalizeRecipientIds([row.requester_user_id], actor.id);
      await createNotifications(
        recipientUserIds.map((recipientUserId) => ({
          recipientUserId,
          actorUserId: actor.id,
          type: "CHANGE_REQUEST_REVIEWED",
          title: status === "APPROVED" ? "변경요청이 승인되었습니다." : "변경요청이 반려되었습니다.",
          message: `${row.work_item_title} / v${String(updated.version).padStart(3, "0")}${comment ? ` / ${comment}` : ""}`,
          workItemId: row.work_item_id,
          changeRequestId,
          meta: {
            status,
            comment,
          },
        })),
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
