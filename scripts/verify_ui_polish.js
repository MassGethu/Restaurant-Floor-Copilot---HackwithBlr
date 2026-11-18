// Read-only workspace checks plus an isolated guest registration in the local demo.
async (page) => {
  const results = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = "http://127.0.0.1:5174";
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/autonomy",
      "/floor",
      "/staff",
      "/settings",
      "/check-in",
      "/welcome",
      "/supervisor",
    ]) {
      await page.goto(base + route);
      await page.locator("h1").waitFor({ timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      if (route === "/autonomy") await page.locator(".room-plan").waitFor();
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        unnamed: [...document.querySelectorAll("button")].filter(
          (e) => !e.textContent.trim() && !e.getAttribute("aria-label"),
        ).length,
      }));
      if (layout.overflow || layout.unnamed)
        throw new Error(JSON.stringify({ width, route, ...layout }));
    }
  }
  results.push(
    "Seven routes fit 1440, 1024, 768, 390 and 320px; all rendered buttons have names.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/autonomy");
  await page.locator(".room-plan").waitFor();
  const more = page.getByRole("button", { name: "Show more activity" });
  if (await more.count()) {
    await more.click();
    await page.getByRole("button", { name: "Show recent activity" }).click();
    results.push("Activity expansion and collapse work.");
  }
  const review = page.locator('a[href="#exceptions-title"]');
  if (await review.count()) {
    await review.click();
    const top = await page
      .locator("#exceptions-title")
      .evaluate((el) => el.getBoundingClientRect().top);
    if (top < 72) throw new Error("Exception heading covered by sticky header");
    results.push("Review exceptions jumps below the sticky header.");
  }
  await page.goto(base + "/staff");
  await page.getByLabel("Show jobs for").selectOption("cleaner-1");
  await page.getByRole("button", { name: /Mark me (un)?available/ }).waitFor();
  results.push("Staff filter and availability control remain reachable.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/autonomy");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close menu" }).click();
  results.push("Mobile navigation dialog opens and closes.");
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 390, height: 844 } });
  const guest = await context.newPage();
  try {
    await guest.goto(base + "/check-in");
    await guest.getByLabel("Your name").fill("UI verification guest");
    await guest.getByLabel("How many guests?").fill("2");
    await guest.getByRole("button", { name: "Join the waiting list" }).click();
    await guest
      .getByText("UI verification guest · 2 guests", { exact: true })
      .waitFor({ timeout: 15000 });
    await guest.reload();
    await guest
      .getByText("UI verification guest · 2 guests", { exact: true })
      .waitFor({ timeout: 15000 });
    results.push(
      "Restyled guest form submits and restores its ticket on reload.",
    );
  } finally {
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("; "));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/autonomy");
  return { status: "pass", checks: results, pageErrors: errors };
};
