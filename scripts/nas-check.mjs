import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const nasMountPath = path.resolve(process.cwd(), process.env.NAS_MOUNT_PATH ?? "./nas_mount");
const checkDir = path.join(nasMountPath, ".ops-nas-check");
const checkFile = path.join(checkDir, `check-${Date.now()}.txt`);
const checkPayload = `nas-check ${new Date().toISOString()}\n`;

async function assertPathWritable(targetPath) {
  await access(targetPath, fsConstants.R_OK | fsConstants.W_OK);
}

async function main() {
  console.log(`[nas-check] NAS_MOUNT_PATH: ${nasMountPath}`);

  const dirStat = await stat(nasMountPath).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    throw new Error(`NAS mount path is missing or not a directory: ${nasMountPath}`);
  }
  await assertPathWritable(nasMountPath);
  console.log("[nas-check] mount path is accessible (read/write)");

  await mkdir(checkDir, { recursive: true });
  await assertPathWritable(checkDir);

  await writeFile(checkFile, checkPayload, "utf8");
  const fileStat = await stat(checkFile);
  if (fileStat.size <= 0) {
    throw new Error("Check file size is zero.");
  }

  const readBack = await readFile(checkFile, "utf8");
  if (readBack !== checkPayload) {
    throw new Error("Read-back payload mismatch.");
  }
  console.log("[nas-check] write/read verification passed");

  await rm(checkFile, { force: true });
  console.log("[nas-check] cleanup completed");
  console.log("[nas-check] PASSED");
}

main().catch((error) => {
  console.error("[nas-check] FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
