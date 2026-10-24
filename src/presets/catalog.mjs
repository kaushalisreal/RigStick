// The preset menu in one place, compact enough for an AI client to read in a few hundred tokens per kind
// (rigstick_presets {kind}) and complete enough for the Presets panel to build its tabs from.
import { OBJECTS, OBJECT_CATEGORIES } from './objects.mjs';
import { MOTIONS, MOTION_GROUPS, CAMERA_PRESETS, CAMERA_CLIPS } from './motions.mjs';
import { STICKERS, STICKER_GROUPS } from './stickers.mjs';
import { TEXT_LOOKS, TEXT_LOOK_GROUPS, TEXT_ANIMATIONS, TEXT_ANIMATION_GROUPS } from './text-presets.mjs';
import { MOVE_GROUPS, MOVE_LABELS } from '../ai/moves.mjs';
import { VFX_PRESETS } from '../vfx-presets.mjs';
import { VFX_LIBRARY, EFFECT_CATEGORIES } from './vfx-library.mjs';

const byGroup = (groups, entries, groupOf) => Object.fromEntries(groups.map(group => [group, entries.filter(([, value]) => groupOf(value) === group).map(([name]) => name)]));

/** {kind: {group: [names]}} for every preset kind. */
export function presetCatalog() {
  return {
    objects: Object.fromEntries(Object.entries(OBJECT_CATEGORIES).map(([id, label]) => [label, Object.entries(OBJECTS).filter(([, o]) => o.category === id).map(([name]) => name)])),
    moves: MOVE_GROUPS,
    motions: Object.fromEntries(Object.entries(MOTION_GROUPS)),
    camera: {Moves: Object.keys(CAMERA_PRESETS), 'Camera effects': Object.keys(CAMERA_CLIPS)},
    effects: byGroup(EFFECT_CATEGORIES, Object.entries({...VFX_PRESETS, ...VFX_LIBRARY}), preset => preset.category),
    stickers: byGroup(STICKER_GROUPS, Object.entries(STICKERS), sticker => sticker.group),
    textLooks: byGroup(TEXT_LOOK_GROUPS, Object.entries(TEXT_LOOKS), look => look.group),
    textAnimations: byGroup(TEXT_ANIMATION_GROUPS, Object.entries(TEXT_ANIMATIONS), animation => animation.group),
  };
}

/** Display labels by kind and name, for the Presets panel. */
export function presetLabel(kind, name) {
  return {objects: () => name, moves: () => MOVE_LABELS[name], motions: () => MOTIONS[name]?.label, camera: () => CAMERA_PRESETS[name]?.label ?? CAMERA_CLIPS[name],
    effects: () => name, stickers: () => STICKERS[name]?.label, textLooks: () => TEXT_LOOKS[name]?.label, textAnimations: () => TEXT_ANIMATIONS[name]?.label}[kind]?.() ?? name;
}
