// The editor side of RigStick's MCP tools (catalogue: desktop/ai-tool-catalog.cjs). The main process
// forwards each call here; every handler returns MCP content ([{type:'text'|'image', …}]).
// Changes go through the editor's own commands with Auto key on, inside one movieclipBatch, so each
// AI action is one undo step labelled "AI: …" and keys land exactly where a user's would.
import { buildMove, resolveRoles, MOVES } from './moves.mjs';
import { applySmoothLimbs } from './smooth-limbs.mjs';
import { catalog, buildProp, PROPS, TEXT_STYLES, BACKGROUNDS, VFX_GENERATED } from './presets.mjs';
import { VFX_PRESETS } from '../vfx-presets.mjs';
import { ExportFrameRenderer } from '../export-frame-renderer.mjs';
import { createTextFigure } from '../text-authoring.mjs';
import { timeline, evaluatedFrame } from '../pivot/geometry.mjs';
import { vfxClips } from '../vfx-clips.mjs';
import { objectBounds } from '../renderer-geometry.mjs';
import { loadTextFont } from '../text-authoring.mjs';
import { OBJECTS } from '../presets/objects.mjs';
import { MOTIONS, CAMERA_PRESETS, CAMERA_CLIPS } from '../presets/motions.mjs';
import { STICKERS, stickerFrameUrls } from '../presets/stickers.mjs';
import { TEXT_LOOKS, TEXT_ANIMATIONS, textOptions } from '../presets/text-presets.mjs';
import { presetCatalog } from '../presets/catalog.mjs';
import { VFX_LIBRARY } from '../presets/vfx-library.mjs';
import { ACTIONS, RIG, stickmanKeys, scarfKeys } from '../scene3d/hero.mjs';
import { cameraRigFigure, scarfFigure, heroFigure, swordFigure, flipbookFigure, isFlipbook, SET_LAYERS, rigAngles, rigValues, isCameraRig, setCameraAt, SET_CAMERAS, RIG_PPM, HERO_UNIT_M } from '../scene3d/set3d.mjs';

const DEG = Math.PI / 180;
const SET_TAG = 'set3d';
// Compact JSON: every answer goes back into the AI's context, so whitespace is paid for in tokens.
const text = value => [{type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value)}];
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const wrap = radians => Math.atan2(Math.sin(radians), Math.cos(radians));
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const fail = message => { throw new Error(message); };
// Lets the window paint between long-job steps. A message, not a timer: timers crawl while the window is in the background.
const yieldToUI = () => new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); resolve(); }; channel.port2.postMessage(0); });

export function createAiTools({editor, importer, desktop = null, importImage = null, play, stop, transcripts = () => [], onChange = () => {}}) {
  let exportJob = null;
  const tickOf = frame => (Number.isInteger(frame) ? frame - 1 : Math.floor(editor.tick));
  const fps = () => editor.report.fps || 24;
  const typeOf = object => editor.report.figure_types.find(type => type.figure_type_id === object.figure_type_id);
  const objects = () => editor.evaluatedFrame?.objects ?? [];
  const objectOf = uid => objects().find(object => object.unique_id === uid) ?? fail(`No figure ${uid} on this frame. Call rigstick_get_project to see the figures.`);
  const layerOf = uid => editor.report._rigs?.layers?.assignments?.[uid] ?? editor.report._rigs?.layers?.defaultLayerId ?? editor.activeLayerId;
  const allTracks = () => ['scene', 'camera', ...(editor.report._rigs?.layers?.order ?? [])];

  /** Longer scenes hold their last pose; the AI can always key past the end. */
  function ensureLength(ticks) {
    if (editor.totalTicks < ticks) editor.sheetInsertFrames(allTracks(), editor.totalTicks, ticks - editor.totalTicks);
  }
  function seek(tick) { ensureLength(tick + 1); editor.seek(tick); }
  /** Puts figure `uid` (a prop) in `holder`'s hand: joined at the end of its forearm. */
  function grip(uid, holder, hand = 'right') {
    const type = typeOf(objectOf(holder)), pattern = new RegExp(`${hand}.*(forearm|lower arm|hand)`, 'i');
    const segment = type.segments.find(item => pattern.test(item.name ?? '')) ?? type.segments.find(item => /(forearm|hand)/i.test(item.name ?? ''));
    if (!segment) fail(`Figure ${holder} has no hand to hold with.`);
    editor.select(uid, -1); editor.joinTo(holder, segment.segment_id);
  }
  /** Slides figure `uid` by (dx, dy) at constant speed: a layer moving past the camera (parallax). */
  function pan(uid, tick, seconds, dx, dy) {
    const end = tick + Math.max(1, Math.round(seconds * fps())), layer = layerOf(uid);
    ensureLength(end + 1);
    seek(tick); editor.sheetInsertKey([layer], tick);
    const start = objectOf(uid);
    seek(end); moveTo(uid, start.root_x + dx, start.root_y + dy);
    editor.sheetSetEasing([layer], tick, end, {interpolation: 'linear'});
  }
  /** Takes figure `uid` off screen from `tick` on: an empty key on its layer (its own layer, for AI-made props). */
  function remove(uid, tick) {
    const layer = layerOf(uid);
    ensureLength(tick + 1);
    editor.sheetInsertKey([layer], tick, {blank: true});
  }
  /** A generated effect (explosion…) or a look preset (Impact…) on a figure or the scene, `seconds` long from `tick`. */
  function addVfx(effect, on, tick, seconds) {
    const target = on === 'scene' || on === undefined ? {kind: 'scene'} : {kind: 'figure', uid: Number(on)};
    if (target.kind === 'figure') objectOf(target.uid);
    seek(tick);
    const duration = Math.max(1, Math.round(seconds * fps()));
    ensureLength(tick + duration);
    if (VFX_GENERATED.includes(effect)) return editor.addVfxClip(target, effect, {start: tick, duration});
    const look = Object.keys(VFX_PRESETS).find(name => name.toLowerCase() === String(effect).toLowerCase());
    if (!look) fail(`Unknown effect "${effect}". Generated: ${VFX_GENERATED.join(', ')}. Looks: ${Object.keys(VFX_PRESETS).join(', ')}.`);
    return editor.addVfxGroup(target, look, {start: tick, duration});
  }
  /** Keys a preset move from `tick`; returns its length in frames. */
  function moveKeys(figure, move, first, {seconds, direction, distance, intensity} = {}) {
    let plan = buildMove(move, {fps: fps(), seconds, direction, distance, intensity});
    seek(first); ensureLength(first + plan.frames);
    const type = typeOf(objectOf(figure)), roles = resolveRoles(type.segments), origin = {x: objectOf(figure).root_x, y: objectOf(figure).root_y};
    if (!Object.keys(roles).length) fail(`Figure "${type.name}" has no joints named like a person (torso, arms, legs).`);
    const travel = plan.keys.at(-1).dx, margin = 60, room = travel > 0 ? editor.report.canvas_width - margin - origin.x : origin.x - margin;
    if (distance === undefined && Math.abs(travel) > Math.max(0, room)) plan = buildMove(move, {fps: fps(), seconds, direction, intensity, distance: Math.max(0, room)});
    let turned = 0;
    for (const key of plan.keys) {
      seek(first + key.frame);
      if (turned) { editor.select(figure, -1); editor.rotateFigure(-turned * DEG); turned = 0; }
      setJoints(figure, Object.fromEntries(Object.entries(key.joints).filter(([role]) => role in roles).map(([role, degrees]) => [roles[role], degrees * DEG])));
      moveTo(figure, origin.x + key.dx, origin.y + key.dy);
      if (key.rot) { editor.select(figure, -1); editor.rotateFigure(key.rot * DEG); turned = key.rot; }
    }
    editor.sheetSetEasing([layerOf(figure)], first, first + plan.frames - 1, {interpolation: 'auto'});
    return plan.frames;
  }
  /** A camera preset from `tick`; follow tracks the named figure. */
  function cameraMove(move, tick, seconds, strength, who) {
    const type = {'zoom-pulse': 'pulse', 'push-in': 'pulse', 'pull-out': 'pulse'}[move] ?? move, duration = Math.max(1, Math.round(seconds * fps()));
    ensureLength(tick + duration);
    if (type === 'follow') { const uid = Number.isInteger(who) ? who : objects()[0]?.unique_id; editor.select(uid, -1); return editor.addCameraMotion('follow', {start: tick, duration, targets: [{uid, weight: 1}]}); }
    return editor.addCameraMotion(type, {start: tick, duration});
  }

  /** A new layer's first key covers one frame; stretch it to the end so its contents stay on screen. */
  /**
   * Where an inserted thing goes: the existing layer `layerId` when it can take it (an unlocked figure layer), else a
   * new layer named `name`. On a shared layer the thing must not disturb what is already there: `shared` says so.
   */
  function placeLayer(layerId, name) {
    const existing = layerId ? editor.getLayer(layerId) : null;
    if (existing && existing.kind === 'layer' && !existing.locked) { editor.setActiveLayer(existing.id); return {layer: existing, shared: true}; }
    return {layer: editor.createLayer(name, {activate: true}), shared: false};
  }
  /**
   * Keeps a thing on screen to the end: a new layer's cel is held. On a shared layer the thing is carried into the
   * layer's later keys (a figure lives in the key it was added to), and the last key is held when nothing follows.
   */
  function holdPlaced({layer, shared}, tick, uid = editor.selectedUid) {
    const later = shared && editor.layerFrameKeys(layer.id).some(key => key.tick > tick);
    if (later && Number.isInteger(uid)) { editor.select(uid, -1); editor.sheetCarryFigure(); }
    if (!later) holdToEnd(layer.id, tick);
  }
  /**
   * Ends a one-shot thing at `tick`: a blank key on its own layer. On a shared layer only the thing leaves: a key at
   * `tick` (the layer's pose there) and every later key lose it, so the layer's other figures stay.
   */
  function endPlaced(uid, {layer, shared}, tick) {
    if (!shared) return remove(uid, tick);
    ensureLength(tick + 1);
    if (!editor.layerFrameKeys(layer.id).some(key => key.tick === tick)) { seek(tick); editor.sheetInsertKey([layer.id], tick); }
    for (const {tick: at} of editor.layerFrameKeys(layer.id).filter(key => key.tick >= tick)) {
      seek(at);
      if (editor.evaluatedFrame.objects.some(object => object.unique_id === uid)) { editor.select(uid, -1); editor.deleteFigure(); }
    }
  }
  function holdToEnd(layerId, tick) {
    const length = editor.totalTicks - tick;
    if (length > 1) editor.sheetSetDuration(length, layerId, tick);
  }

  function edit(label, run) {
    if (!editor.report._rigs?.layerSheet) fail('This document uses the old Pivot frame list; open it in Advanced mode once to convert it, then try again.');
    const autoKey = editor.autoKey; let result;
    try {
      editor.autoKey = true;
      editor.movieclipBatch(`AI: ${label}`, () => { result = run(); return true; });
    } finally { editor.autoKey = autoKey; }
    onChange();
    return result;
  }

  /** Absolute joint angles (radians, by segment index), parents first so children keep their own target. */
  function setJoints(uid, angles) {
    for (const index of Object.keys(angles).map(Number).sort((a, b) => a - b)) {
      editor.select(uid, index);
      const current = editor.object?.angles?.[index];
      if (current === undefined) continue;
      const delta = wrap(angles[index] - current);
      if (Math.abs(delta) > 1e-4) editor.rotateJoint(delta);
    }
  }
  function moveTo(uid, x, y) {
    editor.select(uid, -1);
    const object = editor.object, dx = Number.isFinite(x) ? x - object.root_x : 0, dy = Number.isFinite(y) ? y - object.root_y : 0;
    if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) editor.moveSelection(dx, dy);
  }
  function jointIndex(type, name) {
    const exact = type.segments.findIndex(segment => (segment.name ?? '').toLowerCase() === String(name).toLowerCase());
    if (exact >= 0) return exact;
    const numbered = /^#?(\d+)$/.exec(String(name));
    if (numbered && type.segments[Number(numbered[1])]) return Number(numbered[1]);
    fail(`Figure "${type.name}" has no joint "${name}". Its joints: ${type.segments.map(segment => segment.name).filter(Boolean).join(', ')}.`);
  }
  function figureSummary(object) {
    const type = typeOf(object);
    return {id: object.unique_id, name: type?.name ?? 'Figure', x: round(object.root_x), y: round(object.root_y), layer: layerOf(object.unique_id),
      joints: type?.segments.map(segment => segment.name).filter(Boolean) ?? [], text: Boolean(type?.text_assets?.length)};
  }

  /** The animation evaluated at a fractional time (sub-frames for the 3D Set's motion blur). */
  function frameAtTime(rows, time) {
    const end = rows.at(-1).start + rows.at(-1).count;
    time = Math.min(Math.max(0, time), end - 1);
    let low = 0;
    for (let i = 0; i < rows.length && rows[i].start <= time; i++) low = i;
    return evaluatedFrame(editor.report, low, rows[low].count ? Math.min(1, (time - rows[low].start) / rows[low].count) : 0, time);
  }
  /**
   * Renders the 3D Set from the 3D Camera rig at every frame (`blur` sub-frames over a 180° shutter that
   * opens at the frame, as export motion blur does, with the rig evaluated between its keys) and puts the
   * images in the Scene layer as one undo step. Runs as the
   * background job rigstick_export_status reports.
   */
  function startSetBake({seed, blur = 4, onProgress} = {}) {
    const report = editor.report, rigType = report.figure_types.find(isCameraRig) ?? fail('This project has no 3D Camera. Build a 3D shot first.');
    const previous = (report.backgrounds ?? []).find(asset => asset._rigs?.sequence?.tag === SET_TAG)?._rigs.sequence;
    seed = Number.isInteger(seed) ? seed : previous?.seed ?? 7; blur = Math.max(1, Math.min(12, Math.round(blur ?? previous?.blur ?? 4)));
    const total = editor.totalTicks, width = report.canvas_width, height = report.canvas_height, rate = fps();
    const job = exportJob = {status: 'rendering', kind: '3d-set', done: 0, total, path: null, error: null, seconds: round(total / rate, 2), size: `${width}×${height}`, stop: false};
    job.promise = (async () => {
      const {createShot} = await import('../scene3d/shot.mjs');
      const shot = createShot({width, height, seed}), rows = timeline(editor.report), frames = [], layers = SET_LAYERS.map(() => []);
      const rigAt = time => { const object = frameAtTime(rows, time).objects.find(item => item.figure_type_id === rigType.figure_type_id); return object ? rigValues(object) : null; };
      try {
        for (let tick = 0; tick < total; tick++) {
          if (job.stop) { job.status = 'cancelled'; return; }
          const views = [];
          for (let j = 0; j < blur; j++) { const time = tick + (blur > 1 ? (j + 0.5) / blur * 0.5 : 0), rig = rigAt(time); if (rig) views.push({...rig, time: time / rate}); }
          // The sky goes to the Scene layer; the city and the rooftop, with transparency, to their own layers.
          const shots = views.length ? views : [{time: tick / rate}];
          frames.push({tick, data_url: shot.view(shots, {bloom: false, pass: 'sky'}).toDataURL('image/jpeg', 0.86), width, height, mime_type: 'image/jpeg'});
          SET_LAYERS.forEach(({pass}, i) => layers[i].push({tick, data_url: shot.view(shots, {bloom: false, pass}).toDataURL('image/webp', 0.86), width, height, mime_type: 'image/webp'}));
          job.done = tick + 1; onProgress?.(job.done, total);
          await yieldToUI();
        }
      } finally { shot.dispose(); }
      edit('Update 3D set', () => {
        editor.setSceneSequence(frames, {tag: SET_TAG, name: '3D Sky', meta: {seed, blur}});
        SET_LAYERS.forEach(({name}, i) => placeFlipbook(name, layers[i], i));
      });
      job.status = 'done';
    })().catch(error => { job.status = 'error'; job.error = error.message; });
    return job;
  }

  /**
   * Puts a 3D Set layer's frames on its own RigStick layer: a flipbook sprite keyed to show frame n at tick
   * n. The first render makes the layer (at `index` from the bottom); later renders replace its images.
   */
  function placeFlipbook(name, frames, index) {
    const {canvas_width: width, canvas_height: height} = editor.report;
    let type = editor.report.figure_types.find(item => isFlipbook(item, name)), uid;
    if (type) {
      editor.setFigureImages(type.figure_type_id, frames.map(({data_url, mime_type}) => ({data_url, mime_type, width, height})));
      uid = objects().find(object => object.figure_type_id === type.figure_type_id)?.unique_id;
    } else {
      seek(0);
      const layer = editor.createLayer(name, {activate: true});
      editor.importFigure(flipbookFigure(name, frames, width, height), {position: {x: width / 2, y: height / 2}});
      uid = editor.selectedUid; moveTo(uid, width / 2, height / 2); holdToEnd(layer.id, 0);
      editor.moveLayerTo(layer.id, index);
    }
    if (uid === undefined) return;
    editor.addAnimationKeys(frames.map((frame, i) => ({target: {kind: 'segment', uid, handleId: 1}, property: 'image', tick: frame.tick, value: i})));
  }

  // ---- Presets (src/presets): objects, motions, camera moves, effects, stickers and text. ----
  const scaleTo = (uid, wanted) => { const now = objectOf(uid).scale || 1; if (Math.abs(now - wanted) > 1e-4) { editor.select(uid, -1); editor.scaleSelection(wanted / now); } };
  /** On-screen bounds of a figure at the current tick. */
  function boundsOf(uid) {
    const g = [...editor.geometry.objects.values()].find(item => item?.obj?.unique_id === uid);
    return g?.drawables?.length ? objectBounds(g.drawables, {}) : null;
  }
  /**
   * Keys motion preset `name` (motions.mjs) on figure `uid` from tick `first`: positions, scale, turn and
   * opacity relative to where it is, every key on its layer, then the preset's easing over the range.
   * `pivot` (world point) stays put while it scales and turns (text turns about its centre).
   */
  function motionKeys(uid, name, first, {seconds, intensity = 1, pivot} = {}) {
    const motion = MOTIONS[name] ?? fail(`Unknown motion "${name}". Motions: ${Object.keys(MOTIONS).join(', ')}.`);
    const frames = Math.max(2, Math.round((seconds ?? motion.seconds) * fps())), last = first + frames - 1;
    ensureLength(last + 1); seek(first);
    const start = objectOf(uid), base = {x: start.root_x, y: start.root_y, scale: start.scale || 1}, center = pivot ?? {x: base.x, y: base.y};
    let turned = 0; const seen = new Set();
    for (const key of motion.keys) {
      const tick = first + Math.round(key.u * (frames - 1));
      if (seen.has(tick)) continue; seen.add(tick); seek(tick);
      const k = Math.max(0.02, 1 + ((key.s ?? 1) - 1) * intensity), turn = (key.r ?? 0) * intensity;
      scaleTo(uid, base.scale * k);
      if (Math.abs(turn - turned) > 1e-6) { editor.select(uid, -1); editor.rotateFigure((turn - turned) * DEG); turned = turn; }
      const a = turn * DEG, vx = center.x - base.x, vy = center.y - base.y;
      moveTo(uid, center.x + (key.dx ?? 0) * intensity - k * (vx * Math.cos(a) - vy * Math.sin(a)), center.y + (key.dy ?? 0) * intensity - k * (vx * Math.sin(a) + vy * Math.cos(a)));
      if (key.o !== undefined) editor.addAnimationKeys([{target: {kind: 'figure', uid}, property: 'opacity', tick, value: Math.min(1, Math.max(0, key.o))}]);
    }
    editor.sheetSetEasing([layerOf(uid)], first, last, {interpolation: motion.ease === 'linear' ? 'linear' : 'auto'});
    return frames;
  }
  /** Keys camera preset `name` on the Camera layer from tick `first`, relative to the camera there. */
  function cameraKeys(name, first, {seconds, intensity = 1} = {}) {
    const preset = CAMERA_PRESETS[name] ?? fail(`Unknown camera move "${name}". Camera: ${[...Object.keys(CAMERA_PRESETS), ...Object.keys(CAMERA_CLIPS)].join(', ')}.`);
    const frames = Math.max(2, Math.round((seconds ?? preset.seconds) * fps())), last = first + frames - 1;
    ensureLength(last + 1); seek(first);
    const camera = editor.evaluatedFrame.camera ?? {x: 0, y: 0, scale: 1, angle_rad: 0};
    for (const key of preset.keys) {
      seek(first + Math.round(key.u * (frames - 1)));
      editor.setCameraValues({x: camera.x + (key.dx ?? 0) * intensity, y: camera.y + (key.dy ?? 0) * intensity,
        // The camera scale is how much of the stage it sees, so zooming in divides it.
        scale: camera.scale / Math.max(0.05, 1 + ((key.zoom ?? 1) - 1) * intensity), angle_rad: camera.angle_rad + (key.roll ?? 0) * intensity * DEG});
    }
    editor.sheetSetEasing(['camera'], first, last, {interpolation: preset.ease === 'linear' ? 'linear' : 'auto'});
    return frames;
  }
  /** One effect clip holding these effects (registry types with partial params), `ticks` long from `first`. */
  function effectClip(target, effects, first, ticks, name) {
    const id = editor.addVfxClip(target, effects[0][0], {start: first, duration: Math.max(1, ticks)});
    for (const [type] of effects.slice(1)) editor.addVfxGroupEffect(id, type);
    const clip = vfxClips(editor.report).find(item => item.id === id);
    editor.setVfxClip(id, {name, effects: clip.effects.map((effect, i) => ({...effect, params: {...effect.params, ...effects[i]?.[1]}}))});
    return id;
  }
  /** An effect preset by name as one clip: RigStick's looks through addVfxGroup, the library's through effectClip. */
  function addEffectPreset(target, name, first, ticks) {
    if (VFX_PRESETS[name]) return editor.addVfxGroup(target, name, {start: first, duration: ticks});
    const preset = VFX_LIBRARY[name] ?? fail(`Unknown effect "${name}".`);
    return effectClip(target, preset.effects, first, ticks, name);
  }
  /** A sticker's art as data URLs (src/presets/art, or an imported preset's own images). */
  async function stickerFrames(sticker) {
    // Art from preset files and imports is held as Blobs (the page's content policy does not fetch blob: URLs).
    const sources = sticker.blobs ?? stickerFrameUrls(sticker);
    return Promise.all(sources.map(async source => {
      const blob = source instanceof Blob ? source : await (await fetch(source)).blob(), type = blob.type || 'image/webp', bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return {data_url: `data:${type};base64,${btoa(binary)}`, mime_type: type};
    }));
  }
  /** A figure under a canvas point (topmost by draw order), for drops onto the canvas. */
  function figureAt(point) {
    const hits = [...editor.geometry.objects.values()].filter(g => g?.drawables?.length && !isCameraRig(typeOf(g.obj))).filter(g => {
      // Stick figures are thin: a drop within a forgiving margin of one still lands on it.
      const b = objectBounds(g.drawables, {}), pad = Math.max(24, 0.15 * Math.min(b.width, b.height));
      return point.x >= b.x - pad && point.x <= b.x + b.width + pad && point.y >= b.y - pad && point.y <= b.y + b.height + pad; });
    const order = editor.evaluatedFrame.object_draw_order_unique_ids ?? [];
    hits.sort((a, b) => order.indexOf(b.obj.unique_id) - order.indexOf(a.obj.unique_id));
    return hits[0]?.obj.unique_id ?? null;
  }
  /**
   * Turns text figure `uid` into a figure per letter (same look), each on its own layer in a folder named
   * after the text: a layer key holds every figure on its layer, so staggered letters need a layer each.
   */
  async function splitLetters(uid) {
    const object = objectOf(uid), type = typeOf(object), asset = type.text_assets?.[0];
    if (!asset?.text) fail(`Figure ${uid} is not text.`);
    const segment = type.segments.find(item => item.segment_kind === 'text') ?? type.segments[0], scale = object.scale || 1, size = asset.font_size;
    const font = await loadTextFont({bold: Boolean(asset.bold), italic: Boolean(asset.italic)});
    const style = {fontSize: size, bold: Boolean(asset.bold), italic: Boolean(asset.italic), color: segment.color_rgb ?? [43, 43, 43],
      ...(segment.secondary?.rgb ? {gradientColor: segment.secondary.rgb} : {}),
      ...(type.segment_decode?.global_style?.outline_thickness ? {outlineWidth: type.segment_decode.global_style.outline_thickness, outlineColor: type.segment_decode.global_style.rgb ?? [0, 0, 0]} : {})};
    const letters = [];
    for (const [i, char] of [...asset.text].entries()) if (char.trim()) letters.push({char, x: object.root_x + font.getAdvanceWidth(asset.text.slice(0, i), size) * scale,
      definition: await createTextFigure({text: char, name: char, ...style})});
    const effects = vfxClips(editor.report).filter(clip => clip.target.kind === 'figure' && clip.target.uid === uid);
    return edit('Split text into letters', () => {
      const layer = layerOf(uid), y = object.root_y, from = editor.layerFrameKeys(layer).find(key => !key.empty)?.tick ?? 0;
      editor.select(uid, -1); editor.deleteFigure(); editor.deleteLayer(layer);
      const layers = [], ids = letters.map(letter => {
        seek(from);
        const own = editor.createLayer(`${asset.text.slice(0, 16)} · ${letter.char}`, {activate: true}); layers.push(own.id);
        editor.importFigure(letter.definition, {position: {x: letter.x, y}});
        const id = editor.selectedUid; moveTo(id, letter.x, y); scaleTo(id, scale); holdToEnd(own.id, from);
        for (const clip of effects) effectClip({kind: 'figure', uid: id}, clip.effects.map(effect => [effect.type, effect.params]), clip.start, clip.duration ?? editor.totalTicks - clip.start, clip.name);
        return id;
      });
      editor.createLayerFolder(`Text: ${asset.text.slice(0, 24)}`, layers);
      return ids;
    });
  }

  async function renderPng(tick, width) {
    const report = editor.report, scale = width / report.canvas_width;
    const renderer = new ExportFrameRenderer({width: Math.round(width), height: Math.round(report.canvas_height * scale), baseURL: importer.baseURL, token: importer.token,
      getRevision: () => editor.report === report ? `${editor.revision}` : 'replaced'});
    try {
      await renderer.load(report);
      // Native ticks come back as an encoded PNG ({blob, width, height}); a canvas is the fallback shape.
      const frame = await renderer.renderNativeTick(tick);
      const blob = frame.blob ?? (frame.convertToBlob ? await frame.convertToBlob({type: 'image/png'}) : await new Promise(resolve => frame.toBlob(resolve, 'image/png')));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    } finally { renderer.dispose(); }
  }

  const handlers = {
    rigstick_get_project({detail = false} = {}) {
      const report = editor.report, audio = report._rigs?.audio;
      return text({
        canvas: {width: report.canvas_width, height: report.canvas_height}, fps: fps(),
        frames: editor.totalTicks, seconds: round(editor.totalTicks / fps(), 2), currentFrame: Math.floor(editor.tick) + 1,
        layers: (report._rigs?.layers?.order ?? []).map(id => ({id, name: report._rigs.layers.byId[id]?.name})),
        figures: objects().map(object => { const summary = figureSummary(object); if (!detail) { summary.joints = summary.joints.length; } return summary; }),
        figureTypes: report.figure_types.map(type => ({id: type.figure_type_id, name: type.name})),
        audioTracks: (audio?.tracks ?? []).map(track => ({id: track.id, name: track.name, clips: track.clips?.length ?? 0,
          transcribed: transcripts().some(item => item.track === track.id)})),
        presets: 'call rigstick_presets',
      });
    },
    rigstick_get_figure({figure, frame}) {
      seek(tickOf(frame));
      const object = objectOf(figure), type = typeOf(object), geometry = editor.geometry?.objects?.get(object.object_slot);
      return text({...figureSummary(object), frame: Math.floor(editor.tick) + 1,
        joints: type.segments.map((segment, index) => {
          const end = geometry?.segments?.find(item => item.index === index)?.end;
          const parent = type.segments.find(item => item.segment_id === segment.parent_id);
          return {name: segment.name ?? `#${index}`, parent: parent?.name ?? 'root', angle: round(object.angles[index] / DEG), end: end ? {x: round(end.x), y: round(end.y)} : null};
        })});
    },
    async rigstick_render_frame({frame, width = 480}) {
      const tick = Math.min(tickOf(frame), editor.totalTicks - 1);
      return [{type: 'image', mimeType: 'image/png', data: await renderPng(tick, width)}, ...text(`Frame ${tick + 1} of ${editor.totalTicks}.`)];
    },
    rigstick_add_figure({x, y, frame, color}) {
      const uid = edit('Add figure', () => {
        seek(frame ? tickOf(frame) : 0);
        // Its own layer: a layer key holds every figure on it, so keying one figure never re-poses another.
        const layer = editor.createLayer(`Figure ${(editor.report._rigs?.layers?.order?.length ?? 0) + 1}`, {activate: true});
        const added = editor.addFigure();
        holdToEnd(layer.id, Math.floor(editor.tick));
        const id = added?.unique_id ?? editor.selectedUid;
        moveTo(id, x ?? editor.report.canvas_width / 2, y ?? editor.report.canvas_height / 2);
        if (color) { editor.select(id, -1); editor.setFigureColor(color); }
        return id;
      });
      return text({figure: uid, message: `Added figure ${uid}.`});
    },
    rigstick_pose({figure, frame, joints = {}, x, y, rotation}) {
      edit('Pose figure', () => {
        seek(tickOf(frame));
        const type = typeOf(objectOf(figure));
        setJoints(figure, Object.fromEntries(Object.entries(joints).map(([name, degrees]) => [jointIndex(type, name), degrees * DEG])));
        if (Number.isFinite(x) || Number.isFinite(y)) moveTo(figure, x, y);
        if (Number.isFinite(rotation) && rotation) { editor.select(figure, -1); editor.rotateFigure(rotation * DEG); }
        editor.sheetSetEasing([layerOf(figure)], 0, editor.totalTicks - 1, {interpolation: 'auto'});
      });
      return text(`Posed figure ${figure} at frame ${tickOf(frame) + 1}.`);
    },
    rigstick_apply_move({figure, move, start, seconds, direction, distance, intensity}) {
      const first = tickOf(start);
      // Without an explicit distance a travelling move stops short of the canvas edge (moveKeys).
      const frames = edit(`${move[0].toUpperCase()}${move.slice(1)}`, () => moveKeys(figure, move, first, {seconds, direction, distance, intensity}));
      return text(`Applied "${move}" to figure ${figure}: frames ${first + 1}–${first + frames}.`);
    },
    rigstick_camera({move, start, seconds = 1, strength = 1, figures}) {
      const type = {'zoom-pulse': 'pulse', 'push-in': 'pulse', 'pull-out': 'pulse'}[move] ?? move, first = tickOf(start);
      const id = edit('Camera move', () => {
        ensureLength(first + Math.round(seconds * fps()));
        if (type === 'follow') { if (!figures?.length) fail('Name the figures the camera should follow.'); editor.select(figures[0], -1); }
        return editor.addCameraMotion(type, {start: first, duration: Math.max(1, Math.round(seconds * fps())),
          targets: type === 'follow' ? figures.map(uid => ({uid, weight: 1})) : undefined});
      });
      if (strength !== 1) { const clip = editor.getCameraMotions().find(item => item.id === id), params = {};
        for (const [key, value] of Object.entries(clip?.params ?? {})) if (typeof value === 'number' && /amount|strength|intensity|scale|amplitude/i.test(key)) params[key] = value * strength;
        if (Object.keys(params).length) editor.setCameraMotion(id, {params}); }
      return text(`Added a ${move} camera move from frame ${first + 1}.`);
    },
    async rigstick_add_text({text: words, x, y, size = 48, color = '#2b2b2b', frame}) {
      const definition = await createTextFigure({text: words, name: words.slice(0, 60), fontSize: size, color: hexToRgb(color)});
      edit('Add text', () => {
        seek(frame ? tickOf(frame) : 0);
        const layer = editor.createLayer(`Text: ${words.slice(0, 24)}`, {activate: true});
        editor.importFigure(definition, {position: {x: x ?? editor.report.canvas_width / 2, y: y ?? editor.report.canvas_height / 2}});
        holdToEnd(layer.id, Math.floor(editor.tick));
      });
      return text(`Added text "${words.slice(0, 40)}" as figure ${editor.selectedUid}.`);
    },
    rigstick_scene({fps: rate, width, height, background, frames}) {
      edit('Scene settings', () => {
        if (rate) editor.setFPS(rate);
        if (width || height) editor.setCanvasSize(width ?? editor.report.canvas_width, height ?? editor.report.canvas_height);
        if (background) editor.setBackgroundColor(0xff000000 + parseInt(background.slice(1), 16));
        if (frames && frames > editor.totalTicks) ensureLength(frames);
        else if (frames && frames < editor.totalTicks) editor.sheetRemoveFrames(allTracks(), frames, editor.totalTicks - 1);
      });
      return text(`Scene: ${editor.report.canvas_width}×${editor.report.canvas_height}, ${fps()} fps, ${editor.totalTicks} frames.`);
    },
    rigstick_smooth_limbs({figure, strength = 0.6, allKeys = true}) {
      objectOf(figure);
      const frames = applySmoothLimbs(editor, figure, {strength, allKeys, layerId: layerOf(figure)});
      onChange();
      return text(frames ? `Smoothed figure ${figure}'s limbs on ${frames} frame(s).` : 'Nothing to smooth: its segments are already curved or are not lines.');
    },
    rigstick_presets({kind} = {}) { return text(kind ? presetCatalog()[kind] ?? fail(`Kinds: ${Object.keys(presetCatalog()).join(', ')}.`) : presetCatalog()); },
    /**
     * Adds a preset thing at (x, y): an object (objects.mjs), a sticker (stickers.mjs, plays its landing
     * motion) or styled text (text-presets.mjs looks; give `text`). Each gets its own layer, or goes on `layer` (an
     * existing layer's id) when given.
     */
    async rigstick_insert_preset({kind, name, x, y, frame, text: words, size, scale = 1, color, layer: layerId}) {
      const at = {x: x ?? editor.report.canvas_width / 2, y: y ?? editor.report.canvas_height / 2}, tick = frame ? tickOf(frame) : Math.floor(editor.tick);
      if (kind === 'object') {
        const object = OBJECTS[name] ?? fail(`Unknown object "${name}".`);
        const uid = edit(`Add ${name}`, () => {
          seek(tick); const place = placeLayer(layerId, name[0].toUpperCase() + name.slice(1));
          const id = buildProp(editor, name, {x: at.x, y: at.y, scale, tint: color, definition: object}); holdPlaced(place, tick, id); return id;
        });
        return text({figure: uid, message: `Added ${name} as figure ${uid}.`});
      }
      if (kind === 'sticker') {
        const sticker = STICKERS[name] ?? fail(`Unknown sticker "${name}".`), frames = await stickerFrames(sticker);
        const uid = edit(`Add ${sticker.label}`, () => {
          seek(tick); const place = placeLayer(layerId, sticker.label);
          // Imported presets keep their own size; one too big for the canvas starts at most 60% of it.
          const width = sticker.width ?? 256, height = sticker.height ?? 256;
          // Art with a size fits 60% of the stage; backgrounds fill its height ('height'), full-frame effects cover it ('stage').
          const {canvas_width: stageWidth, canvas_height: stageHeight} = editor.report;
          const fit = sticker.fit === 'height' ? stageHeight / height : sticker.fit === 'stage' ? Math.max(stageWidth / width, stageHeight / height)
            : sticker.width ? Math.min(1, 0.6 * stageWidth / width, 0.6 * stageHeight / height) : 1;
          editor.importFigure(flipbookFigure(sticker.label, frames, width, height), {position: at});
          const id = editor.selectedUid; moveTo(id, at.x, at.y); scaleTo(id, (sticker.size ?? fit) * scale); holdPlaced(place, tick, id);
          const tint = color ? parseInt(color.slice(1), 16) : sticker.tint;
          if (tint !== undefined) effectClip({kind: 'figure', uid: id}, [['tint', {color: tint, mix: 1}], ['glow', {color: tint, radius: 10, intensity: 0.7}]], tick, editor.totalTicks - tick, sticker.label);
          if (frames.length > 1) {
            const step = sticker.frameTicks ?? 1, end = tick + frames.length * step;
            ensureLength(end + 1);
            editor.addAnimationKeys(frames.map((_, i) => ({target: {kind: 'segment', uid: id, handleId: 1}, property: 'image', tick: tick + i * step, value: i})));
            endPlaced(id, place, end); seek(tick);
          } else if (sticker.motion) motionKeys(id, sticker.motion, tick);
          return id;
        });
        return text({figure: uid, message: `Added sticker ${sticker.label} as figure ${uid}.`});
      }
      if (kind === 'text') {
        const look = TEXT_LOOKS[name] ?? fail(`Unknown text look "${name}".`);
        if (!words?.trim()) fail('Give the text to write.');
        const definition = await createTextFigure(textOptions(look, {text: words, size}));
        const uid = edit(`Add text: ${words.slice(0, 24)}`, () => {
          seek(tick); const place = placeLayer(layerId, `Text: ${words.slice(0, 24)}`);
          editor.importFigure(definition, {position: at}); const id = editor.selectedUid; scaleTo(id, scale);
          // Centre the text on the point (text figures hang from the left end of their baseline).
          const box = boundsOf(id); if (box) { const o = objectOf(id); moveTo(id, o.root_x + at.x - (box.x + box.width / 2), o.root_y + at.y - (box.y + box.height / 2)); }
          holdPlaced(place, tick, id);
          if (look.effects?.length) effectClip({kind: 'figure', uid: id}, look.effects, tick, editor.totalTicks - tick, look.label);
          return id;
        });
        return text({figure: uid, message: `Added "${words.slice(0, 40)}" (${look.label}) as figure ${uid}.`});
      }
      fail('kind is object, sticker or text.');
    },
    /**
     * Applies a preset from the playhead (or `frame`): a character move (moves.mjs), a motion for any
     * figure, a camera move, an effect (on `figure` or the scene), or a text animation (on a text figure).
     */
    async rigstick_apply_preset({kind, name, figure, frame, seconds, intensity = 1, direction}) {
      const first = frame ? tickOf(frame) : Math.floor(editor.tick);
      if (kind === 'move') return handlers.rigstick_apply_move({figure, move: name, start: first + 1, seconds, intensity, direction});
      if (kind === 'motion') {
        objectOf(figure);
        const frames = edit(MOTIONS[name]?.label ?? name, () => {
          const box = typeOf(objectOf(figure))?.text_assets?.length ? boundsOf(figure) : null;
          return motionKeys(figure, name, first, {seconds, intensity, pivot: box ? {x: box.x + box.width / 2, y: box.y + box.height / 2} : undefined});
        });
        return text(`Applied "${name}" to figure ${figure}: frames ${first + 1}–${first + frames}.`);
      }
      if (kind === 'camera') {
        if (CAMERA_CLIPS[name]) return handlers.rigstick_camera({move: name === 'pulse' ? 'zoom-pulse' : name, start: first + 1, seconds: seconds ?? 1, strength: intensity, figures: figure ? [figure] : undefined});
        const frames = edit(CAMERA_PRESETS[name]?.label ?? name, () => cameraKeys(name, first, {seconds, intensity}));
        return text(`Camera "${name}": frames ${first + 1}–${first + frames}.`);
      }
      if (kind === 'effect') {
        const preset = VFX_PRESETS[name] ?? VFX_LIBRARY[name] ?? fail(`Unknown effect "${name}". Call rigstick_presets {kind: "effects"}.`);
        const scene = figure === undefined || figure === 'scene' || preset.target === 'scene';
        if (!scene) objectOf(Number(figure));
        const ticks = Math.max(1, Math.round(seconds ? seconds * fps() : preset.duration ?? 48));
        edit(name, () => { seek(first); ensureLength(first + ticks); return addEffectPreset(scene ? {kind: 'scene'} : {kind: 'figure', uid: Number(figure)}, name, first, ticks); });
        return text(`Added "${name}" on ${scene ? 'the scene' : `figure ${figure}`}: frames ${first + 1}–${first + ticks}.`);
      }
      if (kind === 'text') {
        const animation = TEXT_ANIMATIONS[name] ?? fail(`Unknown text animation "${name}".`);
        objectOf(figure);
        const targets = animation.letters ? await splitLetters(figure) : [figure];
        edit(animation.label, () => {
          const hidden = MOTIONS[animation.motion].keys[0].o === 0;
          targets.forEach((uid, i) => {
            const start = first + Math.round(i * (animation.stagger ?? 0) * fps());
            // A letter that enters from hidden stays hidden until its own turn.
            if (hidden && start > first) { seek(first); editor.addAnimationKeys([{target: {kind: 'figure', uid}, property: 'opacity', tick: first, value: 0}]); }
            seek(start); const box = boundsOf(uid);
            motionKeys(uid, animation.motion, start, {intensity, pivot: box ? {x: box.x + box.width / 2, y: box.y + box.height / 2} : undefined});
          });
          if (animation.effect) for (const uid of targets) addEffectPreset({kind: 'figure', uid}, animation.effect, first, Math.round(0.5 * fps()));
        });
        return text({figures: targets, message: `Animated text "${name}" from frame ${first + 1}.`});
      }
      fail('kind is move, motion, camera, effect or text.');
    },
    /** Which figure is under a canvas point (for drops from the Presets panel). */
    rigstick_figure_at({x, y}) { return text({figure: figureAt({x, y})}); },
    rigstick_add_prop({prop, x, y, scale = 1, color, hold, hand = 'right', frame}) {
      const uid = edit(`Add ${prop}`, () => {
        seek(frame ? tickOf(frame) : 0);
        const layer = editor.createLayer(`Prop: ${prop}`, {activate: true});
        const id = buildProp(editor, prop, {x: x ?? editor.report.canvas_width / 2, y: y ?? editor.report.canvas_height / 2, scale, tint: color});
        holdToEnd(layer.id, Math.floor(editor.tick));
        if (hold !== undefined) grip(id, hold, hand);
        return id;
      });
      return text({figure: uid, message: `Added ${prop} as figure ${uid}${hold !== undefined ? `, held by figure ${hold}` : ''}.`});
    },
    rigstick_add_vfx({effect, on = 'scene', start, seconds = 1.5}) {
      const id = edit(`VFX: ${effect}`, () => addVfx(effect, on, tickOf(start), seconds));
      return text(`Added ${effect} on ${on === 'scene' ? 'the scene' : `figure ${on}`} (${id}).`);
    },
    async rigstick_add_image({data, name = 'image.png', as = 'sprite', x, y, scale, fit, behind}) {
      if (!data) fail('Give a path (desktop app) or an https url.');
      if (!importImage) fail('Image import is not available here.');
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const type = /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : 'image/png';
      const file = new File([bytes], name, {type});
      if (as === 'background') { await importImage(file, {background: true}); onChange(); return text(`Set ${name} as the background.`); }
      // fit: sized to the canvas width; behind: the layer goes to the bottom, a backdrop for the cast.
      if (fit) { const bitmap = await createImageBitmap(file); scale = editor.report.canvas_width / bitmap.width; bitmap.close(); }
      editor.createLayer(`Image: ${name.slice(0, 24)}`, {activate: true});
      await importImage(file, {background: false});
      const uid = editor.selectedUid;
      edit('Place image', () => {
        if (behind) editor.moveLayerTo(editor.activeLayerId, 0);
        if (Number.isFinite(x) || Number.isFinite(y)) moveTo(uid, x, y);
        if (scale && scale !== 1) { editor.select(uid, -1); editor.scaleSelection(scale); }
        holdToEnd(editor.activeLayerId, Math.floor(editor.tick));
      });
      return text({figure: uid, message: `Added ${name} as sprite figure ${uid}.`});
    },
    // Export renders in the background (long renders outlive an AI app's request timeout): it answers at
    // once with the file it will write, and rigstick_export_status reports progress until it is done.
    rigstick_export_video({path, width = 1280, fps, blur = 1}) {
      if (!desktop?.exportVideoBegin) fail('Video export over MCP needs the RigStick desktop app.');
      if (exportJob?.status === 'rendering') fail(`An export is already rendering (${exportJob.done}/${exportJob.total} frames).`);
      const report = editor.report, rate = fps ?? (report.fps || 24), total = editor.totalTicks;
      const height = Math.round(report.canvas_height * width / report.canvas_width / 2) * 2;
      const job = exportJob = {status: 'rendering', done: 0, total, path: null, error: null, seconds: round(total / rate, 2), size: `${width}×${height}`};
      job.promise = (async () => {
        const {token, output} = await desktop.exportVideoBegin({path, fps: rate, name: editor.name || 'RigStick'});
        job.path = output;
        const renderer = new ExportFrameRenderer({width, height, baseURL: importer.baseURL, token: importer.token, getRevision: () => editor.report === report ? `${editor.revision}` : 'replaced',
          motionBlur: blur > 1 ? {samples: blur, shutter: 0.5} : null});
        try {
          await renderer.load(report);
          for (let tick = 0; tick < total; tick++) {
            const frame = await renderer.renderNativeTick(tick);
            const blob = frame.blob ?? await frame.convertToBlob({type: 'image/png'});
            await desktop.exportVideoFrame(token, tick, new Uint8Array(await blob.arrayBuffer()));
            job.done = tick + 1;
          }
        } catch (error) { await desktop.exportVideoCancel?.(token); throw error; } finally { renderer.dispose(); }
        job.path = (await desktop.exportVideoFinish(token)).path; job.status = 'done';
      })().catch(error => { job.status = 'error'; job.error = error.message; });
      return new Promise(resolve => setTimeout(() => resolve(text({status: job.status, path: job.path, frames: total, seconds: job.seconds, size: job.size,
        next: 'call rigstick_export_status until status is done'})), 300));
    },
    // 3D shots (src/scene3d/shot.mjs): a generated three.js city with the 2D hero planted in it, physics-
    // driven motion and real motion blur. `preview` returns a few stills; otherwise it renders an MP4 in the
    // background like rigstick_export_video (poll rigstick_export_status).
    async rigstick_render_3d_shot({scene = 'night-rooftop', camera = 'hero-orbit', action = 'sword-raise', color = '#ff7a1a', seconds = 6, fps = 24,
      width = 1280, blur = 6, seed = 7, hero = true, path, preview}) {
      const {renderShot} = await import('../scene3d/shot.mjs');
      const height = Math.round(width * 9 / 16 / 2) * 2, options = {seconds, fps, width, height, camera, action, color, blur, seed, hero};
      if (preview?.length) {
        const out = [];
        await renderShot({...options, width: 640, height: 360, frames: preview.map(second => Math.min(Math.round(second * fps), Math.round(seconds * fps) - 1))}, async canvas => {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85)), bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          out.push({type: 'image', mimeType: 'image/jpeg', data: btoa(binary)});
        });
        return [...out, ...text(`Preview of ${scene} / ${camera} / ${action} at ${preview.join(', ')} s.`)];
      }
      if (!desktop?.exportVideoBegin) fail('Rendering a 3D shot to video needs the RigStick desktop app.');
      if (exportJob?.status === 'rendering') fail(`An export is already rendering (${exportJob.done}/${exportJob.total} frames).`);
      const total = Math.round(seconds * fps), job = exportJob = {status: 'rendering', done: 0, total, path: null, error: null, seconds, size: `${width}×${height}`};
      job.promise = (async () => {
        const {token, output} = await desktop.exportVideoBegin({path, fps, name: `${scene}-${camera}`}); job.path = output;
        try {
          await renderShot(options, async (canvas, index) => {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await desktop.exportVideoFrame(token, index, new Uint8Array(await blob.arrayBuffer())); job.done = index + 1;
          });
        } catch (error) { await desktop.exportVideoCancel?.(token); throw error; }
        job.path = (await desktop.exportVideoFinish(token)).path; job.status = 'done';
      })().catch(error => { job.status = 'error'; job.error = error.message; });
      return new Promise(resolve => setTimeout(() => resolve(text({status: job.status, path: job.path, frames: total, seconds, next: 'poll rigstick_export_status'})), 300));
    },
    /**
     * The 3D shot built from RigStick parts, every one editable, matching the 3D Shot studio's take: the
     * "3D Camera" rig keyed every frame along the studio's camera move, the hero (a figure in the studio
     * hero's proportions) keyed every frame from the physics solver with his feet planted on the roof, a
     * wind-simulated scarf at his neck, a sword in his hand turned along the forearm, glow, bloom and
     * vignette clips, and the 3D Set (the city) rendered from the rig into the Scene layer. Hero, scarf and
     * sword are scaled with the camera every frame, so they stay locked to the roof. The set renders in the
     * background; poll rigstick_export_status.
     */
    async rigstick_build_3d_layers({camera = 'hero-orbit', action = 'sword-raise', color = '#ff7a1a', seconds = 6, seed = 7, blur = 4, onProgress}) {
      if (!SET_CAMERAS.includes(camera)) fail(`Unknown camera "${camera}". Cameras: ${SET_CAMERAS.join(', ')}.`);
      if (!ACTIONS[action]) fail(`Unknown action "${action}". Actions: ${Object.keys(ACTIONS).join(', ')}.`);
      if (exportJob?.status === 'rendering') fail(`A render is already running (${exportJob.done}/${exportJob.total} frames).`);
      const width = 1280, height = 720;
      const built = edit('Build 3D shot', () => {
        if (editor.report.canvas_width !== width || editor.report.canvas_height !== height) editor.setCanvasSize(width, height);
        const rate = fps(), total = Math.round(seconds * rate), last = total - 1;
        ensureLength(total);
        for (const object of objects().filter(object => typeOf(object)?.name === 'Blue' && editor.layerFrameKeys(layerOf(object.unique_id)).length <= 1)) { editor.select(object.unique_id, -1); editor.deleteFigure(); }
        const shotAt = tick => setCameraAt(camera, tick / Math.max(1, seconds * rate), {width, height});
        // Screen pixels per hero unit at a frame: the camera's scale at the hero (set3d.mjs, shot.mjs).
        const unitScale = view => height * RIG_PPM * view.zoom * HERO_UNIT_M;
        const scaleTo = (uid, wanted) => { const now = objectOf(uid).scale; if (Math.abs(now - wanted) > 1e-4) { editor.select(uid, -1); editor.scaleSelection(wanted / now); } };
        const first = shotAt(0);

        // 1. The 3D Camera: an invisible rig, keyed every frame with the studio's move (dials + roof point).
        seek(0);
        const rigLayer = editor.createLayer('3D Camera', {activate: true});
        editor.importFigure(cameraRigFigure(first), {position: first.marker});
        const rig = editor.selectedUid; holdToEnd(rigLayer.id, 0);
        for (let tick = 0; tick < total; tick++) {
          const view = shotAt(tick);
          seek(tick); setJoints(rig, Object.fromEntries(rigAngles(view).map((angle, i) => [i, angle]))); moveTo(rig, view.marker.x, view.marker.y);
        }
        editor.sheetSetEasing([rigLayer.id], 0, last, {interpolation: 'linear'});

        // 2. The scarf (behind the hero), 3. the hero, 4. the sword: hero units, scaled by the camera.
        const scarfLayer = editor.createLayer('Scarf', {activate: true});
        seek(0); editor.importFigure(scarfFigure({links: 8, linkLength: 38, width: 26}), {position: first.marker});
        const scarf = editor.selectedUid; holdToEnd(scarfLayer.id, 0);
        const heroLayer = editor.createLayer('Hero', {activate: true});
        seek(0); editor.importFigure(heroFigure(RIG, color), {position: first.marker});
        const hero = editor.selectedUid; holdToEnd(heroLayer.id, 0);
        const swordLayer = editor.createLayer('Sword', {activate: true});
        seek(0); editor.importFigure(swordFigure(RIG), {position: first.marker});
        const sword = editor.selectedUid; holdToEnd(swordLayer.id, 0);
        const type = typeOf(objectOf(hero)), roles = resolveRoles(type.segments), index = name => type.segments.findIndex(segment => segment.name === name);
        const neck = type.segments[index('Chest')].segment_id, hand = type.segments[index('Left forearm')].segment_id, collar = index('Collar');
        seek(0);
        editor.select(scarf, -1); editor.joinTo(hero, neck);
        editor.select(sword, -1); editor.joinTo(hero, hand);
        const heroKeys = stickmanKeys(action, {seconds, fps: rate, every: 1, thigh: RIG.thigh, shin: RIG.shin});
        const scarfAngles = scarfKeys(action, {seconds, fps: rate, every: 1, links: 8, linkLength: 38});
        for (const [i, key] of heroKeys.entries()) {
          seek(key.tick);
          const scale = unitScale(shotAt(key.tick)), marker = shotAt(key.tick).marker;
          scaleTo(hero, scale);
          const joints = Object.fromEntries(Object.entries(key.joints).filter(([role]) => role in roles).map(([role, angle]) => [roles[role], angle]));
          joints[collar] = key.joints.head;    // the head tips on its neck, as the studio hero's does
          setJoints(hero, joints);
          moveTo(hero, marker.x + key.hip.x * scale, marker.y + key.hip.y * scale);
          scaleTo(scarf, scale); setJoints(scarf, Object.fromEntries(scarfAngles[i].angles.map((angle, link) => [link, angle])));
          // The blade runs on along the forearm, as in the studio: turn the whole sword to the forearm's angle.
          scaleTo(sword, scale);
          const turn = wrap(key.joints.armALower - objectOf(sword).angles[0]);
          if (Math.abs(turn) > 1e-4) { editor.select(sword, -1); editor.rotateFigure(turn); }
        }
        for (const layer of [heroLayer, scarfLayer, swordLayer]) editor.sheetSetEasing([layer.id], 0, last, {interpolation: 'linear'});

        // 5. Glow on the blade from the raise, and the scene's bloom and vignette, as effect clips.
        const raise = Math.round((ACTIONS[action].find(beat => beat.spring === 'snap')?.t ?? 0) * rate);
        if (raise) { seek(raise - 2); editor.addVfxGroup({kind: 'figure', uid: sword}, 'Power up', {start: raise - 2, duration: total - raise + 2}); }
        seek(0);
        const tune = (id, name, params) => { const clip = vfxClips(editor.report).find(item => item.id === id);
          editor.setVfxClip(id, {name, effects: clip.effects.map(effect => ({...effect, params: {...effect.params, ...params}}))}); };
        tune(editor.addVfxClip({kind: 'scene'}, 'bloom', {start: 0, duration: total}), 'City glow', {threshold: 0.78, intensity: 0.45, radius: 22});
        tune(editor.addVfxClip({kind: 'scene'}, 'vignette', {start: 0, duration: total}), 'Vignette', {amount: 0.4});
        editor.seek(0);
        return {rig, hero, scarf, sword, layers: ['3D Camera', 'Scarf', 'Hero', 'Sword'], frames: total};
      });
      const job = startSetBake({seed, blur, onProgress});
      return text({...built, set: {status: job.status, frames: job.total}, next: 'the 3D Set renders in the background; poll rigstick_export_status'});
    },
    /**
     * Keys the 3D Camera at a frame: orbit/tilt in degrees, lens (field of view, degrees), zoom, and where
     * the roof lands in the frame (x, y). Values left out keep the camera's current value there. The city
     * follows after rigstick_update_3d_set.
     */
    rigstick_set_3d_camera({frame, orbit, tilt, lens, zoom, x, y}) {
      const rigType = editor.report.figure_types.find(isCameraRig) ?? fail('This project has no 3D Camera. Build a 3D shot first.');
      const tick = frame === undefined ? Math.floor(editor.tick) : tickOf(frame);
      const values = edit('Key 3D camera', () => {
        seek(tick);
        const object = objects().find(item => item.figure_type_id === rigType.figure_type_id) ?? fail('The 3D Camera is not on this frame.');
        const now = rigValues(object), next = {orbit: Number.isFinite(orbit) ? orbit * DEG : now.orbit, tilt: Number.isFinite(tilt) ? tilt * DEG : now.tilt,
          lens: Number.isFinite(lens) ? lens : now.lens, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : now.zoom};
        setJoints(object.unique_id, Object.fromEntries(rigAngles(next).map((angle, i) => [i, angle])));
        if (Number.isFinite(x) || Number.isFinite(y)) moveTo(object.unique_id, x, y);
        return rigValues(objectOf(object.unique_id));
      });
      return text({frame: tick + 1, orbit: round(values.orbit / DEG), tilt: round(values.tilt / DEG), lens: round(values.lens), zoom: round(values.zoom, 2),
        x: round(values.marker.x), y: round(values.marker.y), next: 'rigstick_update_3d_set renders the city from the new camera'});
    },
    /** The 3D Camera's values at a frame (degrees), for the panel and AI clients. */
    rigstick_get_3d_camera({frame}) {
      const rigType = editor.report.figure_types.find(isCameraRig);
      if (!rigType) return text({camera: null});
      const tick = frame === undefined ? Math.floor(editor.tick) : tickOf(frame), rows = timeline(editor.report);
      const object = frameAtTime(rows, tick).objects.find(item => item.figure_type_id === rigType.figure_type_id);
      if (!object) return text({camera: null});
      const v = rigValues(object);
      return text({frame: tick + 1, orbit: round(v.orbit / DEG), tilt: round(v.tilt / DEG), lens: round(v.lens), zoom: round(v.zoom, 2), x: round(v.marker.x), y: round(v.marker.y)});
    },
    /** Re-renders the 3D Set (the city behind everything) from the 3D Camera rig's current keys. */
    rigstick_update_3d_set({seed, blur, onProgress}) {
      if (exportJob?.status === 'rendering') fail(`A render is already running (${exportJob.done}/${exportJob.total} frames).`);
      const job = startSetBake({seed, blur, onProgress});
      return text({status: job.status, frames: job.total, next: 'poll rigstick_export_status'});
    },
    rigstick_export_status() {
      if (!exportJob) return text({status: 'none'});
      const {status, done, total, path, error, seconds, size} = exportJob;
      return text({status, frames: `${done}/${total}`, path, seconds, size, ...(error ? {error} : {})});
    },
    async rigstick_build_scene({background, seconds, cast = [], steps = []}) {
      const rate = fps(), names = new Map(), props = new Set(), report = [];
      const resolve = who => { if (who === undefined || who === 'scene') return 'scene'; const uid = names.get(who) ?? (Number.isInteger(Number(who)) ? Number(who) : undefined); if (uid === undefined) fail(`No cast member "${who}".`); return uid; };
      const atTick = t => Math.max(0, Math.round((t ?? 0) * rate));
      const textFigures = [];
      for (const member of cast) if (member.kind === 'text') {
        const style = TEXT_STYLES[member.style] ?? TEXT_STYLES.caption;
        textFigures.push({member, definition: await createTextFigure({text: member.text ?? member.name, name: (member.text ?? member.name).slice(0, 60), fontSize: style.size * (member.scale ?? 1), color: hexToRgb(member.color ?? style.color)})});
      }
      // Images are imported first (async), so they become the bottom layers: backdrops behind the cast.
      const images = new Map();
      for (const member of cast) if (member.kind === 'image') {
        if (!member.data) fail(`Image "${member.name}" needs a path (desktop app) or url.`);
        if (!importImage) fail('Image import is not available here.');
        const bytes = Uint8Array.from(atob(member.data), c => c.charCodeAt(0)), name = member.name ?? 'image';
        editor.createLayer(`Image: ${name}`, {activate: true});
        await importImage(new File([bytes], member.fileName ?? `${name}.png`, {type: /\.jpe?g$/i.test(member.fileName ?? '') ? 'image/jpeg' : 'image/png'}), {background: false});
        images.set(member, editor.selectedUid);
      }
      const stepTexts = [];
      for (const step of steps) if (step.do === 'text') {
        const style = TEXT_STYLES[step.style] ?? TEXT_STYLES.caption;
        stepTexts.push({step, definition: await createTextFigure({text: step.text ?? 'Text', name: (step.text ?? 'Text').slice(0, 60), fontSize: style.size, color: hexToRgb(style.color)})});
      }
      edit('Build scene', () => {
        const end = Math.max(atTick(seconds), ...steps.map(step => atTick(step.t) + Math.round((step.seconds ?? 2) * rate)));
        ensureLength(Math.max(1, end));
        if (background) { seek(0); editor.setBackgroundColor(0xff000000 + parseInt((BACKGROUNDS[background] ?? background).slice(1), 16)); }
        // A cast replaces the new document's untouched stock figure; each member gets its own layer, in cast
        // order, so the order of the cast is the depth order (first = furthest back).
        if (cast.some(member => member.kind === 'stickman')) for (const object of objects().filter(object => typeOf(object)?.name === 'Blue' && editor.layerFrameKeys(layerOf(object.unique_id)).length <= 1)) { editor.select(object.unique_id, -1); editor.deleteFigure(); }
        for (const member of cast) {
          seek(0);
          if (member.kind === 'stickman') {
            const layer = editor.createLayer(member.name, {activate: true}), uid = editor.addFigure()?.unique_id ?? editor.selectedUid;
            holdToEnd(layer.id, 0);
            moveTo(uid, member.x ?? editor.report.canvas_width / 2, member.y ?? editor.report.canvas_height / 2);
            if (member.scale && member.scale !== 1) { editor.select(uid, -1); editor.scaleSelection(member.scale); }
            if (member.color) { editor.select(uid, -1); editor.setFigureColor(member.color); }
            names.set(member.name, uid);
          } else if (member.kind === 'prop') {
            const layer = editor.createLayer(`Prop: ${member.prop}`, {activate: true});
            const uid = buildProp(editor, member.prop, {x: member.x ?? editor.report.canvas_width / 2, y: member.y ?? editor.report.canvas_height / 2, scale: member.scale ?? 1, tint: member.color, options: {depth: member.depth, seed: member.seed, width: member.width}});
            holdToEnd(layer.id, 0);
            names.set(member.name, uid); props.add(uid);
            if (member.hold) grip(uid, resolve(member.hold), 'right');
          } else if (member.kind === 'image') {
            const uid = images.get(member);
            moveTo(uid, member.x ?? editor.report.canvas_width / 2, member.y ?? editor.report.canvas_height / 2);
            if (member.scale && member.scale !== 1) { editor.select(uid, -1); editor.scaleSelection(member.scale); }
            holdToEnd(layerOf(uid), 0);
            names.set(member.name, uid);
          } else if (member.kind === 'text') {
            const {definition} = textFigures.find(item => item.member === member);
            const layer = editor.createLayer(`Text: ${member.name}`, {activate: true});
            editor.importFigure(definition, {position: {x: member.x ?? editor.report.canvas_width / 2, y: member.y ?? 60}});
            holdToEnd(layer.id, 0);
            names.set(member.name, editor.selectedUid);
          }
        }
        for (const step of [...steps].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))) {
          const tick = atTick(step.t);
          if (step.do === 'move') { const plan = moveKeys(resolve(step.who), step.move, tick, step); report.push(`${step.who} ${step.move} ${round(tick / rate)}–${round((tick + plan) / rate)}s`); }
          else if (step.do === 'vfx') {
            const on = resolve(step.on ?? step.who ?? 'scene');
            addVfx(step.effect, on, tick, step.seconds ?? 1.5); report.push(`${step.effect} at ${round(tick / rate)}s`);
            // An explosion destroys the prop it is on: the prop leaves a few frames in, under the blast.
            if (step.effect === 'explosion' && on !== 'scene' && props.has(on)) remove(on, tick + Math.round(rate * 0.15));
          }
          else if (step.do === 'pan') { pan(resolve(step.who), tick, step.seconds ?? 2, step.dx ?? 0, step.dy ?? 0); report.push(`${step.who} pans ${step.dx ?? 0}px`); }
          else if (step.do === 'remove') { remove(resolve(step.who), tick); report.push(`${step.who} removed at ${round(tick / rate)}s`); }
          else if (step.do === 'camera') { cameraMove(step.move, tick, step.seconds ?? 1, step.intensity ?? 1, step.on ?? step.who); report.push(`camera ${step.move} at ${round(tick / rate)}s`); }
          else if (step.do === 'look') { addVfx(step.effect, resolve(step.on ?? step.who ?? 'scene'), tick, step.seconds ?? 2); report.push(`look ${step.effect}`); }
          else if (step.do === 'pose') {
            const uid = resolve(step.who); seek(tick); const type = typeOf(objectOf(uid));
            setJoints(uid, Object.fromEntries(Object.entries(step.joints ?? {}).map(([name, degrees]) => [jointIndex(type, name), degrees * DEG])));
            if (Number.isFinite(step.x) || Number.isFinite(step.y)) moveTo(uid, step.x, step.y);
            editor.sheetSetEasing([layerOf(uid)], 0, editor.totalTicks - 1, {interpolation: 'auto'});
          } else if (step.do === 'text') {
            const {definition} = stepTexts.find(item => item.step === step);
            seek(tick); const layer = editor.createLayer(`Text: ${(step.text ?? '').slice(0, 20)}`, {activate: true});
            editor.importFigure(definition, {position: {x: step.x ?? editor.report.canvas_width / 2, y: step.y ?? 60}});
            const length = Math.max(1, Math.round((step.seconds ?? 2) * rate)); editor.sheetSetDuration(Math.min(length, editor.totalTicks - tick), layer.id, tick);
            report.push(`text "${(step.text ?? '').slice(0, 20)}"`);
          }
        }
        seek(0);
      });
      return text({frames: editor.totalTicks, seconds: round(editor.totalTicks / rate, 2), cast: Object.fromEntries(names), did: report});
    },
    rigstick_go_to_frame({frame}) { editor.seek(Math.min(tickOf(frame), editor.totalTicks - 1)); onChange(); return text(`At frame ${Math.floor(editor.tick) + 1}.`); },
    rigstick_delete_figure({figure}) {
      edit('Delete figure', () => { objectOf(figure); editor.select(figure, -1); editor.deleteFigure(); });
      return text(`Deleted figure ${figure}.`);
    },
    rigstick_undo({steps = 1}) { let done = 0; while (done < steps && editor.canUndo) { editor.undo(); done++; } onChange(); return text(`Undid ${done} step(s).`); },
    rigstick_redo({steps = 1}) { let done = 0; while (done < steps && editor.canRedo) { editor.redo(); done++; } onChange(); return text(`Redid ${done} step(s).`); },
    rigstick_get_transcript({track}) {
      const all = transcripts(), item = track ? all.find(entry => entry.track === track) : all[0];
      if (!item) return text('No transcript yet. Ask the user to open the Transcribe panel, pick the audio track and press Transcribe.');
      const rate = fps(), offset = item.offset ?? 0;
      return text({track: item.track, name: item.name, language: item.result.language, engine: item.result.engine,
        words: item.result.words.map(word => ({text: word.text, start: round(word.start + offset, 2), end: round(word.end + offset, 2),
          frame: Math.floor((word.start + offset) * rate) + 1}))});
    },
    rigstick_play({playing}) { if (playing) play(); else stop(); return text(playing ? 'Playing.' : 'Stopped.'); },
  };

  return {
    names: Object.keys(handlers),
    /** The running (or last) background render: an export or a 3D Set. The 3D Shot studio watches it. */
    job: () => exportJob,
    async call(name, args) {
      const handler = handlers[name];
      if (!handler) fail(`RigStick has no editor tool ${name}.`);
      return handler(args ?? {});
    },
  };
}
