import { chromium } from "./support/playwright.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const checks = [],
  errors = [],
  out = "artifacts/root-edit-boundaries";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (error) => errors.push(error.message));
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
  console.log("PASS", name);
};
try {
  await page.goto(process.env.RIGS_URL || "http://127.0.0.1:47831");
  await page.waitForFunction(() => rigs.ready);
  await page.evaluate(async () => {
    const { emptyDocument, createFrame, createObject } = await import(
      "/src/demo.mjs"
    );
    const report = emptyDocument();
    report.keyframes = [
      createFrame([createObject(report.figure_types[0], 10, 400, 250)]),
      createFrame([createObject(report.figure_types[0], 10, 420, 260)]),
    ];
    rigs.editor.load(report, "Edit boundaries");
    rigs.settingsUI.commit({ timelineMode: "simple" });
    rigs.editor.beginFrameDraft({ mode: "add", index: 1 });
    rigs.editor.select(10);
    rigs.fit();
    window.beforeBoundary = {
      x: rigs.editor.object.root_x,
      y: rigs.editor.object.root_y,
      undo: rigs.editor._undo.length,
    };
  });
  await page.waitForTimeout(50);
  const origin = await page.evaluate(() => {
    const r = document.querySelector("#viewport").getBoundingClientRect(),
      v = rigs.state.view,
      o = rigs.editor.object;
    return {
      x: r.x + v.x + o.root_x * v.scale,
      y: r.y + v.y + o.root_y * v.scale,
      scale: v.scale,
    };
  });
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + 38, origin.y + 14, { steps: 3 });
  await page.evaluate(() => rigs.actions.export());
  check(
    "Explicit export commits a held canvas translation into one journaled edit",
    await page.evaluate(({ scale }) => {
      const e = rigs.editor,
        b = beforeBoundary,
        d = e.report._rigs.simpleFrameDraft;
      return (
        !rigs.state.drag &&
        !e._drag &&
        e._undo.length === b.undo + 1 &&
        d.mode === "add" &&
        d.baseline.objects[0].root_x === b.x &&
        Math.abs(e.object.root_x - b.x - 38 / scale) < 1e-7
      );
    }, origin),
  );
  await page.mouse.up();
  check(
    "Later pointer-up does not duplicate that committed history entry",
    await page.evaluate(
      () => rigs.editor._undo.length === beforeBoundary.undo + 1,
    ),
  );
  await page.evaluate(() => {
    document.querySelector("#dialog").close();
    rigs.editor.undo();
  });
  check(
    "Undo restores the pre-gesture working pose and clean draft",
    await page.evaluate(
      () =>
        rigs.editor.object.root_x === beforeBoundary.x &&
        !rigs.editor.frameDraft.dirty,
    ),
  );
  await page.evaluate(() => {
    window.realAssign = rigs.editor.assignFiguresToLayerAsync;
    rigs.editor.assignFiguresToLayerAsync = (_uids, _layer, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Cancelled", "AbortError")),
          { once: true },
        );
      });
    window.migration = rigs.layers.onAssignFigures([10], "layer-2");
    rigs.actions.export();
  });
  await page.waitForTimeout(220);
  check(
    "A delayed layer progress dialog cannot replace a newer export dialog",
    await page.evaluate(
      async () =>
        (await migration) === false &&
        !document.querySelector("#dialog").open &&
        !!document.querySelector("#export-dialog[open] #export-submit") &&
        !document.querySelector("#layer-progress"),
    ),
  );
  await page.evaluate(
    () => (rigs.editor.assignFiguresToLayerAsync = realAssign),
  );
  check("No unhandled browser errors", errors.length === 0);
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: `${out}/export-dialog.png` });
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
} catch (error) {
  await mkdir(out, { recursive: true });
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
