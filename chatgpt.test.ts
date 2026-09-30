import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chatGPTSubscriptionFromCredential, getChatGPTSubscription, updateChatGPTRequestStatus } from "./src/chatgpt.ts";
import { buildUsageWidget, updateFooterStatus } from "./src/render.ts";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { UsageContext } from "./src/types.ts";
import quotaExtension from "./index.ts";

const credential = {type: "oauth" as const, access: "fixture-only", scopes: ["chatgpt.tokens.use.direct"], expires: Date.now() + 60_000};
const theme = {fg: (_color: string, text: string) => text, bold: (text: string) => text} as Theme;

test("new ChatGPT login is distinct from API keys and old Codex credentials", () => {
 const state = chatGPTSubscriptionFromCredential(credential);
 assert.equal(state?.connection, "signed_in");
 assert.equal(state?.quotaAvailable, false);
 assert.equal(chatGPTSubscriptionFromCredential({type: "api_key", key: "fixture"}), undefined);
 assert.equal(chatGPTSubscriptionFromCredential({type: "oauth", access: "legacy-token"}), undefined);
 assert.equal(chatGPTSubscriptionFromCredential({...credential, expires: 1})?.connection, "refresh_needed");
 assert.equal(chatGPTSubscriptionFromCredential({...credential, scopes: ["openid"]})?.connection, "plan_disabled");
 assert(!JSON.stringify(state).includes(credential.access));
});

test("older stored metadata can classify the new JWT format without inventing a plan tier", () => {
 const token = `header.${Buffer.from(JSON.stringify({aud: "https://api.openai.com/v1", scope: "openid chatgpt.tokens.use.direct", "https://api.openai.com/auth": {encrypted_auth_metadata: "opaque"}})).toString("base64url")}.signature`;
 assert.equal(chatGPTSubscriptionFromCredential({type: "oauth", access: token})?.connection, "signed_in");
 const wrongAudience = `header.${Buffer.from(JSON.stringify({aud: "https://example.com", scope: "chatgpt.tokens.use.direct"})).toString("base64url")}.signature`;
 assert.equal(chatGPTSubscriptionFromCredential({type: "oauth", access: wrongAudience}), undefined);
});

test("direct login renders explicit unavailable quotas beside separate Codex data", () => {
 const chatgpt = chatGPTSubscriptionFromCredential(credential)!;
 const snapshot = {chatgpt, subscriptions: []};
 const text = buildUsageWidget(snapshot, theme, false).join("\n");
 assert.match(text, /ChatGPT plan.*signed in/);
 assert.match(text, /plan tier: unavailable/);
 assert.match(text, /https:\/\/chatgpt.com\/settings\/usage/);
 assert(!text.includes("0%"));
 let footer = "";
 updateFooterStatus({hasUI: true, ui: {theme, setStatus: (_key: string, value?: string) => {footer = value ?? "";}}} as unknown as UsageContext, snapshot);
 assert.match(footer, /ChatGPT:signed in; quota n\/a/);
});

test("only explicit subscription errors establish plan exhaustion", () => {
 const current = chatGPTSubscriptionFromCredential(credential)!;
 assert.equal(updateChatGPTRequestStatus(current, {role: "assistant", provider: "openai", stopReason: "error", errorMessage: "429 request rate limit"}), current);
 assert.equal(updateChatGPTRequestStatus(current, {role: "assistant", provider: "openai", stopReason: "error", errorMessage: "subscription_sharing_usage_limit_exceeded"}).lastRequest, "limit_reached");
 assert.equal(updateChatGPTRequestStatus(current, {role: "assistant", provider: "openai", stopReason: "stop"}).lastRequest, "succeeded");
});

test("actual stored openai login reaches monitor snapshot with no token transmission", async () => {
 const dir = mkdtempSync(join(tmpdir(), "pi-overview-chatgpt-"));
 const previous = process.env.PI_CODING_AGENT_DIR;
 const previousFetch = globalThis.fetch;
 try {
  process.env.PI_CODING_AGENT_DIR = dir;
  writeFileSync(join(dir, "auth.json"), JSON.stringify({openai: credential}));
  let requests = 0;
  globalThis.fetch = async () => {requests++; throw Error("Unexpected network request");};
  assert.equal((await getChatGPTSubscription())?.connection, "signed_in");
  const monitor = quotaExtension({registerFlag: () => {}, getFlag: () => false, on: () => () => {}, registerCommand: () => {}} as any, {silent: true});
  await monitor.refresh({hasUI: true, cwd: dir, modelRegistry: {getProviderAuth: async () => undefined, getProvider: () => undefined}, ui: {theme, setStatus: () => {}, setWidget: () => {}, notify: () => {}}} as unknown as UsageContext);
  assert.equal(monitor.snapshot().chatgpt?.connection, "signed_in");
  assert.equal(monitor.snapshot().codex, undefined);
  assert.equal(requests, 0);
 } finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
  globalThis.fetch = previousFetch;
  rmSync(dir, {recursive: true, force: true});
 }
});
