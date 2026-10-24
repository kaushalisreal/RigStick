// Smooth limbs: turns a figure's straight segments into arcs so each limb flows into the next instead
// of meeting at a corner. Every joint stays exactly where it is; only the curve between joints changes.
//
// At a joint shared by a segment and its continuation (its parent, or the child pointing most nearly the
// same way) both arcs take the bisector of the two chords as their tangent, so the limb is smooth there.
// A segment's arc turns by the difference between its end and start tangents (src/pivot/geometry.mjs
// arc(): start tangent = chord − bend/2). Applied through setSegmentValues with `isolate`, so children keep
// their own angles, and with Auto key on every keyframe of the figure's layer, so it animates.
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const bisector = (a, b) => a + wrap(b - a) / 2;
const MAX_BEND = (90 * Math.PI) / 180;

/**
 * Pose values ({angle, bend, length} in degrees and unscaled length) that curve each line segment.
 * `shapes` are evaluated geometry segments (start, end, seg); `strength` 0..1 scales the curve.
 */
export function smoothValues(shapes, {strength = 0.6, scale = 1} = {}) {
  const chords = shapes.map(shape => Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x));
  const lines = shapes.map(shape => shape.seg.segment_kind === 'line' && shape.thickness > 0 && Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y) > 1e-6);
  const byId = new Map(shapes.map((shape, i) => [shape.seg.segment_id, i]));
  const values = new Map();
  shapes.forEach((shape, i) => {
    if (!lines[i]) return;
    const chord = chords[i], parent = byId.get(shape.seg.parent_id);
    const children = shapes.map((other, j) => j).filter(j => j !== i && lines[j] && shapes[j].seg.parent_id === shape.seg.segment_id);
    const next = children.sort((a, b) => Math.abs(wrap(chords[a] - chord)) - Math.abs(wrap(chords[b] - chord)))[0];
    // Only continue through a joint that is really a bend in one limb, not a fork (hip, shoulders).
    const continues = j => j !== undefined && Math.abs(wrap(chords[j] - chord)) < (100 * Math.PI) / 180;
    const fromParent = parent !== undefined && lines[parent] && continues(parent), intoChild = continues(next);
    const start = fromParent ? wrap(bisector(chords[parent], chord) - chord) : 0, end = intoChild ? wrap(bisector(chord, chords[next]) - chord) : 0;
    // An arc's tangents sit symmetrically about its chord (chord ∓ bend/2), so with one end free the
    // constrained end gets the whole turn; with both constrained the arc splits the difference.
    let bend = (fromParent && intoChild ? end - start : intoChild ? 2 * end : -2 * start) * strength;
    bend = Math.max(-MAX_BEND, Math.min(MAX_BEND, bend));
    if (Math.abs(bend) < 1e-4) return;
    const length = Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y) * (bend / 2) / Math.sin(bend / 2);
    values.set(i, {angle: ((chord - bend / 2) * 180) / Math.PI, bend: (bend * 180) / Math.PI, length: length / Math.abs(scale || 1)});
  });
  return values;
}

/** Curves every limb of figure `uid` at the current frame, or at every key of its layer. Returns the frames changed. */
export function applySmoothLimbs(editor, uid, {strength = 0.6, allKeys = true, layerId} = {}) {
  const keys = allKeys ? (editor.layerFrameKeys?.(layerId) ?? []).map(key => key.tick).filter(Number.isInteger) : [];
  const ticks = keys.length ? [...new Set(keys)].sort((a, b) => a - b) : [Math.floor(editor.tick)];
  const autoKey = editor.autoKey, back = Math.floor(editor.tick);
  let changed = 0;
  try {
    editor.autoKey = true;
    editor.movieclipBatch('Smooth limbs', () => {
      for (const tick of ticks) {
        editor.seek(tick);
        const object = editor.evaluatedFrame?.objects?.find(item => item.unique_id === uid);
        if (!object) continue;
        const geometry = editor.geometry?.objects?.get(object.object_slot);
        if (!geometry) continue;
        const values = smoothValues(geometry.segments, {strength, scale: object.scale});
        for (const [index, value] of values) { editor.select(uid, index); editor.setSegmentValues(value, {isolate: true}); }
        if (values.size) changed++;
      }
      return true;
    });
  } finally { editor.autoKey = autoKey; editor.seek(back); }
  return changed;
}
