import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { writeAuditLog } from "../services/audit";
import { asyncHandler } from "../utils/asyncHandler";
import { isIsoDate, parseId } from "../utils/validators";

interface WorkItemRow {
  id: number;
  owner_user_id: number;
  title: string;
  plan_text: string;
  due_date: string;
  status: "DRAFT" | "SUBMITTED" | "EVALUATING" | "DONE" | "REJECTED";
  created_at: string;
  updated_at: string;
  owner_full_name: string;
  owner_employee_id: string;
  owner_department: string;
}

interface SubmissionRow {
  id: number;
  work_item_id: number;
  version: number;
  status: "UPLOADING" | "SUBMITTED" | "EVALUATING" | "DONE" | "REJECTED";
  change_request_id: number | null;
  change_request_version: number | null;
  note_text: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ArtifactRow {
  id: number;
  submission_id: number;
  original_filename: string;
  stored_filename: string;
  nas_path: string;
  size_bytes: string;
  sha256: string;
  mime_type: string;
  created_at: string;
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
  reviewer_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const workItemsRouter = Router();
workItemsRouter.use(requireAuth);

const WORK_ITEM_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "EVALUATING",
  "DONE",
  "REJECTED",
]);
const MAX_QUERY_LENGTH = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_PLAN_TEXT_LENGTH = 10_000;
const MAX_CHANGE_TEXT_LENGTH = 2_000;

async function getWorkItemForAccessCheck(workItemId: number): Promise<WorkItemRow> {
  const itemResult = await query<WorkItemRow>(
    `
      SELECT
        w.id,
        w.owner_user_id,
        w.title,
        w.plan_text,
        w.due_date,
        w.status,
        w.created_at,
        w.updated_at,
        u.full_name AS owner_full_name,
        u.employee_id AS owner_employee_id,
        u.department AS owner_department
      FROM work_items w
      JOIN users u ON u.id = w.owner_user_id
      WHERE w.id = $1
    `,
    [workItemId],
  );
  const workItem = itemResult.rows[0];
  if (!workItem) {
    throw new HttpError(404, "Work item not found.");
  }
  return workItem;
}

function ensureWorkItemAccess(
  user: { id: number; role: "EMPLOYEE" | "ADMIN" },
  workItem: WorkItemRow,
): void {
  if (user.role !== "ADMIN" && workItem.owner_user_id !== user.id) {
    throw new HttpError(403, "Forbidden.");
  }
}

workItemsRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const status = String(req.query.status ?? "").trim().toUpperCase();
    const keyword = String(req.query.q ?? "").trim();
    if (status && !WORK_ITEM_STATUSES.has(status)) {
      throw new HttpError(400, "Invalid status filter.");
    }
    if (keyword.length > MAX_QUERY_LENGTH) {
      throw new HttpError(400, "Search keyword is too long.");
    }

    const values: unknown[] = [user.id];
    const clauses: string[] = ["w.owner_user_id = $1"];

    if (status) {
      values.push(status);
      clauses.push(`w.status = $${values.length}`);
    }

    if (keyword) {
      values.push(`%${keyword}%`);
      clauses.push(`(w.title ILIKE $${values.length} OR w.plan_text ILIKE $${values.length})`);
    }

    const sql = `
      SELECT
        w.id,
        w.title,
        w.due_date,
        w.status,
        w.created_at,
        w.updated_at,
        COALESCE((SELECT MAX(s.version) FROM submissions s WHERE s.work_item_id = w.id), 0) AS latest_submission_version
      FROM work_items w
      WHERE ${clauses.join(" AND ")}
      ORDER BY w.updated_at DESC
    `;

    const result = await query(sql, values);
    res.json({ items: result.rows });
  }),
);

workItemsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const title = String(req.body?.title ?? "").trim();
    const planText = String(req.body?.planText ?? "").trim();
    const dueDate = String(req.body?.dueDate ?? "").trim();

    if (!title || !planText || !dueDate) {
      throw new HttpError(400, "title, planText, dueDate are required.");
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new HttpError(400, "title is too long.");
    }
    if (planText.length > MAX_PLAN_TEXT_LENGTH) {
      throw new HttpError(400, "planText is too long.");
    }
    if (!isIsoDate(dueDate)) {
      throw new HttpError(400, "dueDate must be YYYY-MM-DD.");
    }

    const created = await query<WorkItemRow>(
      `
        INSERT INTO work_items (owner_user_id, title, plan_text, due_date, status)
        VALUES ($1, $2, $3, $4, 'DRAFT')
        RETURNING id, owner_user_id, title, plan_text, due_date, status, created_at, updated_at
      `,
      [user.id, title, planText, dueDate],
    );
    const item = created.rows[0];

    await writeAuditLog({
      actorUserId: user.id,
      action: "work_item.create",
      targetType: "work_item",
      targetId: item.id,
      meta: { title, dueDate },
    });

    res.status(201).json({
      item: {
        id: item.id,
        ownerUserId: item.owner_user_id,
        title: item.title,
        planText: item.plan_text,
        dueDate: item.due_date,
        status: item.status,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      },
    });
  }),
);

workItemsRouter.get(
  "/:workItemId/change-requests",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const workItemId = parseId(req.params.workItemId);
    if (!workItemId) {
      throw new HttpError(400, "Invalid workItemId.");
    }

    const workItem = await getWorkItemForAccessCheck(workItemId);
    ensureWorkItemAccess(user, workItem);

    const result = await query<ChangeRequestRow>(
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
          c.reviewer_comment,
          c.reviewed_at,
          c.created_at,
          c.updated_at
        FROM change_requests c
        JOIN users ru ON ru.id = c.requester_user_id
        WHERE c.work_item_id = $1
        ORDER BY c.version DESC
      `,
      [workItemId],
    );

    res.json({
      changeRequests: result.rows.map((row) => ({
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
        reviewerComment: row.reviewer_comment,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }),
);

workItemsRouter.post(
  "/:workItemId/change-requests",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const workItemId = parseId(req.params.workItemId);
    if (!workItemId) {
      throw new HttpError(400, "Invalid workItemId.");
    }

    const changeText = String(req.body?.changeText ?? "").trim();
    const proposedPlanTextRaw = String(req.body?.proposedPlanText ?? "").trim();
    const proposedDueDateRaw = String(req.body?.proposedDueDate ?? "").trim();
    const proposedPlanText = proposedPlanTextRaw.length > 0 ? proposedPlanTextRaw : null;
    const proposedDueDate = proposedDueDateRaw.length > 0 ? proposedDueDateRaw : null;

    if (!changeText) {
      throw new HttpError(400, "changeText is required.");
    }
    if (changeText.length > MAX_CHANGE_TEXT_LENGTH) {
      throw new HttpError(400, "changeText is too long.");
    }
    if (proposedPlanText && proposedPlanText.length > MAX_PLAN_TEXT_LENGTH) {
      throw new HttpError(400, "proposedPlanText is too long.");
    }
    if (proposedDueDate && !isIsoDate(proposedDueDate)) {
      throw new HttpError(400, "proposedDueDate must be YYYY-MM-DD.");
    }
    if (!proposedPlanText && !proposedDueDate) {
      throw new HttpError(400, "At least one proposed field is required.");
    }

    const workItem = await getWorkItemForAccessCheck(workItemId);
    ensureWorkItemAccess(user, workItem);

    const inserted = await query<ChangeRequestRow>(
      `
        INSERT INTO change_requests (
          work_item_id,
          requester_user_id,
          version,
          status,
          change_text,
          proposed_plan_text,
          proposed_due_date
        )
        VALUES (
          $1,
          $2,
          (SELECT COALESCE(MAX(version), 0) + 1 FROM change_requests WHERE work_item_id = $1),
          'REQUESTED',
          $3,
          $4,
          $5
        )
        RETURNING
          id,
          work_item_id,
          requester_user_id,
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
      [workItemId, user.id, changeText, proposedPlanText, proposedDueDate],
    );
    const changeRequest = inserted.rows[0];

    await writeAuditLog({
      actorUserId: user.id,
      action: "change_request.create",
      targetType: "change_request",
      targetId: changeRequest.id,
      meta: {
        workItemId,
        version: changeRequest.version,
      },
    });

    res.status(201).json({
      changeRequest: {
        id: changeRequest.id,
        workItemId: changeRequest.work_item_id,
        requesterUserId: changeRequest.requester_user_id,
        version: changeRequest.version,
        status: changeRequest.status,
        changeText: changeRequest.change_text,
        proposedPlanText: changeRequest.proposed_plan_text,
        proposedDueDate: changeRequest.proposed_due_date,
        reviewerUserId: changeRequest.reviewer_user_id,
        reviewerComment: changeRequest.reviewer_comment,
        reviewedAt: changeRequest.reviewed_at,
        createdAt: changeRequest.created_at,
        updatedAt: changeRequest.updated_at,
      },
    });
  }),
);

workItemsRouter.get(
  "/:workItemId",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const workItemId = parseId(req.params.workItemId);
    if (!workItemId) {
      throw new HttpError(400, "Invalid workItemId.");
    }

    const workItem = await getWorkItemForAccessCheck(workItemId);
    ensureWorkItemAccess(user, workItem);

    const submissionResult = await query<SubmissionRow>(
      `
        SELECT
          s.id,
          s.work_item_id,
          s.version,
          s.status,
          s.change_request_id,
          c.version AS change_request_version,
          s.note_text,
          s.submitted_at,
          s.created_at,
          s.updated_at
        FROM submissions s
        LEFT JOIN change_requests c ON c.id = s.change_request_id
        WHERE s.work_item_id = $1
        ORDER BY s.version DESC
      `,
      [workItemId],
    );
    const submissions = submissionResult.rows;
    const submissionIds = submissions.map((row) => row.id);

    let artifactRows: ArtifactRow[] = [];
    if (submissionIds.length > 0) {
      const artifactResult = await query<ArtifactRow>(
        `
          SELECT
            id, submission_id, original_filename, stored_filename,
            nas_path, size_bytes, sha256, mime_type, created_at
          FROM file_artifacts
          WHERE submission_id = ANY($1::bigint[])
          ORDER BY created_at ASC
        `,
        [submissionIds],
      );
      artifactRows = artifactResult.rows;
    }

    const changeResult = await query<ChangeRequestRow>(
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
          c.reviewer_comment,
          c.reviewed_at,
          c.created_at,
          c.updated_at
        FROM change_requests c
        JOIN users ru ON ru.id = c.requester_user_id
        WHERE c.work_item_id = $1
        ORDER BY c.version DESC
      `,
      [workItemId],
    );

    const artifactsBySubmission = new Map<number, ArtifactRow[]>();
    for (const artifact of artifactRows) {
      const list = artifactsBySubmission.get(artifact.submission_id) ?? [];
      list.push(artifact);
      artifactsBySubmission.set(artifact.submission_id, list);
    }

    res.json({
      workItem: {
        id: workItem.id,
        ownerUserId: workItem.owner_user_id,
        ownerEmployeeId: workItem.owner_employee_id,
        ownerName: workItem.owner_full_name,
        ownerDepartment: workItem.owner_department,
        title: workItem.title,
        planText: workItem.plan_text,
        dueDate: workItem.due_date,
        status: workItem.status,
        createdAt: workItem.created_at,
        updatedAt: workItem.updated_at,
      },
      submissions: submissions.map((submission) => ({
        id: submission.id,
        version: submission.version,
        status: submission.status,
        changeRequestId: submission.change_request_id,
        changeRequestVersion: submission.change_request_version,
        noteText: submission.note_text,
        submittedAt: submission.submitted_at,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
        files: (artifactsBySubmission.get(submission.id) ?? []).map((artifact) => ({
          id: artifact.id,
          originalFilename: artifact.original_filename,
          storedFilename: artifact.stored_filename,
          nasPath: artifact.nas_path,
          sizeBytes: Number(artifact.size_bytes),
          sha256: artifact.sha256,
          mimeType: artifact.mime_type,
          createdAt: artifact.created_at,
        })),
      })),
      changeRequests: changeResult.rows.map((row) => ({
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
        reviewerComment: row.reviewer_comment,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  }),
);
