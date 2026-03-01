import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { createServer } from "node:net";

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

const flags = new Set(process.argv.slice(2));
const skipE2E = flags.has("--skip-e2e");

const checks = [
  {
    name: "NAS mount pre-check",
    command: npmCmd,
    args: ["run", "ops:nas-check"],
    name: "Environment validation",
    command: npmCmd,
    args: ["run", "ops:validate-env"],
  },
  { name: "Backend build", command: npmCmd, args: ["run", "build"] },
  {
    name: "Frontend lint",
    command: npmCmd,
    args: ["--prefix", "frontend", "run", "lint"],
  },
  {
    name: "Frontend build",
    command: npmCmd,
    args: ["--prefix", "frontend", "run", "build"],
  },
  {
    name: "API smoke (local)",
    command: npmCmd,
    args: ["run", "test:smoke:api:local"],
    envFactory: ({ ports }) => ({
      PORT: String(ports.smokeApi),
      API_BASE_URL: `http://127.0.0.1:${ports.smokeApi}`,
      SMOKE_FORCE_START: "1",
    }),
  },
  {
    name: "Frontend E2E",
    command: npmCmd,
    args: ["run", "test:e2e:frontend"],
    envFactory: ({ ports }) => ({
      PORT: String(ports.e2eApi),
      FRONTEND_PORT: String(ports.e2eWeb),
      NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${ports.e2eApi}`,
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${ports.e2eWeb}`,
    }),
    skip: skipE2E,
  },
];

function timestampForFile(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function toIsoKst(date) {
  return date.toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul",
    hour12: false,
  }).replace(" ", "T");
}

function runCommand(name, command, args, env = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const mergedEnv = {
      ...process.env,
      ...env,
    };
    const child =
      isWindows
        ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `${command} ${args.join(" ")}`], {
            stdio: "inherit",
            shell: false,
            env: mergedEnv,
          })
        : spawn(command, args, {
            stdio: "inherit",
            shell: false,
            env: mergedEnv,
          });

    child.on("close", (code) => {
      const durationMs = Date.now() - startedAt;
      resolve({
        name,
        status: code === 0 ? "PASSED" : "FAILED",
        code: code ?? -1,
        durationMs,
        command: `${command} ${args.join(" ")}`,
      });
    });
  });
}

function findAvailablePort(start = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(start, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to resolve free port")));
        return;
      }
      const { port } = address;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(port);
      });
    });
  });
}

function safeGit(command, fallback) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return fallback;
  }
}

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}m ${seconds}s`;
}

function buildReport({
  startedAt,
  finishedAt,
  branch,
  commit,
  results,
  skipped,
  hasFailure,
}) {
  const lines = [];
  lines.push("# Release Preflight Report");
  lines.push("");
  lines.push(`- Started (KST): ${toIsoKst(startedAt)}`);
  lines.push(`- Finished (KST): ${toIsoKst(finishedAt)}`);
  lines.push(`- Branch: ${branch}`);
  lines.push(`- Commit: ${commit}`);
  lines.push(`- Overall: ${hasFailure ? "FAILED" : "PASSED"}`);
  lines.push("");
  lines.push("## Checks");
  lines.push("");

  for (const result of results) {
    lines.push(
      `- [${result.status === "PASSED" ? "x" : " "}] ${result.name} (${formatDuration(
        result.durationMs,
      )})`,
    );
    lines.push(`  - Command: \`${result.command}\``);
    lines.push(`  - Exit code: ${result.code}`);
  }

  if (skipped.length > 0) {
    lines.push("");
    lines.push("## Skipped");
    lines.push("");
    for (const item of skipped) {
      lines.push(`- ${item.name}`);
      lines.push(`  - Command: \`${item.command} ${item.args.join(" ")}\``);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const branch =
    process.env.GIT_BRANCH ?? safeGit("git rev-parse --abbrev-ref HEAD", "unknown");
  const commit = process.env.GIT_COMMIT ?? safeGit("git rev-parse --short HEAD", "unknown");

  const results = [];
  const skipped = [];
  let hasFailure = false;
  const ports = {
    smokeApi: await findAvailablePort(0),
    e2eApi: await findAvailablePort(0),
    e2eWeb: await findAvailablePort(0),
  };

  for (const check of checks) {
    if (check.skip) {
      skipped.push(check);
      continue;
    }
    console.log(`\n[preflight] running: ${check.name}`);
    const env =
      typeof check.envFactory === "function"
        ? check.envFactory({ ports })
        : check.env;
    const result = await runCommand(check.name, check.command, check.args, env);
    results.push(result);
    if (result.status === "FAILED") {
      hasFailure = true;
      break;
    }
  }

  const finishedAt = new Date();
  const evidenceDir = join(process.cwd(), ".github", "release-evidence");
  await mkdir(evidenceDir, { recursive: true });

  const fileTimestamp = timestampForFile(startedAt);
  const report = buildReport({
    startedAt,
    finishedAt,
    branch,
    commit,
    results,
    skipped,
    hasFailure,
  });

  const reportFile = join(evidenceDir, `preflight-${fileTimestamp}.md`);
  const latestFile = join(evidenceDir, "latest-preflight.md");
  await writeFile(reportFile, report, "utf8");
  await writeFile(latestFile, report, "utf8");

  const totalDuration = Date.now() - startedAtMs;
  console.log(`\n[preflight] report: ${reportFile}`);
  console.log(`[preflight] total: ${formatDuration(totalDuration)}`);

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[preflight] unexpected error");
  console.error(error);
  process.exit(1);
});
