// The preset library in the Library panel: everything in src/presets as cards to drag onto the canvas or click,
// under your own saved items. The Library's Show menu and search drive it (user-library.mjs → setView): "All" shows
// a few of each kind, a kind shows all of it with its options, "My presets" the presets you imported or saved.
// Things (objects, stickers, styled text, saved figures) land where they are dropped, on their own layer;
// animations (character moves, motions, text animations) and effects apply to the figure they are dropped on, or
// to the selected figure when clicked; scene effects and camera moves apply at the playhead. Every action goes
// through the AI tool set (src/ai/ai-tools.mjs), so the panel and AI clients share one engine and one undo story.
// Every preset can be saved as its own file (.rigset for animations and effects, .rigobject for things;
// preset-files.mjs) from its card's menu, and such files import back into My presets.
import { el, svg } from '../ai/ai-panel.mjs';
import { vfxIcon } from '../vfx-icons.mjs';
import { openMenu } from '../ui/ui-menu.mjs';
import { icon } from '../icons.mjs';
import { OBJECTS, OBJECT_CATEGORIES } from './objects.mjs';
import { MOTIONS, MOTION_GROUPS, CAMERA_PRESETS, CAMERA_CLIPS } from './motions.mjs';
import { STICKERS, STICKER_GROUPS, stickerFrameUrls } from './stickers.mjs';
import { presetPackFiles, importedPacks, removeImportedPack, loadImportedPresets } from './imported-presets.mjs';
import { builtinRecord, writePresetFile, recordMotion, presetFileName, extensionFor, FIGURE_PRESETS, PRESET_FILE } from './preset-files.mjs';
import { loadLibraryPacks, loadUserPresets, userPresetFiles, addUserPresetFiles, saveUserPreset, userPresetBlob, removeUserPresetFile, canRevealUserPresets, revealUserPresets } from './user-presets.mjs';
import { TEXT_LOOKS, TEXT_LOOK_GROUPS, TEXT_ANIMATIONS, TEXT_ANIMATION_GROUPS } from './text-presets.mjs';
import { MOVE_GROUPS, MOVE_LABELS, TRAVELLING_MOVES, buildMove } from '../ai/moves.mjs';
import { VFX_PRESETS as LOOKS } from '../vfx-presets.mjs';
import { VFX_LIBRARY, EFFECT_CATEGORIES } from './vfx-library.mjs';

// Every effect preset: RigStick's looks and the effects library (the library's entries can come from files).
const effectPreset = name => VFX_LIBRARY[name] ?? LOOKS[name];
const effectEntries = () => Object.entries({...LOOKS, ...VFX_LIBRARY});

/** The kinds, in the Show menu's order: id, title. */
const KINDS = [['objects', 'Objects'], ['moves', 'Characters'], ['motions', 'Motion'], ['camera', 'Camera'], ['effects', 'Effects'], ['stickers', 'Stickers'],
  ['text', 'Text'], ['shot', '3D Shot'], ['mine', 'My presets']];
/** How many cards a kind shows in the "All" view before its "Show all" link. */
const PREVIEW_CARDS = 8;
const THUMB = 64;
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'preset';

export class PresetsPanel {
  /**
   * root: the element to fill; tools: the AI tool set; shotCard / polishCard: the 3D Shot and Smooth cards (MovesPanel);
   * installDrag(source, {getAsset, insert}): pointer drags from cards onto the canvas (app.mjs);
   * showKind(kind): switch the Library's Show menu to a kind ("Show all");
   * insertFigure(preset, point): add a figure saved as a preset (the Library's insert);
   * snapshotSelection(): the selection as a figure file and preview (the Library's); saveFile(blob, name): save a file to disk.
   */
  constructor({root, editor, tools, notify = () => {}, shotCard = null, polishCard = null, installDrag = null, showKind = () => {},
    insertFigure = null, snapshotSelection = null, saveFile = null}) {
    Object.assign(this, {root, editor, tools, notify, shotCard, polishCard, showKind, insertFigure, snapshotSelection, saveFile});
    this.kind = 'all'; this.query = '';
    this.seconds = null; this.intensity = 1; this.direction = 'right'; this.words = 'Your text'; this.thumbs = new Map();
    root.classList.add('ai-panel', 'presets-panel');
    this.target = el('p', {className: 'ai-hint presets-target'});
    this.body = el('div', {className: 'presets-body'});
    root.replaceChildren(this.target, this.body);
    installDrag?.(this.body, {getAsset: card => this.assetFor(card), insert: (asset, point) => this.drop(asset, point)});
    this.body.addEventListener('click', event => {
      const more = event.target.closest('[data-preset-more]');
      if (more) { event.stopPropagation(); return this.cardMenu(more.closest('.preset-card'), {anchor: more}); }
      const all = event.target.closest('[data-show-kind]');
      if (all) return this.showKind(all.dataset.showKind);
      const card = event.target.closest('.preset-card'); if (card) this.activate(card);
    });
    this.body.addEventListener('contextmenu', event => {
      const card = event.target.closest('.preset-card'); if (!card) return;
      event.preventDefault(); event.stopPropagation(); this.cardMenu(card, {point: {x: event.clientX, y: event.clientY}});
    });
    this.body.addEventListener('keydown', event => {
      const card = event.target.closest?.('.preset-card'); if (!card || event.target.closest('[data-preset-more]')) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.activate(card); }
      if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = card.getBoundingClientRect(); this.cardMenu(card, {point: {x: rect.left, y: rect.bottom}}); }
    });
    editor.addEventListener?.('change', () => {
      if (editor.activeLayerId !== this.seenLayer) { this.seenLayer = editor.activeLayerId; if (!this.inserting) this.pickedLayer = editor.activeLayerId; }
      this.syncTarget();
    });
    this.seenLayer = editor.activeLayerId; this.pickedLayer = null;
    // Importing: preset files (.rigset, .rigobject), packs (.zip) and images, or a folder of them.
    this.fileInput = el('input', {type: 'file', multiple: true, hidden: true, accept: '.rigset,.rigobject,.zip,application/zip,image/png,image/webp,image/jpeg,image/gif',
      onchange: () => this.importFiles(this.fileInput)});
    this.folderInput = el('input', {type: 'file', multiple: true, hidden: true, webkitdirectory: true, onchange: () => this.importFiles(this.folderInput)});
    root.append(this.fileInput, this.folderInput);
    this.renderBody(); this.syncTarget();
    // The library's packs and your presets come from files: show them once they are read.
    void Promise.all([loadImportedPresets(), loadLibraryPacks(), loadUserPresets()]).then(() => this.renderBody());
  }

  /** The Library's Show menu and search: kind 'all', one of KINDS, or null (your items only: nothing here). */
  setView({kind = this.kind, query = this.query} = {}) {
    this.kind = kind; this.query = query ?? '';
    this.root.hidden = kind === null;
    if (kind !== null) { this.renderBody(); this.syncTarget(); }
  }
  /** Back-compatibility: show(kind) as the old tab strip did. */
  show(kind) { this.showKind(kind); }

  get figure() {
    const uid = this.editor.selectedUid;
    return Number.isInteger(uid) && this.editor.evaluatedFrame?.objects?.some(object => object.unique_id === uid) ? uid : null;
  }
  syncTarget() {
    const frame = Math.floor(this.editor.tick) + 1, uid = this.figure;
    const what = {all: 'Presets: drag onto the canvas or a figure, or click. Right-click one to save it as a file.', objects: 'Drag onto the canvas, or click to add in the middle.',
      stickers: 'Drag onto the canvas where it should hit.', mine: 'Your presets: imported .rigset / .rigobject files and the ones you saved. They stay in every project.',
      text: 'Type your words, then drag a look onto the canvas. Animations go on a text figure.', camera: `Camera moves start at frame ${frame}.`, shot: ''}[this.kind];
    this.target.textContent = what ?? (uid === null ? `Drop on a figure, or select one and click (from frame ${frame}).` : `Click to apply to the selected figure from frame ${frame}, or drop on any figure.`);
  }

  /** Sections of [title, cards] for one kind (unfiltered by the "All" limit). */
  sections(kind) {
    const q = this.query, match = label => !q || String(label).toLowerCase().includes(q);
    const list = [];
    const add = (title, cards) => { if (cards.length) list.push([title, cards]); };
    if (kind === 'objects') for (const [id, label] of Object.entries(OBJECT_CATEGORIES))
      add(label, Object.entries(OBJECTS).filter(([name, o]) => o.category === id && match(name)).map(([name]) => this.card('object', name, name)));
    if (kind === 'moves') for (const [group, names] of Object.entries(MOVE_GROUPS)) add(group, names.filter(name => match(MOVE_LABELS[name])).map(name => this.card('move', name, MOVE_LABELS[name])));
    if (kind === 'motions') for (const [group, names] of Object.entries(MOTION_GROUPS)) add(group, names.filter(name => MOTIONS[name] && match(MOTIONS[name].label)).map(name => this.card('motion', name, MOTIONS[name].label)));
    if (kind === 'camera') {
      add('Camera moves (keys on the Camera layer)', Object.entries(CAMERA_PRESETS).filter(([, p]) => match(p.label)).map(([name, p]) => this.card('camera', name, p.label)));
      add('Camera effects', Object.entries(CAMERA_CLIPS).filter(([, label]) => match(label)).map(([name, label]) => this.card('camera', name, label)));
    }
    if (kind === 'effects') for (const category of EFFECT_CATEGORIES)
      add(category, effectEntries().filter(([name, p]) => p.category === category && !name.startsWith('Test ') && match(name)).map(([name]) => this.card('effect', name, name)));
    if (kind === 'stickers') for (const group of STICKER_GROUPS)
      add(group, Object.entries(STICKERS).filter(([, s]) => s.group === group && !s.imported && match(s.label)).map(([name, s]) => this.card('sticker', name, s.label)));
    if (kind === 'text') {
      for (const group of TEXT_LOOK_GROUPS) add(`Looks: ${group}`, Object.entries(TEXT_LOOKS).filter(([, l]) => l.group === group && match(l.label)).map(([name, l]) => this.card('textLook', name, l.label)));
      for (const group of TEXT_ANIMATION_GROUPS) add(`Animations: ${group.toLowerCase()}`, Object.entries(TEXT_ANIMATIONS).filter(([, a]) => a.group === group && match(a.label)).map(([name, a]) => this.card('textAnimation', name, a.label)));
    }
    if (kind === 'mine') {
      for (const file of userPresetFiles) add(file.name, file.presets.filter(p => match(p.name)).map(p => this.card(p.kind === 'textLook' || p.kind === 'textAnimation' ? p.kind : p.kind, p.key, p.name, {file: file.id})));
      for (const {pack, keys} of importedPacks()) add(pack, keys.filter(key => match(STICKERS[key].label)).map(key => this.card('sticker', key, STICKERS[key].label, {pack})));
    }
    return list;
  }

  /** Cards for the current view, grouped, filtered by the search. */
  renderBody() {
    if (this.kind === null) return;
    const section = (title, cards, extra = null) => el('section', {className: 'presets-group'}, el('h3', {className: 'ai-title presets-group-title'}, el('span', {textContent: title}), ...(extra ? [extra] : [])), el('div', {className: 'presets-grid'}, cards));
    const groups = [];
    if (this.kind === 'all') {
      // A taste of every kind: its first cards, then "Show all" switches the Show menu to it.
      for (const [kind, title] of KINDS) {
        if (kind === 'shot') { if (!this.query && this.shotCard) groups.push(section(title, [], el('button', {type: 'button', className: 'presets-show-all', dataset: {showKind: kind}, textContent: 'Open'}))); continue; }
        const cards = this.sections(kind).flatMap(([, list]) => list);
        if (!cards.length) continue;
        groups.push(section(title, cards.slice(0, PREVIEW_CARDS), cards.length > PREVIEW_CARDS ? el('button', {type: 'button', className: 'presets-show-all', dataset: {showKind: kind}, textContent: `Show all ${cards.length}`}) : null));
      }
    } else {
      if (this.kind === 'moves') groups.push(this.moveOptions());
      if (this.kind === 'motions') groups.push(this.strength());
      if (this.kind === 'text') groups.push(this.textOptions());
      if (this.kind === 'mine') groups.push(this.importButtons());
      for (const [title, cards] of this.sections(this.kind)) {
        const file = this.kind === 'mine' ? userPresetFiles.find(item => item.name === title) : null, pack = this.kind === 'mine' && !file ? title : null;
        const actions = file ? el('span', {className: 'presets-group-actions'},
          el('button', {type: 'button', className: 'ui-icon-button', title: `Save ${file.name}…`, ariaLabel: `Save ${file.name}`, dataset: {variant: 'ghost', size: 'sm'}, onclick: () => this.exportUserFile(file)}, svg('download')),
          el('button', {type: 'button', className: 'ui-icon-button', title: `Remove ${file.name}`, ariaLabel: `Remove ${file.name}`, dataset: {variant: 'ghost', size: 'sm'}, onclick: () => this.removeFile(file)}, svg('trash')))
          : pack ? el('button', {type: 'button', className: 'ui-icon-button presets-pack-remove', title: `Remove ${pack}`, ariaLabel: `Remove ${pack}`, dataset: {variant: 'ghost', size: 'sm'},
            onclick: async () => { await removeImportedPack(pack); this.notify(`Removed ${pack}.`); this.renderBody(); }}, svg('trash')) : null;
        groups.push(section(title, cards, actions));
      }
      if (this.kind === 'moves' && !this.query && this.polishCard) groups.push(this.polishCard);
      if (this.kind === 'shot' && this.shotCard) groups.push(this.shotCard);
      if (this.kind === 'mine' && !userPresetFiles.length && !importedPacks().length) groups.push(el('p', {className: 'ai-hint presets-import-note', textContent:
        'Import .rigset (animations, effects) and .rigobject (objects, stickers, text looks, figures) files, or a .zip pack or folder of images. To make your own, select a figure and use the Library menu (⋯): Save selection as object preset, or Save its animation or effects as a preset.'}));
    }
    const shown = groups.filter(Boolean);
    this.body.replaceChildren(...(shown.length ? shown : [el('p', {className: 'ai-empty', textContent: 'No presets match.'})]));
  }
  importButtons() {
    return el('div', {className: 'presets-import'},
      el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'soft', size: 'sm'}, onclick: () => this.fileInput.click()}, svg('upload'), el('span', {textContent: 'Import presets…'})),
      el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'ghost', size: 'sm'}, onclick: () => this.folderInput.click()}, svg('folder'), el('span', {textContent: 'Import folder…'})));
  }

  /** The Library's ⋯ menu items for presets (user-library.mjs presetMenu). */
  menuItems() {
    const selected = this.editor.selectedObjects?.length > 0, figure = this.figure !== null;
    return [
      {label: 'Import presets (.rigset, .rigobject, .zip)…', icon: 'upload', run: () => this.fileInput.click()},
      {label: 'Import preset folder…', icon: 'folder', run: () => this.folderInput.click()},
      {label: 'Save selection as object preset (.rigobject)…', icon: 'plus', disabled: !selected || !this.snapshotSelection, run: () => this.saveObjectPreset()},
      {label: 'Save its animation as preset (.rigset)…', icon: 'route', disabled: !figure, run: () => this.saveAnimationPreset()},
      {label: 'Save its effects as preset (.rigset)…', icon: 'fx', disabled: !figure, run: () => this.saveEffectPreset()},
      ...(canRevealUserPresets() ? [{label: 'Open presets folder', icon: 'folder', run: () => Promise.resolve(revealUserPresets()).catch(error => this.notify(error.message, true))}] : []),
    ];
  }

  /** Imports the chosen files into My presets: preset files as they are, packs and images as .rigobject files of stickers. */
  async importFiles(input) {
    const files = [...input.files]; input.value = '';
    if (!files.length) return;
    const presetFiles = files.filter(file => PRESET_FILE.test(file.name)), others = files.filter(file => !PRESET_FILE.test(file.name));
    try {
      let added = 0;
      const all = [...presetFiles, ...(others.length ? await presetPackFiles(others) : [])];
      for (const entry of await addUserPresetFiles(all)) added += entry.presets.length;
      this.notify(`Imported ${added} preset${added === 1 ? '' : 's'} into My presets.`);
      this.showKind('mine');
    } catch (error) { this.notify(error.message, true); }
  }

  card(kind, name, label, {file = null, pack = null} = {}) {
    const thumb = el('span', {className: 'library-thumbnail preset-thumb', dataset: {kind}});
    const image = this.thumbnail(kind, name);
    if (typeof image === 'string' && image.startsWith('<svg')) thumb.innerHTML = image; else if (image) thumb.append(el('img', {src: image, alt: '', draggable: false}));
    const more = el('button', {type: 'button', className: 'preset-more', tabIndex: -1, title: 'More', ariaLabel: `More for ${label}`, dataset: {presetMore: ''}});
    more.innerHTML = icon('more');
    // A focusable div, not a <button>: the canvas drag (library-drag.mjs) starts from anything but form controls.
    return el('div', {role: 'button', tabIndex: 0, className: 'preset-card', title: label, dataset: {publicId: `${kind}:${name}`, kind, name, ...(file ? {file} : {}), ...(pack ? {pack} : {})}},
      thumb, el('span', {className: 'preset-label', textContent: label}), more);
  }

  /** A card's menu: add or apply it, save it as a file, and remove it when it is yours. */
  cardMenu(card, {anchor = null, point = null} = {}) {
    if (!card) return;
    const {kind, name, file, pack} = card.dataset, label = card.title, extension = extensionFor(kind);
    const things = ['object', 'sticker', 'textLook', 'figure'].includes(kind);
    const items = [
      {label: things ? 'Add to canvas' : 'Apply', icon: 'plus', shortcut: 'Enter', run: () => this.activate(card)},
      {label: `Save as ${extension} file…`, icon: 'download', disabled: !this.saveFile || Boolean(pack) || kind === 'camera' && CAMERA_CLIPS[name], run: () => this.exportPreset(kind, name, label, file)},
      ...(file ? [null, {label: 'Remove from My presets', icon: 'trash', danger: true, run: () => this.removeFile(userPresetFiles.find(item => item.id === file))}] : []),
    ];
    openMenu({items, ...(anchor ? {anchor} : {point}), icon: glyph => icon(glyph), label: `${label} actions`, invoker: card});
  }

  /** Saves one preset as its own file (a built-in, a pack's or one of yours) through the save dialog. */
  async exportPreset(kind, name, label, fileId) {
    try {
      if (fileId) { const file = userPresetFiles.find(item => item.id === fileId); if (file?.presets.length === 1) return this.exportUserFile(file); }
      const record = kind === 'figure'
        ? {kind, id: slug(label), name: label, group: FIGURE_PRESETS[name].group, data: {}, figure: FIGURE_PRESETS[name].figure}
        : {...await builtinRecord(kind, name), ...(fileId ? {id: name.replace(/^user:/, '')} : {})};
      await this.saveFile(await writePresetFile(record), presetFileName(label, kind));
    } catch (error) { this.notify(error.message, true); }
  }
  async exportUserFile(file) {
    try { const blob = await userPresetBlob(file.id); if (blob) await this.saveFile(blob, file.name); } catch (error) { this.notify(error.message, true); }
  }
  async removeFile(file) {
    if (!file) return;
    try { await removeUserPresetFile(file.id); this.notify(`Removed ${file.name}.`); this.renderBody(); } catch (error) { this.notify(error.message, true); }
  }

  // ---- Making presets from the canvas ----
  /** Adds records to My presets and saves them as a file too, so the preset exists as a .rigset / .rigobject on disk. */
  async keep(records, label) {
    const entry = await saveUserPreset(records);
    this.renderBody();
    try { await this.saveFile?.(await userPresetBlob(entry.id), entry.name); } catch (error) { if (error?.name !== 'AbortError') this.notify(error.message, true); }
    this.notify(`Saved ${label} to My presets as ${entry.name}.`);
    return entry;
  }
  async saveObjectPreset() {
    try {
      const snapshot = await this.snapshotSelection();
      // The preview is a PNG data URL (decoded here: the page's content policy does not fetch data: URLs).
      const thumbnail = new Blob([Uint8Array.from(atob(snapshot.thumbnail.split(',')[1]), c => c.charCodeAt(0))], {type: 'image/png'});
      await this.keep({kind: 'figure', id: slug(snapshot.name), name: snapshot.name, group: 'My objects', data: {libraryKind: snapshot.kind}, figure: snapshot.blob, thumbnail}, snapshot.name);
    } catch (error) { this.notify(error.message, true); }
  }
  /** The selected figure's keyed movement (position, turn, size, opacity) as a motion you can drop on any figure. */
  async saveAnimationPreset() {
    const uid = this.figure; if (uid === null) return this.notify('Select the figure whose animation to save.', true);
    try {
      const editor = this.editor, target = {kind: 'figure', uid}, value = (property, tick) => Number(editor.animationValue(target, property, tick)) || 0;
      const rigs = editor.report._rigs, layer = rigs?.layers?.assignments?.[uid] ?? rigs?.layers?.defaultLayerId ?? editor.activeLayerId;
      let ticks = editor.layerFrameKeys(layer).map(key => key.tick).filter(Number.isInteger);
      // A figure moved by its own keys rather than layer cels: sample the whole animation.
      if (ticks.length < 2) ticks = Array.from({length: Math.ceil(editor.totalTicks / 2)}, (_, i) => i * 2);
      const from = Math.min(...ticks), to = Math.max(...ticks), fps = editor.report.frame_delay_ms ? 1000 / editor.report.frame_delay_ms : (editor.report.fps || 24);
      const name = `My motion ${userPresetFiles.length + 1}`;
      const record = recordMotion({name, from, to, fps, ticks, sample: tick => ({x: value('x', tick), y: value('y', tick), rotation: value('rotation', tick) * 180 / Math.PI,
        scale: value('scale', tick) || 1, opacity: editor.animationValue(target, 'opacity', tick) ?? 1})});
      if (record.data.keys.every(key => !key.dx && !key.dy && !key.r && !key.s && key.o === record.data.keys[0].o)) return this.notify('This figure does not move over its keys yet: animate it first, then save its animation.', true);
      await this.keep(record, name);
    } catch (error) { this.notify(error.message, true); }
  }
  /** The selected figure's effect clips as one effect preset. */
  async saveEffectPreset() {
    const uid = this.figure; if (uid === null) return this.notify('Select the figure whose effects to save.', true);
    try {
      const clips = this.editor.getVfxClips({kind: 'figure', uid});
      const effects = clips.flatMap(clip => clip.effects.filter(effect => effect.enabled !== false).map(effect => [effect.type, effect.params ?? {}]));
      if (!effects.length) return this.notify('This figure has no effects yet: add some in the VFX panel, then save them.', true);
      const name = clips.find(clip => clip.name)?.name || `My effect ${userPresetFiles.length + 1}`;
      const duration = Math.max(...clips.map(clip => clip.duration ?? 0)) || 24;
      await this.keep({kind: 'effect', id: slug(name), name, group: 'My effects', data: {icon: 'effects', category: 'My effects', target: 'figure', duration, effects}}, name);
    } catch (error) { this.notify(error.message, true); }
  }

  moveOptions() {
    const facing = el('div', {className: 'ui-segmented', role: 'group', ariaLabel: 'Direction'}, ['left', 'right'].map(direction => el('button', {type: 'button', className: 'ui-segmented-item',
      textContent: direction === 'left' ? '← Left' : 'Right →', ariaPressed: String(this.direction === direction), onclick: event => {
        this.direction = direction; for (const button of facing.children) button.setAttribute('aria-pressed', String(button === event.currentTarget)); }})));
    return el('div', {className: 'moves-options'}, this.range('Length', 0, 6, 0.1, this.seconds ?? 0, value => { this.seconds = value || null; }, value => value ? `${value.toFixed(1)} s` : 'Auto'),
      this.strength().firstElementChild, el('div', {className: 'moves-option'}, el('span', {textContent: 'Direction'}), facing));
  }
  strength() {
    return el('div', {className: 'moves-options'}, this.range('Strength', 0.3, 2, 0.1, this.intensity, value => { this.intensity = value; }, value => `${Math.round(value * 100)}%`));
  }
  textOptions() {
    const input = el('input', {type: 'text', className: 'presets-text', value: this.words, ariaLabel: 'Text to add', oninput: () => { this.words = input.value; }});
    return el('div', {className: 'moves-options'}, el('label', {className: 'moves-option presets-text-row'}, el('span', {textContent: 'Text'}), input));
  }
  range(label, min, max, step, value, set, format) {
    const output = el('output', {textContent: format(value)});
    const input = el('input', {type: 'range', min, max, step, value, oninput: () => { set(Number(input.value)); output.textContent = format(Number(input.value)); }});
    return el('label', {className: 'moves-option'}, el('span', {textContent: label}), input, output);
  }

  assetFor(card) { return {kind: card.dataset.kind, name: card.dataset.name, id: card.dataset.publicId}; }

  /** A click: things go to the middle of the canvas, animations to the selected figure (effects to the scene when nothing is selected). */
  activate(card) { return this.apply(this.assetFor(card), null); }
  /** A drop at a canvas point: things land there; animations and effects go to the figure under it. */
  async drop(asset, point) { return this.apply(asset, point); }

  /** The layer a thing goes on: the one picked in the timeline, or the selected one while it is empty; else none (a new layer). */
  targetLayer() {
    const layer = this.editor.getLayer?.(this.editor.activeLayerId);
    if (!layer || layer.kind !== 'layer' || layer.locked) return null;
    return this.pickedLayer === layer.id || !layer.figureUids?.length ? layer.id : null;
  }
  /** A drop on a timeline layer row: the thing goes on that layer, in the middle of the stage. */
  async dropOnLayer(asset, layerId) {
    if (!['object', 'sticker', 'textLook'].includes(asset.kind)) return this.notify('Drop animations and effects on a figure on the canvas.', true);
    return this.apply(asset, null, layerId);
  }

  async apply({kind, name}, point, layerId = this.targetLayer()) {
    const tools = this.tools, at = point ? {x: Math.round(point.x), y: Math.round(point.y)} : {}, onLayer = layerId ? {layer: layerId} : {};
    if (kind === 'figure') {
      const preset = FIGURE_PRESETS[name];
      if (!preset || !this.insertFigure) return;
      try { await this.insertFigure({source: 'preset', name: preset.name, figure: preset.figure}, point ?? undefined); } catch (error) { this.notify(error.message, true); }
      return;
    }
    const under = async () => point ? JSON.parse((await tools.call('rigstick_figure_at', at))[0].text).figure : this.figure;
    // The playhead stays where the person left it (the tools seek while they key).
    const tick = Math.floor(this.editor.tick);
    const run = async action => { try { const result = await action(); if (Math.floor(this.editor.tick) !== tick) this.editor.seek(tick); const text = result?.[0]?.text ?? '';
      let message = text; try { message = JSON.parse(text).message ?? text; } catch { /* plain text */ } if (message) this.notify(message); } catch (error) { this.notify(error.message, true); } this.syncTarget(); };
    const insert = args => run(async () => { this.inserting = true; try { return await tools.call('rigstick_insert_preset', {...args, ...at, ...onLayer}); }
      finally { this.inserting = false; this.seenLayer = this.editor.activeLayerId; this.pickedLayer = layerId ?? null; } });
    if (kind === 'object' || kind === 'sticker') return insert({kind, name});
    if (kind === 'textLook') return insert({kind: 'text', name, text: this.words || 'Your text'});
    const figure = await under();
    if (kind === 'camera') {
      if (name === 'follow' && figure === null) return this.notify('Drop Follow on the figure the camera should follow, or select it first.', true);
      return run(() => tools.call('rigstick_apply_preset', {kind: 'camera', name, intensity: this.intensity, ...(name === 'follow' ? {figure} : {})}));
    }
    if (kind === 'effect') {
      const scene = effectPreset(name)?.target === 'scene' || figure === null && effectPreset(name)?.target !== 'figure';
      if (!scene && figure === null) return this.notify('Drop this effect on a figure, or select one first.', true);
      return run(() => tools.call('rigstick_apply_preset', {kind: 'effect', name, ...(scene ? {} : {figure})}));
    }
    if (figure === null) return this.notify(kind === 'textAnimation' ? 'Drop this on a text figure, or select one first.' : 'Drop this on a figure, or select one first.', true);
    if (kind === 'move') return run(() => tools.call('rigstick_apply_preset', {kind: 'move', name, figure, intensity: this.intensity, ...(this.seconds ? {seconds: this.seconds} : {}),
      ...(TRAVELLING_MOVES.has(name) ? {direction: this.direction} : {})}));
    if (kind === 'motion') return run(() => tools.call('rigstick_apply_preset', {kind: 'motion', name, figure, intensity: this.intensity}));
    if (kind === 'textAnimation') return run(() => tools.call('rigstick_apply_preset', {kind: 'text', name, figure}));
  }

  // ---- Thumbnails: drawn once per preset and cached as data URLs (stickers use their own art). ----
  thumbnail(kind, name) {
    const key = `${kind}:${name}`;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    let value;
    if (kind === 'sticker') { const frames = stickerFrameUrls(STICKERS[name]); value = frames[Math.floor(frames.length / 2)]; }
    else if (kind === 'effect') value = vfxIcon(effectIcon(name, effectPreset(name)));
    else if (kind === 'figure') value = FIGURE_PRESETS[name]?.thumbnail ?? '';
    else {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = THUMB * 2;
      const ctx = canvas.getContext('2d'); ctx.scale(2, 2); ctx.lineCap = ctx.lineJoin = 'round';
      ({object: drawObject, move: drawMove, motion: drawMotion, camera: drawCamera, textLook: drawTextLook, textAnimation: drawTextAnimation}[kind])?.(ctx, name);
      value = canvas.toDataURL('image/png');
    }
    this.thumbs.set(key, value); return value;
  }
}

/** The best icon for an effect: by name first (snow, rain, fire…), then by its main effect type. */
function effectIcon(name, preset) {
  const words = name.toLowerCase();
  for (const [word, icon] of [['snow', 'snow'], ['blizzard', 'snow'], ['rain', 'rain'], ['storm', 'rain'], ['lightning', 'lightning'], ['fire', 'fire'], ['burn', 'fire'], ['ember', 'fire'],
    ['campfire', 'fire'], ['speed', 'speed'], ['confetti', 'confetti'], ['firework', 'confetti'], ['sparkle', 'sparkle'], ['magic', 'sparkle'], ['star', 'sparkle'], ['spark', 'sparks'], ['smoke', 'smoke'], ['steam', 'smoke'], ['dust', 'smoke']])
    if (words.includes(word)) return icon;
  return preset?.effects?.[0]?.[0] ?? preset?.icon ?? 'effects';
}

// Drawing helpers for thumbnails (THUMB × THUMB, light ink on the panel's card matte).
const INK = '#ff7a1a';
function fitTo(ctx, bounds, pad = 8) {
  const w = Math.max(1, bounds.maxX - bounds.minX), h = Math.max(1, bounds.maxY - bounds.minY), k = Math.min((THUMB - 2 * pad) / w, (THUMB - 2 * pad) / h);
  ctx.translate(THUMB / 2, THUMB / 2); ctx.scale(k, k); ctx.translate(-(bounds.minX + w / 2), -(bounds.minY + h / 2));
  return k;
}
/** An edge from a to b bulging by `bend` (radians, the prop format's convention) as a quadratic curve. */
function edgeTo(ctx, a, b, bend) {
  if (!bend) { ctx.lineTo(b[0], b[1]); return; }
  const dx = b[0] - a[0], dy = b[1] - a[1], chord = Math.hypot(dx, dy) || 1, sag = chord / 2 * Math.tan(bend / 4) * 2;
  ctx.quadraticCurveTo((a[0] + b[0]) / 2 + dy / chord * sag, (a[1] + b[1]) / 2 - dx / chord * sag, b[0], b[1]);
}
function drawObject(ctx, name) {
  const object = OBJECTS[name], parts = object.make ? object.make({depth: 'mid', seed: 4, width: 600}) : object.parts, b = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
  const grow = (x, y, r = 0) => { b.minX = Math.min(b.minX, x - r); b.minY = Math.min(b.minY, y - r); b.maxX = Math.max(b.maxX, x + r); b.maxY = Math.max(b.maxY, y + r); };
  for (const p of parts) { if (p.circle) grow(p.circle[0], p.circle[1], p.circle[2]); else for (const [x, y] of p.path ?? p.windows ?? []) grow(x, y); }
  const k = fitTo(ctx, b);
  for (const p of parts) {
    if (p.circle) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.circle[0], p.circle[1], p.circle[2], 0, Math.PI * 2); ctx.fill(); continue; }
    if (p.windows) { ctx.fillStyle = p.color; for (const [x, y] of p.windows) ctx.fillRect(x, y - 5, 8, 10); continue; }
    ctx.beginPath(); ctx.moveTo(p.path[0][0], p.path[0][1]);
    for (let i = 1; i < p.path.length; i++) edgeTo(ctx, p.path[i - 1], p.path[i], p.bends?.[i] ?? 0);
    if (p.fill && p.path.length >= 4) { ctx.fillStyle = p.fill; ctx.fill(); }
    if ((p.width ?? 4) > 0) { ctx.strokeStyle = p.color ?? '#2b2b2b'; ctx.lineWidth = Math.max(1 / k, p.width ?? 4); ctx.stroke(); }
  }
}
function drawMove(ctx, name) {
  const plan = buildMove(name, {}), key = plan.keys.reduce((best, k) => Math.abs(k.dx) + Math.abs(k.dy) + Object.values(k.joints).reduce((s, v) => s + Math.abs(v), 0) >
    Math.abs(best.dx) + Math.abs(best.dy) + Object.values(best.joints).reduce((s, v) => s + Math.abs(v), 0) ? k : best, plan.keys[Math.floor(plan.keys.length / 2)]);
  const j = key.joints, d = Math.PI / 180, at = (from, deg, length) => [from[0] + Math.cos(deg * d) * length, from[1] + Math.sin(deg * d) * length];
  const hip = [0, 0], neck = at(hip, j.torso ?? -90, 20), head = at(neck, j.head ?? -90, 7);
  const lines = [[hip, neck], [neck, at(neck, j.armAUpper ?? 98, 13)], [neck, at(neck, j.armBUpper ?? 82, 13)], [hip, at(hip, j.legAUpper ?? 96, 16)], [hip, at(hip, j.legBUpper ?? 84, 16)]];
  const lower = [[lines[1][1], j.armALower ?? 92, 12], [lines[2][1], j.armBLower ?? 88, 12], [lines[3][1], j.legALower ?? 92, 15], [lines[4][1], j.legBLower ?? 88, 15]];
  ctx.translate(THUMB / 2, THUMB / 2 + 4); ctx.rotate((key.rot ?? 0) * d);
  ctx.strokeStyle = ctx.fillStyle = INK; ctx.lineWidth = 3.2;
  for (const [a, b] of [...lines, ...lower.map(([from, deg, l]) => [from, at(from, deg, l)])]) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(head[0], head[1], 6, 0, Math.PI * 2); ctx.fill();
}
/** A motion as a fading trail of the thing at each key: the path squeezed into the card, the box kept readable. */
function drawMotion(ctx, name) {
  const keys = MOTIONS[name].keys, xs = keys.map(k => k.dx ?? 0), ys = keys.map(k => k.dy ?? 0);
  const span = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), k = Math.min(1, 36 / span);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  ctx.translate(THUMB / 2, THUMB / 2);
  keys.forEach((key, i) => {
    ctx.save(); ctx.translate(((key.dx ?? 0) - cx) * k, ((key.dy ?? 0) - cy) * k); ctx.rotate((key.r ?? 0) * Math.PI / 180); const s = Math.min(2.2, key.s ?? 1); ctx.scale(s, s);
    ctx.globalAlpha = Math.max(0.12, (0.25 + 0.75 * (i + 1) / keys.length) * (key.o ?? 1)); ctx.fillStyle = INK; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-9, -9, 18, 18, 4); else ctx.rect(-9, -9, 18, 18); ctx.fill(); ctx.stroke(); ctx.restore();
  });
}
/** A camera move as frames: where the view goes, zooms and rolls. */
function drawCamera(ctx, name) {
  const preset = CAMERA_PRESETS[name];
  ctx.translate(THUMB / 2, THUMB / 2); ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  const keys = preset?.keys ?? [{}, {zoom: 1.2}];
  keys.forEach((key, i) => {
    ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * (i + 1) / keys.length;
    ctx.translate((key.dx ?? 0) / 18, (key.dy ?? 0) / 18); ctx.rotate((key.roll ?? 0) * Math.PI / 180); const s = 1 / (key.zoom ?? 1); ctx.scale(s, s);
    ctx.strokeRect(-22, -14, 44, 28); ctx.restore();
  });
  if (!preset) { ctx.font = '600 9px sans-serif'; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(CAMERA_CLIPS[name] ?? name, 0, 26); }
}
function drawTextLook(ctx, name) {
  const look = TEXT_LOOKS[name].text, effects = TEXT_LOOKS[name].effects ?? [];
  // Dark text sits on a light card so it can be seen.
  const rgb = [1, 3, 5].map(i => parseInt(look.color.slice(i, i + 2), 16));
  if (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 110) { ctx.fillStyle = '#eef0f4'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, THUMB, THUMB, 8); else ctx.rect(0, 0, THUMB, THUMB); ctx.fill(); }
  ctx.font = `${look.italic ? 'italic ' : ''}${look.bold ? '800' : '500'} 30px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const glow = effects.find(([type]) => type === 'glow')?.[1], shadow = effects.find(([type]) => type === 'shadow')?.[1];
  const fill = look.gradient ? (() => { const g = ctx.createLinearGradient(0, 18, 0, 46); g.addColorStop(0, look.color); g.addColorStop(1, look.gradient); return g; })() : look.color;
  if (shadow) { ctx.fillStyle = `#${(shadow.color ?? 0).toString(16).padStart(6, '0')}`; ctx.globalAlpha = shadow.opacity ?? 0.5; ctx.fillText('Aa', THUMB / 2 + (shadow.offsetX ?? 6) / 3, THUMB / 2 + (shadow.offsetY ?? 6) / 3); ctx.globalAlpha = 1; }
  if (glow) { ctx.shadowColor = `#${(typeof glow.color === 'number' ? glow.color : 0xffffff).toString(16).padStart(6, '0')}`; ctx.shadowBlur = 10; }
  if (look.outline) { ctx.strokeStyle = look.outlineColor ?? '#000'; ctx.lineWidth = Math.min(6, look.outline); ctx.strokeText('Aa', THUMB / 2, THUMB / 2); }
  ctx.fillStyle = fill; ctx.fillText('Aa', THUMB / 2, THUMB / 2);
}
function drawTextAnimation(ctx, name) {
  const animation = TEXT_ANIMATIONS[name], keys = MOTIONS[animation.motion].keys;
  ctx.font = '800 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
  const letters = ['A', 'B', 'C'];
  letters.forEach((letter, i) => {
    const key = animation.letters ? keys[Math.min(keys.length - 1, Math.round((keys.length - 1) * (i + 1) / letters.length))] : keys[Math.floor(keys.length / 2)];
    ctx.save(); ctx.globalAlpha = Math.max(0.15, key.o ?? 1); ctx.translate(18 + i * 14 + (animation.letters ? 0 : (key.dx ?? 0) / 40), THUMB / 2 + (key.dy ?? 0) / 6);
    ctx.rotate((key.r ?? 0) * Math.PI / 360); ctx.fillText(letter, 0, 0); ctx.restore();
  });
}
