import { chromium } from "./support/playwright.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const out = "artifacts/root-replacement-boundaries",
  checks = [],
  errors = [];
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => errors.push(error.message));
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
  console.log("PASS", name);
};
async function setup() {
  await page.evaluate(async () => {
    const { emptyDocument, createFrame, createObject } = await import(
      "/src/demo.mjs"
    );
    const report = emptyDocument();
    report.keyframes = [
      createFrame([createObject(report.figure_types[0], 90, 400, 250)]),
    ];
    rigs.editor.load(report, "Replacement boundary");
    rigs.settingsUI.commit({ timelineMode: "simple" });
    rigs.editor.beginFrameDraft({ mode: "add", index: 0 });
    rigs.editor.select(90);
    rigs.editor.markSaved();
    rigs.fit();
    window.replaceBefore = {
      report: rigs.editor.report,
      x: rigs.editor.object.root_x,
      undo: rigs.editor._undo.length,
    };
  });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function hold() {
  const p = await page.evaluate(() => {
    const r = document.querySelector("#viewport").getBoundingClientRect(),
      v = rigs.state.view,
      o = rigs.editor.object;
    return {
      x: r.x + v.x + o.root_x * v.scale,
      y: r.y + v.y + o.root_y * v.scale,
    };
  });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 31, p.y + 11, { steps: 3 });
}
try {
  await page.goto(process.env.RIGS_URL || "http://127.0.0.1:47831");
  await page.waitForFunction(() => window.rigs?.ready);
  await setup();
  await hold();
  // Projects stay open side by side (docs/PROJECT-TABS.md): closing one is what asks about its changes.
  await page.evaluate(() => {
    window.pendingNew = Promise.race([
      rigs.actions["close-project"](),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Replacement dialog did not resolve")),
          9000,
        ),
      ),
    ]);
  });
  await page.locator("#keep-editing").waitFor();
  check(
    "Closing finalizes a held gesture before asking about the project",
    await page.evaluate(
      () =>
        !rigs.state.drag &&
        !rigs.editor._drag &&
        !document.querySelector("#overlay").hasPointerCapture(1) &&
        rigs.editor._undo.length === replaceBefore.undo + 1,
    ),
  );
  await page.locator("#keep-editing").click();
  await page.mouse.up();
  check(
    "Cancelling the close retains the edited document and one undo",
    await page.evaluate(async () => {
      await pendingNew;
      return (
        rigs.editor.report === replaceBefore.report &&
        rigs.editor.object.root_x !== replaceBefore.x &&
        rigs.editor._undo.length === replaceBefore.undo + 1
      );
    }),
  );
  await setup();
  await hold();
  await page.evaluate(() => {
    window.pendingNew = Promise.race([
      rigs.actions["close-project"](),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Replacement dialog did not resolve")),
          9000,
        ),
      ),
    ]);
  });
  await page.locator("#discard-changes").click();
  await page.evaluate(async () => {
    await pendingNew;
    window.newRoot = JSON.stringify(rigs.editor.frame.objects);
  });
  await page.mouse.up();
  check(
    "Discarding the last project leaves a clean zero-frame document without an old drag",
    await page.evaluate(
      () =>
        rigs.editor.report !== replaceBefore.report &&
        rigs.editor.totalTicks === 0 &&
        !rigs.state.drag &&
        !rigs.editor._drag &&
        !rigs.editor.canUndo &&
        !rigs.editor.dirty &&
        JSON.stringify(rigs.editor.frame.objects) === newRoot,
    ),
  );
  check(
    "New footer reports zero stored keys",
    (await page.locator("#timeline-summary").count())
      ? await page
          .locator("#timeline-summary")
          .innerText()
          .then((text) => text.startsWith("0 keys"))
      : await page.evaluate(() =>
          document.body.innerText.includes("0 keys · 0 frames"),
        ),
  );
  await setup();
  await hold();
  await page.evaluate(() => { window.pendingNew = rigs.actions.new(); });
  await page.waitForFunction(() => rigs.editor.report !== replaceBefore.report);
  await page.mouse.up();
  check(
    "New finalizes a held gesture; the edited project rests beside the new one with its one undo",
    await page.evaluate(async () => {
      await pendingNew;
      const resting = rigs.projects.tabs.items.find((item) => item.session?.report === replaceBefore.report);
      return !rigs.state.drag && !rigs.editor._drag && !rigs.editor.canUndo && !rigs.editor.dirty &&
        Boolean(resting) && resting.dirty && resting.session._undo.length === replaceBefore.undo + 1;
    }),
  );
  await setup();
  await hold();
  await page
    .locator("#file-input")
    .setInputFiles(
      path.resolve("../Pivot Animator v5/Animations/tween_pendulum.piv"),
    );
  await page.waitForFunction(() => rigs.editor.name === "tween_pendulum");
  check(
    "File import finalizes the held gesture before its project leaves the front",
    await page.evaluate(() => {
      const resting = rigs.projects.tabs.items.find((item) => item.session?.report === replaceBefore.report);
      return !rigs.state.drag && !rigs.editor._drag && Boolean(resting) && resting.dirty && resting.session._undo.length === replaceBefore.undo + 1;
    }),
  );
  await page.evaluate(() => {
    window.importedRoot = JSON.stringify(rigs.editor.frame.objects);
  });
  await page.mouse.up();
  check(
    "Async import opens the final stored key and ignores the old pointer release",
    await page.evaluate(
      () =>
        rigs.editor.frameIndex === rigs.editor.report.keyframes.length - 1 &&
        !rigs.state.drag &&
        !rigs.editor._drag &&
        !rigs.editor.dirty &&
        JSON.stringify(rigs.editor.frame.objects) === importedRoot,
    ),
  );
  check("No unhandled renderer errors", errors.length === 0);
  await mkdir(out, { recursive: true });
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
} catch (error) {
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: `${out}/failure.png` });
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      { passed: false, checks, errors, error: error.stack },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
