/** Test/inspection helper for native container payloads and historical JSON. */
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';

export async function readNativeDocument(filename) {
  const bytes = await readFile(filename), magic = bytes.subarray(0, 4).toString('ascii');
  if (!['RIGS', 'STKZ', 'STMV'].includes(magic)) return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const kind = magic === 'RIGS' ? 'rigs' : magic === 'STKZ' ? 'stkz' : 'rigsmov';
  const {decodeDocument} = await import('../src/native-container.mjs');
  return (await decodeDocument(bytes, kind)).document;
}
