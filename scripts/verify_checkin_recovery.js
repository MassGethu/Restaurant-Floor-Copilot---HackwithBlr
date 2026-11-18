// Destructive to its target replay: use the isolated local demo only.
async (page) => {
  const api = "http://127.0.0.1:8001/api/copilot";
  const app = "http://127.0.0.1:5174";
  const setup = async () => {
    await page.request.post(api + "/play", {
      data: { video_id: "controlled-floor-demo" },
    });
    await page.request.post(api + "/pause", { data: { paused: true } });
    await page.goto(app + "/check-in");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.getByLabel("Your name").fill("Recovery verification");
    await page.getByLabel("How many guests?").fill("2");
  };
  const until = async (check) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Guest recovery verification timed out");
  };
  await setup();
  let interrupted = false;
  await page.route("**/api/copilot/check-in", async (route) => {
    if (route.request().method() === "POST" && !interrupted) {
      interrupted = true;
      await route.fetch(); // server commits, but the browser never gets its reply
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Join the waiting list" }).click();
  await until(() => page.getByRole("alert").isVisible());
  await page.unroute("**/api/copilot/check-in");
  await page.reload();
  await until(() =>
    page
      .getByText("Recovery verification · 2 guests", { exact: true })
      .isVisible(),
  );
  let state = await (await page.request.get(api)).json();
  if (state.parties.length !== 1)
    throw new Error("Lost reply created a duplicate");
  const checks = [
    "A committed check-in survives a lost reply and browser reload without duplication",
  ];
  await setup();
  interrupted = false;
  await page.route("**/api/copilot/check-in", async (route) => {
    if (route.request().method() === "POST" && !interrupted) {
      interrupted = true;
      await route.abort("connectionreset"); // request never reaches the server
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Join the waiting list" }).click();
  await until(() => page.getByRole("alert").isVisible());
  await page.unroute("**/api/copilot/check-in");
  await page.reload();
  const retry = page.getByRole("button", { name: "Retry the same check-in" });
  await until(() => retry.isVisible());
  await retry.click();
  await until(() =>
    page
      .getByText("Recovery verification · 2 guests", { exact: true })
      .isVisible(),
  );
  state = await (await page.request.get(api)).json();
  if (state.parties.length !== 1)
    throw new Error("Retry did not create exactly one party");
  checks.push(
    "An unreceived request can be retried with the original idempotency key after reload",
  );
  await page.goto(app + "/autonomy");
  return { status: "pass", checks };
};
