import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOpenCodeFreeEnv, OPENCODE_FREE_SETTING_KEYS } from "@/lib/opencodeFreeEnv";
import { OPENCODE_FREE, describeOpenCodeFreeTransport } from "open-sse/config/runtimeConfig.js";

export const dynamic = "force-dynamic";

const FIELDS = Object.keys(OPENCODE_FREE_SETTING_KEYS);

const NO_STORE = { "Cache-Control": "no-store" };

function effective() {
  return {
    endpoint: OPENCODE_FREE.endpoint,
    uaMode: OPENCODE_FREE.uaMode,
    ua: OPENCODE_FREE.ua,
    client: OPENCODE_FREE.client,
    dropHeaders: [...OPENCODE_FREE.dropHeaders].join(","),
    extraHeaders: JSON.stringify(OPENCODE_FREE.extraHeaders),
    fingerprint: describeOpenCodeFreeTransport(),
  };
}

/**
 * GET /api/settings/opencode-free
 * persisted = what the dashboard saved (DB), live = what the router sends right now.
 */
export async function GET() {
  try {
    const settings = await getSettings();
    const persisted = Object.fromEntries(FIELDS.map((key) => [key, settings[key] ?? ""]));
    return NextResponse.json({ persisted, live: effective() }, { headers: NO_STORE });
  } catch (error) {
    console.log("Error reading OpenCode free settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/opencode-free — save the fingerprint and apply it to
 * process.env immediately (the executors read it live, no restart needed).
 */
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const patch = {};
    for (const key of FIELDS) {
      if (typeof body[key] === "string") patch[key] = body[key].trim();
    }

    if (patch.openCodeUaMode && !["passthrough", "pinned"].includes(patch.openCodeUaMode)) {
      return NextResponse.json({ error: "UA mode must be 'passthrough' or 'pinned'" }, { status: 400 });
    }
    if (patch.openCodeEndpoint && !/^https?:\/\/\S+$/.test(patch.openCodeEndpoint)) {
      return NextResponse.json({ error: "Endpoint must be an http(s) URL" }, { status: 400 });
    }
    if (patch.openCodeExtraHeaders) {
      let parsed = null;
      try {
        parsed = JSON.parse(patch.openCodeExtraHeaders);
      } catch {
        parsed = null;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Extra headers must be a JSON object" }, { status: 400 });
      }
    }

    const settings = await updateSettings(patch);
    applyOpenCodeFreeEnv(settings);

    return NextResponse.json(
      { success: true, persisted: Object.fromEntries(FIELDS.map((key) => [key, settings[key] ?? ""])), live: effective() },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.log("Error saving OpenCode free settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
