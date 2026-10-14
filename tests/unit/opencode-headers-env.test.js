import { describe, it, expect, afterEach, vi } from "vitest";

// OPENCODE_* env vars (config/runtimeConfig.js) retune the OpenCode free-tier
// fingerprint without a rebuild — the gate moved twice in three days
// (/zen/v1 -> /inference/v1, v1 UA -> v2 UA, placeholder tools -> official
// read/shell). The executors own the semantics (passthrough vs pinned, v1/v2
// validity); an env value only ever overrides.

async function load(env = {}) {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const runtimeConfig = await import("../../open-sse/config/runtimeConfig.js");
  const { OpenCodeExecutor } = await import("../../open-sse/executors/opencode.js");
  const registry = (await import("../../open-sse/providers/registry/opencode.js")).default;
  return { runtimeConfig, OpenCodeExecutor, registry };
}

function buildHeaders(executor, rawHeaders = {}) {
  const model = "mimo-v2.6-flash-free";
  const body = { model, messages: [{ role: "user", content: "x" }], max_tokens: 8 };
  const creds = executor.prepareRequestCredentials({ body, credentials: { rawHeaders } });
  return executor.buildHeaders(creds, true, executor.buildUrl(model), model);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("OpenCode free fingerprint — defaults (no env set)", () => {
  it("keeps a valid downstream v2 UA and falls back to the v2 shape otherwise", async () => {
    const { OpenCodeExecutor } = await load();
    const ex = new OpenCodeExecutor();
    expect(buildHeaders(ex, { "user-agent": "opencode/latest/2.0.28/cli" })["User-Agent"])
      .toBe("opencode/latest/2.0.28/cli");
    expect(buildHeaders(ex, { "user-agent": "curl/8.0" })["User-Agent"])
      .toBe("opencode/latest/2.0.26/cli");
    expect(buildHeaders(ex, {})["User-Agent"]).toBe("opencode/latest/2.0.26/cli");
  });

  it("keeps the built-in /inference/v1 paths and passes the client header through", async () => {
    const { OpenCodeExecutor } = await load();
    const ex = new OpenCodeExecutor();
    expect(ex.buildUrl("mimo-v2.6-flash-free")).toBe("https://opencode.ai/inference/v1/chat/completions");
    expect(ex.buildUrl("muse-spark-1.3-contributor-free")).toBe("https://opencode.ai/inference/v1/responses");
    expect(buildHeaders(ex, { "x-opencode-client": "desktop" })["x-opencode-client"]).toBe("desktop");
    expect(buildHeaders(ex, {})["x-opencode-client"]).toBe("cli");
    // session contract untouched by the overrides
    const h = buildHeaders(ex, {});
    expect(h["x-opencode-session-id"]).toBe(h["x-opencode-session"]);
    expect(h["x-opencode-request"]).toBeUndefined();
  });
});

describe("OPENCODE_UA_MODE / OPENCODE_UA", () => {
  it("pinned mode sends OPENCODE_UA whatever the client claims", async () => {
    const { OpenCodeExecutor } = await load({
      OPENCODE_UA_MODE: "pinned",
      OPENCODE_UA: "opencode/stable/9.9.9/cli",
    });
    const ex = new OpenCodeExecutor();
    expect(buildHeaders(ex, { "user-agent": "opencode/latest/2.0.28/cli" })["User-Agent"])
      .toBe("opencode/stable/9.9.9/cli");
  });

  it("an explicit OPENCODE_UA wins even in passthrough mode", async () => {
    const { OpenCodeExecutor } = await load({ OPENCODE_UA: "opencode/stable/9.9.9/cli" });
    const ex = new OpenCodeExecutor();
    expect(buildHeaders(ex, { "user-agent": "opencode/latest/2.0.28/cli" })["User-Agent"])
      .toBe("opencode/stable/9.9.9/cli");
  });
});

describe("OPENCODE_ENDPOINT / OPENCODE_CLIENT", () => {
  it("replaces the free-lane base when the gate moves again", async () => {
    const { OpenCodeExecutor } = await load({ OPENCODE_ENDPOINT: "https://opencode.ai/zen/v1" });
    const ex = new OpenCodeExecutor();
    expect(ex.buildUrl("mimo-v2.6-flash-free")).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(ex.buildUrl("muse-spark-1.3-contributor-free")).toBe("https://opencode.ai/zen/v1/responses");
    expect(ex.buildUrl("union-alpha")).toBe("https://opencode.ai/zen/v1/messages");
  });

  it("OPENCODE_CLIENT overrides the downstream client header", async () => {
    const { OpenCodeExecutor } = await load({ OPENCODE_CLIENT: "desktop" });
    const ex = new OpenCodeExecutor();
    expect(buildHeaders(ex, { "x-opencode-client": "cli" })["x-opencode-client"]).toBe("desktop");
    expect(buildHeaders(ex, {})["x-opencode-client"]).toBe("desktop");
  });
});

describe("OPENCODE_DROP_HEADERS / OPENCODE_EXTRA_HEADERS", () => {
  it("strips dropped headers and merges extras last", async () => {
    const { OpenCodeExecutor } = await load({
      OPENCODE_DROP_HEADERS: "x-opencode-project , x-session-affinity",
      OPENCODE_EXTRA_HEADERS: '{"x-probe":"on"}',
    });
    const ex = new OpenCodeExecutor();
    const h = buildHeaders(ex, {});
    expect(h["x-opencode-project"]).toBeUndefined();
    expect(h["x-session-affinity"]).toBeUndefined();
    expect(h["x-probe"]).toBe("on");
    // untouched otherwise
    expect(h["x-opencode-session-id"]).toBe(h["x-opencode-session"]);
  });

  it("an extra header can re-add what was dropped (merge runs last)", async () => {
    const { OpenCodeExecutor } = await load({
      OPENCODE_DROP_HEADERS: "x-opencode-project",
      OPENCODE_EXTRA_HEADERS: '{"x-opencode-project":"forced"}',
    });
    const ex = new OpenCodeExecutor();
    expect(buildHeaders(ex, {})["x-opencode-project"]).toBe("forced");
  });
});

describe("registry + diagnostics", () => {
  it("systemoneConfig follows the client/UA overrides", async () => {
    const { registry } = await load({ OPENCODE_CLIENT: "desktop", OPENCODE_UA: "opencode/stable/9.9.9/cli" });
    expect(registry.systemoneConfig.headers["x-opencode-client"]).toBe("desktop");
    expect(registry.systemoneConfig.headers["User-Agent"]).toBe("opencode/stable/9.9.9/cli");
    const { registry: defaults } = await load();
    expect(defaults.systemoneConfig.headers["x-opencode-client"]).toBe("cli");
    expect(defaults.systemoneConfig.headers["User-Agent"]).toBe("opencode/1.18.35");
  });

  it("describeOpenCodeFreeTransport reports the effective fingerprint", async () => {
    const { runtimeConfig } = await load({
      OPENCODE_ENDPOINT: "https://opencode.ai/zen/v1",
      OPENCODE_UA_MODE: "pinned",
      OPENCODE_DROP_HEADERS: "x-opencode-request",
    });
    const line = runtimeConfig.describeOpenCodeFreeTransport("https://opencode.ai/zen/v1/chat/completions");
    expect(line).toContain("endpoint=https://opencode.ai/zen/v1");
    expect(line).toContain("uaMode=pinned");
    expect(line).toContain("drop=[x-opencode-request]");
    expect(line).toContain("url=https://opencode.ai/zen/v1/chat/completions");
  });
});

describe("live process.env (the dashboard writes at runtime)", () => {
  it("applies a change to the next buildUrl/buildHeaders without a module reload", async () => {
    const { OpenCodeExecutor, runtimeConfig } = await load();
    const ex = new OpenCodeExecutor();
    expect(ex.buildUrl("mimo-v2.6-flash-free")).toContain("/inference/v1/");
    process.env.OPENCODE_ENDPOINT = "https://opencode.ai/zen/v1";
    try {
      expect(runtimeConfig.OPENCODE_FREE.endpoint).toBe("https://opencode.ai/zen/v1");
      expect(ex.buildUrl("mimo-v2.6-flash-free")).toBe("https://opencode.ai/zen/v1/chat/completions");
      expect(buildHeaders(ex, {})["x-opencode-project"]).toBe("global");
    } finally {
      delete process.env.OPENCODE_ENDPOINT;
    }
  });
});

describe("applyOpenCodeFreeEnv (dashboard settings → process.env)", () => {
  it("overrides, leaves .env values alone when unset, clears only what it managed", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("DATA_DIR", "/tmp/opencode/test-data-opencode-env");
    process.env.OPENCODE_ENDPOINT = "https://from-dotenv.example/v1";
    const { applyOpenCodeFreeEnv } = await import("../../src/lib/opencodeFreeEnv.js");

    // A persisted value overrides the boot value and is remembered as managed.
    applyOpenCodeFreeEnv({ openCodeEndpoint: "https://managed.example/v1", openCodeUaMode: "pinned" });
    expect(process.env.OPENCODE_ENDPOINT).toBe("https://managed.example/v1");
    expect(process.env.OPENCODE_UA_MODE).toBe("pinned");
    expect(process.env.OPENCODE_FREE_MANAGED).toContain("OPENCODE_ENDPOINT");

    // undefined = never touched by the dashboard → clearing must NOT drop the .env value.
    applyOpenCodeFreeEnv({ openCodeEndpoint: undefined });
    expect(process.env.OPENCODE_ENDPOINT).toBe("https://managed.example/v1");

    // Explicit empty = user reset → restore the boot (.env) value we overwrote.
    applyOpenCodeFreeEnv({ openCodeEndpoint: "" });
    expect(process.env.OPENCODE_ENDPOINT).toBe("https://from-dotenv.example/v1");
    expect(process.env.OPENCODE_UA_MODE).toBe("pinned");

    // An operator's own .env value that we never managed is never deleted.
    applyOpenCodeFreeEnv({ openCodeUaMode: "" });
    expect(process.env.OPENCODE_UA_MODE).toBeUndefined();

    delete process.env.OPENCODE_FREE_MANAGED;
  });
});
