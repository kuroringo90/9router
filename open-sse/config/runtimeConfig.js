// HTTP status codes
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_ACCEPTABLE: 406,
  REQUEST_TIMEOUT: 408,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// Re-export error config (backward compat)
export { ERROR_TYPES, DEFAULT_ERROR_MESSAGES, BACKOFF_CONFIG, COOLDOWN_MS } from "./errorConfig.js";

// Cache TTLs (seconds)
export const CACHE_TTL = {
  userInfo: 300,    // 5 minutes
  modelAlias: 3600  // 1 hour
};

// Memory management config
export const MEMORY_CONFIG = {
  sessionTtlMs: 2 * 60 * 60 * 1000,
  sessionCleanupIntervalMs: 30 * 60 * 1000,
  dnsCacheTtlMs: 5 * 60 * 1000,
  proxyDispatchersMaxSize: 20,
};

// Parse a positive integer env override, falling back to a default.
function envMs(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function envUrl(name, def) {
  const raw = process.env[name]?.trim();
  return raw || def;
}

// SearXNG endpoint used by the unauthenticated web-search provider.
// Configure this for a separate Docker service or remote SearXNG instance.
export const SEARXNG_URL = envUrl("SEARXNG_URL", "http://localhost:8888/search");

// Inter-chunk stall timeout (once tokens are flowing). Generous headroom so
// slow reasoning models aren't aborted mid-stream. Env: STREAM_STALL_TIMEOUT_MS.
export const STREAM_STALL_TIMEOUT_MS = envMs("STREAM_STALL_TIMEOUT_MS", 360 * 1000);

// Time-to-first-token timeout (prompt prefill). Env: STREAM_FIRST_CHUNK_TIMEOUT_MS.
export const STREAM_FIRST_CHUNK_TIMEOUT_MS = envMs("STREAM_FIRST_CHUNK_TIMEOUT_MS", 200 * 1000);

// Fetch connect timeout: abort if upstream doesn't return response headers within this duration
export const FETCH_CONNECT_TIMEOUT_MS = envMs("FETCH_CONNECT_TIMEOUT_MS", 60 * 1000);

// Gemini native TTS fetch timeout: abort if Google does not return response headers in time.
export const GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS = envMs("GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS", 45 * 1000);

// Default token limits
export const DEFAULT_MAX_TOKENS = 64000;
export const DEFAULT_MIN_TOKENS = 32000;

export const TOKEN_SAVER_HEADER = "x-9router-token-saver";

// Retry config for 429 responses (legacy - kept for backward compatibility)
export const RETRY_CONFIG = {
  maxAttempts: 2,
  delayMs: 2000
};

// Default retry config by status code: { attempts, delayMs }
// Backward compat: if value is a number, treated as attempts with RETRY_CONFIG.delayMs
export const DEFAULT_RETRY_CONFIG = {
  429: { attempts: 0, delayMs: 0 },
  502: { attempts: 3, delayMs: 3000 },
  503: { attempts: 3, delayMs: 2000 },
  504: { attempts: 2, delayMs: 3000 }
};

// Normalize a retry entry to { attempts, delayMs }
export function resolveRetryEntry(entry) {
  if (entry == null) return { attempts: 0, delayMs: RETRY_CONFIG.delayMs };
  if (typeof entry === "number") return { attempts: entry, delayMs: RETRY_CONFIG.delayMs };
  return {
    attempts: entry.attempts || 0,
    delayMs: entry.delayMs != null ? entry.delayMs : RETRY_CONFIG.delayMs
  };
}

// Requests containing these texts will bypass provider
export const SKIP_PATTERNS = [
  "Please write a 5-10 word title for the following conversation:"
];

// ── OpenCode Free transport fingerprint ────────────────────────────────────────────────
// The free-tier gate moved twice in three days (2026-10-13/14): /zen/v1 → /inference/v1,
// the v1 "opencode/1.18.x" UA → the v2 "opencode/<channel>/<version>/<client>" shape, and
// the tool fingerprint → OpenCode's own read/shell definitions (measured: same endpoint
// and headers, placeholder tools → 403 FreeTierError, official definitions → 200).
// Each of those so far meant a code edit + redeploy; these vars retune the fingerprint
// from .env instead. Semantics (passthrough vs pinned, v1/v2 validity) stay in the
// executors — a value here only ever overrides.
function envStr(name, def) {
  const raw = process.env[name];
  return raw == null || raw === "" ? def : raw;
}

function envList(name) {
  return envStr(name, "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function envJsonObj(name, def) {
  const raw = process.env[name]?.trim();
  if (!raw) return def;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : def;
  } catch {
    return def;
  }
}

// Getters, not precomputed values: the dashboard writes these into process.env at
// runtime (src/lib/opencodeFreeEnv.js), so a fingerprint change must take effect on
// the next request instead of at boot.
export const OPENCODE_FREE = {
  // "" → the built-in /inference/v1 paths of the free lane. A value such as
  // "https://opencode.ai/zen/v1" replaces the base of every free-lane URL
  // (chat/messages/responses). Applies to the no-auth `oc` lane only.
  get endpoint() { return envStr("OPENCODE_ENDPOINT", ""); },
  // passthrough (default): keep a valid downstream OpenCode UA.
  // pinned: always send OPENCODE_UA, whatever the client claims to be.
  get uaMode() { return envStr("OPENCODE_UA_MODE", "passthrough"); },
  // "" → the executor's own default (free lane: opencode/latest/2.0.26/cli).
  get ua() { return envStr("OPENCODE_UA", ""); },
  get uaExplicit() { const v = process.env.OPENCODE_UA; return v != null && v !== ""; },
  // "" → keep whatever the downstream client sent (fallback: cli).
  get client() { return envStr("OPENCODE_CLIENT", ""); },
  // Header names (case-insensitive) to strip from the outgoing request.
  get dropHeaders() { return new Set(envList("OPENCODE_DROP_HEADERS")); },
  // Headers merged last, after everything else — the escape hatch for the next
  // gate requirement, e.g. OPENCODE_EXTRA_HEADERS='{"x-foo":"bar"}'.
  get extraHeaders() { return envJsonObj("OPENCODE_EXTRA_HEADERS", {}); },
};

// Strip the headers the gate rejects, then merge the escape hatch. Called last
// by every OpenCode buildHeaders().
export function applyOpenCodeHeaderOverrides(headers) {
  for (const name of OPENCODE_FREE.dropHeaders) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === name) delete headers[key];
    }
  }
  for (const [key, value] of Object.entries(OPENCODE_FREE.extraHeaders)) {
    if (typeof value === "string") headers[key] = value;
  }
  return headers;
}

// One line with everything that decides a free-lane request, logged when the gate
// answers 403 FreeTierError so the next fingerprint change can be diagnosed from
// the log alone.
export function describeOpenCodeFreeTransport(url = "") {
  const { endpoint, uaMode, ua, client, dropHeaders, extraHeaders } = OPENCODE_FREE;
  return [
    `endpoint=${endpoint || "(built-in /inference/v1)"}`,
    `uaMode=${uaMode}`,
    `ua=${ua || "(executor default)"}`,
    `client=${client || "(passthrough)"}`,
    `drop=[${[...dropHeaders].join(",")}]`,
    `extra=${JSON.stringify(extraHeaders)}`,
    url && `url=${url}`,
  ].filter(Boolean).join(" ");
}
