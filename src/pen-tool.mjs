// Build's Pen and Shape tools: Illustrator-style drawing straight into a rig.
//
// Pen: click places a corner anchor, click-and-drag pulls the curve's tangent out of the anchor (the
// next segment continues smoothly from it), clicking the first anchor closes the path and fills it,
// Enter or double-click finishes an open path, Backspace removes the last anchor, Esc cancels.
// Shape: drag a rectangle, ellipse, polygon or star (Shift keeps it regular, Alt draws from the centre).
//
// Every anchor becomes a joint and every edge a segment whose bend (a circular arc, src/pivot/
// geometry.mjs arc()) follows the drawn curve, so drawings are rigs: Animate poses and keys them like
// any figure, and closed shapes get a polygon fill (two undo steps: the outline, then its fill).
import {builderStrokeAppearance, setBuilderStroke} from './builder-appearance.mjs';

export const SHAPES = ['rectangle', 'ellipse', 'polygon', 'star'];
const TAU = Math.PI * 2;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** An arc from a to b whose end tangent turns `bend` past the chord; the segment spec addSegments takes. */
export function arcSpec(a, b, bend, scale = 1) {
  const chord = distance(a, b), phi = Math.atan2(b.y - a.y, b.x - a.x);
  bend = Math.max(-1.95 * Math.PI, Math.min(1.95 * Math.PI, bend));
  const length = Math.abs(bend) < 1e-6 ? chord : chord * (bend / 2) / Math.sin(bend / 2);
  return {type: 'line', length: length / Math.abs(scale), angle: phi - bend / 2 - (scale < 0 ? Math.PI : 0), bend: scale < 0 ? -bend : bend};
}

/** Points along the arc arcSpec describes, for previews. */
export function arcPoints(a, b, bend, steps = 24) {
  if (Math.abs(bend) < 1e-6) return [a, b];
  const chord = distance(a, b), phi = Math.atan2(b.y - a.y, b.x - a.x), length = chord * (bend / 2) / Math.sin(bend / 2), r = length / bend, start = phi - bend / 2;
  return Array.from({length: steps + 1}, (_, i) => ({x: a.x + r * (Math.sin(start + bend * i / steps) - Math.sin(start)), y: a.y + r * (Math.cos(start) - Math.cos(start + bend * i / steps))}));
}

/** A closed outline as anchors plus the bend into each anchor (bends[0] unused). */
export function shapeOutline(kind, from, to, {regular = false, centred = false, sides = 6} = {}) {
  let w = to.x - from.x, h = to.y - from.y;
  if (regular) { const size = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * size; h = Math.sign(h || 1) * size; }
  const cx = centred ? from.x : from.x + w / 2, cy = centred ? from.y : from.y + h / 2, rx = Math.abs(centred ? w : w / 2), ry = Math.abs(centred ? h : h / 2);
  let anchors, bends;
  if (kind === 'rectangle') {
    anchors = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({x: cx + sx * rx, y: cy + sy * ry}));
    bends = anchors.map(() => 0);
  } else if (kind === 'ellipse') {
    // Eight circular arcs, each turning by the ellipse's own tangent change: exact for circles, close for ellipses.
    const count = 8, at = t => ({x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t)}), tangent = t => Math.atan2(ry * Math.cos(t), -rx * Math.sin(t));
    anchors = Array.from({length: count}, (_, i) => at(-Math.PI / 2 + i * TAU / count));
    bends = anchors.map((_, i) => i ? wrap(tangent(-Math.PI / 2 + i * TAU / count) - tangent(-Math.PI / 2 + (i - 1) * TAU / count)) : 0);
  } else {
    const points = kind === 'star' ? 10 : Math.max(3, sides), inner = 0.45;
    anchors = Array.from({length: points}, (_, i) => {
      const t = -Math.PI / 2 + i * TAU / points, k = kind === 'star' && i % 2 ? inner : 1;
      return {x: cx + rx * k * Math.cos(t), y: cy + ry * k * Math.sin(t)};
    });
    bends = anchors.map(() => 0);
  }
  // Close: the last edge returns to the first anchor, bending like the first arc of the outline.
  return {anchors: [...anchors, {...anchors[0]}], bends: [...bends, kind === 'ellipse' ? bends[1] : 0]};
}

const hex = rgb => `#${rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const lighter = rgb => rgb.map(v => v + (255 - v) * 0.55);

export function createPenTool({editor, state, render, project, snap = (p) => p, onError = console.error}) {
  let draft = null, shape = null;
  const geometry = () => editor.geometry?.objects?.get(editor.object?.object_slot) ?? null;
  const scale = () => editor.object?.scale ?? 1;
  const radius = () => 10 / state.view.scale;

  /** Where a path starts: an existing joint it touches, else the figure's root through an invisible link. */
  function attach(point) {
    const geom = geometry();
    let hit = null, best = radius();
    for (const [id, joint] of geom?.joints ?? []) { const d = distance(joint, point); if (d <= best) { best = d; hit = {id, ...joint}; } }
    if (hit) return {parentId: hit.id, start: {x: hit.x, y: hit.y}, link: null};
    const root = geom?.joints?.get(0);
    return root ? {parentId: 0, start: point, link: {from: root, to: point}} : {parentId: 0, start: point, link: null};
  }

  function commitOutline(anchors, bends, closed, parent) {
    const specs = [], stroke = builderStrokeAppearance(editor, parent.link ? 0 : parent.parentId).width / Math.abs(scale());
    // The path's own stroke: never inherited from the invisible link that ties it to the figure.
    const thickness = stroke > 0 ? stroke : 8;
    if (parent.link) specs.push({...arcSpec(parent.link.from, parent.link.to, 0, scale()), thickness: 0});
    for (let i = 1; i < anchors.length; i++) if (distance(anchors[i - 1], anchors[i]) > 0.5) specs.push({...arcSpec(anchors[i - 1], anchors[i], bends[i] ?? 0, scale()), thickness});
    if (!specs.length) return;
    if (!editor.figure) specs[0].start = parent.link ? parent.link.from : anchors[0];
    specs[0].parentId = editor.figure ? parent.parentId : undefined;
    const appearance = builderStrokeAppearance(editor, parent.parentId), color = appearance.color.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [43, 43, 43];
    // Build records topology edits in its own session history: the outline and its fill are two steps.
    const added = editor.addSegments(specs);
    if (closed && anchors.length >= 4) {
      const ids = added.slice(parent.link ? 1 : 0).map(segment => segment.segment_id);
      const first = parent.link ? added[0].segment_id : parent.parentId;
      editor.addPolygon([first, ...ids], {color: hex(lighter(color)), opacity: 1});
    }
  }

  function cancel() { draft = null; shape = null; render(); }
  function finish() {
    if (!draft) return;
    const {anchors, bends, closed, parent} = draft;
    draft = null;
    try { if (anchors.length >= 2) commitOutline(anchors, bends, closed, parent); } catch (error) { onError(error); }
    render();
  }

  const pen = {
    get active() { return Boolean(draft); },
    press(point, event) {
      if (!draft) {
        const parent = attach(point);
        draft = {anchors: [parent.start], bends: [0], out: [null], parent, pressing: true, current: parent.start, closed: false, appearance: builderStrokeAppearance(editor, parent.parentId)};
      } else {
        const first = draft.anchors[0], last = draft.anchors.at(-1);
        const closing = draft.anchors.length >= 3 && distance(point, first) <= radius();
        const next = closing ? {...first} : snap(point, event, last);
        if (distance(next, last) < 1 / state.view.scale) { draft.pressing = true; return render(); }
        const previousOut = draft.out.at(-1), phi = Math.atan2(next.y - last.y, next.x - last.x);
        // A dragged anchor's handle sets where the next edge leaves it: the arc keeps that tangent (smooth point).
        draft.bends.push(previousOut == null ? 0 : 2 * wrap(phi - previousOut));
        draft.anchors.push(next); draft.out.push(null); draft.closed = closing; draft.pressing = true;
      }
      draft.current = draft.anchors.at(-1);
      render();
    },
    move(point, event) {
      if (!draft) return;
      if (draft.pressing) {
        const anchor = draft.anchors.at(-1), i = draft.anchors.length - 1;
        if (distance(point, anchor) < 3 / state.view.scale) return;
        const theta = Math.atan2(point.y - anchor.y, point.x - anchor.x);
        draft.handle = point; draft.out[i] = theta;
        if (i > 0) {
          // Dragging out of an anchor shapes the edge into it: its end tangent follows the handle.
          const prev = draft.anchors[i - 1], phi = Math.atan2(anchor.y - prev.y, anchor.x - prev.x);
          draft.bends[i] = 2 * wrap(theta - phi);
        }
      } else draft.current = snap(point, event, draft.anchors.at(-1));
      render();
    },
    release() {
      if (!draft) return;
      draft.pressing = false; draft.handle = null;
      if (draft.closed) finish(); else render();
    },
    back() { if (!draft) return; if (draft.anchors.length > 1) { draft.anchors.pop(); draft.bends.pop(); draft.out.pop(); } else draft = null; render(); },
    finish, cancel,
    draw(ctx) {
      if (!draft) return;
      ctx.save(); setBuilderStroke(ctx, draft.appearance, state.view.scale); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      draft.anchors.forEach((anchor, i) => {
        if (!i) { const p = project(anchor); ctx.moveTo(p.x, p.y); return; }
        for (const point of arcPoints(draft.anchors[i - 1], anchor, draft.bends[i]).slice(1)) { const p = project(point); ctx.lineTo(p.x, p.y); }
      });
      if (!draft.pressing && !draft.closed) {
        const last = draft.anchors.at(-1), out = draft.out.at(-1), next = draft.current;
        const bend = out == null ? 0 : 2 * wrap(Math.atan2(next.y - last.y, next.x - last.x) - out);
        for (const point of arcPoints(last, next, bend).slice(1)) { const p = project(point); ctx.lineTo(p.x, p.y); }
      }
      ctx.stroke(); ctx.restore();
      ctx.save(); ctx.lineWidth = 1.5;
      if (draft.handle) {
        const a = project(draft.anchors.at(-1)), h = project(draft.handle), mirror = {x: 2 * a.x - h.x, y: 2 * a.y - h.y};
        ctx.strokeStyle = '#ff6a1a'; ctx.beginPath(); ctx.moveTo(mirror.x, mirror.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        for (const end of [h, mirror]) { ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.arc(end.x, end.y, 3.5, 0, TAU); ctx.fill(); }
      }
      draft.anchors.forEach((anchor, i) => {
        const p = project(anchor), first = i === 0;
        ctx.fillStyle = first && draft.anchors.length >= 3 ? '#ff6a1a' : '#ffffff'; ctx.strokeStyle = '#ff6a1a';
        ctx.beginPath(); ctx.rect(p.x - 4, p.y - 4, 8, 8); ctx.fill(); ctx.stroke();
      });
      ctx.restore();
    },
  };

  const shapes = {
    get active() { return Boolean(shape); },
    press(point) { shape = {from: point, to: point, kind: state.settings.penShape ?? 'rectangle', appearance: builderStrokeAppearance(editor, 0)}; render(); },
    move(point, event) {
      if (!shape) return;
      shape.to = point; shape.regular = event.shiftKey; shape.centred = event.altKey; render();
    },
    release() {
      if (!shape) return;
      const {from, to, kind, regular, centred} = shape; shape = null;
      if (distance(from, to) < 4 / state.view.scale) return render();
      try {
        const outline = shapeOutline(kind, from, to, {regular, centred, sides: state.settings.penSides ?? 6});
        commitOutline(outline.anchors, outline.bends, true, attach(outline.anchors[0]));
      } catch (error) { onError(error); }
      render();
    },
    cancel() { shape = null; render(); },
    draw(ctx) {
      if (!shape) return;
      const outline = shapeOutline(shape.kind, shape.from, shape.to, {regular: shape.regular, centred: shape.centred, sides: state.settings.penSides ?? 6});
      ctx.save(); setBuilderStroke(ctx, shape.appearance, state.view.scale); ctx.lineJoin = 'round';
      ctx.fillStyle = 'rgba(255, 106, 26, 0.12)'; ctx.beginPath();
      outline.anchors.forEach((anchor, i) => {
        if (!i) { const p = project(anchor); ctx.moveTo(p.x, p.y); return; }
        for (const point of arcPoints(outline.anchors[i - 1], anchor, outline.bends[i]).slice(1)) { const p = project(point); ctx.lineTo(p.x, p.y); }
      });
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    },
  };

  // While a path is open, Enter finishes it, Escape cancels it and Backspace removes its last anchor.
  document.addEventListener('keydown', event => {
    if (!(draft || shape) || event.target.closest?.('input,textarea,select,[contenteditable=true],dialog,:popover-open')) return;
    if (!['Enter', 'Escape', 'Backspace'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape') cancel();
    else if (!draft) return;
    else if (event.key === 'Enter') finish();
    else pen.back();
  }, true);
  editor.addEventListener('change', event => {
    if ((draft || shape) && ['history', 'document', 'frame', 'seek'].includes(event.detail?.kind)) cancel();
  });

  return {pen, shapes};
}
