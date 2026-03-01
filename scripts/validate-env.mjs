import dotenv from "dotenv";

dotenv.config();

const strictMode = process.argv.includes("--strict");

const requiredVars = [
  "DATABASE_URL",
  "JWT_SECRET",
  "NAS_MOUNT_PATH",
  "CORS_ORIGIN",
];

const insecureSecrets = new Set([
  "change_this_secret",
  "dev_secret_ci",
  "secret",
  "password",
  "admin1234",
]);

const errors = [];
const warnings = [];
const checks = [];

function addCheck(ok, message) {
  checks.push({ ok, message });
}

function fail(message) {
  errors.push(message);
  addCheck(false, message);
}

function warn(message) {
  warnings.push(message);
}

function pass(message) {
  addCheck(true, message);
}

function get(name) {
  return process.env[name]?.trim() ?? "";
}

function parseNumber(name, fallback) {
  const raw = get(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) {
    fail(`${name} must be a positive number.`);
    return null;
  }
  return parsed;
}

function parseOrigins(raw) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

for (const name of requiredVars) {
  const value = get(name);
  if (!value) {
    fail(`Missing required env var: ${name}`);
  } else {
    pass(`${name} is set`);
  }
}

const databaseUrl = get("DATABASE_URL");
if (databaseUrl && !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  fail("DATABASE_URL must start with postgres:// or postgresql://");
}

const jwtSecret = get("JWT_SECRET");
if (jwtSecret) {
  if (jwtSecret.length < 16) {
    fail("JWT_SECRET must be at least 16 characters.");
  } else {
    pass("JWT_SECRET length is valid (>=16)");
  }
  if (insecureSecrets.has(jwtSecret.toLowerCase())) {
    const message = "JWT_SECRET uses a known insecure/default value.";
    if (strictMode) {
      fail(message);
    } else {
      warn(message);
    }
  }
  if (strictMode && jwtSecret.length < 32) {
    fail("Strict mode: JWT_SECRET should be at least 32 characters.");
  }
}

const port = parseNumber("PORT", 4000);
if (port !== null) {
  if (port < 1 || port > 65535) {
    fail("PORT must be between 1 and 65535.");
  } else {
    pass(`PORT is valid (${port})`);
  }
}

const uploadMaxMb = parseNumber("UPLOAD_MAX_MB", 100);
if (uploadMaxMb !== null) {
  if (uploadMaxMb > 1024) {
    warn("UPLOAD_MAX_MB is unusually high (>1024MB).");
  } else {
    pass(`UPLOAD_MAX_MB is valid (${uploadMaxMb})`);
  }
}

const maxFilenameLen = parseNumber("UPLOAD_MAX_FILENAME_LEN", 180);
if (maxFilenameLen !== null) {
  if (maxFilenameLen < 20 || maxFilenameLen > 255) {
    warn("UPLOAD_MAX_FILENAME_LEN is outside common range (20-255).");
  } else {
    pass(`UPLOAD_MAX_FILENAME_LEN is in common range (${maxFilenameLen})`);
  }
}

const rateWindow = parseNumber("LOGIN_RATE_LIMIT_WINDOW_MS", 600000);
const rateAttempts = parseNumber("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 10);
if (rateWindow !== null && rateAttempts !== null) {
  if (rateAttempts > 100) {
    warn("LOGIN_RATE_LIMIT_MAX_ATTEMPTS is high; verify this is intentional.");
  } else {
    pass("Login rate-limit values are in expected range");
  }
}

const corsOrigin = get("CORS_ORIGIN");
if (corsOrigin) {
  if (corsOrigin === "*") {
    const message = "CORS_ORIGIN is '*' (allows any origin).";
    if (strictMode) {
      fail(message);
    } else {
      warn(message);
    }
  } else {
    const origins = parseOrigins(corsOrigin);
    if (origins.length === 0) {
      fail("CORS_ORIGIN must contain at least one origin.");
    } else {
      pass(`CORS_ORIGIN has ${origins.length} origin(s)`);
      const hasLocalhost = origins.some((origin) =>
        /localhost|127\.0\.0\.1/i.test(origin),
      );
      if (hasLocalhost) {
        const message =
          "CORS_ORIGIN includes localhost/127.0.0.1; production should use real domains only.";
        if (strictMode) {
          fail(message);
        } else {
          warn(message);
        }
      }
    }
  }
}

const nasMountPath = get("NAS_MOUNT_PATH");
if (nasMountPath) {
  pass("NAS_MOUNT_PATH is set");
  const isRelativePath = /^[.]{1,2}[\\/]/.test(nasMountPath);
  if (strictMode && isRelativePath) {
    fail("Strict mode: NAS_MOUNT_PATH should be an absolute path or mounted volume path.");
  }
}

console.log(`\n[env-check] mode: ${strictMode ? "strict" : "default"}\n`);
for (const check of checks) {
  const mark = check.ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${check.message}`);
}

if (warnings.length > 0) {
  console.log("\n[env-check] warnings:");
  for (const message of warnings) {
    console.log(`- ${message}`);
  }
}

if (errors.length > 0) {
  console.error(`\n[env-check] failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log("\n[env-check] passed.");
