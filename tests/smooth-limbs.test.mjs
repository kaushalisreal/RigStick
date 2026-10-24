/**
 * Smooth limbs (src/ai/smooth-limbs.mjs): curved segments must end exactly where the straight ones did,
 * continue smoothly through a bent joint, and leave forks (hip, shoulders) and non-lines alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothValues} from '../src/ai/smooth-limbs.mjs';
import {arc} from '../src/pivot/geometry.mjs';

const DEG = Math.PI / 180;
const shape = (id, parent, start, end, kind = 'line') => ({start, end, thickness: 12, seg: {segment_id: id, parent_id: parent, segment_kind: kind}});
// An arm bent at the elbow, a head circle and two legs forking at the hip.
const shapes = [
  shape(1, 0, {x: 0, y: 0}, {x: 30, y: 50}),
  shape(2, 1, {x: 30, y: 50}, {x: 20, y: 100}),
  shape(3, 0, {x: 0, y: 0}, {x: 0, y: -20}, 'circleFill'),
  shape(4, 0, {x: 0, y: 0}, {x: -30, y: 60}),
  shape(5, 0, {x: 0, y: 0}, {x: 30, y: 60}),
];

test('every curved segment still ends on its joint', () => {
  const values = smoothValues(shapes);
  assert.ok(values.size >= 2, 'the bent arm is curved');
  for (const [index, value] of values) {
    const end = arc(shapes[index].start, value.angle * DEG, value.length, value.bend * DEG).at(-1);
    assert.ok(Math.hypot(end.x - shapes[index].end.x, end.y - shapes[index].end.y) < 1e-6, `segment ${index}`);
  }
});

test('the elbow is smooth: the upper arm leaves it on the tangent the forearm arrives on', () => {
  const values = smoothValues(shapes, {strength: 1}), upper = values.get(0), lower = values.get(1);
  const upperEnd = (upper.angle + upper.bend) * DEG, lowerStart = lower.angle * DEG;
  assert.ok(Math.abs(Math.atan2(Math.sin(upperEnd - lowerStart), Math.cos(upperEnd - lowerStart))) < 1e-6);
});

test('circles, forks and strength 0 are left alone; mirrored figures get unscaled lengths', () => {
  const values = smoothValues(shapes);
  assert.equal(values.has(2), false, 'the head circle');
  assert.equal(values.has(3), false, 'a leg forking at the hip has no continuation');
  assert.equal(smoothValues(shapes, {strength: 0}).size, 0);
  const scaled = smoothValues(shapes, {scale: -2});
  assert.ok(Math.abs(scaled.get(0).length * 2 - values.get(0).length) < 1e-9);
});
