/**
 * Build's Pen and Shape tools (src/pen-tool.mjs): the arc each drawn edge becomes must land exactly on
 * the next anchor when the renderer evaluates it (src/pivot/geometry.mjs arc()), and shapes must close.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcSpec, arcPoints, shapeOutline, SHAPES} from '../src/pen-tool.mjs';
import {arc} from '../src/pivot/geometry.mjs';

const near = (a, b, label) => { assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, `${label}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); };

test('a drawn edge, evaluated by the renderer, ends on the next anchor for straight and curved bends', () => {
  const a = {x: 100, y: 200}, b = {x: 260, y: 140};
  for (const bend of [0, 0.6, -0.6, 2.5, -2.9, 5.5]) {
    const spec = arcSpec(a, b, bend), points = arc(a, spec.angle, spec.length, spec.bend);
    near(points.at(-1), b, `bend ${bend}`);
    near(arcPoints(a, b, bend).at(-1), b, `preview ${bend}`);
  }
});

test('a mirrored figure (negative scale) gets the mirrored segment', () => {
  const spec = arcSpec({x: 0, y: 0}, {x: 10, y: 0}, 1, -2);
  assert.ok(Math.abs(spec.length - 10 * 0.5 / Math.sin(0.5) / 2) < 1e-9);
  assert.equal(spec.bend, -1);
});

test('every shape closes on its first anchor, and an ellipse of equal radii is a true circle', () => {
  for (const kind of SHAPES) {
    const {anchors, bends} = shapeOutline(kind, {x: 0, y: 0}, {x: 200, y: 120});
    near(anchors.at(-1), anchors[0], kind);
    assert.equal(anchors.length, bends.length, kind);
  }
  const circle = shapeOutline('ellipse', {x: 0, y: 0}, {x: 100, y: 100});
  for (let i = 1; i < circle.anchors.length; i++) {
    for (const point of arcPoints(circle.anchors[i - 1], circle.anchors[i], circle.bends[i], 8))
      assert.ok(Math.abs(Math.hypot(point.x - 50, point.y - 50) - 50) < 1e-6, 'every arc sample lies on the circle');
  }
  const square = shapeOutline('rectangle', {x: 0, y: 0}, {x: 80, y: 30}, {regular: true});
  assert.deepEqual(square.anchors.slice(0, 4).map(p => [p.x, p.y]), [[0, 0], [80, 0], [80, 80], [0, 80]]);
  assert.equal(shapeOutline('star', {x: 0, y: 0}, {x: 10, y: 10}).anchors.length, 11);
});
