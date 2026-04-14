/**
 * Wrap Claude API calls with request/response logging to stderr.
 *
 * Output is wrapped in GitHub Actions `::group::` markers so it renders
 * as a collapsible section in the workflow logs.
 */

import type Anthropic from "@anthropic-ai/sdk";

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
  } finally {
    console.error("::endgroup::");
  }
}
