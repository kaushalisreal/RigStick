'use strict';
// RigStick's MCP server: lets an AI client (Claude Desktop, Claude Code, Gemini CLI, Cursor, …)
// read and change the open animation.
//
// Streamable HTTP on 127.0.0.1 only, stateless (a fresh protocol server per request). Every request
// needs `Authorization: Bearer <token>`; requests carrying a non-local Origin or Host are refused, so a
// web page cannot reach it (DNS rebinding included). Clients that only speak stdio use
// desktop/mcp-stdio.cjs, which forwards to this endpoint. Settings and the token live in
// <userData>/mcp.json.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {Server} = require('@modelcontextprotocol/sdk/server/index.js');
const {StreamableHTTPServerTransport} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {ListToolsRequestSchema, CallToolRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema} = require('@modelcontextprotocol/sdk/types.js');
const {TOOLS, PROMPTS} = require('./ai-tool-catalog.cjs');

const DEFAULT_PORT = 47760;
const MAX_BODY = 4 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function readSettings(file) {
  let value = {};
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const token = typeof value.token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value.token) ? value.token : crypto.randomBytes(24).toString('base64url');
  const port = Number.isInteger(value.port) && value.port >= 1024 && value.port <= 65535 ? value.port : DEFAULT_PORT;
  return {enabled: value.enabled !== false, port, token};
}

const localName = value => { try { return LOCAL_HOSTS.has(new URL(`http://${value}`).hostname); } catch { return false; } };
const sameToken = (given, token) => {
  const a = Buffer.from(String(given ?? '')), b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

class McpHost {
  /**
   * `callEditor(name, args)` runs an editor tool in the workspace window and resolves to MCP content;
   * `onActivity(entry)` hears every call for the AI panel.
   */
  constructor({directory, version, callEditor, onActivity = () => {}}) {
    this.file = path.join(directory, 'mcp.json');
    this.settings = readSettings(this.file);
    Object.assign(this, {version, callEditor, onActivity});
    this.server = null; this.port = null; this.error = null; this.sequence = 0;
    this.save();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    fs.writeFileSync(this.file, JSON.stringify({...this.settings, url: this.url, pid: process.pid}, null, 2), {mode: 0o600});
  }
  get url() { return this.port ? `http://127.0.0.1:${this.port}/mcp` : null; }
  status() {
    return {enabled: this.settings.enabled, running: Boolean(this.server), url: this.url, token: this.settings.token, port: this.port, error: this.error, file: this.file, tools: TOOLS.length};
  }
  async setEnabled(enabled) {
    this.settings.enabled = enabled === true;
    if (this.settings.enabled) await this.start(); else await this.stop();
    this.save(); return this.status();
  }
  async regenerateToken() {
    this.settings.token = crypto.randomBytes(24).toString('base64url'); this.save(); return this.status();
  }
  async start() {
    if (this.server || !this.settings.enabled) return this.status();
    this.error = null;
    // The preferred port, then the next nine (a second workspace window takes the next one).
    for (let port = this.settings.port; port < this.settings.port + 10; port++) {
      try { await this.listen(port); this.port = port; break; } catch (error) { if (error.code !== 'EADDRINUSE') { this.error = error.message; break; } }
    }
    if (!this.server && !this.error) this.error = `Ports ${this.settings.port}–${this.settings.port + 9} are busy.`;
    this.save(); return this.status();
  }
  listen(port) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => this.serve(request, response).catch(error => {
        if (!response.headersSent) response.writeHead(500, {'content-type': 'application/json'});
        response.end(JSON.stringify({jsonrpc: '2.0', error: {code: -32603, message: error.message}, id: null}));
      }));
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.off('error', reject); this.server = server; resolve(); });
    });
  }
  async stop() {
    const server = this.server; this.server = null; this.port = null;
    if (server) await new Promise(resolve => server.close(() => resolve()));
    return this.status();
  }

  async serve(request, response) {
    const deny = (status, message) => { response.writeHead(status, {'content-type': 'application/json'}); response.end(JSON.stringify({error: message})); };
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/mcp') return deny(404, 'Not found.');
    if (!localName(request.headers.host)) return deny(403, 'Only local clients may connect.');
    if (request.headers.origin && !localName(new URL(request.headers.origin).host)) return deny(403, 'Web pages may not connect.');
    if (!sameToken(request.headers.authorization, this.settings.token)) return deny(401, 'Missing or wrong RigStick token.');
    if (request.method !== 'POST') return deny(405, 'This server is stateless: POST only.');
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) return deny(413, 'Request too large.'); chunks.push(chunk); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    const server = this.protocolServer();
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
    response.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  protocolServer() {
    const server = new Server({name: 'rigstick', version: this.version}, {capabilities: {tools: {}, prompts: {}},
      instructions: 'RigStick is a stick-figure animation editor. To save tokens, never draw or code effects yourself: read the preset library one kind at a time (rigstick_presets {kind}: objects, moves, motions, camera, effects, stickers, textLooks, textAnimations), add things with rigstick_insert_preset and animate them with rigstick_apply_preset; rigstick_build_scene builds a simple shot in one call. Images you generate can be added with rigstick_add_image. Frames are 1-based; angles are absolute screen degrees (0 right, 90 down). Check work with a small rigstick_render_frame. Every change can be undone with rigstick_undo.'});
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS.map(({name, description, inputSchema, annotations}) => ({name, description, inputSchema, annotations})),
    }));
    server.setRequestHandler(CallToolRequestSchema, async request => this.call(request.params.name, request.params.arguments ?? {}));
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({prompts: PROMPTS.map(({name, description, arguments: args}) => ({name, description, arguments: args}))}));
    server.setRequestHandler(GetPromptRequestSchema, async request => {
      const prompt = PROMPTS.find(item => item.name === request.params.name);
      if (!prompt) throw new Error(`Unknown prompt ${request.params.name}.`);
      return {description: prompt.description, messages: [{role: 'user', content: {type: 'text', text: prompt.text(request.params.arguments ?? {})}}]};
    });
    return server;
  }

  async call(name, args) {
    const tool = TOOLS.find(item => item.name === name);
    const entry = {id: ++this.sequence, tool: name, args, started: Date.now(), status: 'running'};
    this.onActivity({...entry});
    try {
      if (!tool) throw new Error(`Unknown tool ${name}.`);
      const content = await this.callEditor(name, args);
      const result = Array.isArray(content) ? {content} : content;
      this.onActivity({...entry, status: result.isError ? 'error' : 'done', ms: Date.now() - entry.started, summary: summary(result)});
      return result;
    } catch (error) {
      this.onActivity({...entry, status: 'error', ms: Date.now() - entry.started, summary: error.message});
      return {isError: true, content: [{type: 'text', text: error.message}]};
    }
  }
}

function summary(result) {
  const text = result.content?.find(item => item.type === 'text')?.text ?? (result.content?.some(item => item.type === 'image') ? 'Image' : '');
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/** The snippets the AI panel offers, for the clients people use most. */
function clientConfigs({url, token, executable, stdioScript, profile}) {
  const header = `Bearer ${token}`;
  const stdio = {command: executable, args: [stdioScript, '--profile', profile], env: {ELECTRON_RUN_AS_NODE: '1'}};
  return {
    claudeDesktop: JSON.stringify({mcpServers: {rigstick: stdio}}, null, 2),
    claudeCode: `claude mcp add --transport http rigstick ${url} --header "Authorization: ${header}"`,
    geminiCli: JSON.stringify({mcpServers: {rigstick: {httpUrl: url, headers: {Authorization: header}}}}, null, 2),
    generic: JSON.stringify({mcpServers: {rigstick: {type: 'http', url, headers: {Authorization: header}}}}, null, 2),
  };
}

module.exports = {McpHost, clientConfigs, readSettings, DEFAULT_PORT};
