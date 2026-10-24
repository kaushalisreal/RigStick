// The AI panel: connect any MCP client to RigStick and watch what it does.
// Desktop: shows the local MCP endpoint, copy-ready setup for Claude Desktop, Claude Code, Gemini CLI and
// other clients, the guided prompts, and a live log of every tool call with an undo for AI changes.
// Browser: explains that AI connections need the desktop app (a web page cannot host an MCP server).
import { icon } from '../icons.mjs';

const CLIENTS = [
  {id: 'claudeDesktop', label: 'Claude Desktop', icon: 'message', steps: ['Copy the setup below.', 'In Claude: Settings → Developer → Edit Config.', 'Paste it into claude_desktop_config.json and restart Claude.']},
  {id: 'claudeCode', label: 'Claude Code', icon: 'keyboard', steps: ['Copy the command below.', 'Run it once in a terminal.', 'Ask Claude to animate something in RigStick.']},
  {id: 'geminiCli', label: 'Gemini CLI', icon: 'lightbulb', steps: ['Copy the setup below.', 'Merge it into ~/.gemini/settings.json.', 'Restart Gemini CLI.']},
  {id: 'generic', label: 'Other apps', icon: 'link', steps: ['Copy the setup below.', 'Add it as a Streamable HTTP MCP server.', 'Works with Cursor, VS Code, Windsurf, LM Studio…']},
];
const PROMPTS = [
  ['animate_scene', 'Describe a scene, the AI builds it'],
  ['act_out_voiceover', 'Act out the transcribed voiceover'],
  ['research_and_storyboard', 'Research a topic, then animate it'],
  ['polish_animation', 'Review and smooth the animation'],
];
const TOOL_LABELS = {rigstick_get_project: 'Read the project', rigstick_get_figure: 'Read a figure', rigstick_render_frame: 'Looked at a frame',
  rigstick_add_figure: 'Added a figure', rigstick_pose: 'Posed a figure', rigstick_apply_move: 'Applied a move', rigstick_camera: 'Moved the camera',
  rigstick_add_text: 'Added text', rigstick_scene: 'Changed the scene', rigstick_smooth_limbs: 'Smoothed limbs', rigstick_go_to_frame: 'Went to a frame', rigstick_delete_figure: 'Deleted a figure',
  rigstick_undo: 'Undid', rigstick_redo: 'Redid', rigstick_get_transcript: 'Read the transcript', rigstick_play: 'Played the preview'};

export const el = (tag, {dataset, ...props} = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
};
export const svg = name => { const template = document.createElement('template'); template.innerHTML = icon(name); return template.content.firstElementChild; };

export class AiPanel {
  constructor({root, desktop, editor, showPanel}) {
    Object.assign(this, {root, desktop, editor, showPanel});
    this.entries = []; this.client = 'claudeDesktop'; this.status = null; this.configs = null;
    root.classList.add('ai-panel');
    if (!desktop?.mcpStatus) { this.renderWebOnly(); return; }
    this.render();
    desktop.onMcpActivity(entry => this.activity(entry));
    editor.addEventListener?.('change', () => { this.undo.disabled = !(editor.canUndo && /^AI: /.test(editor.undoLabel ?? '')); });
    desktop.onMcpStatus?.(status => this.update(status));
    this.refresh();
  }

  renderWebOnly() {
    this.root.replaceChildren(el('div', {className: 'ai-card'},
      el('h3', {className: 'ai-title', textContent: 'Connect an AI'}),
      el('p', {className: 'ai-text', textContent: 'Claude, Gemini and other AI apps connect to RigStick over MCP, which needs the RigStick desktop app for Windows or Linux. In the browser you can still use Moves and Transcribe.'}),
      el('button', {type: 'button', className: 'ui-button', textContent: 'Open Moves', onclick: () => this.showPanel('moves')})));
  }

  render() {
    this.toggle = el('input', {type: 'checkbox', role: 'switch', className: 'ui-switch ai-switch', ariaLabel: 'Allow AI apps to connect', onchange: () => this.setEnabled(this.toggle.checked)});
    this.state = el('span', {className: 'ai-state'});
    this.address = el('code', {className: 'ai-address'});
    this.copyAddress = el('button', {type: 'button', className: 'ui-icon-button', dataset: {size: 'sm'}, ariaLabel: 'Copy address', title: 'Copy address',
      onclick: () => this.copyText(this.status?.url, this.copyAddress)}, svg('clipboard'));
    this.tabs = el('div', {className: 'ai-clients', role: 'radiogroup', ariaLabel: 'AI app'},
      CLIENTS.map(client => el('button', {type: 'button', role: 'radio', className: 'ai-client', dataset: {client: client.id},
        onclick: () => { this.client = client.id; this.renderConfig(); }}, svg(client.icon), el('span', {textContent: client.label}))));
    this.steps = el('ol', {className: 'ai-steps'});
    this.config = el('pre', {className: 'ai-config'});
    this.copy = el('button', {type: 'button', className: 'ui-button ai-copy', dataset: {variant: 'primary', size: 'sm'}, onclick: () => this.copyText(this.config.textContent, this.copy)},
      svg('clipboard'), el('span', {textContent: 'Copy'}));
    this.log = el('ol', {className: 'ai-log', ariaLive: 'polite'});
    this.undo = el('button', {type: 'button', className: 'ui-button', dataset: {size: 'sm', variant: 'outline'}, onclick: () => this.undoAi()}, svg('undo'), el('span', {textContent: 'Undo AI change'}));
    this.root.replaceChildren(
      el('section', {className: 'ai-card ai-status'},
        el('label', {className: 'ai-head'}, el('span', {className: 'ai-title', textContent: 'AI connection'}), this.toggle),
        this.state,
        el('div', {className: 'ai-field'}, this.address, this.copyAddress),
        el('p', {className: 'ai-text', textContent: 'AI apps that speak MCP can read your animation, add and pose figures, apply moves, move the camera and read transcripts. Each change is one undo step.'})),
      el('section', {className: 'ai-card'},
        el('h3', {className: 'ai-title', textContent: 'Set up your AI app'}),
        this.tabs, this.steps,
        el('div', {className: 'ai-code'}, this.config, this.copy),
        el('div', {className: 'ai-foot'}, el('span', {className: 'ai-hint', textContent: 'The setup holds a private token.'}),
          el('button', {type: 'button', className: 'ui-button', dataset: {variant: 'ghost', size: 'sm'}, textContent: 'New token', title: 'Disconnects apps using the old token', onclick: () => this.newToken()}))),
      el('section', {className: 'ai-card'},
        el('h3', {className: 'ai-title', textContent: 'Try asking'}),
        el('ul', {className: 'ai-prompts'}, PROMPTS.map(([name, text]) => el('li', {}, el('code', {textContent: `/${name}`}), el('span', {textContent: text})))),
        el('p', {className: 'ai-hint', textContent: 'Most AI apps show these as slash commands once connected. Or just say it: “make the stickman run in and wave”.'})),
      el('section', {className: 'ai-card ai-activity'},
        el('div', {className: 'ai-head'}, el('h3', {className: 'ai-title', textContent: 'What the AI did'}), this.undo),
        this.log));
    this.renderLog();
  }

  async refresh() { this.update(await this.desktop.mcpStatus()); }
  update(status) {
    this.status = status; this.configs = status.configs;
    const on = status.enabled && status.running;
    this.toggle.checked = status.enabled;
    this.state.textContent = on ? 'Ready for AI apps' : status.enabled ? `Not running: ${status.error ?? 'starting…'}` : 'Off: AI apps cannot connect';
    this.state.dataset.state = on ? 'on' : status.enabled ? 'error' : 'off';
    this.address.textContent = on ? status.url : '—';
    this.copyAddress.disabled = !on;
    this.renderConfig();
  }
  renderConfig() {
    for (const button of this.tabs.children) button.setAttribute('aria-checked', String(button.dataset.client === this.client));
    const client = CLIENTS.find(item => item.id === this.client);
    this.config.textContent = this.status?.running ? this.configs?.[this.client] ?? '' : 'Turn the connection on to see the setup.';
    this.steps.replaceChildren(...client.steps.map(step => el('li', {textContent: step})));
    this.copy.disabled = !this.status?.running;
  }
  async copyText(value, button) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    button.dataset.copied = 'true';
    const label = button.querySelector('span');
    if (label) label.textContent = 'Copied';
    setTimeout(() => { delete button.dataset.copied; if (label) label.textContent = 'Copy'; }, 1400);
  }
  async setEnabled(enabled) { this.update(await this.desktop.setMcpEnabled(enabled)); }
  async newToken() { this.update(await this.desktop.regenerateMcpToken()); }
  undoAi() {
    if (this.editor.canUndo && /^AI: /.test(this.editor.undoLabel ?? '')) this.editor.undo();
  }

  activity(entry) {
    const index = this.entries.findIndex(item => item.id === entry.id);
    if (index >= 0) this.entries[index] = {...this.entries[index], ...entry}; else this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, 60);
    this.renderLog();
  }
  renderLog() {
    this.undo.disabled = !(this.editor.canUndo && /^AI: /.test(this.editor.undoLabel ?? ''));
    if (!this.entries.length) { this.log.replaceChildren(el('li', {className: 'ai-empty', textContent: 'Nothing yet. Connect an AI app and ask it to animate something.'})); return; }
    this.log.replaceChildren(...this.entries.map(entry => el('li', {className: 'ai-entry', dataset: {status: entry.status}},
      el('span', {className: 'ai-dot', ariaHidden: 'true'}),
      el('span', {className: 'ai-what', textContent: TOOL_LABELS[entry.tool] ?? entry.tool}),
      el('time', {className: 'ai-when', textContent: new Date(entry.started).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})}),
      entry.summary ? el('span', {className: 'ai-summary', textContent: entry.summary}) : null)));
  }
}
