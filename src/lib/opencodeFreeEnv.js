// OpenCode free-tier fingerprint: DB settings -> process.env.
//
// The dashboard persists the OPENCODE_* knobs as flat settings and this module
// mirrors them into process.env, which config/runtimeConfig.js reads live — so a
// fingerprint change applies to the next request, no restart. Boot-time values
// still come from .env; a setting only ever overrides what it defines.
//
// Mirrors src/lib/network/outboundProxy.js (applyOutboundProxyEnv) including the
// "managed" marker, so clearing a field removes exactly what we set and never
// touches an operator's own .env entry.

import { getSettings } from "@/lib/localDb";

const MANAGED_KEY = "OPENCODE_FREE_MANAGED";

export const OPENCODE_FREE_SETTING_KEYS = {
  openCodeEndpoint: "OPENCODE_ENDPOINT",
  openCodeUaMode: "OPENCODE_UA_MODE",
  openCodeUa: "OPENCODE_UA",
  openCodeClient: "OPENCODE_CLIENT",
  openCodeDropHeaders: "OPENCODE_DROP_HEADERS",
  openCodeExtraHeaders: "OPENCODE_EXTRA_HEADERS",
};

// Boot-time values (the .env file), captured before the first override: clearing a
// managed field restores these, which is what "Reset to .env defaults" promises —
// once we overwrite process.env the original is otherwise unrecoverable.
let bootEnv = null;

function captureBootEnv() {
  if (bootEnv) return;
  bootEnv = {};
  for (const envName of Object.values(OPENCODE_FREE_SETTING_KEYS)) {
    if (process.env[envName] !== undefined) bootEnv[envName] = process.env[envName];
  }
}

/**
 * Mirror persisted fingerprint settings into process.env.
 * - non-empty value → set (and remember as managed)
 * - empty string    → clear, but only if we were the ones who set it
 * - undefined       → leave untouched (boot/.env value stays)
 * @param {Record<string, unknown>} settings
 */
export function applyOpenCodeFreeEnv(settings = {}) {
  if (typeof process === "undefined" || !process.env) return;
  captureBootEnv();

  const managed = new Set(
    String(process.env[MANAGED_KEY] || "").split(",").map((s) => s.trim()).filter(Boolean)
  );

  for (const [setting, envName] of Object.entries(OPENCODE_FREE_SETTING_KEYS)) {
    const value = settings[setting];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (trimmed === "") {
      if (managed.has(envName)) {
        if (bootEnv && bootEnv[envName] !== undefined) process.env[envName] = bootEnv[envName];
        else delete process.env[envName];
        managed.delete(envName);
      }
      continue;
    }
    process.env[envName] = trimmed;
    managed.add(envName);
  }

  if (managed.size) process.env[MANAGED_KEY] = [...managed].join(",");
  else delete process.env[MANAGED_KEY];
}

let initialized = false;

export async function ensureOpenCodeFreeInitialized() {
  if (initialized) return true;
  try {
    const settings = await getSettings();
    applyOpenCodeFreeEnv(settings);
    initialized = true;
  } catch (error) {
    console.error("[ServerInit] Error initializing OpenCode free fingerprint env:", error);
  }
  return initialized;
}

// Defer init so the HTTP server accepts connections first (same pattern as
// src/lib/network/initOutboundProxy.js).
setImmediate(() => {
  ensureOpenCodeFreeInitialized().catch(console.log);
});

export default ensureOpenCodeFreeInitialized;
