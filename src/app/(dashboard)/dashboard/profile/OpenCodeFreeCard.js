"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input, Select } from "@/shared/components";

// OpenCode Free fingerprint — retunes what 9router sends to the free lane
// (endpoint, UA, client, dropped/extra headers) without a rebuild or restart:
// the card PATCHes /api/settings/opencode-free, which persists the values and
// mirrors them into process.env, where config/runtimeConfig.js reads them live.

const EMPTY = {
  openCodeEndpoint: "",
  openCodeUaMode: "passthrough",
  openCodeUa: "",
  openCodeClient: "",
  openCodeDropHeaders: "",
  openCodeExtraHeaders: "",
};

export default function OpenCodeFreeCard() {
  const [form, setForm] = useState(EMPTY);
  const [live, setLive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/opencode-free", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setForm({ ...EMPTY, ...(data.persisted || {}) });
        setLive(data.live || null);
      } else {
        setErr(data.error || "Failed to load the fingerprint");
      }
    } catch (error) {
      setErr(error.message);
    }
  }, []);

  useEffect(() => {
    // Initial fetch: the state updates happen after `await fetch`, not synchronously
    // in the effect body (same pattern as the other tool cards in this dashboard).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const save = async (payload = form) => {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/settings/opencode-free", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Save failed");
        return;
      }
      setLive(data.live || null);
      setMsg("Applied — effective on the next request, no restart needed.");
    } catch (error) {
      setErr(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-1">
        <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
          <span className="material-symbols-outlined text-[20px]">fingerprint</span>
        </div>
        <h3 className="text-base sm:text-lg font-semibold">OpenCode Free fingerprint</h3>
      </div>
      <p className="text-xs sm:text-sm text-text-muted mb-4">
        What 9router sends to the <code>oc/*</code> free lane. The upstream gate has changed
        endpoint and headers several times — retune here instead of patching code. Empty field
        means &quot;no override&quot; (the <code>.env</code> / built-in value applies).
      </p>

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs sm:text-sm text-text-muted mb-1">Endpoint base</label>
          <Input
            value={form.openCodeEndpoint}
            onChange={set("openCodeEndpoint")}
            placeholder="https://opencode.ai/inference/v1 (built-in)"
            spellCheck={false}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs sm:text-sm text-text-muted mb-1">User-Agent mode</label>
            <Select
              value={form.openCodeUaMode || "passthrough"}
              onChange={set("openCodeUaMode")}
              options={[
                { value: "passthrough", label: "passthrough (keep the client UA)" },
                { value: "pinned", label: "pinned (always send UA below)" },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-text-muted mb-1">User-Agent</label>
            <Input
              value={form.openCodeUa}
              onChange={set("openCodeUa")}
              placeholder="opencode/latest/2.0.26/cli (built-in)"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs sm:text-sm text-text-muted mb-1">x-opencode-client</label>
            <Input
              value={form.openCodeClient}
              onChange={set("openCodeClient")}
              placeholder="cli (passthrough)"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-text-muted mb-1">Drop headers</label>
            <Input
              value={form.openCodeDropHeaders}
              onChange={set("openCodeDropHeaders")}
              placeholder="x-opencode-request,x-session-affinity"
              spellCheck={false}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs sm:text-sm text-text-muted mb-1">Extra headers (JSON)</label>
          <Input
            value={form.openCodeExtraHeaders}
            onChange={set("openCodeExtraHeaders")}
            placeholder='{"x-foo":"bar"}'
            spellCheck={false}
          />
        </div>

        {live?.fingerprint && (
          <pre className="text-[11px] leading-relaxed text-text-muted bg-bg border border-border rounded-lg p-3 overflow-x-auto">
            {live.fingerprint}
          </pre>
        )}

        {msg && <p className="text-xs text-green-500">{msg}</p>}
        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save()} disabled={saving}>
            {saving ? "Saving…" : "Save & apply"}
          </Button>
          <Button variant="secondary" onClick={() => save({ ...EMPTY })} disabled={saving}>
            Reset to .env defaults
          </Button>
        </div>
      </div>
    </Card>
  );
}
