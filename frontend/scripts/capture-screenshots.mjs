import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.FRONTEND_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "screenshots");

async function captureEmployeeFlow(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(OUT_DIR, "01-login.png"),
    fullPage: true,
  });

  await page.getByPlaceholder("예: emp001").fill("emp001");
  await page.getByPlaceholder("비밀번호").fill("Emp1234!");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL("**/work-items", { timeout: 20000 });
  await page.waitForTimeout(700);

  await page.screenshot({
    path: path.join(OUT_DIR, "02-employee-work-items.png"),
    fullPage: true,
  });

  await context.close();
}

async function captureAdminFlow(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("예: emp001").fill("admin001");
  await page.getByPlaceholder("비밀번호").fill("Admin1234!");
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL("**/admin", { timeout: 20000 });
  await page.waitForTimeout(1000);

  await page.screenshot({
    path: path.join(OUT_DIR, "03-admin-dashboard.png"),
    fullPage: true,
  });

  const firstItem = page.locator('a[href^="/admin/work-items/"]').first();
  if (await firstItem.count()) {
    await firstItem.click();
    await page.waitForURL("**/admin/work-items/**", { timeout: 20000 });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: path.join(OUT_DIR, "04-admin-detail.png"),
      fullPage: true,
    });
  }

  await context.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await captureEmployeeFlow(browser);
    await captureAdminFlow(browser);
    console.log(`Screenshots saved to ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
