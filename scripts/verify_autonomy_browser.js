// Run against an isolated local demo with:
// playwright-cli -s=futuretech run-code --filename=scripts/verify_autonomy_browser.js
async (page) => {
  const checks = [];
  const api = "http://127.0.0.1:8001/api/copilot";
  const app = "http://127.0.0.1:5174";
  const call = async (path = "", body) => {
    const response =
      body === undefined
        ? await page.request.get(api + path)
        : await page.request.post(api + path, { data: body });
    if (!response.ok()) throw new Error(`${path}: HTTP ${response.status()}`);
    return response.json();
  };
  const until = async (check, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out after: ${checks.join(", ")} at ${page.url()}`);
  };
  await call("/play", { video_id: "controlled-floor-demo" });
  await call("/automation", {
    enabled: true,
    paused: false,
    max_tasks_per_staff: 4,
  });
  await call("/pause", { paused: true });
  await until(async () =>
    (await call()).tables.every((t) => t.observed === "absent"),
  );
  await until(async () => (await call()).tasks.some((t) => t.assigned_to));
  await page.goto(app + "/staff");
  await page.getByLabel("Show jobs for").selectOption("cleaner-1");
  await until(() => page.getByText("Clean and prepare · Table 1").isVisible());
  const first = page
    .locator("article.staff-job")
    .filter({ hasText: "Clean and prepare · Table 1" });
  await first.getByText("Report a problem with this job").click();
  await first
    .getByLabel("What needs the manager’s help?")
    .fill("Demo: cleaning supplies missing");
  await first.getByRole("button", { name: "Send problem to manager" }).click();
  await until(() => first.getByText("Problem reported:").isVisible());
  checks.push("Staff can report a problem from the job");
  await page.goto(app + "/autonomy");
  const incident = page
    .locator("article.auto-incident")
    .filter({ hasText: "Staff reported a problem" });
  await until(() => incident.isVisible());
  await incident.getByRole("button", { name: "I’m handling this" }).click();
  await until(() =>
    incident.getByRole("button", { name: "Acknowledged" }).isVisible(),
  );
  checks.push("Manager sees and acknowledges the reported exception");
  await page.screenshot({
    path: "docs/verification/futuretech-exception-browser.png",
    fullPage: true,
  });
  await page.goto(app + "/staff");
  await until(() =>
    page.getByRole("button", { name: "Problem is resolved" }).isVisible(),
  );
  await page.getByRole("button", { name: "Problem is resolved" }).click();
  await page
    .locator("article.staff-job")
    .filter({ hasText: "Clean and prepare · Table 1" })
    .getByRole("button", { name: "Table is empty and clean" })
    .click();
  await until(
    async () =>
      (await call()).tables.find((t) => t.id === "T1").status === "ready",
  );
  checks.push("Cleaner completion makes the verified table ready");
  await page.goto(app + "/check-in");
  await page.evaluate(() => {
    sessionStorage.removeItem("floor-check-in");
    sessionStorage.removeItem("floor-check-in-attempt");
  });
  await page.reload();
  await page.getByLabel("Your name").fill("Browser demo pair");
  await page.getByLabel("How many guests?").fill("2");
  await page.getByRole("button", { name: "Join the waiting list" }).click();
  await until(() =>
    page.getByRole("heading", { name: "Your table is assigned." }).isVisible(),
  );
  await until(() => page.getByText("Table 1", { exact: true }).isVisible());
  checks.push("Guest self check-in updates to an automatic table assignment");
  await page.screenshot({
    path: "docs/verification/futuretech-guest-browser.png",
    fullPage: true,
  });
  await page.reload();
  await until(() =>
    page.getByRole("heading", { name: "Your table is assigned." }).isVisible(),
  );
  const state = await call();
  if (state.parties.filter((p) => p.name === "Browser demo pair").length !== 1)
    throw new Error("Duplicate guest check-in");
  checks.push(
    "Guest reload restores the ticket without duplicate registration",
  );
  await page.goto(app + "/autonomy");
  await page.getByRole("button", { name: "Pause automation" }).click();
  await until(() =>
    page.getByRole("button", { name: "Resume automation" }).isVisible(),
  );
  await page.getByRole("button", { name: "Resume automation" }).click();
  await until(() =>
    page.getByRole("button", { name: "Pause automation" }).isVisible(),
  );
  checks.push("Manager can pause and resume autonomous operation");
  await page.screenshot({
    path: "docs/verification/futuretech-autonomy-browser.png",
    fullPage: true,
  });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/autonomy", "/staff", "/check-in", "/settings"]) {
      await page.goto(app + route);
      await until(() => page.locator("h1").isVisible());
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      if (overflow)
        throw new Error(`Horizontal overflow at ${width}px on ${route}`);
    }
  }
  checks.push(
    "Overview, staff, guest and settings views fit 1440, 1024, 768, 390 and 320px",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app + "/autonomy");
  await until(() =>
    page.getByRole("heading", { name: "Service, in motion." }).isVisible(),
  );
  await page.screenshot({
    path: "docs/verification/futuretech-mobile-browser.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(app + "/autonomy");
  await call("/automation", { max_tasks_per_staff: 3 });
  return {
    status: "pass",
    checks,
    notes:
      "UI inputs are staged; the camera processes the controlled demo footage.",
  };
};
