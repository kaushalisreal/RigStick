// The 3D Shot studio: RigStick's window onto src/scene3d. Pick a camera move, an action, the hero's colour,
// length, motion blur and quality, watch it live (the city is built once, then any frame draws on demand),
// and render an MP4 through the desktop app's encoder. A finished shot can be opened, shown in its folder,
// or one of its frames dropped into the project as the background or an image layer.
//
// The live view draws without blur while playing (real time) and with the chosen blur when paused, so
// what you stop on is exactly what the render will look like.
import { el, svg } from '../ai/ai-panel.mjs';

const CAMERAS = [['hero-orbit', 'Hero orbit', 'Arcs left to right around him'], ['push-in', 'Push in', 'Slowly closes in'],
  ['crane-up', 'Crane up', 'Rises over the roof'], ['truck', 'Truck', 'Slides past sideways']];
const ACTIONS = [['sword-raise', 'Sword raise'], ['idle', 'Stand and breathe']];
const BLUR = [[1, 'Off'], [3, 'Low'], [6, 'High'], [10, 'Max']];
const QUALITY = [[1280, '720p'], [1920, '1080p']];
const SWATCHES = ['#ff7a1a', '#ffd23f', '#3ec1ff', '#e5383b', '#7cff6b', '#f4f4f4'];
const PREVIEW = {width: 960, height: 540};

/** What to ask an AI app for a 3D shot: it drives the same studio through the rigstick_*_3d_* tools (docs/AI.md). */
export const AI_SHOT_PROMPT = 'Make a 6-second 3D shot in Rigstick: my hero raises his sword on a rooftop at night while the camera orbits him. Build it as editable layers, then render a preview frame so I can check it.';
/**
 * "Use your AI to make 3D shots": the card in the studio and in the Library's 3D Shot section. openAi() shows the AI
 * tab (where Claude, Gemini or any MCP app is connected); the example prompt can be copied for the app.
 */
export function aiShotNote({openAi = null, notify = () => {}} = {}) {
  const prompt = el('p', {className: 'shot-ai-prompt', textContent: `“${AI_SHOT_PROMPT}”`});
  const copy = el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'outline'}, onclick: async () => {
    try { await navigator.clipboard.writeText(AI_SHOT_PROMPT); notify('Copied. Paste it into your AI app.'); } catch { notify('Select the example and copy it.', true); } }}, svg('clipboard'), el('span', {textContent: 'Copy example'}));
  return el('div', {className: 'shot-place shot-ai'},
    el('span', {className: 'shot-label', textContent: 'Use your AI to make 3D shots'}),
    el('p', {className: 'ai-hint', textContent: 'Connect Claude, Gemini or any AI app in the AI tab and just describe the shot: it builds the 3D city, the hero, the camera move and the render for you, and can re-frame it later. For example:'}),
    prompt,
    el('div', {className: 'shot-inline'}, copy, ...(openAi ? [el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'soft'}, onclick: openAi}, svg('wand'), el('span', {textContent: 'Open AI tab'}))] : [])));
}

export class ShotStudio {
  /**
   * tools: the AI tool set (placing frames, building layers); desktop: the preload API (rendering needs it);
   * newProject: opens a blank project for "Build as editable layers" (resolves whether it did);
   * progressText: where build progress shows once the studio has closed (the Moves panel).
   */
  constructor({desktop, tools, notify = () => {}, newProject = null, progressText = () => {}, openAi = null}) {
    Object.assign(this, {desktop, tools, notify, newProject, progressText, openAi});
    this.take = {camera: 'hero-orbit', action: 'sword-raise', color: '#ff7a1a', seconds: 6, fps: 24, blur: 6, hero: true};
    this.width = 1280; this.seed = 7; this.index = 0; this.playing = false; this.shot = null; this.job = null; this.output = null;
  }

  get total() { return Math.round(this.take.seconds * this.take.fps); }
  get canRender() { return Boolean(this.desktop?.exportVideoBegin); }

  open() {
    if (!this.dialog) this.build();
    if (!this.dialog.open) this.dialog.showModal();
    this.load();
  }

  build() {
    const segmented = (label, options, key, set) => el('div', {className: 'ui-segmented shot-segmented', role: 'group', ariaLabel: label},
      options.map(([value, text]) => el('button', {type: 'button', className: 'ui-segmented-item', textContent: text, dataset: {[key]: String(value)},
        onclick: () => { set(value); this.sync(); }})));
    const field = (label, control) => el('div', {className: 'shot-field'}, el('span', {className: 'shot-label', textContent: label}), control);

    this.canvas = el('canvas', {className: 'shot-canvas', width: PREVIEW.width, height: PREVIEW.height});
    this.busy = el('div', {className: 'shot-busy', textContent: 'Building the city…'});
    this.playButton = el('button', {type: 'button', className: 'ui-icon-button', dataset: {variant: 'soft'}, ariaLabel: 'Play', onclick: () => this.toggle()}, svg('play'));
    this.scrub = el('input', {type: 'range', className: 'shot-scrub', min: 0, max: this.total - 1, step: 1, value: 0, ariaLabel: 'Frame',
      oninput: () => { this.pause(); this.seek(Number(this.scrub.value)); }});
    this.clock = el('output', {className: 'shot-clock'});

    this.cameras = el('div', {className: 'shot-cameras'}, CAMERAS.map(([value, label, detail]) => el('button', {type: 'button', className: 'shot-choice', dataset: {camera: value},
      onclick: () => { this.take.camera = value; this.sync(); this.redraw(); }}, el('b', {textContent: label}), el('span', {textContent: detail}))));
    this.actions = segmented('Action', ACTIONS, 'action', value => { this.take.action = value; this.redraw(); });
    // Empty city: the same shot without the hero, a moving backdrop for the user's own figures.
    this.heroes = segmented('Hero', [[true, 'Show hero'], [false, 'Empty city']], 'hero', value => { this.take.hero = value; this.redraw(); });
    this.colorInput = el('input', {type: 'color', className: 'shot-color', value: this.take.color, ariaLabel: 'Hero colour', oninput: () => { this.take.color = this.colorInput.value; this.sync(); this.redraw(); }});
    this.swatches = el('div', {className: 'shot-swatches'}, SWATCHES.map(color => el('button', {type: 'button', className: 'shot-swatch', title: color, ariaLabel: `Hero colour ${color}`,
      style: `--swatch: ${color}`, dataset: {color}, onclick: () => { this.take.color = color; this.colorInput.value = color; this.sync(); this.redraw(); }})), this.colorInput);
    this.lengthOut = el('output', {className: 'shot-value'});
    this.length = el('input', {type: 'range', min: 3, max: 12, step: 0.5, value: this.take.seconds, ariaLabel: 'Length',
      oninput: () => { this.take.seconds = Number(this.length.value); this.index = Math.min(this.index, this.total - 1); this.sync(); this.redraw(); }});
    this.blurs = segmented('Motion blur', BLUR, 'blur', value => { this.take.blur = value; this.redraw(); });
    this.qualities = segmented('Quality', QUALITY, 'width', value => { this.width = value; });
    this.seedOut = el('output', {className: 'shot-value'});
    this.newCity = el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'outline'}, onclick: () => { this.seed = 1 + Math.floor(Math.random() * 9999); this.load(true); }},
      svg('rotate'), el('span', {textContent: 'New city'}));

    this.renderButton = el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'primary'}, onclick: () => this.render()}, svg('export'), el('span', {textContent: 'Render MP4'}));
    this.cancelButton = el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'ghost'}, hidden: true, onclick: () => this.cancel()}, el('span', {textContent: 'Cancel'}));
    this.buildButton = el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'outline'}, onclick: () => this.buildLayers()}, svg('layers'), el('span', {textContent: 'Build as editable layers'}));
    this.progress = el('progress', {className: 'shot-progress', max: 1, value: 0, hidden: true});
    this.status = el('p', {className: 'ai-hint shot-status'});
    this.after = el('div', {className: 'shot-after', hidden: true},
      el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm'}, onclick: () => this.reveal('openVideo')}, svg('play'), el('span', {textContent: 'Open video'})),
      el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm'}, onclick: () => this.reveal('revealVideo')}, svg('folder'), el('span', {textContent: 'Show in folder'})));

    const close = el('button', {type: 'button', className: 'ui-icon-button', ariaLabel: 'Close', onclick: () => this.dialog.close()}, svg('close'));
    this.dialog = el('dialog', {className: 'shot-studio', ariaLabel: '3D Shot'},
      el('header', {className: 'shot-head'},
        el('div', {}, el('h2', {className: 'shot-title', textContent: '3D Shot'}), el('p', {className: 'ai-hint', textContent: 'A real 3D city with your 2D hero on the roof. Physics-driven motion, true motion blur.'})),
        close),
      el('div', {className: 'shot-body'},
        el('section', {className: 'shot-stage'},
          el('div', {className: 'shot-screen'}, this.canvas, this.busy),
          el('div', {className: 'shot-transport'}, this.playButton, this.scrub, this.clock)),
        el('aside', {className: 'shot-controls'},
          aiShotNote({openAi: this.openAi ? () => { this.dialog.close(); this.openAi(); } : null, notify: this.notify}),
          field('Camera', this.cameras),
          field('Hero', this.heroes),
          field('Action', this.actions),
          field('Hero colour', this.swatches),
          field('Length', el('div', {className: 'shot-inline'}, this.length, this.lengthOut)),
          field('Motion blur', this.blurs),
          field('Quality', this.qualities),
          field('City', el('div', {className: 'shot-inline'}, this.seedOut, this.newCity)),
          el('div', {className: 'shot-render'},
            el('div', {className: 'shot-inline'}, this.renderButton, this.cancelButton), this.progress, this.status, this.after,
            el('div', {className: 'shot-place'},
              el('span', {className: 'shot-label', textContent: 'Make it in RigStick'}),
              el('p', {className: 'ai-hint', textContent: 'A new project with this shot as layers: the 3D Camera rig (turn its dials to re-frame), the hero keyed from the physics, scarf, sword, glow and the 3D city in the Scene layer. Everything stays editable.'}),
              this.buildButton),
            el('div', {className: 'shot-place'},
              el('span', {className: 'shot-label', textContent: 'Put this frame in the project'}),
              el('div', {className: 'shot-inline'},
                el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'outline'}, onclick: () => this.place('background')}, svg('image'), el('span', {textContent: 'As background'})),
                el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'outline'}, onclick: () => this.place('sprite')}, svg('layers'), el('span', {textContent: 'As image layer'}))))))));
    this.dialog.addEventListener('close', () => this.pause());
    this.dialog.addEventListener('keydown', event => {
      if (event.target.matches?.('input')) return;
      if (event.key === ' ') { event.preventDefault(); this.toggle(); }
      else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); this.pause(); this.seek(this.index + (event.key === 'ArrowRight' ? 1 : -1)); }
    });
    if (!this.canRender) { this.renderButton.disabled = true; this.status.textContent = 'Rendering to MP4 needs the RigStick desktop app. The preview works here.'; }
    document.body.append(this.dialog);
    this.sync();
  }

  sync() {
    const mark = (group, key, value) => { for (const button of group.querySelectorAll(`[data-${key}]`)) button.setAttribute('aria-pressed', String(button.dataset[key] === String(value))); };
    mark(this.cameras, 'camera', this.take.camera); mark(this.heroes, 'hero', this.take.hero); mark(this.actions, 'action', this.take.action); mark(this.blurs, 'blur', this.take.blur);
    mark(this.qualities, 'width', this.width); mark(this.swatches, 'color', this.take.color);
    this.lengthOut.textContent = `${this.take.seconds.toFixed(1)} s`; this.seedOut.textContent = `#${this.seed}`;
    this.scrub.max = String(this.total - 1); this.scrub.value = String(this.index);
    this.clock.textContent = `${(this.index / this.take.fps).toFixed(2)} / ${this.take.seconds.toFixed(1)} s`;
    this.playButton.replaceChildren(svg(this.playing ? 'pause' : 'play')); this.playButton.ariaLabel = this.playing ? 'Pause' : 'Play';
    const rendering = Boolean(this.job);
    this.renderButton.disabled = rendering || !this.canRender; this.cancelButton.hidden = !rendering; this.progress.hidden = !rendering;
    this.buildButton.disabled = rendering || !this.newProject;
    for (const control of [this.length, this.newCity, ...this.qualities.children]) control.disabled = rendering;
    for (const control of [...this.actions.children, ...this.swatches.children]) control.disabled = !this.take.hero;
  }

  /** Builds (or rebuilds, for a new city) the live preview's world. three.js loads on first open. */
  async load(rebuild = false) {
    if (this.shot && !rebuild) return this.redraw();
    this.busy.hidden = false; this.pause();
    await new Promise(resolve => setTimeout(resolve, 30));   // let "Building the city…" paint (not rAF: it stalls in a hidden window)
    try {
      const {createShot} = await import('./shot.mjs');
      this.shot?.dispose(); this.shot = createShot({...PREVIEW, seed: this.seed});
      this.busy.hidden = true; this.sync(); this.redraw();
    } catch (error) { this.busy.textContent = `The 3D preview could not start: ${error.message}`; }
  }

  draw(blur) {
    if (!this.shot) return;
    const frame = this.shot.frame(this.index, {...this.take, blur}), context = this.canvas.getContext('2d');
    context.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
  }
  /** A still: drawn with the chosen blur, so it matches the render. */
  redraw() { if (!this.playing) this.draw(this.take.blur); this.sync(); }
  seek(index) { this.index = Math.max(0, Math.min(this.total - 1, index)); this.redraw(); }

  toggle() { this.playing ? this.pause() : this.play(); }
  play() {
    if (!this.shot || this.playing) return;
    if (this.index >= this.total - 1) this.index = 0;
    this.playing = true; this.sync();
    const start = performance.now() - this.index / this.take.fps * 1000;
    const tick = now => {
      if (!this.playing) return;
      const index = Math.floor((now - start) / 1000 * this.take.fps);
      if (index >= this.total) { this.index = this.total - 1; this.pause(); return; }
      if (index !== this.index) { this.index = index; this.draw(1); this.scrub.value = String(index); this.clock.textContent = `${(index / this.take.fps).toFixed(2)} / ${this.take.seconds.toFixed(1)} s`; }
      this.frameRequest = requestAnimationFrame(tick);
    };
    this.draw(1); this.frameRequest = requestAnimationFrame(tick);
  }
  pause() {
    if (!this.playing) return;
    this.playing = false; cancelAnimationFrame(this.frameRequest);
    if (this.dialog?.open) this.redraw(); else this.sync();
  }

  async render() {
    if (this.job || !this.canRender) return;
    this.pause(); this.output = null; this.after.hidden = true;
    const width = this.width, height = Math.round(width * 9 / 16 / 2) * 2, take = {...this.take}, total = this.total;
    const job = this.job = {stop: false}; this.sync();
    const started = performance.now();
    let token = null;
    try {
      const {renderShot} = await import('./shot.mjs');
      ({token} = await this.desktop.exportVideoBegin({fps: take.fps, name: take.hero ? `3d-${take.camera}-${take.action}` : `3d-${take.camera}-city`}));
      await renderShot({...take, width, height, seed: this.seed, shouldStop: () => job.stop}, async (canvas, index) => {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await this.desktop.exportVideoFrame(token, index, new Uint8Array(await blob.arrayBuffer()));
        const done = index + 1, left = (performance.now() - started) / done * (total - done) / 1000;
        this.progress.value = done / total;
        this.status.textContent = `Rendering frame ${done} of ${total}… about ${left < 60 ? `${Math.ceil(left)} s` : `${Math.ceil(left / 60)} min`} left`;
      });
      if (job.stop) { await this.desktop.exportVideoCancel(token); this.status.textContent = 'Render cancelled.'; return; }
      this.status.textContent = 'Encoding the MP4…';
      const {path} = await this.desktop.exportVideoFinish(token);
      this.output = path; this.after.hidden = false;
      this.status.textContent = `Saved ${path}`;
      this.notify('3D shot rendered');
    } catch (error) {
      if (token) await this.desktop.exportVideoCancel?.(token).catch(() => {});
      this.status.textContent = `Render failed: ${error.message}`; this.notify(error.message, true);
    } finally { this.job = null; this.progress.value = 0; this.sync(); }
  }

  cancel() {
    if (!this.job) return;
    this.job.stop = true;
    const running = this.tools.job?.(); if (running?.status === 'rendering') running.stop = true;
  }

  /**
   * Builds the shot as RigStick layers in a new project, then renders its 3D Set. The studio closes first,
   * so the app's own prompts (Save changes?) are on top; progress then shows in the Moves panel.
   */
  async buildLayers() {
    if (this.job || !this.newProject) return;
    this.pause(); this.after.hidden = true;
    const job = this.job = {stop: false}, take = {...this.take}, seed = this.seed;
    this.dialog.close();
    try {
      // newProject resolves false when the person keeps their current project (Cancel on Save changes?).
      if (!await this.newProject()) return;
      this.progressText('Building the layers…');
      await this.tools.call('rigstick_build_3d_layers', {camera: take.camera, action: take.action, color: take.color, seconds: take.seconds, seed,
        blur: Math.min(8, take.blur), onProgress: (done, total) => this.progressText(`Rendering the 3D city: frame ${done} of ${total}…`)});
      const running = this.tools.job?.();
      await running?.promise;
      if (running?.status === 'error') throw new Error(running.error);
      if (running?.status === 'cancelled') return this.progressText('The layers are built; the 3D city was not rendered. Press Update 3D set.');
      this.progressText('Built. Select 3D Camera and turn its dials to re-frame, then Update 3D set.');
      this.notify('3D shot built as layers');
    } catch (error) { this.progressText(`Build failed: ${error.message}`); this.notify(error.message, true); }
    finally { this.job = null; this.sync(); }
  }

  /** Re-renders the open project's 3D Set from its 3D Camera rig. progress(text) reports as it goes. */
  async updateSet(progress = () => {}) {
    const report = (done, total) => progress(`Rendering the 3D city: frame ${done} of ${total}…`);
    await this.tools.call('rigstick_update_3d_set', {onProgress: report});
    const running = this.tools.job?.();
    await running?.promise;
    if (running?.status === 'error') throw new Error(running.error);
    progress(running?.status === 'cancelled' ? 'Cancelled.' : '3D set updated.');
  }

  async reveal(method) {
    try { await this.desktop[method](this.output); } catch (error) { this.notify(error.message, true); }
  }

  /** Puts the current frame (full quality, with blur) into the project as the background or an image layer. */
  async place(as) {
    if (!this.shot) return;
    this.pause();
    try {
      const {renderShot} = await import('./shot.mjs'), width = this.width, height = Math.round(width * 9 / 16 / 2) * 2;
      let data = null;
      await renderShot({...this.take, width, height, seed: this.seed, frames: [this.index]}, async canvas => {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')), bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        data = btoa(binary);
      });
      const result = await this.tools.call('rigstick_add_image', {data, name: `3d-shot-${this.index + 1}.png`, as, ...(as === 'sprite' ? {fit: true, behind: true} : {})});
      const message = result?.find?.(item => item.type === 'text')?.text ?? '';
      let answer = message; try { answer = JSON.parse(message).message ?? message; } catch { /* already plain text */ }
      this.notify(as === 'background' ? 'Frame set as the background' : answer || 'Frame added as an image layer');
    } catch (error) { this.notify(error.message, true); }
  }
}
