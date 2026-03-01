import { spawn } from "node:child_process";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const HEALTH_URL = `${API_BASE_URL}/health`;
const FORCE_START_SERVER = process.env.SMOKE_FORCE_START === "1";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isHealthy() {
  try {
    const response = await fetch(HEALTH_URL);
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    return payload?.ok === true;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isHealthy()) {
      return true;
    }
    await wait(500);
  }
  return false;
}

function spawnCommand(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

async function main() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  let backendProcess = null;
  let startedBackend = false;

  if (FORCE_START_SERVER || !(await isHealthy())) {
    startedBackend = true;
    const env = {
      ...process.env,
      PORT: process.env.PORT ?? "4000",
    };

    if (process.platform === "win32") {
      backendProcess = spawnCommand(process.env.ComSpec ?? "cmd.exe", [
        "/d",
        "/s",
        "/c",
        `${npmCommand} run start`,
      ], {
        cwd: process.cwd(),
        env,
      });
    } else {
      backendProcess = spawnCommand(npmCommand, ["run", "start"], {
        cwd: process.cwd(),
        env,
      });
    }
  }

  try {
    const healthy = await waitForHealth(45_000);
    if (!healthy) {
      throw new Error(`Backend not healthy: ${HEALTH_URL}`);
    }

    const smokeProcess = spawnCommand(process.execPath, ["scripts/api-smoke.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        API_BASE_URL,
      },
    });

    const exitCode = await new Promise((resolve) => {
      smokeProcess.on("close", (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  } finally {
    if (startedBackend && backendProcess) {
      backendProcess.kill();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
