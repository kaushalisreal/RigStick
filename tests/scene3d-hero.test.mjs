/**
 * The 3D shot's hero rig (src/scene3d/hero.mjs): physics-solved motion, planted feet, forward knees and the
 * sword raise ending overhead and clear of the head. Pure functions, so no WebGL is needed here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {RIG, ACTIONS, solveMotion, skeleton} from '../src/scene3d/hero.mjs';

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

test('motion is deterministic and settles on the last beat', () => {
  const a = solveMotion('sword-raise', 6), b = solveMotion('sword-raise', 6);
  for (const t of [0, 1.6, 2.1, 4.5]) assert.deepEqual(a(t), b(t));
  const last = ACTIONS['sword-raise'].reduce((pose, beat) => ({...pose, ...beat}), {});
  const end = a(5.5);
  assert.ok(near(end.armS0, last.armS[0], 0.02) && near(end.armS1, last.armS[1], 0.02), 'the sword arm comes to rest at its target');
});

test('a snap beat overshoots (follow-through) instead of easing in flat', () => {
  const motion = solveMotion('sword-raise', 6), target = ACTIONS['sword-raise'].find(beat => beat.spring === 'snap').armS[1];
  let past = false;
  for (let t = 2.05; t < 3; t += 0.01) if (motion(t).armS1 < target - 0.01) past = true;
  assert.ok(past, 'the forearm swings past its target before settling');
});

test('feet stay planted on the ground and knees bend forward through the crouch', () => {
  const motion = solveMotion('sword-raise', 6);
  for (let t = 0; t <= 6; t += 0.25) {
    const s = skeleton(motion(t));
    assert.deepEqual([s.footL.y, s.footR.y], [0, 0]);
    for (const [knee, foot] of [[s.kneeL, s.footL], [s.kneeR, s.footR]]) {
      assert.ok(near(Math.hypot(knee.x - s.hip.x, knee.y - s.hip.y), RIG.thigh, 0.5), 'thigh keeps its length');
      assert.ok(Math.hypot(foot.x - knee.x, foot.y - knee.y) <= RIG.shin + 0.5, 'the shin reaches the foot');
    }
    const crouch = (a, b) => a.x >= Math.min(s.hip.x, b.x) - 0.5;
    assert.ok(crouch(s.kneeL, s.footL) && crouch(s.kneeR, s.footR), `knees point the way he faces at ${t} s`);
  }
});

test('the raised sword arm ends overhead and clear of the head', () => {
  const s = skeleton(solveMotion('sword-raise', 6)(5));
  assert.ok(s.handS.y < s.head.y - RIG.head, 'the hand is above the top of the head');
  const elbowFromHead = Math.hypot(s.elbowS.x - s.head.x, s.elbowS.y - s.head.y);
  assert.ok(elbowFromHead > RIG.head, 'the upper arm does not pass through the head');
});
