/**
 * Shared Anthropic client + logged API calls + error classification.
 *
 * The client is configured for resilience against rate-limit (429) and
 * overload (529) errors. The SDK retries those automatically with
 * exponential backoff and honors the `retry-after` header; we bump
 * maxRetries well above the default of 2 so that bursty TPM ceilings
 * and transient capacity blips don't fail a whole stage.
 *
 * Output is wrapped in GitHub Actions `::group::` markers so it renders
 * as a collapsible section in the workflow logs.
 */

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-4-6";

export function createClient(): Anthropic {
  return new Anthropic({
    maxRetries: 8,
    // Per-attempt timeout (the SDK resets it on each retry). Long enough
    // to absorb `retry-after` waits from 429s and slow responses.
    timeout: 300_000,
  });
}

/**
 * Wrap a Claude API call with request/response logging and typed error
 * reporting. Errors are logged with their type/status, then re-thrown so
 * the caller can decide whether to skip the item or abort the stage.
 */
export async function loggedCreate(
  client: Anthropic,
  label: string,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  console.error(`::group::Claude call — ${label}`);
  console.error("--- Request ---");
  console.error(JSON.stringify(params, null, 2));
  try {
    const response = await client.messages.create(params);
    console.error("--- Response ---");
    console.error(JSON.stringify(response, null, 2));
    return response;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error(`Rate-limited (429) after retries for ${label}: ${err.message}`);
    } else if (err instanceof Anthropic.APIError) {
      console.error(
        `API error ${err.status ?? "?"} (${err.name}) for ${label}: ${err.message}`,
      );
    } else {
      console.error(`Non-API error for ${label}:`, err);
    }
    throw err;
  } finally {
    console.error("::endgroup::");
  }
}

/**
 * True for errors that represent transient capacity problems — rate
 * limits, overload, 5xx. Stages use this to decide: transient → log and
 * skip the item; otherwise → rethrow and abort.
 */
export function isTransientApiError(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) return true;
    if (typeof err.status === "number" && err.status >= 500) return true;
  }
  return false;
}
