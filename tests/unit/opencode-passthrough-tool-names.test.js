/**
 * OpenCode free fingerprint: the response side must undo the request-side
 * alias (shell → shell_client, read → read_client).
 *
 * translateResponse() restores names for translated streams and the
 * non-streaming handlers restore them too, but a stream whose client format
 * equals the provider format never reaches translateResponse(): chatCore's
 * streamingHandler falls back to createPassthroughStreamWithLogger(), which
 * forwarded bytes verbatim. An OpenCode client then received a function_call
 * for "shell_client" — a tool it never declared — and failed the tool call.
 * These tests pin the passthrough restore (stream.js) and the wiring that
 * hands the rename map to it (streamingHandler.js).
 */

import { describe, it, expect, vi } from "vitest";

// requestDetail.js / stream.js / streamingHandler.js all go through the DB helper.
vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
  trackPendingRequest: vi.fn(() => {}),
}));

const { createPassthroughStreamWithLogger } = await import("../../open-sse/utils/stream.js");
const { handleStreamingResponse } = await import("../../open-sse/handlers/chatCore/streamingHandler.js");

const FINGERPRINT_MAP = new Map([["shell_client", "shell"], ["read_client", "read"]]);
const CLOAK_MAP = new Map([["Bash_ide", "Bash"]]);

const CHAT_TOOL_CALL = [
  `data: ${JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1760000000,
    model: "mimo-v2.6-flash-free",
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "shell_client", arguments: "" } }] } }],
  })}`,
  `data: ${JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1760000000,
    model: "mimo-v2.6-flash-free",
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
  })}`,
  "data: [DONE]",
  "",
].join("\n");

const CLAUDE_TOOL_USE = [
  `event: content_block_start`,
  `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "Bash_ide", input: {} } })}`,
  "",
].join("\n");

async function readAll(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function runPassthrough(input, toolNameMap) {
  const encoder = new TextEncoder();
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });
  const output = source.pipeThrough(
    createPassthroughStreamWithLogger("opencode", null, "mimo-v2.6-flash-free", null, { stream: true }, null, null, toolNameMap),
  );
  return readAll(output);
}

function makeController() {
  let connected = true;
  return {
    signal: new AbortController().signal,
    startTime: Date.now(),
    isConnected: () => connected,
    handleComplete: () => { connected = false; },
    handleError: () => { connected = false; },
    handleDisconnect: () => { connected = false; },
    abort: () => { connected = false; },
  };
}

describe("same-format (passthrough) streaming restores aliased tool names", () => {
  it("rewrites an OpenCode fingerprint alias back to the caller's tool", async () => {
    const out = await runPassthrough(CHAT_TOOL_CALL, FINGERPRINT_MAP);

    expect(out).toContain('"name":"shell"');
    expect(out).not.toContain("shell_client");
    // the terminal sentinel still reaches the client
    expect(out).toContain("data: [DONE]");
  });

  it("leaves the alias alone when no rename map applies", async () => {
    const out = await runPassthrough(CHAT_TOOL_CALL, null);

    expect(out).toContain('"name":"shell_client"');
  });

  it("restores a Claude-cloaked tool_use name in the same-format path", async () => {
    const out = await runPassthrough(CLAUDE_TOOL_USE, CLOAK_MAP);

    expect(out).toContain('"name":"Bash"');
    expect(out).not.toContain("Bash_ide");
  });

  it("does not touch chunks that carry no aliased name", async () => {
    const input = `data: {"id":"chatcmpl-9","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n`;
    const out = await runPassthrough(input, FINGERPRINT_MAP);

    expect(out).toContain('"content":"hi"');
    expect(out).not.toContain("shell");
  });
});

describe("streamingHandler hands the rename map to the passthrough stream", () => {
  it("does not leak shell_client to a same-format (openai → openai) client", async () => {
    const providerResponse = new Response(CHAT_TOOL_CALL, {
      headers: { "content-type": "text/event-stream" },
    });

    const result = await handleStreamingResponse({
      providerResponse,
      provider: "opencode",
      model: "mimo-v2.6-flash-free",
      sourceFormat: "openai",
      targetFormat: "openai",
      userAgent: "opencode/2.0.26/cli",
      body: { stream: true },
      stream: true,
      translatedBody: null,
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "c1",
      apiKey: null,
      clientRawRequest: null,
      onRequestSuccess: null,
      reqLogger: null,
      toolNameMap: FINGERPRINT_MAP,
      customToolNames: null,
      streamController: makeController(),
      onStreamComplete: null,
      streamDetailId: "d1",
      pxpipe: null,
      reqTag: "t",
      log: null,
      credentials: null,
    });

    expect(result.success).toBe(true);
    const text = await readAll(result.response.body);

    expect(text).toContain('"name":"shell"');
    expect(text).not.toContain("shell_client");
  });
});
