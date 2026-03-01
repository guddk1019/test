const DEFAULT_REPO = "guddk1019/test";
const DEFAULT_BRANCH = "main";
const DEFAULT_REQUIRED_CHECK = "test";

function parseRepo(input) {
  const value = String(input ?? "").trim();
  const parts = value.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${value}". Use "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}

function buildPayload(requiredCheck) {
  return {
    required_status_checks: {
      strict: true,
      contexts: [requiredCheck],
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: 1,
    },
    restrictions: null,
    required_conversation_resolution: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_linear_history: false,
    lock_branch: false,
  };
}

async function main() {
  const repoInput = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO;
  const branch = process.env.GH_BRANCH ?? DEFAULT_BRANCH;
  const requiredCheck = process.env.GH_REQUIRED_CHECK ?? DEFAULT_REQUIRED_CHECK;
  const dryRun = process.argv.includes("--dry-run");

  const { owner, repo } = parseRepo(repoInput);
  const payload = buildPayload(requiredCheck);
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}/protection`;

  if (dryRun) {
    console.log("[dry-run] endpoint:", endpoint);
    console.log("[dry-run] payload:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error("Missing token. Set GITHUB_TOKEN or GH_TOKEN.");
  }

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API failed ${response.status}: ${bodyText}`);
  }

  console.log(`Branch protection applied: ${owner}/${repo} -> ${branch}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
