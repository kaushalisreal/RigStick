/**
 * The 3D shot as RigStick layers: the 3D Camera rig's dial mapping (set3d.mjs), the physics keys for a
 * stickman and scarf (hero.mjs), the Scene layer's per-frame image sequence (editor-scene.mjs) and the
 * export Motion blur option (export-request.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Editor} from '../src/editor.mjs';
import {emptyDocument, createObject, createFrame} from '../src/demo.mjs';
import {evaluatedFrame} from '../src/pivot/geometry.mjs';
import {rigAngles, rigValues, cameraRigFigure, isCameraRig, scarfFigure, CAMERA_DIALS, RIG_DEFAULTS, SET_CAMERAS, setCameraAt, heroFigure, swordFigure} from '../src/scene3d/set3d.mjs';
import {stickmanKeys, scarfKeys} from '../src/scene3d/hero.mjs';
import {buildExportRequest, exportOptionsFromRequest, exportFieldVisibility, normalizeExportPreferences} from '../src/export-request.mjs';

const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

test('the 3D Camera dials round-trip: camera values → dial angles → camera values', () => {
  for (const values of [RIG_DEFAULTS, {orbit: -1.05, tilt: -0.12, lens: 42, zoom: 0.95}, {orbit: 0.95, tilt: 0.7, lens: 24, zoom: 2}, {orbit: 2.5, tilt: -0.4, lens: 80, zoom: 0.5}]) {
    const back = rigValues({angles: rigAngles(values), root_x: 10, root_y: 20});
    for (const key of ['orbit', 'tilt', 'lens', 'zoom']) assert.ok(near(back[key], values[key], 1e-9), `${key} survives the dial`);
    assert.deepEqual(back.marker, {x: 10, y: 20});
  }
  const rig = cameraRigFigure();
  assert.ok(isCameraRig(rig));
  assert.equal(rig.segments.length, CAMERA_DIALS.length);
  assert.ok(rig.segments.every(segment => !segment.visible && segment.thickness === 0), 'the rig is never drawn or exported');
});

test('camera moves reproduce the studio camera: the hero stays centred, the roof below the frame centre', () => {
  for (const move of SET_CAMERAS) for (const u of [0, 0.5, 1]) {
    const view = setCameraAt(move, u, {width: 1280, height: 720});
    assert.ok([view.orbit, view.tilt, view.zoom, view.marker.x, view.marker.y].every(Number.isFinite), move);
    assert.ok(view.marker.y > 360 && view.marker.y < 720, `${move} at ${u}: the roof under his feet is in the lower half (${view.marker.y})`);
  }
  // The hero orbit sweeps about 115° and closes in a little, as the studio's does.
  const [from, to] = [0, 1].map(u => setCameraAt('hero-orbit', u));
  assert.ok(near(from.orbit, -1.05, 1e-9) && near(to.orbit, 0.95, 1e-9));
  assert.ok(to.zoom > from.zoom);
  assert.equal(from.marker.x, 640);
});

test('the hero and sword figures carry the studio hero proportions and Moves names', async () => {
  const {RIG} = await import('../src/scene3d/hero.mjs');
  const hero = heroFigure(RIG, '#ff7a1a'), length = name => hero.segments.find(segment => segment.name === name).length;
  assert.equal(length('Torso') + length('Chest'), RIG.torso);
  assert.deepEqual([length('Left thigh'), length('Left lower leg'), length('Head')], [RIG.thigh, RIG.shin, RIG.head * 2]);
  const far = hero.segments.find(segment => segment.name === 'Right upper arm'), near = hero.segments.find(segment => segment.name === 'Left upper arm');
  assert.ok(far.z_order < hero.segments.find(segment => segment.name === 'Torso').z_order && far.color_rgb[0] < near.color_rgb[0], 'the far arm is darker and behind the body');
  assert.equal(swordFigure(RIG).segments.find(segment => segment.name === 'Blade').length, RIG.sword);
});

test('dial values are clamped to a usable camera', () => {
  const wild = rigValues({angles: [0, -3, 3, -3], root_x: 0, root_y: 0});
  assert.ok(wild.tilt <= 1.45 && wild.tilt >= -0.6 && wild.lens >= 12 && wild.lens <= 100 && wild.zoom >= 0.25 && wild.zoom <= 4);
});

test('stickman keys plant the feet on any figure size and cover the whole shot', () => {
  const keys = stickmanKeys('sword-raise', {seconds: 6, fps: 24, every: 2, thigh: 66, shin: 63});
  assert.equal(keys[0].tick, 0); assert.equal(keys.at(-1).tick, 143);
  for (const {hip, joints} of keys) {
    // Walk each leg from the hip with the figure's own lengths: it must end on the ground at its foot.
    for (const [upper, lower, foot] of [['legAUpper', 'legALower', 1], ['legBUpper', 'legBLower', -1]]) {
      const knee = {x: hip.x + Math.cos(joints[upper]) * 66, y: hip.y + Math.sin(joints[upper]) * 66};
      const end = {x: knee.x + Math.cos(joints[lower]) * 63, y: knee.y + Math.sin(joints[lower]) * 63};
      assert.ok(Math.abs(end.y) < 0.6 && Math.abs(Math.abs(end.x) - 38.7) < 0.6 && Math.sign(end.x) === foot, `the foot stays planted (${end.x}, ${end.y})`);
    }
  }
  const raised = keys.at(-1).joints;
  assert.ok(raised.armALower < -1.2, 'the sword forearm ends pointing up');
});

test('scarf keys give one angle per link at every sampled frame', () => {
  const keys = scarfKeys('sword-raise', {seconds: 2, fps: 24, every: 2, links: 8, linkLength: 38});
  assert.equal(keys.length, 24);
  assert.ok(keys.every(key => key.angles.length === 8 && key.angles.every(Number.isFinite)));
  assert.equal(scarfFigure({links: 8}).segments.length, 8);
});

function sheetEditor(ticks = 4) {
  const report = emptyDocument(), walker = report.figure_types[0];
  report.keyframes = [createFrame([createObject(walker, 1, 200, 200)])];
  const editor = new Editor({demo: false, propertyChannels: true, layerTimeline: true}).load(report);
  // Every track `ticks` frames long, as the 3D shot builder makes them.
  editor.sheetInsertFrames(['scene', 'camera', ...editor.report._rigs.layers.order], editor.totalTicks, ticks - editor.totalTicks);
  return editor;
}
const pixel = color => `data:image/png;base64,${Buffer.from(color).toString('base64')}`;
const shownAt = (editor, tick) => evaluatedFrame(editor.report, 0, 0, tick).background_id;

test('a scene image sequence keys one image per frame, rewrites in place, and undoes exactly', () => {
  const editor = sheetEditor(), frames = color => [0, 1, 2, 3].map(tick => ({tick, data_url: pixel(`${color}${tick}`), width: 4, height: 4}));
  const ids = editor.setSceneSequence(frames('a'), {tag: 'set', name: 'Set'});
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(editor.report.backgrounds.map(asset => asset.data_url), frames('a').map(frame => frame.data_url), 'every image kept, in order');
  assert.deepEqual([0, 1, 2, 3].map(tick => shownAt(editor, tick)), ids);
  // A second render reuses the same images (no asset is removed), so undo restores the first render.
  const again = editor.setSceneSequence(frames('b'), {tag: 'set', name: 'Set'});
  assert.deepEqual(again, ids);
  assert.equal(editor.report.backgrounds.length, 4);
  assert.deepEqual(editor.report.backgrounds.map(asset => asset.data_url), frames('b').map(frame => frame.data_url));
  editor.undo();
  assert.deepEqual(editor.report.backgrounds.map(asset => asset.data_url), frames('a').map(frame => frame.data_url));
  editor.undo();
  assert.equal(editor.report.backgrounds?.length ?? 0, 0);
  editor.redo();
  assert.deepEqual(editor.report.backgrounds.map(asset => asset.data_url), frames('a').map(frame => frame.data_url), 'redo re-adds every image in order');
});

test('a flipbook sprite shows the image its keyed `image` property picks, and its images can be replaced', async () => {
  const {flipbookFigure} = await import('../src/scene3d/set3d.mjs');
  const {resolveInstanceFigure} = await import('../src/animation-style.mjs');
  const editor = sheetEditor(3);
  editor.importFigure(flipbookFigure('3D City', ['a', 'b', 'c'].map(color => ({data_url: pixel(color), mime_type: 'image/png'})), 8, 4), {position: {x: 4, y: 2}});
  const uid = editor.selectedUid, type = editor.report.figure_types.find(figure => figure.name === '3D City');
  editor.addAnimationKeys([0, 1, 2].map(tick => ({target: {kind: 'segment', uid, handleId: 1}, property: 'image', tick, value: 2 - tick})));
  const shown = tick => {
    const object = evaluatedFrame(editor.report, 0, 0, tick).objects.find(item => item.unique_id === uid);
    const segment = resolveInstanceFigure(type, object).segments[0];
    return type.image_assets[segment.extra_u16].data_url;
  };
  assert.deepEqual([0, 1, 2].map(shown), [pixel('c'), pixel('b'), pixel('a')]);
  editor.setFigureImages(type.figure_type_id, ['x', 'y', 'z'].map(color => ({data_url: pixel(color), mime_type: 'image/png'})));
  const replaced = editor.report.figure_types.find(figure => figure.figure_type_id === type.figure_type_id);
  assert.deepEqual(replaced.image_assets.map(asset => asset.data_url), ['x', 'y', 'z'].map(pixel));
  assert.deepEqual(replaced.image_assets[2].anchor_start, type.image_assets[0].anchor_start, 'frames keep their anchors');
  editor.undo();
  assert.deepEqual(editor.report.figure_types.find(figure => figure.figure_type_id === type.figure_type_id).image_assets.map(asset => asset.data_url), ['a', 'b', 'c'].map(pixel));
});

test('Motion blur is an export option for animations only, remembered, and absent when off', () => {
  const context = {canvasWidth: 960, canvasHeight: 540, totalFrames: 48};
  assert.equal('motionBlur' in buildExportRequest({format: 'mp4'}, context), false);
  const request = buildExportRequest({format: 'mp4', motionBlur: '6'}, context);
  assert.equal(request.motionBlur, 6);
  assert.deepEqual(exportOptionsFromRequest(request, context).motionBlur, {samples: 6, shutter: 0.5});
  assert.equal(buildExportRequest({format: 'mp4', motionBlur: '7'}, context).motionBlur, undefined, 'only the listed sample counts');
  assert.equal(exportFieldVisibility(buildExportRequest({format: 'png'}, context)).motionBlur, false);
  assert.equal(normalizeExportPreferences({motionBlur: 12}).motionBlur, 12);
});
