import { expect, test, Page } from "@playwright/test";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

const employeeCredentials = {
  employeeId: process.env.E2E_EMPLOYEE_ID ?? "emp001",
  password: process.env.E2E_EMPLOYEE_PASSWORD ?? "Emp1234!",
};

const adminCredentials = {
  employeeId: process.env.E2E_ADMIN_ID ?? "admin001",
  password: process.env.E2E_ADMIN_PASSWORD ?? "Admin1234!",
};

function buildDueDate(daysFromNow = 7): string {
  const due = new Date();
  due.setDate(due.getDate() + daysFromNow);
  return due.toISOString().slice(0, 10);
}

async function loginByUi(
  page: Page,
  credentials: { employeeId: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.locator('form input:not([type="password"])').first().fill(credentials.employeeId);
  await page.locator('form input[type="password"]').fill(credentials.password);
  await page.locator('form button[type="submit"]').click();
}

async function requestJson<T>(
  path: string,
  options?: {
    method?: string;
    token?: string;
    json?: unknown;
  },
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options?.json ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.json ? JSON.stringify(options.json) : undefined,
  });

  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(
      `[${response.status}] ${path}: ${payload?.message ?? "request failed"}`,
    );
  }
  return payload;
}

async function loginByApi(credentials: {
  employeeId: string;
  password: string;
}): Promise<string> {
  const response = await requestJson<{ token: string }>("/api/auth/login", {
    method: "POST",
    json: credentials,
  });
  return response.token;
}

async function waitForSubmissionStatus(
  submissionId: number,
  expectedStatus: string,
  token: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await requestJson<{
      submission: { status: string };
    }>(`/api/submissions/${submissionId}/status`, { token });

    if (response.submission.status === expectedStatus) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Timed out waiting for submission ${submissionId} status "${expectedStatus}".`,
  );
}

test.describe("MVP core flow", () => {
  test("employee submit -> admin approve", async ({ browser, page }) => {
    const suffix = `${Date.now()}`;
    const title = `E2E Work Item ${suffix}`;
    const planText = `E2E plan ${suffix}`;
    const noteText = `E2E note ${suffix}`;

    await loginByUi(page, employeeCredentials);
    await expect(page).toHaveURL(/\/work-items$/);

    await page.goto("/work-items/new");
    const form = page.locator("form").first();
    await form.locator('input:not([type="date"])').first().fill(title);
    await form.locator("textarea").fill(planText);
    await form.locator('input[type="date"]').fill(buildDueDate(10));
    await form.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/work-items\/\d+$/);
    const workItemIdMatch = page.url().match(/\/work-items\/(\d+)$/);
    const workItemId = Number(workItemIdMatch?.[1]);
    expect(workItemId).toBeGreaterThan(0);

    await page.locator(`a[href="/work-items/${workItemId}/submit"]`).click();
    await expect(page).toHaveURL(new RegExp(`/work-items/${workItemId}/submit$`));

    await page.setInputFiles('input[type="file"]', {
      name: `e2e-${suffix}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`E2E upload ${suffix}`, "utf8"),
    });
    await page.locator("textarea").fill(noteText);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Submission ID:")).toBeVisible({ timeout: 30_000 });

    const adminToken = await loginByApi(adminCredentials);
    const detail = await requestJson<{
      submissions: Array<{ id: number; status: string }>;
    }>(`/api/admin/work-items/${workItemId}`, { token: adminToken });
    const submissionId = detail.submissions[0]?.id;
    expect(submissionId).toBeTruthy();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      await loginByUi(adminPage, adminCredentials);
      await expect(adminPage).toHaveURL(/\/admin$/);

      await adminPage.getByPlaceholder("Search title/plan text").fill(title);
      await adminPage.getByRole("button", { name: "Search" }).click();
      await adminPage.locator(`a[href="/admin/work-items/${workItemId}"]`).first().click();
      await expect(adminPage).toHaveURL(new RegExp(`/admin/work-items/${workItemId}$`));

      await adminPage.locator("article").first().locator("select").first().selectOption("DONE");
      await adminPage.locator("article").first().getByRole("button", { name: "Apply" }).click();
    } finally {
      await adminContext.close();
    }

    await waitForSubmissionStatus(submissionId, "DONE", adminToken);
  });

  test("admin change-request filters and search", async ({ page }) => {
    const suffix = `${Date.now()}`;
    const title = `E2E CR Filter ${suffix}`;
    const planText = `E2E CR plan ${suffix}`;
    const changeText = `E2E CR reason ${suffix}`;

    const employeeToken = await loginByApi(employeeCredentials);

    const createdWorkItem = await requestJson<{
      item: { id: number };
    }>("/api/work-items", {
      method: "POST",
      token: employeeToken,
      json: {
        title,
        planText,
        dueDate: buildDueDate(10),
      },
    });
    const workItemId = createdWorkItem.item.id;
    expect(workItemId).toBeGreaterThan(0);

    const createdChangeRequest = await requestJson<{
      changeRequest: { id: number; status: string };
    }>(`/api/work-items/${workItemId}/change-requests`, {
      method: "POST",
      token: employeeToken,
      json: {
        changeText,
        proposedPlanText: `${planText} (updated)`,
      },
    });
    expect(createdChangeRequest.changeRequest.id).toBeGreaterThan(0);
    expect(createdChangeRequest.changeRequest.status).toBe("REQUESTED");

    await loginByUi(page, adminCredentials);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto("/admin/change-requests");
    await expect(page).toHaveURL(/\/admin\/change-requests$/);

    await page.locator("select").first().selectOption("REQUESTED");
    await page
      .getByPlaceholder("Requester employee ID")
      .fill(employeeCredentials.employeeId);
    await page.getByPlaceholder("Search work item title / reason").fill(title);
    await page.getByRole("button", { name: "Search" }).click();

    const row = page
      .locator("tbody tr")
      .filter({ has: page.getByRole("link", { name: title }) })
      .first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("REQUESTED");
    await expect(row).toContainText(employeeCredentials.employeeId);

    await row.getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/work-items/${workItemId}$`));
  });
});
