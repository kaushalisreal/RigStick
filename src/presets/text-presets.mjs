// Text presets: looks (font weight, colour, gradient, outline plus glow/shadow effects) and animations
// (whole-text motions from motions.mjs, or per-letter ones that split the text into a figure per
// letter and stagger a motion across them: typewriter, wave, rain...).

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
/** Text options for text-authoring.mjs createTextFigure, from friendly values. */
export function textOptions(look, {text, size} = {}) {
  const o = look.text;
  return {text, name: text.slice(0, 60), fontSize: size ?? o.size, bold: Boolean(o.bold), italic: Boolean(o.italic), color: hex(o.color),
    ...(o.gradient ? {gradientColor: hex(o.gradient)} : {}), ...(o.outline ? {outlineWidth: o.outline, outlineColor: hex(o.outlineColor ?? '#000000')} : {})};
}

export const TEXT_LOOK_GROUPS = ['Titles', 'Comic & fun', 'Glow & neon', 'Metal & elements', 'Clean'];

/** {group, label, text: {size, bold, italic, color, gradient, outline, outlineColor}, effects: [[type, params]]}. */
export const TEXT_LOOKS = {
  'title': {group: 'Titles', label: 'Bold title', text: {size: 72, bold: true, color: '#1b1b1f'}},
  'title-white': {group: 'Titles', label: 'White title', text: {size: 72, bold: true, color: '#ffffff', outline: 3, outlineColor: '#1b1b1f'}, effects: [['shadow', {opacity: 0.5, radius: 8, offsetX: 4, offsetY: 6}]]},
  'cinematic': {group: 'Titles', label: 'Cinematic', text: {size: 64, color: '#f2efe6'}, effects: [['glow', {color: 0xffe2b0, radius: 10, intensity: 0.5}]]},
  'headline': {group: 'Titles', label: 'Headline', text: {size: 84, bold: true, color: '#e5383b', outline: 4, outlineColor: '#ffffff'}, effects: [['shadow', {opacity: 0.4, radius: 6, offsetX: 6, offsetY: 6}]]},
  'subtitle': {group: 'Titles', label: 'Subtitle', text: {size: 40, color: '#3a3a42'}},

  'comic': {group: 'Comic & fun', label: 'Comic', text: {size: 80, bold: true, italic: true, color: '#ffd23f', outline: 6, outlineColor: '#1b1b1f'}, effects: [['shadow', {opacity: 0.9, radius: 0, offsetX: 6, offsetY: 6, color: 0xe5383b}]]},
  'boom': {group: 'Comic & fun', label: 'BOOM!', text: {size: 96, bold: true, color: '#ff7a1a', gradient: '#ffd23f', outline: 7, outlineColor: '#1b1b1f'}, effects: [['shadow', {opacity: 1, radius: 0, offsetX: 7, offsetY: 7}]]},
  'bubble': {group: 'Comic & fun', label: 'Bubble', text: {size: 72, bold: true, color: '#ffffff', outline: 8, outlineColor: '#2f6fe0'}, effects: [['shadow', {opacity: 0.35, radius: 4, offsetX: 0, offsetY: 6}]]},
  'candy': {group: 'Comic & fun', label: 'Candy', text: {size: 72, bold: true, color: '#ff5d8f', gradient: '#ffd1e3', outline: 5, outlineColor: '#ffffff'}, effects: [['shadow', {opacity: 0.4, radius: 6, offsetY: 6, offsetX: 0, color: 0xb0305a}]]},
  'retro': {group: 'Comic & fun', label: 'Retro', text: {size: 72, bold: true, italic: true, color: '#ffb347', gradient: '#ff5d8f'}, effects: [['shadow', {opacity: 1, radius: 0, offsetX: 5, offsetY: 5, color: 0x2b1d4a}]]},

  'neon-pink': {group: 'Glow & neon', label: 'Neon pink', text: {size: 72, color: '#ffd1f0'}, effects: [['glow', {color: 0xff3fb4, radius: 18, intensity: 1.6, coreColor: 0xffffff, coreMix: 0.3}]]},
  'neon-blue': {group: 'Glow & neon', label: 'Neon blue', text: {size: 72, color: '#d6f4ff'}, effects: [['glow', {color: 0x2dcfff, radius: 18, intensity: 1.6, coreColor: 0xffffff, coreMix: 0.3}]]},
  'glow-orange': {group: 'Glow & neon', label: 'Orange glow', text: {size: 72, bold: true, color: '#ff7a1a'}, effects: [['glow', {color: 0xff7a1a, radius: 16, intensity: 1.2}]]},
  'tech': {group: 'Glow & neon', label: 'Tech', text: {size: 64, color: '#7ff0ff'}, effects: [['glow', {color: 0x31dfff, radius: 10, intensity: 1}], ['rgbSplit', {amount: 2}]]},
  'hologram': {group: 'Glow & neon', label: 'Hologram', text: {size: 64, color: '#9ff4ff'}, effects: [['glow', {color: 0x2dcfff, radius: 8, intensity: 0.8}], ['noise', {amount: 0.1, colored: 1}]]},

  'gold': {group: 'Metal & elements', label: 'Gold', text: {size: 80, bold: true, color: '#fff2a8', gradient: '#c98f00', outline: 3, outlineColor: '#6b4a00'}, effects: [['glow', {color: 0xffd23f, radius: 12, intensity: 0.6}], ['lightSweep', {intensity: 0.6}]]},
  'silver': {group: 'Metal & elements', label: 'Silver', text: {size: 80, bold: true, color: '#ffffff', gradient: '#8d939b', outline: 3, outlineColor: '#3a3f46'}, effects: [['lightSweep', {intensity: 0.7}]]},
  'fire': {group: 'Metal & elements', label: 'Fire', text: {size: 80, bold: true, color: '#ffe066', gradient: '#e5383b'}, effects: [['glow', {color: 0xff6a1a, radius: 18, intensity: 1.3}]]},
  'ice': {group: 'Metal & elements', label: 'Ice', text: {size: 80, bold: true, color: '#ffffff', gradient: '#7cc7ff', outline: 2, outlineColor: '#2f6fe0'}, effects: [['glow', {color: 0x9fe6ff, radius: 12, intensity: 0.9}]]},
  'toxic': {group: 'Metal & elements', label: 'Toxic', text: {size: 80, bold: true, color: '#d8ff6a', gradient: '#3fa34d'}, effects: [['glow', {color: 0x8bff22, radius: 14, intensity: 1}]]},
  'horror': {group: 'Metal & elements', label: 'Horror', text: {size: 80, bold: true, color: '#b3001b', gradient: '#3a0008'}, effects: [['shadow', {opacity: 0.8, radius: 10, offsetX: 0, offsetY: 8}], ['turbulence', {amount: 3, size: 20}]]},

  'clean-dark': {group: 'Clean', label: 'Clean dark', text: {size: 48, color: '#1b1b1f'}},
  'clean-light': {group: 'Clean', label: 'Clean light', text: {size: 48, color: '#ffffff'}, effects: [['shadow', {opacity: 0.35, radius: 6, offsetX: 0, offsetY: 3}]]},
  'caption': {group: 'Clean', label: 'Caption', text: {size: 40, bold: true, color: '#ffffff', outline: 4, outlineColor: '#000000'}},
  'label': {group: 'Clean', label: 'Label', text: {size: 28, color: '#5a5a63'}},
};

export const TEXT_ANIMATION_GROUPS = ['Letter by letter', 'Whole text'];
/**
 * Text animations. Letter ones split the text into letters (one figure each, on the text's layer) and run
 * `motion` on each, `stagger` seconds apart; whole-text ones run `motion` (or add `effect`) on the text.
 */
export const TEXT_ANIMATIONS = {
  'typewriter': {group: 'Letter by letter', label: 'Typewriter', letters: true, motion: 'type-on', stagger: 0.06},
  'letter-rise': {group: 'Letter by letter', label: 'Letters rise', letters: true, motion: 'slide-in-bottom-short', stagger: 0.045},
  'letter-drop': {group: 'Letter by letter', label: 'Letters drop', letters: true, motion: 'drop-in-short', stagger: 0.05},
  'letter-wave': {group: 'Letter by letter', label: 'Wave', letters: true, motion: 'jump-up-short', stagger: 0.06},
  'letter-fade': {group: 'Letter by letter', label: 'Fade across', letters: true, motion: 'fade-in', stagger: 0.05},
  'letter-spin': {group: 'Letter by letter', label: 'Spin in', letters: true, motion: 'spin-in', stagger: 0.05},
  'pop-in': {group: 'Whole text', label: 'Pop in', motion: 'pop-in'},
  'zoom-in': {group: 'Whole text', label: 'Zoom in', motion: 'zoom-in'},
  'slide-up': {group: 'Whole text', label: 'Slide up', motion: 'slide-in-bottom'},
  'slide-left': {group: 'Whole text', label: 'Slide in from right', motion: 'slide-in-right'},
  'drop-bounce': {group: 'Whole text', label: 'Drop and bounce', motion: 'drop-in'},
  'swing-in': {group: 'Whole text', label: 'Swing in', motion: 'swing-in'},
  'shake': {group: 'Whole text', label: 'Shake', motion: 'shake'},
  'pulse': {group: 'Whole text', label: 'Pulse', motion: 'heartbeat'},
  'tada': {group: 'Whole text', label: 'Ta-da!', motion: 'tada'},
  'neon-flicker': {group: 'Whole text', label: 'Neon flicker', motion: 'flicker'},
  'glitch': {group: 'Whole text', label: 'Glitch', effect: 'Glitch', motion: 'shake'},
  'fade-out': {group: 'Whole text', label: 'Fade out', motion: 'fade-out'},
};
