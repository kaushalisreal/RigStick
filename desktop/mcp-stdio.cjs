'use strict';
// stdio ⇄ HTTP bridge for MCP clients that launch a command (Claude Desktop and most others).
// Run by the RigStick executable in Node mode:
//   ELECTRON_RUN_AS_NODE=1 RigStick.exe <this file> --profile <userData>
// It reads the running app's address and token from <userData>/mcp.json and forwards every
// message both ways, so the client talks to the open RigStick window. It never opens a window.
const fs = require('node:fs');
const path = require('node:path');
const {StdioServerTransport} = require('@modelcontextprotocol/sdk/server/stdio.js');
const {StreamableHTTPClientTransport} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const argument = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : null; };
const profile = argument('--profile') ?? process.env.RIGSTICK_PROFILE;

function endpoint() {
  if (!profile) throw new Error('Start the bridge with --profile <RigStick user data folder>.');
  const settings = JSON.parse(fs.readFileSync(path.join(profile, 'mcp.json'), 'utf8'));
  if (!settings.url) throw new Error('RigStick is not running, or AI connections are turned off in its AI panel.');
  return settings;
}

async function main() {
  const client = new StdioServerTransport();
  let remote = null, connecting = null;
  const connect = () => connecting ??= (async () => {
    const {url, token} = endpoint();
    const transport = new StreamableHTTPClientTransport(new URL(url), {requestInit: {headers: {Authorization: `Bearer ${token}`}}});
    transport.onmessage = message => client.send(message).catch(() => {});
    transport.onerror = () => {};
    transport.onclose = () => { remote = null; connecting = null; };
    await transport.start(); remote = transport; return transport;
  })().catch(error => { connecting = null; throw error; });

  client.onmessage = async message => {
    try { await (remote ?? await connect()).send(message); }
    catch (error) {
      // A request with nowhere to go gets an answer, so the client shows why instead of hanging.
      remote = null; connecting = null;
      if (message.id !== undefined) await client.send({jsonrpc: '2.0', id: message.id, error: {code: -32000, message: `RigStick: ${error.message}`}});
    }
  };
  client.onclose = () => process.exit(0);
  await client.start();
}

main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exit(1); });
