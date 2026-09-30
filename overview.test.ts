import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import extension from "./overview.ts";
import { cacheSummary, OverviewPanel } from "./overview-panel.ts";
import { collectUsageData } from "./history/data.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text, bg: (_color: string, text: string) => text } as Theme;

test("one package registers four unique commands and one quota lifecycle", () => {
 const commands = new Map();
 const events: string[] = [];
 extension({
  registerCommand: (name: string, value: unknown) => { assert(!commands.has(name)); commands.set(name, value); },
  registerFlag: () => {},
  getFlag: () => false,
  on: (event: string) => { events.push(event); return () => {}; },
 } as unknown as ExtensionAPI);
 assert.deepEqual([...commands.keys()].sort(), ["history", "overview", "quota", "usage"]);
 assert.equal(events.filter(event => event === "session_start").length, 1);
 assert.equal(events.filter(event => event === "after_provider_response").length, 1);
});

test("cache share includes cache creation and has an explicit empty state", () => {
 assert.match(cacheSummary({input: 100, output: 100, cacheRead: 600, cacheWrite: 300, total: 1100}), /60\.0%/);
 assert.match(cacheSummary({input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}), /n\/a/);
});

test("real JSONL history, warm cache, combined quota view, viewport, and cleanup", async () => {
 const dir = await mkdtemp(join(tmpdir(), "pi-overview-test-"));
 const sessionsDir = join(dir, "sessions");
 const cachePath = join(dir, "cache.json");
 try {
  await mkdir(sessionsDir);
  const time = new Date().toISOString();
  const record = {type: "message", id: "message-1", timestamp: time, message: {role: "assistant", timestamp: Date.now(), provider: "openai-codex", model: "test-model", content: [{type: "text", text: "fixture"}], usage: {input: 100, output: 100, cacheRead: 600, cacheWrite: 300, totalTokens: 1100, cost: {input: .01, output: .01, cacheRead: .01, cacheWrite: .01, total: .04}}}};
  await writeFile(join(sessionsDir, "test.jsonl"), [JSON.stringify({type: "session", id: "test-session", timestamp: time, cwd: dir}), JSON.stringify(record)].join("\n") + "\n");
  const data = await collectUsageData({sessionsDir, cachePath});
  assert(data);
  assert.equal(data.allTime.totals.tokens.cacheRead, 600);
  assert.equal(data.allTime.totals.messages, 1);
  let parsed = -1;
  const warm = await collectUsageData({sessionsDir, cachePath, onProgress: progress => { parsed = progress.filesToParse; }});
  assert(warm);
  assert.equal(parsed, 0);
  let unsubscribed = false;
  let quotaUpdate = () => {};
  let rows = 100;
  const panel = new OverviewPanel({theme, data,
   snapshot: () => ({subscriptions: [], codex: {planType: "plus", activeLimit: "premium", primaryUsedPercent: 42, primaryWindowMinutes: 300, primaryResetAt: Math.floor(Date.now()/1000) + 3000, rateLimited: false, secondaryWindowMinutes: 10080, primaryResetAfterSeconds: 3000, secondaryResetAfterSeconds: 0, secondaryResetAt: 0, primaryOverSecondaryLimitPercent: 0, creditsHasCredits: false, creditsBalance: "", creditsUnlimited: false}}),
   loading: () => false, rows: () => rows, requestRender: () => {}, done: () => {},
   refresh: async () => warm,
   subscribe: listener => { quotaUpdate = listener; return () => { unsubscribed = true; }; },
  });
  try {
   quotaUpdate();
   const full = panel.render(120).join("\n");
   assert.match(full, /openai-codex/);
   assert.match(full, /Cache read 600/);
   assert.match(full, /42%/);
   assert.match(full, /quotas cached/);
   assert.match(full, /separate from subscription fees/);
   rows = 24;
   for (const width of [1, 20, 60, 100]) {
    const lines = panel.render(width);
    assert(lines.length <= rows);
    assert(lines.every(line => visibleWidth(line) <= width));
   }
   panel.handleInput("k");
   assert.match(panel.render(100).join("\n"), /ACCOUNT QUOTAS/);
   panel.handleInput("h");
   assert.match(panel.render(100).join("\n"), /openai-codex/);
  } finally { panel.dispose(); }
  assert(unsubscribed);
 } finally { await rm(dir, {recursive: true, force: true}); }
});
