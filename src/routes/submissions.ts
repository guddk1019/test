import { access, unlink } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import type { PoolClient } from "pg";
import { config } from "../config";
import { pool, query } from "../db";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { writeAuditLog } from "../services/audit";
import {
  buildNasRelativeDir,
  toAbsoluteNasPath,
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

interface ArtifactOwnerRow {
  artifact_id: number;
  submission_id: number;
  work_item_id: number;
  version: number;
  submission_status: "UPLOADING" | "SUBMITTED" | "EVALUATING" | "DONE" | "REJECTED";
  owner_user_id: number;
  original_filename: string;
  stored_filename: string;
  nas_path: string;
  size_bytes: string;
  sha256: string;
  mime_type: string;
  created_at: Date | string;
}

interface FileArtifactRevisionRow {
  id: number;
  file_artifact_id: number;
  submission_id: number;
  revision_no: number;
  action: string;
  actor_user_id: number | null;
  actor_employee_id: string | null;
  actor_name: string | null;
  original_filename: string;
  stored_filename: string;
  nas_path: string;
  size_bytes: string;
  sha256: string;
  mime_type: string;
  created_at: Date | string;
}

interface RevisionDownloadRow {
  revision_id: number;
  original_filename: string;
  mime_type: string;
  nas_path: string;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadMaxBytes,
  },
});

const MAX_UPLOAD_FILES = 30;
const MAX_NOTE_TEXT_LENGTH = 2_000;
const EDITABLE_FILE_STATUSES = new Set(["UPLOADING", "SUBMITTED"]);

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

function uploadSingleFileMiddleware(req: any, res: any, next: any) {
  upload.single("file")(req, res, (error: any) => {
    if (error) {
      next(new HttpError(400, error.message));
      return;
    }
    next();
  });
}

async function getArtifactOwnerRow(
  submissionId: number,
  fileArtifactId: number,
): Promise<ArtifactOwnerRow | undefined> {
  const result = await query<ArtifactOwnerRow>(
    `
      SELECT
        f.id AS artifact_id,
        f.submission_id,
        s.work_item_id,
        s.version,
        s.status AS submission_status,
        w.owner_user_id,
        f.original_filename,
        f.stored_filename,
        f.nas_path,
        f.size_bytes,
        f.sha256,
        f.mime_type,
        f.created_at
      FROM file_artifacts f
      JOIN submissions s ON s.id = f.submission_id
      JOIN work_items w ON w.id = s.work_item_id
      WHERE f.id = $1
        AND f.submission_id = $2
    `,
    [fileArtifactId, submissionId],
  );
  return result.rows[0];
}

function isEditableFileStatus(status: string | undefined): boolean {
  return Boolean(status && EDITABLE_FILE_STATUSES.has(status));
}

async function writeSubmissionManifestSnapshot(input: {
  client: PoolClient;
  submissionId: number;
  workItemId: number;
  version: number;
}): Promise<void> {
  const artifactResult = await input.client.query(
    `
      SELECT
        id,
        original_filename,
        stored_filename,
        nas_path,
        size_bytes,
        sha256,
        mime_type,
        created_at
      FROM file_artifacts
      WHERE submission_id = $1
      ORDER BY created_at ASC
    `,
    [input.submissionId],
  );

  const artifactRows = artifactResult.rows as ArtifactRow[];

  if (artifactRows.length === 0) {
    throw new HttpError(400, "At least one file is required for SUBMITTED submission.");
  }

  const nasRelativeDir = path.posix.dirname(artifactRows[0].nas_path);
  const manifest = {
    submissionId: input.submissionId,
    workItemId: input.workItemId,
    version: input.version,
    generatedAt: new Date().toISOString(),
    files: artifactRows.map((file) => ({
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
}

async function saveFileArtifactRevision(input: {
  client: PoolClient;
  artifact: ArtifactOwnerRow;
  actorUserId: number;
  action: "REPLACE";
}): Promise<number> {
  const revisionResult = await input.client.query<{ next_revision_no: number }>(
    `
      SELECT COALESCE(MAX(revision_no), 0) + 1 AS next_revision_no
      FROM file_artifact_revisions
      WHERE file_artifact_id = $1
    `,
    [input.artifact.artifact_id],
  );
  const revisionNo = revisionResult.rows[0].next_revision_no;

  await input.client.query(
    `
      INSERT INTO file_artifact_revisions (
        file_artifact_id,
        submission_id,
        revision_no,
        action,
        actor_user_id,
        original_filename,
        stored_filename,
        nas_path,
        size_bytes,
        sha256,
        mime_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      input.artifact.artifact_id,
      input.artifact.submission_id,
      revisionNo,
      input.action,
      input.actorUserId,
      input.artifact.original_filename,
      input.artifact.stored_filename,
      input.artifact.nas_path,
      Number(input.artifact.size_bytes),
      input.artifact.sha256,
      input.artifact.mime_type,
    ],
  );

  return revisionNo;
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
  "/submissions/:submissionId/files/:fileArtifactId/download",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }
    const fileArtifactId = parseId(req.params.fileArtifactId);
    if (!fileArtifactId) {
      throw new HttpError(400, "Invalid fileArtifactId.");
    }

    const artifact = await getArtifactOwnerRow(submissionId, fileArtifactId);
    if (!artifact) {
      throw new HttpError(404, "File artifact not found.");
    }
    if (user.role !== "ADMIN" && artifact.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }

    const absolutePath = toAbsoluteNasPath(artifact.nas_path);
    try {
      await access(absolutePath);
    } catch {
      throw new HttpError(404, "File does not exist in storage.");
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "submission.download_file",
      targetType: "file_artifact",
      targetId: fileArtifactId,
      meta: {
        submissionId,
        workItemId: artifact.work_item_id,
        version: artifact.version,
        originalFilename: artifact.original_filename,
      },
    });

    res.setHeader("Content-Type", artifact.mime_type || "application/octet-stream");
    res.download(absolutePath, artifact.original_filename);
  }),
);

submissionsRouter.get(
  "/submissions/:submissionId/files/:fileArtifactId/revisions",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }
    const fileArtifactId = parseId(req.params.fileArtifactId);
    if (!fileArtifactId) {
      throw new HttpError(400, "Invalid fileArtifactId.");
    }

    const artifact = await getArtifactOwnerRow(submissionId, fileArtifactId);
    if (!artifact) {
      throw new HttpError(404, "File artifact not found.");
    }
    if (user.role !== "ADMIN" && artifact.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }

    const result = await query<FileArtifactRevisionRow>(
      `
        SELECT
          r.id,
          r.file_artifact_id,
          r.submission_id,
          r.revision_no,
          r.action,
          r.actor_user_id,
          u.employee_id AS actor_employee_id,
          u.full_name AS actor_name,
          r.original_filename,
          r.stored_filename,
          r.nas_path,
          r.size_bytes,
          r.sha256,
          r.mime_type,
          r.created_at
        FROM file_artifact_revisions r
        LEFT JOIN users u ON u.id = r.actor_user_id
        WHERE r.file_artifact_id = $1
          AND r.submission_id = $2
        ORDER BY r.revision_no DESC
      `,
      [fileArtifactId, submissionId],
    );

    res.json({
      revisions: result.rows.map((row) => ({
        id: row.id,
        fileArtifactId: row.file_artifact_id,
        submissionId: row.submission_id,
        revisionNo: row.revision_no,
        action: row.action,
        actorUserId: row.actor_user_id,
        actorEmployeeId: row.actor_employee_id,
        actorName: row.actor_name,
        originalFilename: row.original_filename,
        storedFilename: row.stored_filename,
        nasPath: row.nas_path,
        sizeBytes: Number(row.size_bytes),
        sha256: row.sha256,
        mimeType: row.mime_type,
        createdAt: row.created_at,
      })),
    });
  }),
);

submissionsRouter.get(
  "/submissions/:submissionId/files/:fileArtifactId/revisions/:revisionId/download",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }
    const fileArtifactId = parseId(req.params.fileArtifactId);
    if (!fileArtifactId) {
      throw new HttpError(400, "Invalid fileArtifactId.");
    }
    const revisionId = parseId(req.params.revisionId);
    if (!revisionId) {
      throw new HttpError(400, "Invalid revisionId.");
    }

    const artifact = await getArtifactOwnerRow(submissionId, fileArtifactId);
    if (!artifact) {
      throw new HttpError(404, "File artifact not found.");
    }
    if (user.role !== "ADMIN" && artifact.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }

    const revisionResult = await query<RevisionDownloadRow>(
      `
        SELECT
          r.id AS revision_id,
          r.original_filename,
          r.mime_type,
          r.nas_path
        FROM file_artifact_revisions r
        WHERE r.id = $1
          AND r.file_artifact_id = $2
          AND r.submission_id = $3
      `,
      [revisionId, fileArtifactId, submissionId],
    );
    const revision = revisionResult.rows[0];
    if (!revision) {
      throw new HttpError(404, "File revision not found.");
    }

    const absolutePath = toAbsoluteNasPath(revision.nas_path);
    try {
      await access(absolutePath);
    } catch {
      throw new HttpError(404, "Revision file does not exist in storage.");
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "submission.download_file_revision",
      targetType: "file_artifact_revision",
      targetId: revisionId,
      meta: {
        submissionId,
        fileArtifactId,
      },
    });

    res.setHeader("Content-Type", revision.mime_type || "application/octet-stream");
    res.download(absolutePath, revision.original_filename);
  }),
);

submissionsRouter.put(
  "/submissions/:submissionId/files/:fileArtifactId",
  uploadSingleFileMiddleware,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }
    const fileArtifactId = parseId(req.params.fileArtifactId);
    if (!fileArtifactId) {
      throw new HttpError(400, "Invalid fileArtifactId.");
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new HttpError(400, "file is required.");
    }
    validateUploadedFile(file);

    const owner = await getArtifactOwnerRow(submissionId, fileArtifactId);
    if (!owner) {
      throw new HttpError(404, "File artifact not found.");
    }
    if (user.role !== "ADMIN" && owner.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }
    if (!isEditableFileStatus(owner.submission_status)) {
      throw new HttpError(400, "Only UPLOADING or SUBMITTED submission files can be edited.");
    }

    const nasRelativeDir = path.posix.dirname(owner.nas_path);
    const newStored = await storeUploadedFile({
      nasRelativeDir,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });

    const oldAbsolutePath = toAbsoluteNasPath(owner.nas_path);
    let lockedStatus: string = owner.submission_status;
    let committed = false;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lock = await client.query<{ status: string }>(
        "SELECT status FROM submissions WHERE id = $1 FOR UPDATE",
        [submissionId],
      );
      lockedStatus = lock.rows[0]?.status;
      if (!isEditableFileStatus(lockedStatus)) {
        throw new HttpError(400, "Only UPLOADING or SUBMITTED submission files can be edited.");
      }

      const previousRevisionNo = await saveFileArtifactRevision({
        client,
        artifact: owner,
        actorUserId: user.id,
        action: "REPLACE",
      });

      const updated = await client.query<{
        id: number;
        original_filename: string;
        stored_filename: string;
        nas_path: string;
        size_bytes: string;
        sha256: string;
        mime_type: string;
        created_at: string;
      }>(
        `
          UPDATE file_artifacts
          SET
            original_filename = $2,
            stored_filename = $3,
            nas_path = $4,
            size_bytes = $5,
            sha256 = $6,
            mime_type = $7
          WHERE id = $1
          RETURNING
            id,
            original_filename,
            stored_filename,
            nas_path,
            size_bytes,
            sha256,
            mime_type,
            created_at
        `,
        [
          fileArtifactId,
          newStored.originalFilename,
          newStored.storedFilename,
          newStored.nasPath,
          newStored.sizeBytes,
          newStored.sha256,
          newStored.mimeType,
        ],
      );

      await writeAuditLog(
        {
          actorUserId: user.id,
          action: "submission.replace_file",
          targetType: "file_artifact",
          targetId: fileArtifactId,
          meta: {
            submissionId,
            workItemId: owner.work_item_id,
            version: owner.version,
            previousNasPath: owner.nas_path,
            newNasPath: newStored.nasPath,
            previousRevisionNo,
          },
        },
        client,
      );

      if (lockedStatus === "SUBMITTED") {
        await writeSubmissionManifestSnapshot({
          client,
          submissionId,
          workItemId: owner.work_item_id,
          version: owner.version,
        });
      }

      await client.query("COMMIT");
      committed = true;

      if (lockedStatus === "UPLOADING") {
        try {
          await unlink(oldAbsolutePath);
        } catch {
          // best effort cleanup for old file
        }
      }

      const row = updated.rows[0];
      res.json({
        file: {
          id: row.id,
          originalFilename: row.original_filename,
          storedFilename: row.stored_filename,
          nasPath: row.nas_path,
          sizeBytes: Number(row.size_bytes),
          sha256: row.sha256,
          mimeType: row.mime_type,
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      if (!committed) {
        try {
          await unlink(newStored.absolutePath);
        } catch {
          // best effort cleanup for newly stored file on failed replace
        }
      }
    }
  }),
);

submissionsRouter.delete(
  "/submissions/:submissionId/files/:fileArtifactId",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      throw new HttpError(400, "Invalid submissionId.");
    }
    const fileArtifactId = parseId(req.params.fileArtifactId);
    if (!fileArtifactId) {
      throw new HttpError(400, "Invalid fileArtifactId.");
    }

    const artifact = await getArtifactOwnerRow(submissionId, fileArtifactId);
    if (!artifact) {
      throw new HttpError(404, "File artifact not found.");
    }
    if (user.role !== "ADMIN" && artifact.owner_user_id !== user.id) {
      throw new HttpError(403, "Forbidden.");
    }
    if (!isEditableFileStatus(artifact.submission_status)) {
      throw new HttpError(400, "Only UPLOADING or SUBMITTED submission files can be deleted.");
    }

    const absolutePath = toAbsoluteNasPath(artifact.nas_path);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lock = await client.query<{ status: string }>(
        "SELECT status FROM submissions WHERE id = $1 FOR UPDATE",
        [submissionId],
      );
      const lockedStatus = lock.rows[0]?.status;
      if (!isEditableFileStatus(lockedStatus)) {
        throw new HttpError(400, "Only UPLOADING or SUBMITTED submission files can be deleted.");
      }

      const deleted = await client.query<{ id: number }>(
        `
          DELETE FROM file_artifacts
          WHERE id = $1
          RETURNING id
        `,
        [fileArtifactId],
      );
      if (!deleted.rows[0]) {
        throw new HttpError(404, "File artifact not found.");
      }

      await writeAuditLog(
        {
          actorUserId: user.id,
          action: "submission.delete_file",
          targetType: "file_artifact",
          targetId: fileArtifactId,
          meta: {
            submissionId,
            workItemId: artifact.work_item_id,
            version: artifact.version,
            nasPath: artifact.nas_path,
            originalFilename: artifact.original_filename,
          },
        },
        client,
      );

      if (lockedStatus === "SUBMITTED") {
        await writeSubmissionManifestSnapshot({
          client,
          submissionId,
          workItemId: artifact.work_item_id,
          version: artifact.version,
        });
      }

      await client.query("COMMIT");
      try {
        await unlink(absolutePath);
      } catch {
        // best effort cleanup for deleted artifact file
      }
      res.json({
        deleted: {
          id: deleted.rows[0].id,
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
