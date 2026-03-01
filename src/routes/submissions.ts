import { unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { config } from "../config";
import { pool, query } from "../db";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { writeAuditLog } from "../services/audit";
import {
  buildNasRelativeDir,
  storeUploadedFile,
  writeManifest,
} from "../services/storage";
import { asyncHandler } from "../utils/asyncHandler";
import { parseId } from "../utils/validators";

interface WorkItemOwnerRow {
  id: number;
  owner_user_id: number;
  owner_employee_id: string;
  owner_department: string;
}

interface ChangeRequestLinkRow {
  id: number;
  work_item_id: number;
  version: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED";
}

interface SubmissionOwnerRow {
  submission_id: number;
  work_item_id: number;
  version: number;
  status: "UPLOADING" | "SUBMITTED" | "EVALUATING" | "DONE" | "REJECTED";
  created_at: Date | string;
  owner_user_id: number;
  owner_employee_id: string;
  owner_department: string;
}

interface ArtifactRow {
  id: number;
  original_filename: string;
  stored_filename: string;
  nas_path: string;
  size_bytes: string;
  sha256: string;
  mime_type: string;
  created_at: Date | string;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadMaxBytes,
  },
});

const MAX_UPLOAD_FILES = 30;
const MAX_NOTE_TEXT_LENGTH = 2_000;

function readExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

function validateUploadedFile(file: Express.Multer.File): void {
  if (!file.originalname || file.originalname.trim().length === 0) {
    throw new HttpError(400, "File name is required.");
  }
  if (file.originalname.length > config.uploadMaxFilenameLength) {
    throw new HttpError(400, "File name is too long.");
  }
  if (!file.buffer || file.buffer.byteLength === 0) {
    throw new HttpError(400, "Empty files are not allowed.");
  }

  const extension = readExtension(file.originalname);
  if (extension && config.uploadBlockedExtensions.has(extension)) {
    throw new HttpError(400, `File extension ".${extension}" is not allowed.`);
  }
}

function uploadFilesMiddleware(req: any, res: any, next: any) {
  upload.array("files", MAX_UPLOAD_FILES)(req, res, (error: any) => {
    if (error) {
      next(new HttpError(400, error.message));
      return;
    }
    next();
  });
}

export const submissionsRouter = Router();
submissionsRouter.use(requireAuth);

submissionsRouter.post(
  "/work-items/:workItemId/submissions",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const workItemId = parseId(req.params.workItemId);
    if (!workItemId) {
      throw new HttpError(400, "Invalid workItemId.");
    }
    const changeRequestIdRaw = req.body?.changeRequestId;
    const changeRequestId =
      changeRequestIdRaw === undefined || changeRequestIdRaw === null || changeRequestIdRaw === ""
        ? null
        : parseId(String(changeRequestIdRaw));
    if (changeRequestIdRaw !== undefined && changeRequestId === null) {
      throw new HttpError(400, "Invalid changeRequestId.");
    }

    const ownerResult = await query<WorkItemOwnerRow>(
      `
        SELECT
          w.id,
          w.owner_user_id,
          u.employee_id AS owner_employee_id,
          u.department AS owner_department
        FROM work_items w
        JOIN users u ON u.id = w.owner_user_id
        WHERE w.id = $1
      `,
      [workItemId],
    );
    const workItem = ownerResult.rows[0];
    if (!workItem) {
      throw new HttpError(404, "Work item not found.");
    }
    if (user.role !== "ADMIN" && workItem.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }
    if (changeRequestId) {
      const changeRequestResult = await query<ChangeRequestLinkRow>(
        `
          SELECT id, work_item_id, version, status
          FROM change_requests
          WHERE id = $1
        `,
        [changeRequestId],
      );
      const changeRequest = changeRequestResult.rows[0];
      if (!changeRequest || changeRequest.work_item_id !== workItemId) {
        throw new HttpError(400, "Invalid changeRequestId for this work item.");
      }
      if (changeRequest.status !== "APPROVED") {
        throw new HttpError(400, "Only APPROVED change request can be linked.");
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM work_items WHERE id = $1 FOR UPDATE", [workItemId]);

      const versionResult = await client.query<{ next_version: number }>(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM submissions WHERE work_item_id = $1",
        [workItemId],
      );
      const nextVersion = versionResult.rows[0].next_version;

      const inserted = await client.query<{
        id: number;
        work_item_id: number;
        version: number;
        change_request_id: number | null;
        status: string;
        created_at: string;
      }>(
        `
          INSERT INTO submissions (work_item_id, version, status, change_request_id)
          VALUES ($1, $2, 'UPLOADING', $3)
          RETURNING id, work_item_id, version, change_request_id, status, created_at
        `,
        [workItemId, nextVersion, changeRequestId],
      );

      await writeAuditLog(
        {
          actorUserId: user.id,
          action: "submission.create",
          targetType: "submission",
          targetId: inserted.rows[0].id,
          meta: { workItemId, version: nextVersion, changeRequestId },
        },
        client,
      );

      await client.query("COMMIT");
      res.status(201).json({
        submission: {
          id: inserted.rows[0].id,
          workItemId: inserted.rows[0].work_item_id,
          version: inserted.rows[0].version,
          changeRequestId: inserted.rows[0].change_request_id,
          status: inserted.rows[0].status,
          createdAt: inserted.rows[0].created_at,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

submissionsRouter.post(
  "/submissions/:submissionId/files",
  uploadFilesMiddleware,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      throw new HttpError(400, "At least one file is required.");
    }
    for (const file of files) {
      validateUploadedFile(file);
    }

    const ownerResult = await query<SubmissionOwnerRow>(
      `
        SELECT
          s.id AS submission_id,
          s.work_item_id,
          s.version,
          s.status,
          s.created_at,
          w.owner_user_id,
          u.employee_id AS owner_employee_id,
          u.department AS owner_department
        FROM submissions s
        JOIN work_items w ON w.id = s.work_item_id
        JOIN users u ON u.id = w.owner_user_id
        WHERE s.id = $1
      `,
      [submissionId],
    );
    const owner = ownerResult.rows[0];
    if (!owner) {
      throw new HttpError(404, "Submission not found.");
    }
    if (user.role !== "ADMIN" && owner.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }
    if (owner.status !== "UPLOADING") {
      throw new HttpError(400, "Submission is not in UPLOADING status.");
    }

    const createdDate = new Date(owner.created_at);
    const year = Number.isNaN(createdDate.getTime())
      ? new Date().getFullYear()
      : createdDate.getFullYear();
    const nasRelativeDir = buildNasRelativeDir({
      year,
      department: owner.owner_department,
      employeeId: owner.owner_employee_id,
      workItemId: owner.work_item_id,
      version: owner.version,
    });

    const savedAbsolutePaths: string[] = [];
    const uploadedPayload: Array<{
      id: number;
      originalFilename: string;
      storedFilename: string;
      nasPath: string;
      sizeBytes: number;
      sha256: string;
      mimeType: string;
      createdAt: string;
    }> = [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lock = await client.query<{ status: string }>(
        "SELECT status FROM submissions WHERE id = $1 FOR UPDATE",
        [submissionId],
      );
      if (lock.rows[0]?.status !== "UPLOADING") {
        throw new HttpError(400, "Submission is not in UPLOADING status.");
      }

      for (const file of files) {
        const stored = await storeUploadedFile({
          nasRelativeDir,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
        });
        savedAbsolutePaths.push(stored.absolutePath);

        const inserted = await client.query<{
          id: number;
          created_at: string;
        }>(
          `
            INSERT INTO file_artifacts (
              submission_id, original_filename, stored_filename, nas_path, size_bytes, sha256, mime_type
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
          `,
          [
            submissionId,
            stored.originalFilename,
            stored.storedFilename,
            stored.nasPath,
            stored.sizeBytes,
            stored.sha256,
            stored.mimeType,
          ],
        );

        uploadedPayload.push({
          id: inserted.rows[0].id,
          originalFilename: stored.originalFilename,
          storedFilename: stored.storedFilename,
          nasPath: stored.nasPath,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          mimeType: stored.mimeType,
          createdAt: inserted.rows[0].created_at,
        });
      }

      await writeAuditLog(
        {
          actorUserId: user.id,
          action: "submission.upload_files",
          targetType: "submission",
          targetId: submissionId,
          meta: { fileCount: files.length, nasRelativeDir },
        },
        client,
      );

      await client.query("COMMIT");
      res.status(201).json({
        uploaded: uploadedPayload,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      await Promise.all(
        savedAbsolutePaths.map(async (absolutePath) => {
          try {
            await unlink(absolutePath);
          } catch {
            // best effort cleanup
          }
        }),
      );
      throw error;
    } finally {
      client.release();
    }
  }),
);

submissionsRouter.post(
  "/submissions/:submissionId/finalize",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }
    const noteTextRaw = req.body?.noteText;
    const noteText =
      typeof noteTextRaw === "string" && noteTextRaw.trim().length > 0
        ? noteTextRaw.trim()
        : null;
    if (noteText && noteText.length > MAX_NOTE_TEXT_LENGTH) {
      throw new HttpError(400, "noteText is too long.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const ownerResult = await client.query<SubmissionOwnerRow>(
        `
          SELECT
            s.id AS submission_id,
            s.work_item_id,
            s.version,
            s.status,
            s.created_at,
            w.owner_user_id,
            u.employee_id AS owner_employee_id,
            u.department AS owner_department
          FROM submissions s
          JOIN work_items w ON w.id = s.work_item_id
          JOIN users u ON u.id = w.owner_user_id
          WHERE s.id = $1
          FOR UPDATE OF s
        `,
        [submissionId],
      );
      const owner = ownerResult.rows[0];
      if (!owner) {
        throw new HttpError(404, "Submission not found.");
      }
      if (user.role !== "ADMIN" && owner.owner_user_id !== user.id) {
        throw new HttpError(403, "Forbidden.");
      }
      if (owner.status !== "UPLOADING") {
        throw new HttpError(400, "Only UPLOADING submission can be finalized.");
      }

      const artifactResult = await client.query<ArtifactRow>(
        `
          SELECT
            id, original_filename, stored_filename, nas_path,
            size_bytes, sha256, mime_type, created_at
          FROM file_artifacts
          WHERE submission_id = $1
          ORDER BY created_at ASC
        `,
        [submissionId],
      );

      if (artifactResult.rows.length === 0) {
        throw new HttpError(400, "No uploaded files found for this submission.");
      }

      const nasRelativeDir = path.posix.dirname(artifactResult.rows[0].nas_path);
      const manifest = {
        submissionId,
        workItemId: owner.work_item_id,
        version: owner.version,
        generatedAt: new Date().toISOString(),
        files: artifactResult.rows.map((file) => ({
          id: file.id,
          originalFilename: file.original_filename,
          storedFilename: file.stored_filename,
          nasPath: file.nas_path,
          sizeBytes: Number(file.size_bytes),
          sha256: file.sha256,
          mimeType: file.mime_type,
          createdAt: file.created_at,
        })),
      };
      await writeManifest({ nasRelativeDir, manifest });

      const submissionResult = await client.query<{
        id: number;
        work_item_id: number;
        version: number;
        status: string;
        note_text: string | null;
        submitted_at: string;
      }>(
        `
          UPDATE submissions
          SET status = 'SUBMITTED',
              note_text = $2,
              submitted_at = NOW()
          WHERE id = $1
          RETURNING id, work_item_id, version, status, note_text, submitted_at
        `,
        [submissionId, noteText],
      );

      await client.query(
        `
          UPDATE work_items
          SET status = 'SUBMITTED'
          WHERE id = $1
        `,
        [owner.work_item_id],
      );

      await writeAuditLog(
        {
          actorUserId: user.id,
          action: "submission.finalize",
          targetType: "submission",
          targetId: submissionId,
          meta: { workItemId: owner.work_item_id, version: owner.version },
        },
        client,
      );

      await client.query("COMMIT");

      const submission = submissionResult.rows[0];
      res.json({
        submission: {
          id: submission.id,
          workItemId: submission.work_item_id,
          version: submission.version,
          status: submission.status,
          noteText: submission.note_text,
          submittedAt: submission.submitted_at,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

submissionsRouter.get(
  "/submissions/:submissionId/status",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }

    const result = await query<{
      id: number;
      work_item_id: number;
      change_request_id: number | null;
      status: string;
      note_text: string | null;
      submitted_at: string | null;
      updated_at: string;
      owner_user_id: number;
    }>(
      `
        SELECT
          s.id,
          s.work_item_id,
          s.change_request_id,
          s.status,
          s.note_text,
          s.submitted_at,
          s.updated_at,
          w.owner_user_id
        FROM submissions s
        JOIN work_items w ON w.id = s.work_item_id
        WHERE s.id = $1
      `,
      [submissionId],
    );
    const submission = result.rows[0];
    if (!submission) {
      throw new HttpError(404, "Submission not found.");
    }
    if (user.role !== "ADMIN" && submission.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }

    res.json({
      submission: {
        id: submission.id,
        workItemId: submission.work_item_id,
        changeRequestId: submission.change_request_id,
        status: submission.status,
        noteText: submission.note_text,
        submittedAt: submission.submitted_at,
        updatedAt: submission.updated_at,
      },
    });
  }),
);
