import { describe, expect, it } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";

// PR decolua/9router#4814 flagged opencode / opencode-zen / opencode-go as
// disabled because "the upstream free inference endpoint rejects third-party
// clients", which hides every oc/ocz/ocg model from /v1/models and answers 410
// on the connection CRUD. The header alignment cherry-picked from PR #4806
// disproves the premise: a live request through this branch returns 200 for
// oc/mimo-v2.6-flash-free (streaming and non-streaming, reasoning_effort
// preserved) with UA opencode/1.18.35, x-opencode-client: cli and a matching
// x-opencode-session-id. Keep the routes enabled and discoverable; the
// disabled plumbing itself stays in place for any provider that needs it.
describe("OpenCode free routes stay enabled", () => {
  for (const id of ["opencode", "opencode-zen", "opencode-go"]) {
    it(`${id} is neither disabled nor hidden`, () => {
      const provider = REGISTRY.find((entry) => entry.id === id);
      expect(provider).toBeDefined();
      expect(provider.disabled).toBeFalsy();
      expect(provider.hidden).toBeFalsy();
    });
  }
});
