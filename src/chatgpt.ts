import { readStoredCredential } from "./auth.ts";
import type { StoredCredential } from "./auth.ts";
import type { ChatGPTSubscriptionUsage } from "./types.ts";

export const CHATGPT_PROVIDER = "openai";
export const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";

/** Metadata-only detection. No token is sent to a quota endpoint or stored in the snapshot. */
export function chatGPTSubscriptionFromCredential(credential: StoredCredential | undefined): ChatGPTSubscriptionUsage | undefined {
	if (credential?.type !== "oauth" || !credential.access) return undefined;
	let scopes = credential.scopes;
	if (!scopes) {
		try {
			// Decode solely to classify the locally stored credential format, not to validate identity.
			const claims = JSON.parse(Buffer.from(credential.access.split(".")[1] ?? "", "base64url").toString("utf8"));
			if (claims.aud !== "https://api.openai.com/v1" || typeof claims.scope !== "string") return undefined;
			scopes = claims.scope.split(/\s+/);
		} catch { return undefined; }
	}
	const connection = !scopes?.includes(PLAN_SCOPE)
		? "plan_disabled"
		: typeof credential.expires === "number" && Date.now() >= credential.expires
			? "refresh_needed" : "signed_in";
	return { connection, quotaAvailable: false, manageUrl: CHATGPT_USAGE_URL };
}

export async function getChatGPTSubscription(): Promise<ChatGPTSubscriptionUsage | undefined> {
	return chatGPTSubscriptionFromCredential(await readStoredCredential(CHATGPT_PROVIDER));
}

/** Explicit API error codes only; a generic HTTP 429 does not establish plan exhaustion. */
export function updateChatGPTRequestStatus(usage: ChatGPTSubscriptionUsage, message: unknown): ChatGPTSubscriptionUsage {
	const value = message as {role?: string; provider?: string; stopReason?: string; errorMessage?: string};
	if (value?.role !== "assistant" || value.provider !== CHATGPT_PROVIDER) return usage;
	if (value.errorMessage?.includes("subscription_sharing_usage_limit_exceeded")) return {...usage, lastRequest: "limit_reached"};
	if (value.errorMessage?.includes("subscription_sharing_usage_unavailable")) return {...usage, lastRequest: "unavailable"};
	if (value.stopReason && !["error", "aborted"].includes(value.stopReason)) return {...usage, lastRequest: "succeeded"};
	return usage;
}
