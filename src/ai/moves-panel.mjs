// Moves: one-click animation for beginners. Select a figure, press a move, and RigStick keys it from the
// playhead (the same code AI clients call through rigstick_apply_move). Camera presets and a "smooth
// everything" button sit underneath. Works in the browser and the desktop app.
import { MOVES, MOVE_LABELS as LABELS, TRAVELLING_MOVES as TRAVELS } from './moves.mjs';
import { el, svg } from './ai-panel.mjs';
import { isCameraRig } from '../scene3d/set3d.mjs';
import { aiShotNote } from '../scene3d/shot-studio.mjs';

const CAMERA = [['follow', 'Follow figure'], ['shake', 'Shake'], ['impact', 'Impact punch'], ['zoom-pulse', 'Zoom pulse'], ['handheld', 'Handheld']];

export class MovesPanel {
  /** mount: false builds the cards without filling `root` (the Presets panel shows shotCard and polishCard). */
  constructor({root, editor, tools, notify = () => {}, openShot = null, openAi = null, updateSet = null, mount = true}) {
    Object.assign(this, {root, editor, tools, notify});
    this.seconds = 2; this.direction = 'right'; this.intensity = 1;
    root.classList.add('ai-panel', 'moves-panel');
    this.target = el('p', {className: 'ai-text moves-target'});
    this.addButton = el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm'}, onclick: () => this.run(() => this.tools.call('rigstick_add_figure', {}))}, svg('plus'), el('span', {textContent: 'Add a stickman'}));
    this.grid = el('div', {className: 'moves-grid'}, MOVES.map(move => el('button', {type: 'button', className: 'ui-button moves-move', dataset: {move},
      title: `${LABELS[move]} from the playhead`, onclick: () => this.apply(move)}, svg('person'), el('span', {textContent: LABELS[move]}))));
    const range = (label, min, max, step, value, set, format) => {
      const output = el('output', {textContent: format(value)});
      const input = el('input', {type: 'range', min, max, step, value, oninput: () => { set(Number(input.value)); output.textContent = format(Number(input.value)); }});
      return el('label', {className: 'moves-option'}, el('span', {textContent: label}), input, output);
    };
    this.facing = el('div', {className: 'ui-segmented', role: 'group', ariaLabel: 'Direction'},
      ['left', 'right'].map(direction => el('button', {type: 'button', className: 'ui-segmented-item', textContent: direction === 'left' ? '← Left' : 'Right →', dataset: {direction},
        onclick: () => { this.direction = direction; this.sync(); }})));
    // The 3D Shot studio opens from here: a cinematic shot in a 3D city, rendered to video.
    const shot = openShot && el('section', {className: 'ai-card'},
      el('h3', {className: 'ai-title', textContent: '3D Shot'}),
      el('div', {className: 'shot-card-art', ariaHidden: 'true'}),
      el('p', {className: 'ai-text', textContent: 'Your hero on a rooftop in a real 3D city. Pick a camera move and an action, preview it live, render an MP4.'}),
      el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'primary'}, onclick: openShot}, svg('camera'), el('span', {textContent: 'Open 3D Shot studio'})),
      aiShotNote({openAi, notify}),
      ...(updateSet ? [this.cameraControls(), this.setButton = el('button', {type: 'button', className: 'ui-button', title: 'Render the 3D city again from the 3D Camera rig after you change its keys or the length',
        onclick: () => this.updateSet(updateSet)}, svg('rotate'), el('span', {textContent: 'Update 3D set'})), this.setStatus = el('p', {className: 'ai-hint'})] : []));
    this.shotCard = shot || null;
    this.polishCard = el('section', {className: 'ai-card'},
      el('h3', {className: 'ai-title', textContent: 'Polish'}), this.addButton,
      el('div', {className: 'moves-polish'},
        el('button', {type: 'button', className: 'ui-button', title: 'Curve the selected figure’s limbs on every keyframe; joints stay put',
          onclick: () => this.smoothLimbs()}, svg('bend'), el('span', {textContent: 'Smooth limbs'})),
        el('button', {type: 'button', className: 'ui-button', onclick: () => this.smooth()}, svg('tween'), el('span', {textContent: 'Smooth all motion'}))));
    if (mount) root.replaceChildren(
      ...(shot ? [shot] : []),
      el('section', {className: 'ai-card'},
        el('h3', {className: 'ai-title', textContent: 'Moves'}), this.target, this.addButton,
        el('div', {className: 'moves-options'},
          range('Length', 0.4, 6, 0.1, this.seconds, value => { this.seconds = value; }, value => `${value.toFixed(1)} s`),
          range('Size', 0.4, 1.8, 0.1, this.intensity, value => { this.intensity = value; }, value => `${Math.round(value * 100)}%`),
          el('div', {className: 'moves-option'}, el('span', {textContent: 'Direction'}), this.facing)),
        this.grid,
        el('p', {className: 'ai-hint', textContent: 'Moves start at the playhead and add keyed, tweened poses. Stack them: walk, then wave, then sit. Undo removes one move at a time.'})),
      el('section', {className: 'ai-card'},
        el('h3', {className: 'ai-title', textContent: 'Camera'}),
        el('div', {className: 'moves-grid'}, CAMERA.map(([move, label]) => el('button', {type: 'button', className: 'ui-button moves-move', onclick: () => this.camera(move)}, svg('camera'), el('span', {textContent: label})))),
        el('h3', {className: 'ai-title', textContent: 'Polish'}),
        el('div', {className: 'moves-polish'},
          el('button', {type: 'button', className: 'ui-button', title: 'Curve the selected figure’s limbs on every keyframe; joints stay put',
            onclick: () => this.smoothLimbs()}, svg('bend'), el('span', {textContent: 'Smooth limbs'})),
          el('button', {type: 'button', className: 'ui-button', onclick: () => this.smooth()}, svg('tween'), el('span', {textContent: 'Smooth all motion'})))));
    editor.addEventListener?.('change', () => this.sync());
    this.sync();
  }

  /**
   * The 3D Camera at the playhead as sliders (shown when the project has one). Releasing a slider keys the
   * rig's dial there, like turning the dial on the canvas; the city follows on Update 3D set.
   */
  cameraControls() {
    const dial = (key, label, min, max, step, format) => {
      const output = el('output'), input = el('input', {type: 'range', min, max, step, ariaLabel: `3D camera ${label}`,
        oninput: () => { output.textContent = format(Number(input.value)); },
        onchange: () => this.run(async () => { await this.tools.call('rigstick_set_3d_camera', {[key]: Number(input.value)});
          this.setStatusText('Camera keyed. Press Update 3D set to re-render the city.');
          return [{type: 'text', text: `3D Camera ${label.toLowerCase()} keyed at frame ${Math.floor(this.editor.tick) + 1}`}]; })});
      this.dials[key] = {input, output, format};
      return el('label', {className: 'moves-option'}, el('span', {textContent: label}), input, output);
    };
    this.dials = {};
    return this.cameraBox = el('div', {className: 'moves-options', hidden: true},
      el('h3', {className: 'ai-title', textContent: '3D Camera at the playhead'}),
      dial('orbit', 'Orbit', -180, 180, 1, value => `${Math.round(value)}°`),
      dial('tilt', 'Tilt', -34, 83, 1, value => `${Math.round(value)}°`),
      dial('lens', 'Lens', 12, 100, 1, value => `${Math.round(value)}°`),
      dial('zoom', 'Zoom', 0.25, 4, 0.05, value => `${value.toFixed(2)}×`),
      el('p', {className: 'ai-hint', textContent: 'Each change keys the 3D Camera layer at the playhead; RigStick eases between keys. Zoom scales the city: scale the hero to match, or use Lens.'}));
  }
  async syncCamera() {
    if (!this.cameraBox) return;
    const has = this.editor.report.figure_types.some(isCameraRig);
    this.cameraBox.hidden = !has;
    if (!has || Object.values(this.dials).some(({input}) => input === document.activeElement)) return;
    try {
      const values = JSON.parse((await this.tools.call('rigstick_get_3d_camera', {}))[0].text);
      for (const [key, {input, output, format}] of Object.entries(this.dials)) if (Number.isFinite(values[key])) { input.value = values[key]; output.textContent = format(values[key]); }
    } catch { /* the panel keeps its last values */ }
  }

  /** The 3D card's status line: 3D Set renders and "Build as editable layers" report here. */
  setStatusText(text) { if (this.setStatus) this.setStatus.textContent = text; }
  async updateSet(run) {
    this.setButton.disabled = true;
    try { await run(text => this.setStatusText(text)); this.notify('3D set updated'); }
    catch (error) { this.setStatus.textContent = error.message; this.notify(error.message, true); }
    finally { this.sync(); }
  }

  get figure() {
    const uid = this.editor.selectedUid;
    return Number.isInteger(uid) && this.editor.evaluatedFrame?.objects?.some(object => object.unique_id === uid) ? uid : null;
  }
  sync() {
    const uid = this.figure, type = uid === null ? null : this.editor.report.figure_types.find(item => item.figure_type_id === this.editor.evaluatedFrame.objects.find(o => o.unique_id === uid)?.figure_type_id);
    this.target.textContent = uid === null ? 'Select a figure on the canvas, or add one.' : `Animating: ${type?.name ?? 'Figure'} (frame ${Math.floor(this.editor.tick) + 1} onward)`;
    for (const button of this.grid.querySelectorAll('[data-move]')) button.disabled = uid === null;
    // Update 3D set needs a project made with "Build as editable layers" (it has a 3D Camera).
    if (this.setButton) this.setButton.disabled = !this.editor.report.figure_types.some(isCameraRig);
    this.syncCamera();
    for (const button of this.facing.children) button.setAttribute('aria-pressed', String(button.dataset.direction === this.direction));
  }
  async run(action) {
    try { const result = await action(); this.notify(result?.find?.(item => item.type === 'text')?.text ?? 'Done'); }
    catch (error) { this.notify(error.message, true); }
    this.sync();
  }
  apply(move) {
    const figure = this.figure; if (figure === null) return;
    const start = Math.floor(this.editor.tick) + 1;
    return this.run(() => this.tools.call('rigstick_apply_move', {figure, move, start, seconds: this.seconds, intensity: this.intensity,
      ...(TRAVELS.has(move) ? {direction: this.direction} : {})}));
  }
  camera(move) {
    const figure = this.figure, start = Math.floor(this.editor.tick) + 1;
    if (move === 'follow' && figure === null) return this.notify('Select the figure the camera should follow.', true);
    return this.run(() => this.tools.call('rigstick_camera', {move, start, seconds: move === 'follow' ? Math.max(1, (this.editor.totalTicks - start + 1) / (this.editor.report.fps || 24)) : Math.min(this.seconds, 2),
      strength: this.intensity, ...(move === 'follow' ? {figures: [figure]} : {})}));
  }
  smoothLimbs() {
    const figure = this.figure;
    if (figure === null) return this.notify('Select the figure whose limbs should curve.', true);
    return this.run(() => this.tools.call('rigstick_smooth_limbs', {figure}));
  }
  smooth() {
    return this.run(() => {
      const ids = this.editor.report._rigs?.layers?.order ?? [];
      this.editor.movieclipBatch('Smooth all motion', () => this.editor.sheetSetEasing(ids, 0, this.editor.totalTicks - 1, {interpolation: 'auto'}));
      return [{type: 'text', text: 'Every layer now eases smoothly between its keys.'}];
    });
  }
}
