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

export const workItemsRouter = Router();
workItemsRouter.use(requireAuth);

workItemsRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const status = String(req.query.status ?? "").trim().toUpperCase();
    const keyword = String(req.query.q ?? "").trim();

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
  "/:workItemId",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const workItemId = parseId(req.params.workItemId);
    if (!workItemId) {
      throw new HttpError(400, "Invalid workItemId.");
    }

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
    if (user.role !== "ADMIN" && workItem.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }

    const submissionResult = await query<SubmissionRow>(
      `
        SELECT id, work_item_id, version, status, note_text, submitted_at, created_at, updated_at
        FROM submissions
        WHERE work_item_id = $1
        ORDER BY version DESC
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
    });
  }),
);
