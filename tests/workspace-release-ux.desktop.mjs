/** Final finite desktop UX acceptance. --packaged requires a freshly verified matching package. */
import { _electron as electron } from "./support/playwright.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, ".."),
  packaged = process.argv.includes("--packaged");
const out = path.join(root, "artifacts", "workspace-release-ux");
await mkdir(out, { recursive: true });
const executablePath = packaged
  ? process.env.RIGS_PACKAGED_EXECUTABLE ||
    path.join(root, "release", "win-unpacked", "RigStick.exe")
  : undefined;
const sourceFiles = [
  "index.html",
  "src/styles/app.css",
  "src/app.mjs",
  "src/shell/dock-host.mjs",
  "src/shell/layout-solver.mjs",
  "src/shell/layout-store.mjs",
  "src/settings.mjs",
  "src/inspector-view.mjs",
  "src/property-controls.mjs",
  "src/native-property-edit.mjs",
  "src/timeline.mjs",
  "src/simple-timeline.mjs",
  "src/editor.mjs",
  "src/editor-frame-draft.mjs",
  "src/pivot-frame-draft.mjs",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(path.join(root, file)))
        .digest("hex"),
    ]),
  ),
);
let manifest;
if (packaged) {
  manifest = JSON.parse(
    await readFile(
      path.join(root, "artifacts", "package-manifest.json"),
      "utf8",
    ),
  );
  for (const [file, digest] of Object.entries(sourceHashes))
    assert.equal(
      manifest.files.find((entry) => entry.path === file)?.sha256,
      digest,
      "Current package manifest: " + file,
    );
}
const checks = [],
  errors = [],
  layouts = [];
const check = (name, value = true, detail) => {
  assert.ok(value, `${name}${detail ? " " + JSON.stringify(detail) : ""}`);
  checks.push(name);
  console.log("PASS", name);
};
let app, page, metadata;
try {
  app = await electron.launch({
    executablePath,
    args: packaged ? [] : [root],
    cwd: root,
    timeout: 45000,
    env: {
      ...process.env,
      RIGS_USER_DATA_DIR: path.join(out, `profile-${Date.now()}`),
    },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => window.rigs?.ready);
  await page.evaluate(() => {
    const dismiss = () =>
      document
        .querySelectorAll(
          "dialog.release-splash[open], dialog.rigs-privacy[open]",
        )
        .forEach((dialog) => dialog.close());
    dismiss();
    new MutationObserver(dismiss).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  });
  metadata = await app.evaluate(({ app, BrowserWindow }) => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    minimum: BrowserWindow.getAllWindows()[0].getMinimumSize(),
  }));
  if (packaged) {
    assert.equal(metadata.version, manifest.version);
    metadata.executablePath = executablePath;
    metadata.executableSha256 = createHash("sha256")
      .update(await readFile(executablePath))
      .digest("hex");
  }
  const servedHashes = await page.evaluate(
    async (files) =>
      Object.fromEntries(
        await Promise.all(
          files.map(async (file) => {
            const response = await fetch("/" + file);
            if (!response.ok) throw new Error("Missing source " + file);
            const digest = await crypto.subtle.digest(
              "SHA-256",
              await response.arrayBuffer(),
            );
            return [
              file,
              [...new Uint8Array(digest)]
                .map((v) => v.toString(16).padStart(2, "0"))
                .join(""),
            ];
          }),
        ),
      ),
    sourceFiles,
  );
  check(
    "The running desktop serves the recorded current workspace, inspector and timeline sources",
    JSON.stringify(servedHashes) === JSON.stringify(sourceHashes),
  );
  await page.evaluate(async () => {
    rigs.settingsUI.commit({
      timelineMode: "advanced",
      autosaveSeconds: 0,
      locale: "en",
    });
    await rigs.settingsUI.flush();
    const { emptyDocument, createFrame, createObject } = await import(
      "/src/demo.mjs"
    );
    const report = emptyDocument(),
      figure = report.figure_types[0];
    report.keyframes = [100, 120, 140].map((x) =>
      createFrame([createObject(figure, 1, x, 180)], 3),
    );
    rigs.editor.load(report, "Workspace acceptance");
    rigs.editor.select(1);
    rigs.editor.markSaved();
    rigs.fit();
    window.rigs.workspace.reset();
    window.layoutBaseline = {
      report: JSON.stringify(rigs.editor.report),
      undo: rigs.editor._undo.length,
      revision: rigs.editor.revision,
    };
  });
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const resize = async (width, height, stress = false) => {
    await app.evaluate(
      ({ BrowserWindow }, { width, height, stress }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (stress) win.setMinimumSize(760, 600);
        win.setContentSize(width, height);
      },
      { width, height, stress },
    );
    await page.waitForFunction(
      ({ width, height }) => innerWidth === width && innerHeight === height,
      { width, height },
    );
    await settle();
  };
  const layout = () =>
    page.evaluate(() => {
      const l = window.rigs.workspace;
      return { sizes: l.sizes, preferences: l.preferences };
    });
  const documentUnchanged = () =>
    page.evaluate(() => {
      const e = rigs.editor,
        b = window.layoutBaseline;
      return (
        JSON.stringify(e.report) === b.report &&
        e._undo.length === b.undo &&
        e.revision === b.revision
      );
    });
  const drag = async (locator, dx, dy, { cancel = false } = {}) => {
    const r = await locator.boundingBox();
    assert.ok(r, "Visible drag target");
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, {
      steps: 6,
    });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    await settle();
  };
  const gpuSized = () =>
    page.evaluate(() => {
      const v = document.querySelector("#viewport"),
        c = document.querySelector("#scene");
      return (
        Math.abs(c.width / devicePixelRatio - v.clientWidth) <= 1 &&
        Math.abs(c.height / devicePixelRatio - v.clientHeight) <= 1
      );
    });
  const chromeFits = () =>
    page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      controls: [...document.querySelectorAll(".rigs-panel-controls")].every(
        (el) => {
          const r = el.getBoundingClientRect(),
            p = el.parentElement.getBoundingClientRect();
          return r.left >= p.left - 0.5 && r.right <= p.right + 0.5;
        },
      ),
      stage: document.querySelector("#viewport").clientWidth,
    }));
  await resize(1560, 1000);
  const initial = await layout();
  // Studio splitters grow their panel when dragged away from the stage edge.
  for (const [name, dx, dy] of [
    ["right", -40, 0],
    ["timeline", 0, -45],
  ])
    await drag(page.getByRole("separator", { name: name === "right" ? "Resize properties panel" : "Resize timeline" }), dx, dy);
  const resized = await layout();
  check(
    "Wide desktop splitters resize the properties panel and the timeline",
    Math.abs(resized.sizes.right - initial.sizes.right - 40) < 1 &&
      Math.abs(resized.sizes.timeline - initial.sizes.timeline - 45) < 1,
    { initial, resized },
  );
  check(
    "Resizing updates the WebGPU surface without changing the document",
    (await gpuSized()) && (await documentUnchanged()),
  );
  await page.screenshot({ path: path.join(out, "wide-docked.png") });
  const rightSplitter = page.getByRole("separator", { name: "Resize properties panel" });
  await rightSplitter.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await settle();
  const keyboard = await layout();
  check(
    "Focused splitter keyboard resizing stays out of the canvas document",
    // One step (12px) and one Shift step (40px), up to the inspector's 360px maximum.
    Math.abs(keyboard.sizes.right - Math.min(360, resized.sizes.right + 52)) < 1 &&
      (await documentUnchanged()),
  );
  await drag(rightSplitter, -30, 0, { cancel: true });
  check(
    "Escape cancels a splitter drag and releases pointer capture",
    Math.abs((await layout()).sizes.right - keyboard.sizes.right) < 1 &&
      (await page.evaluate(
        () =>
          ![
            ...document.querySelectorAll(
              ".shell-splitter",
            ),
          ].some((el) => el.hasPointerCapture(1)),
      )),
  );
  await rightSplitter.dblclick();
  await settle();
  check(
    "Double-click restores the default panel size",
    Math.abs((await layout()).sizes.right - initial.sizes.right) < 1,
  );
  await page.locator("#expand-timeline").click();
  const expandedTimeline = await layout();
  check(
    "Expand timeline grows the sheet within the workspace height",
    expandedTimeline.sizes.timeline > initial.sizes.timeline,
  );
  await page.locator("#expand-timeline").click();
  await settle();
  await page.screenshot({ path: path.join(out, "wide-floating.png") });
  await resize(900, 760, true);
  const constrained = await layout();
  check(
    "900px stress resize keeps the workspace within its bounds",
    constrained.sizes.right <= Math.min(390, 900 - 460) + 1 &&
      constrained.sizes.timeline <= Math.max(200, 760 - 210) + 1 &&
      (await page.evaluate(
        () => document.querySelector("#viewport").clientWidth >= 300,
      )),
    constrained,
  );
  await resize(1000, 760);
  await settle();
  check(
    "Workspace resizing leaves document history untouched",
    await documentUnchanged(),
  );
  // Check docked controls at the supported native minimum after the stress test.
  await resize(1000, 760);
  await page.locator('.brand[data-action="menu"]').click();
  await page.locator('#menu [data-action="settings"]').click();
  await page.locator("[data-settings-reset]").click();
  await page.locator(".rigs-settings-head button").click();
  await settle();
  const compact = await chromeFits();
  check(
    "1000px docked workspace retains a usable stage and visible panel controls",
    !compact.overflow && compact.controls && compact.stage >= 300,
    compact,
  );
  layouts.push(
    { size: "wide", layout: resized },
    { size: "900-floating", layout: constrained },
    { size: "1000-docked", layout: await layout(), chrome: compact },
  );
  const row = (kind) =>
    page
      .locator(`.sheet-layer[data-kind="${kind}"] .sheet-layer-name`)
      .first();
  const field = (key) => page.locator(`#inspector [data-property="${key}"]`);
  const fixedKinds = await page
    .locator(".sheet-layer")
    .evaluateAll((rows) => rows.map((row) => row.dataset.kind));
  check(
    "Camera and Scene remain distinct fixed rows before user layers",
    fixedKinds[0] === "camera" &&
      fixedKinds[1] === "scene" &&
      fixedKinds.filter((k) => k === "scene").length === 1 &&
      fixedKinds.filter((k) => k === "camera").length === 1,
    fixedKinds,
  );
  await row("camera").click();
  await field("camera_x").waitFor();
  check(
    "Camera selection shows camera properties without figure or scene fields",
    (await field("root_x").count()) === 0 &&
      (await field("canvas_width").count()) === 0,
  );
  const propertyLayout = await page.locator("#inspector").evaluate((el) => ({
    overflow: el.scrollWidth > el.clientWidth + 1,
    keyControls: el.querySelectorAll(
      "[data-property-key],[data-property-nav],.property-key-controls",
    ).length,
  }));
  check(
    "1000px camera properties render unclipped without key controls",
    !propertyLayout.overflow && propertyLayout.keyControls === 0,
    propertyLayout,
  );
  await page.locator("#scene").focus();
  await page.keyboard.press('End');
  await field("camera_x").fill("21.25");
  await field("camera_x").press("Enter");
  await settle();
  const cameraTick = await page.evaluate(() => rigs.editor.tick);
  check(
    "Camera numeric entry writes a camera sheet key with the precise value",
    await page.evaluate(
      (t) =>
        rigs.editor.report._rigs.layerSheet.tracks.camera.keys.some(
          (key) => key.tick === t && key.value?.frameId,
        ) && Number(document.querySelector('#inspector [data-property="camera_x"]').value) === 21.25,
      cameraTick,
    ),
  );
  await page.screenshot({ path: path.join(out, "compact-camera.png") });
  const beforeScrub = await page.evaluate(() => ({
    report: JSON.stringify(rigs.editor.report),
    undo: rigs.editor._undo.length,
  }));
  await drag(
    page.locator(
      '#inspector [data-property-row="camera_x"] [data-property-scrub]',
    ),
    24,
    0,
    { cancel: true },
  );
  check(
    "Escape cancels a contextual property scrub without a history item or stuck gesture",
    await page.evaluate(
      (b) =>
        JSON.stringify(rigs.editor.report) === b.report &&
        rigs.editor._undo.length === b.undo &&
        !rigs.properties.active,
      beforeScrub,
    ),
  );
  await field("camera_x").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  check(
    "Typing-space focus never starts playback or changes the number of figures",
    await page.evaluate(
      () => !rigs.state.playing && rigs.editor.frame.objects.length === 1,
    ),
  );
  await row("scene").click();
  await field("canvas_width").waitFor();
  check(
    "Scene context presents canvas settings without camera or figure controls",
    (await field("camera_x").count()) === 0 &&
      (await field("root_x").count()) === 0,
  );
  await page.screenshot({ path: path.join(out, "compact-scene.png") });
  await row("layer").click();
  await page.locator("#inspector-layer-name").waitFor();
  check(
    "Layer selection has its own property hierarchy",
    (await field("canvas_width").count()) === 0 &&
      (await field("camera_x").count()) === 0,
  );
  const timelineKinds = await page
    .locator("#timeline .sheet-layer")
    .evaluateAll((rows) => rows.map((row) => row.dataset.kind));
  check(
    "Advanced timeline exposes Camera and Scene above the user layer",
    timelineKinds[0] === "camera" &&
      timelineKinds[1] === "scene" &&
      timelineKinds.includes("layer"),
    timelineKinds,
  );
  check(
    "Advanced footer reports output duration without a misleading native key total",
    /^\d+ frames · [\d.]+s$/.test(
      await page.locator("#timeline-summary").textContent(),
    ),
  );
  // Reset only the test document so the mode transition oracle has three exact native poses.
  await page.evaluate(async () => {
    const { emptyDocument, createFrame, createObject } = await import(
      "/src/demo.mjs"
    );
    const report = emptyDocument(),
      f = report.figure_types[0];
    report.keyframes = [100, 120, 140].map((x) =>
      createFrame([createObject(f, 1, x, 180)], 3),
    );
    rigs.editor.load(report, "Stored and working poses");
    rigs.editor.selectFrame(2);
    rigs.editor.select(1);
    rigs.fit();
  });
  const settings = async () => {
    await page.locator('.brand[data-action="menu"]').click();
    await page.locator('#menu [data-action="settings"]').click();
    await page.locator(".rigs-settings").waitFor();
  };
  const mode = async (name) => {
    await settings();
    await page
      .locator(`.rigs-settings [data-setting="timelineMode"][value="${name}"]`)
      .check();
    await page.locator(".rigs-settings-head button").click();
    await settle();
  };
  await mode("simple");
  await page.locator(".sheet-filmstrip").waitFor();
  check(
    "Simple mode fits the filmstrip controls at 1000px",
    (await page.locator(".sheet-filmstrip-controls").evaluate((el) => {
      const p = el.getBoundingClientRect();
      return [...el.querySelectorAll("button,input")].every((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.top >= p.top &&
          r.bottom <= p.bottom + 1 &&
          r.left >= p.left &&
          r.right <= p.right + 1
        );
      });
    })) && (await layout()).sizes.timeline >= 200,
  );
  const ticksBefore = await page.evaluate(() => rigs.editor.totalTicks);
  await page.locator(".sheet-add-frame").click();
  await settle();
  check(
    "Simple Add Frame extends the sheet duration",
    (await page.evaluate(() => rigs.editor.totalTicks)) > ticksBefore,
  );
  await page.evaluate(() => rigs.editor.select(1));
  await field("root_x").fill("230");
  await field("root_x").press("Enter");
  await settle();
  check(
    "Simple edits write a layer-sheet key without a frame draft",
    await page.evaluate(
      () =>
        !rigs.editor.frameDraft &&
        rigs.editor.evaluatedFrame.objects[0].root_x === 230 &&
        rigs.editor.animationChannels.length === 0,
    ),
  );
  check(
    "Simple footer reports the sheet key count",
    /^\d+ keys · \d+ frames · [\d.]+s$/.test(
      await page.locator("#timeline-summary").textContent(),
    ),
  );
  await page.screenshot({ path: path.join(out, "compact-simple-working.png") });
  await mode("advanced");
  check(
    "Simple to Advanced restores the layer sheet and keeps the authored pose",
    await page.evaluate(
      () =>
        rigs.editor.report._rigs.layerSheet.tracks[
          rigs.editor.layerForUid(1)
        ].keys.length > 0 &&
        document.querySelectorAll("#timeline .sheet-layer").length > 0,
    ),
  );
  await settings();
  await page.locator("[data-settings-reset]").click();
  await page.locator(".rigs-settings-head button").click();
  await settle();
  check(
    "The actual Preferences reset returns a compact docked workspace",
    (await layout()).sizes.timeline >= 200 &&
      !(await chromeFits()).overflow &&
      (await chromeFits()).controls,
  );
  await resize(1560, 1000);
  await page.screenshot({ path: path.join(out, "wide-simple.png") });
  check(
    "Final viewport has no stale focus in detached controls or active gestures",
    await page.evaluate(
      () =>
        document.activeElement.isConnected &&
        !rigs.properties.active &&
        !rigs.editor.dragging &&
        !document.querySelector(".rigs-settings").open,
    ),
  );
  check("No uncaught application errors", errors.length === 0, errors);
  await page.evaluate(async () => {
    rigs.editor.markSaved();
    await rigs.settingsUI.flush();
    await window.rigs.workspace.flushPreferences();
  });
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        checks,
        errors,
        metadata,
        packaged,
        sourceHashes,
        layouts,
        notes: [
          "900px is an explicit responsive stress size below the normal native 1000px minimum; only this isolated test window minimum was changed.",
          "Small deterministic three-frame fixture; this is functional UX acceptance, not a large-scene latency benchmark.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: checks.length, errors, packaged }));
} catch (error) {
  await page
    ?.screenshot({ path: path.join(out, "failure.png") })
    .catch(() => {});
  await writeFile(
    path.join(out, "failure.json"),
    JSON.stringify({ checks, errors, metadata, error: error.stack }, null, 2),
  );
  throw error;
} finally {
  if (app) {
    await page
      ?.evaluate(() => window.rigs?.editor?.markSaved())
      .catch(() => {});
    await app.close();
  }
}
