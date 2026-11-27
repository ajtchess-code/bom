import test from "node:test";
import assert from "node:assert/strict";
import {
  hasAllowedSecretSantaRole,
  solveSecretSantaMatching,
} from "../../apps/api/dist/secretSantaMatch.js";
import { seasonalVoice } from "../../apps/controller/dist/banterKnowledge.js";
import { parseMusicMessageRequest } from "../../apps/controller/dist/musicMessageParser.js";
import { resolveSmart } from "../../apps/worker/dist/resolver.js";

test("hasAllowedSecretSantaRole allows everyone when allowlist is empty and enforces roles when set", () => {
  assert.equal(hasAllowedSecretSantaRole([], []), true);
  assert.equal(hasAllowedSecretSantaRole(["111"], []), true);
  assert.equal(hasAllowedSecretSantaRole(["111", "222"], ["222", "333"]), true);
  assert.equal(hasAllowedSecretSantaRole(["111"], ["222", "333"]), false);
  assert.equal(hasAllowedSecretSantaRole(undefined, ["222"]), false);
});

test("solveSecretSantaMatching produces valid derangements respecting exclusions and avoiding 2-cycles", () => {
  assert.equal(solveSecretSantaMatching(["a", "b"], []), null);

  const ids = ["u1", "u2", "u3", "u4", "u5", "u6"];
  const exclusions = [
    ["u1", "u2"],
    ["u3", "u4"],
  ];
  for (let trial = 0; trial < 25; trial++) {
    const map = solveSecretSantaMatching(ids, exclusions);
    assert.ok(map, "matching should exist");
    assert.equal(map.size, ids.length);
    const recipients = new Set(map.values());
    assert.equal(recipients.size, ids.length, "bijection");
    for (const [giver, recipient] of map) {
      assert.notEqual(giver, recipient, "no self-match");
      assert.notEqual(map.get(recipient), giver, "avoids 2-cycle for n >= 4");
    }
    assert.notEqual(map.get("u1"), "u2");
    assert.notEqual(map.get("u2"), "u1");
    assert.notEqual(map.get("u3"), "u4");
    assert.notEqual(map.get("u4"), "u3");
  }

  // Unsatisfiable exclusions for 3 participants: u1 cannot match u2 or u3
  assert.equal(
    solveSecretSantaMatching(
      ["u1", "u2", "u3"],
      [
        ["u1", "u2"],
        ["u1", "u3"],
      ],
    ),
    null,
  );
});

test("seasonalVoice activates Jolly Misfit during Christmas season", () => {
  const nov27 = seasonalVoice(new Date("2026-11-27T12:00:00Z"));
  const dec25 = seasonalVoice(new Date("2026-12-25T12:00:00Z"));
  assert.match(nov27, /Jolly Misfit/i);
  assert.match(dec25, /Jolly Misfit/i);
});

test("parseMusicMessageRequest handles plain song and playlist requests in bots channel without commands", () => {
  assert.deepEqual(
    parseMusicMessageRequest({
      content: "Daft Punk Get Lucky",
      isBotsChannel: true,
      isVoiceTextChannel: false,
    }),
    { query: "Daft Punk Get Lucky", isPlaylistRequest: false, source: "natural" },
  );

  assert.deepEqual(
    parseMusicMessageRequest({
      content: "christmas classics playlist",
      isBotsChannel: true,
      isVoiceTextChannel: false,
    }),
    { query: "christmas classics playlist", isPlaylistRequest: true, source: "natural" },
  );

  assert.deepEqual(
    parseMusicMessageRequest({
      content: "check out https://open.spotify.com/playlist/37i9dQZF1DX0Yxoavh5qJV",
      isBotsChannel: true,
      isVoiceTextChannel: false,
    }),
    {
      query: "https://open.spotify.com/playlist/37i9dQZF1DX0Yxoavh5qJV",
      isPlaylistRequest: true,
      source: "url",
    },
  );

  // Ignores bot mentions, other bot commands, and non-music URLs in bots channel
  assert.equal(
    parseMusicMessageRequest({
      content: "<@12345> what is the speed of a constitution?",
      isBotsChannel: true,
      isVoiceTextChannel: false,
      mentionsBot: true,
    }),
    null,
  );
  assert.equal(
    parseMusicMessageRequest({
      content: "!help",
      isBotsChannel: true,
      isVoiceTextChannel: false,
    }),
    null,
  );
  assert.equal(
    parseMusicMessageRequest({
      content: "https://tenor.com/view/pirate-gif-123",
      isBotsChannel: true,
      isVoiceTextChannel: false,
    }),
    null,
  );

  // Voice channel text stays conservative (requires play prefix or link)
  assert.equal(
    parseMusicMessageRequest({
      content: "brb grabbing coffee",
      isBotsChannel: false,
      isVoiceTextChannel: true,
    }),
    null,
  );
  assert.deepEqual(
    parseMusicMessageRequest({
      content: "play sea shanties",
      isBotsChannel: false,
      isVoiceTextChannel: true,
    }),
    { query: "sea shanties", isPlaylistRequest: false, source: "prefix" },
  );
});

test("resolveSmart fast-paths high-confidence YouTube Music matches and builds text playlists", async () => {
  const calls = [];
  const fakeNode = {
    rest: {
      resolve: async (id) => {
        calls.push(id);
        if (id.startsWith("ytmsearch:")) {
          const q = id.slice("ytmsearch:".length);
          return {
            loadType: "search",
            data: [
              {
                encoded: "enc-1",
                info: { identifier: "yt1", title: q, author: "Artist A", length: 210_000, sourceName: "youtube", isStream: false },
              },
              {
                encoded: "enc-2",
                info: { identifier: "yt2", title: `${q} Part 2`, author: "Artist B", length: 195_000, sourceName: "youtube", isStream: false },
              },
              {
                encoded: "enc-3",
                info: { identifier: "yt3", title: `${q} Live Remix`, author: "Artist C", length: 240_000, sourceName: "youtube", isStream: false },
              },
            ],
          };
        }
        return { loadType: "empty", data: [] };
      },
    },
  };

  // High-confidence ytmsearch hit should return in 1 attempt without calling ytsearch/scsearch
  const single = await resolveSmart(fakeNode, "Artist A Bohemian Rhapsody");
  assert.equal(single.selected.encoded, "enc-1");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^ytmsearch:/);

  // Cached hit should make 0 additional calls
  const cached = await resolveSmart(fakeNode, "Artist A Bohemian Rhapsody");
  assert.equal(cached.selected.encoded, "enc-1");
  assert.equal(calls.length, 1);

  // Text playlist request should return selected + remainder tracks
  const pl = await resolveSmart(fakeNode, "playlist:christmas classics");
  assert.equal(pl.resolution.strategy, "text-playlist");
  assert.equal(pl.selected.encoded, "enc-1");
  assert.equal(pl.remainder.length, 2);
});
