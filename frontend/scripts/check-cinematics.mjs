import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import ts from 'typescript';

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

const { buildCinematics } = await importTypeScript('../src/components/game/cinematics.ts');
const {
  activeVoteDetail,
  currentSpeaker,
  directorDelay,
  directorTier,
  nextDirectorCursor,
  playerAttention,
  soundForEvent,
} = await importTypeScript('../src/components/game/gameDirector.ts');
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
  event('phase_change', { to: 'sheriff_campaign', round: 1 }),
  event('sheriff_election_result', { result: 'elected', sheriff: 'AI-3' }),
  event('badge_transferred', { from: 'AI-3', to: 'AI-4' }),
  event('player_speech', { speaker: 'AI-4', phase: 'last_words', content: '请相信我的判断。' }),
  event('vote_result', { result: 'eliminated', eliminated: 'AI-10' }),
  event('vote_result', { result: 'tie', candidates: ['AI-5', 'AI-6'] }),
  event('game_end', { winner: 'good', final_round: 4 }),
], { 'AI-10': 'seer' });

assert.deepEqual(
  actions.map(({ kind }) => kind),
  [
    'wolf', 'seer', 'guard', 'witch-heal', 'witch-poison', 'white-wolf',
    'wolf-explode', 'hunter-shot', 'wolf-king', 'idiot', 'sheriff-opening',
    'sheriff', 'badge', 'last-words', 'exile', 'tie', 'victory-good',
  ],
);
assert.equal(actions[0].target, 'AI-8');
assert.match(actions.find(({ kind }) => kind === 'exile').detail, /预言家/);

const voteEvents = [
  event('phase_change', { to: 'voting', round: 2 }),
  event('player_vote', { voter: 'AI-1', target: 'AI-5' }),
  event('player_vote', { voter: 'AI-2', target: 'AI-5' }),
  event('vote_result', {
    result: 'eliminated',
    eliminated: 'AI-5',
    vote_detail: { 'AI-1': 'AI-5', 'AI-2': 'AI-5' },
  }),
  event('phase_change', { to: 'night', round: 3 }),
];
assert.deepEqual(activeVoteDetail(voteEvents), { 'AI-1': 'AI-5', 'AI-2': 'AI-5' });
assert(playerAttention(voteEvents)['AI-5'].includes('targeted'));
assert(playerAttention([
  event('guard_action', { guard: 'AI-1', target: 'AI-6' }),
])['AI-6'].includes('protected'));
assert(playerAttention([
  event('player_death', { player: 'AI-6', cause: 'poison' }),
])['AI-6'].includes('fallen'));
assert.equal(currentSpeaker([event('player_speech', { speaker: 'AI-7' })]), 'AI-7');
assert.equal(currentSpeaker([
  event('player_speech', { speaker: 'AI-7' }),
  event('phase_change', { to: 'voting' }),
]), null);
assert.equal(directorTier(voteEvents[3]), 'climax');
assert(directorDelay(voteEvents[1], 1, true) < directorDelay(voteEvents[3], 1, true));
assert.equal(soundForEvent(voteEvents[3]), 'gavel');
assert.equal(nextDirectorCursor([
  event('werewolf_kill', {}),
  event('werewolf_kill', {}),
  event('seer_investigate', {}),
], 0, true), 2);
console.log('cinematic and director checks passed');
