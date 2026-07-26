import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/game/cinematics.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildCinematics } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
);
const event = (event_type, data) => ({ event_type, data, timestamp: '2026-07-27T00:00:00Z' });
const actions = buildCinematics([
  event('werewolf_kill', { killer: 'AI-1', target: 'AI-8' }),
  event('werewolf_kill', { killer: 'AI-2', target: 'AI-8' }),
  event('seer_investigate', { seer: 'AI-3', target: 'AI-1', result: '狼人' }),
  event('guard_action', { guard: 'AI-4', target: 'AI-3' }),
  event('witch_heal', { witch: 'AI-5', target: 'AI-8' }),
  event('witch_poison', { witch: 'AI-5', target: 'AI-2' }),
  event('white_wolf_king_self_destruct', { player: 'AI-6', target: 'AI-3' }),
  event('wolf_self_destruct', { player: 'AI-1' }),
  event('player_death', { player: 'AI-2', shooter: 'AI-7', cause: 'hunter_shot' }),
  event('player_death', { player: 'AI-7', shooter: 'AI-8', cause: 'wolf_king_shot' }),
  event('vote_result', { player: 'AI-9', result: 'idiot_revealed' }),
]);

assert.deepEqual(
  actions.map(({ kind }) => kind),
  ['wolf', 'seer', 'guard', 'witch-heal', 'witch-poison', 'white-wolf', 'wolf-explode', 'hunter-shot', 'wolf-king', 'idiot'],
);
assert.equal(actions[0].target, 'AI-8');
console.log('cinematic mapping check passed');
