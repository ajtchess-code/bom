import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import {
  leaveCommandPayload,
  personalRequestPayload,
  musicDeskPayload,
  battleDiplomacyPayload,
} from '../../apps/controller/dist/deskPresentation.js';
import { samePBPanel } from '../../apps/controller/dist/pbPresentation.js';

const source = readFileSync(new URL('../../apps/controller/src/membership.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(
  source.slice(source.indexOf('async function deskMessage('), source.indexOf('function scheduleConsoleMove(')),
);

function harness() {
  const settings = {
    member_console_channel_id: 'channel',
    member_console_message_id: null,
    battle_map_message_id: null,
    music_desk_message_id: null,
  };
  const messages = new Map();
  let seq = 100n;
  let fetchFailure = null;
  let mapFailure = false;
  const events = [];
  function make(id, body, bot = true) {
    return {
      id: String(id),
      system: false,
      author: { bot },
      flags: { bitfield: 32768, has: () => true },
      embeds: [],
      components: body.components,
      attachments: { some: (f) => (body.files ?? []).some((file) => f({ name: file.name })) },
      pinned: false,
      unpin: async () => events.push('unpin'),
      pin: async () => {
        throw Error('Pinning prohibited');
      },
      edit: async (value) => {
        events.push('edit');
        messages.get(String(id)).components = value.components;
      },
      delete: async () => {
        events.push('delete');
        messages.delete(String(id));
      },
    };
  }
  const channel = {
    id: 'channel',
    isTextBased: () => true,
    isDMBased: () => false,
    messages: {
      fetch: async (arg) => {
        if (fetchFailure) throw fetchFailure;
        if (arg.message) {
          const m = messages.get(arg.message);
          if (!m) throw { code: 10008 };
          return m;
        }
        const list = [...messages.values()].filter((m) => !arg.after || BigInt(m.id) > BigInt(arg.after));
        return { some: (f) => list.some(f) };
      },
    },
    send: async (body) => {
      const id = String(++seq);
      const m = make(id, body);
      messages.set(id, m);
      events.push('send');
      return m;
    },
  };
  const deps = {
    settings: async () => settings,
    guildId: 'guild',
    dashboard: 'https://example.test',
    deskBattleMap: async () => {
      if (mapFailure) throw Error('Map offline');
      return { hash: 'fixed', image: Buffer.alloc(0), allianceImage: Buffer.alloc(0), summary: '🟢 Aruba' };
    },
    musicDeskPayload,
    battleDiplomacyPayload,
    samePBPanel,
    isHandledMusicMessage: () => false,
    afterDeskMove: null,
    AttachmentBuilder: class {
      constructor(buf, opts) {
        this.name = opts.name;
      }
    },
    many: async () => [],
    db: {
      query: async (sql, args) => {
        if (sql.includes('member_console_message_id=NULL')) settings.member_console_message_id = null;
        const match = sql.match(/SET (\w+)=\$2/);
        if (match) settings[match[1]] = args[1];
      },
    },
    console: { warn: () => {} },
  };
  const run = Function(...Object.keys(deps), code + ';return refreshMemberConsoleNow;')(...Object.values(deps));
  const client = { guilds: { cache: { get: () => ({ channels: { fetch: async () => channel } }) } } };
  return {
    run: () => run(client, false),
    messages,
    events,
    settings,
    addLegacyDesk: () => {
      const id = String(++seq);
      messages.set(id, make(id, { components: [] }, true));
      settings.member_console_message_id = id;
    },
    addHuman: () => {
      const id = String(++seq);
      messages.set(id, make(id, { components: [] }, false));
    },
    failFetch: (e) => {
      fetchFailure = e;
    },
    failMap: () => {
      mapFailure = true;
    },
  };
}

test('two V2 surfaces (Battle Map above BOM Music) stay ordered and retire legacy Control Desk', async () => {
  const h = harness();
  h.addLegacyDesk();
  await h.run();
  assert.equal(h.settings.member_console_message_id, null);
  assert.equal(h.messages.size, 2);
  assert.ok(BigInt(h.settings.battle_map_message_id) < BigInt(h.settings.music_desk_message_id));
  assert.deepEqual(h.events, ['delete', 'send', 'send']);
  h.events.length = 0;
  for (let n = 0; n < 3; n++) await h.run();
  assert.deepEqual(h.events, []);
  h.addHuman();
  await h.run();
  assert.equal(h.messages.size, 3);
  assert.equal(h.events.filter((x) => x === 'send').length, 2);
  assert.ok(BigInt(h.settings.battle_map_message_id) < BigInt(h.settings.music_desk_message_id));
});

test('manually deleted map is recreated once with BOM Music below it', async () => {
  const h = harness();
  await h.run();
  h.messages.delete(h.settings.battle_map_message_id);
  await h.run();
  assert.equal(h.messages.size, 2);
  assert.ok(BigInt(h.settings.battle_map_message_id) < BigInt(h.settings.music_desk_message_id));
  h.events.length = 0;
  await h.run();
  assert.deepEqual(h.events, []);
});

test('fetch and map failures preserve existing surfaces without duplicates', async () => {
  const h = harness();
  await h.run();
  h.events.length = 0;
  h.failMap();
  await h.run();
  assert.deepEqual(h.events, []);
  h.failFetch({ code: 50013 });
  await assert.rejects(h.run());
  assert.deepEqual(h.events, []);
});

test('Battle Map, BOM Music, /leave, and personal request payloads are valid V2 surfaces', () => {
  const map = battleDiplomacyPayload('Summary', 'map.png', 'chart.png', 'https://example.test');
  assert.equal(map.components[0].components.find((c) => c.type === 12).items.length, 2);
  assert.ok(JSON.stringify(map).includes('Detailed Battle Map'));

  const music = JSON.stringify(musicDeskPayload('https://example.test'));
  assert.ok(music.includes('Request Music'));
  assert.ok(music.includes('no command needed'));

  const leave = JSON.stringify(leaveCommandPayload('https://example.test', true));
  assert.ok(leave.includes('membership:leave:choose'));
  assert.ok(leave.includes('membership:leave:return'));
  assert.ok(leave.includes('membership:leave:view'));

  for (const kind of ['role', 'emoji', 'animated_emoji', 'sticker', 'soundboard']) {
    const req = JSON.stringify(personalRequestPayload(kind, 'https://example.test'));
    assert.ok(req.includes('https://example.test/dashboard/members'));
  }
});
