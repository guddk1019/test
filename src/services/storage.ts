import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";

const SAFE_SEGMENT = /[^A-Za-z0-9._-]/g;

function cleanSegment(value: string): string {
  const cleaned = value.trim().replace(SAFE_SEGMENT, "_");
  return cleaned.length > 0 ? cleaned : "unknown";
}

function cleanFileName(name: string): string {
  const base = path.basename(name);
  const cleaned = base.replace(SAFE_SEGMENT, "_");
  return cleaned.length > 0 ? cleaned : "file";
}

export function formatVersion(version: number): string {
  return `v${String(version).padStart(3, "0")}`;
}

export function buildNasRelativeDir(input: {
  year: number;
  department: string;
  employeeId: string;
  workItemId: number;
  version: number;
}): string {
  return path.posix.join(
    "/corp_perf",
    String(input.year),
    cleanSegment(input.department),
    cleanSegment(input.employeeId),
    String(input.workItemId),
    "submissions",
    formatVersion(input.version),
  );
}

export function toAbsoluteNasPath(nasRelativePath: string): string {
  const normalized = nasRelativePath.replace(/^\/+/, "");
  return path.join(config.nasMountPath, normalized);
}

export async function storeUploadedFile(input: {
  nasRelativeDir: string;
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{
  originalFilename: string;
  storedFilename: string;
  nasPath: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}> {
  const safeName = cleanFileName(input.originalFilename);
  const storedFilename = `${Date.now()}-${randomUUID()}-${safeName}`;
  const nasPath = path.posix.join(input.nasRelativeDir, storedFilename);
  const absolutePath = toAbsoluteNasPath(nasPath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  return {
    originalFilename: input.originalFilename,
    storedFilename,
    nasPath,
    absolutePath,
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes: input.buffer.byteLength,
    sha256,
  };
}

export async function writeManifest(input: {
  nasRelativeDir: string;
  manifest: unknown;
}): Promise<void> {
  const absoluteDir = toAbsoluteNasPath(input.nasRelativeDir);
  await mkdir(absoluteDir, { recursive: true });
  const manifestPath = path.join(absoluteDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(input.manifest, null, 2), "utf-8");
}
