/**
 * RigStick's AI layer: the Moves keyframe builder (src/ai/moves.mjs) and the MCP server's
 * transport rules and routing (desktop/mcp-server.cjs), over a real loopback HTTP request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildMove, resolveRoles, MOVES} from '../src/ai/moves.mjs';

const require = createRequire(import.meta.url);
const {McpHost, clientConfigs} = require('../desktop/mcp-server.cjs');
const {TOOLS, PROMPTS, MOVES: CATALOG_MOVES} = require('../desktop/ai-tool-catalog.cjs');

const STOCK = ['Torso', 'Head', 'Left upper arm', 'Left forearm', 'Right upper arm', 'Right forearm', 'Left thigh', 'Left lower leg', 'Right thigh', 'Right lower leg'].map(name => ({name}));

test('moves map body roles onto the stock figure by joint name', () => {
  assert.deepEqual(resolveRoles(STOCK), {head: 1, torso: 0, armAUpper: 2, armALower: 3, armBUpper: 4, armBLower: 5, legAUpper: 6, legALower: 7, legBUpper: 8, legBLower: 9});
  assert.deepEqual(resolveRoles([{name: 'Tail'}, {name: 'Wing'}]), {});
});

test('every move builds ordered keys on distinct frames within its length', () => {
  assert.deepEqual(MOVES, CATALOG_MOVES, 'the MCP catalogue offers exactly the moves the builder knows');
  for (const move of MOVES) {
    const {frames, keys} = buildMove(move, {fps: 24, seconds: 1.5});
    assert.ok(keys.length >= 2, move);
    assert.equal(keys[0].frame, 0, move);
    assert.ok(keys.at(-1).frame <= frames - 1, move);
    assert.deepEqual(keys.map(key => key.frame), [...new Set(keys.map(key => key.frame))].sort((a, b) => a - b), move);
    for (const key of keys) for (const value of Object.values(key.joints)) assert.ok(Number.isFinite(value), move);
  }
  assert.throws(() => buildMove('moonwalk'), /Unknown move/);
});

test('facing left mirrors angles and travel', () => {
  const right = buildMove('walk', {fps: 24, seconds: 2, distance: 200}), left = buildMove('walk', {fps: 24, seconds: 2, distance: 200, direction: 'left'});
  assert.equal(right.keys.at(-1).dx, 200); assert.equal(left.keys.at(-1).dx, -200);
  for (const [index, key] of right.keys.entries()) for (const [role, degrees] of Object.entries(key.joints)) assert.equal(left.keys[index].joints[role], 180 - degrees);
});

test('the catalogue is plain JSON Schema with unique names, and prompts render text', () => {
  assert.equal(new Set(TOOLS.map(tool => tool.name)).size, TOOLS.length);
  for (const tool of TOOLS) { assert.equal(tool.inputSchema.type, 'object'); assert.equal(tool.where, 'editor'); assert.ok(tool.description.length > 20, tool.name); }
  for (const prompt of PROMPTS) assert.match(prompt.text({idea: 'x', topic: 'y', figure: 1}), /\S/);
});

test('the MCP server refuses missing tokens and web origins, and routes tools to the editor', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rigstick-mcp-'));
  const calls = [], activity = [];
  const host = new McpHost({directory, version: '0.0.0-test', onActivity: entry => activity.push(entry),
    callEditor: async (name, args) => { calls.push([name, args]); return [{type: 'text', text: `ok ${name}`}]; }});
  host.settings.port = 47900 + Math.floor(Math.random() * 90);
  await host.start();
  t.after(async () => { await host.stop(); fs.rmSync(directory, {recursive: true, force: true}); });
  const {url, token} = host.status();
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  const rpc = (body, headers = {}) => fetch(url, {method: 'POST', body: JSON.stringify(body),
    headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers}});
  assert.equal((await rpc({})).status, 401);
  assert.equal((await rpc({}, {authorization: 'Bearer wrong'})).status, 401);
  assert.equal((await rpc({}, {authorization: `Bearer ${token}`, origin: 'https://evil.example'})).status, 403);
  const auth = {authorization: `Bearer ${token}`};
  const init = await rpc({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '1'}}}, auth);
  assert.equal(init.status, 200);
  assert.equal((await init.json()).result.serverInfo.name, 'rigstick');
  const list = await (await rpc({jsonrpc: '2.0', id: 2, method: 'tools/list'}, auth)).json();
  assert.deepEqual(list.result.tools.map(tool => tool.name), TOOLS.map(tool => tool.name));
  const called = await (await rpc({jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name: 'rigstick_get_project', arguments: {}}}, auth)).json();
  assert.equal(called.result.content[0].text, 'ok rigstick_get_project');
  assert.deepEqual(calls, [['rigstick_get_project', {}]]);
  assert.deepEqual(activity.map(entry => entry.status), ['running', 'done']);
  const unknown = await (await rpc({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'nope', arguments: {}}}, auth)).json();
  assert.equal(unknown.result.isError, true);
  const settings = JSON.parse(fs.readFileSync(path.join(directory, 'mcp.json'), 'utf8'));
  assert.equal(settings.url, url); assert.equal(settings.token, token);
  const configs = clientConfigs({url, token, executable: 'RigStick.exe', stdioScript: 'mcp-stdio.cjs', profile: directory});
  assert.match(configs.claudeCode, /^claude mcp add --transport http rigstick /);
  assert.equal(JSON.parse(configs.claudeDesktop).mcpServers.rigstick.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(JSON.parse(configs.geminiCli).mcpServers.rigstick.httpUrl, url);
});
