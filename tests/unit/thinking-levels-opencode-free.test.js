import { describe, it, expect } from "vitest";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";

// OpenCode Free (probed live 2026-10-14): mimo-v2.6-flash-free answers 200 to any
// reasoning_effort but ignores it — same prompt, six levels, identical
// reasoning_tokens (17) — and models.dev publishes no reasoning_options for the
// id. The model keeps thinking on its own (thinkingCanDisable: false), so the
// honest shape is "no picker, no effort field": the request stays at the model's
// default and nothing is advertised. Other mimo lanes keep the generic set.
//
// The provider argument is the canonical id ("opencode"): parseModel() resolves
// the "oc" alias before applyThinking() runs.
describe("OpenCode Free: mimo v2.6 stays at its own default", () => {
  it("advertises no thinking levels on the opencode free lane", () => {
    expect(getThinkingLevels("opencode", "mimo-v2.6-flash-free")).toBeNull();
  });

  it("keeps the generic mimo v2.6 set on other lanes", () => {
    expect(getThinkingLevels("xiaomi", "mimo-v2.6-flash-free")).toEqual([
      "low", "medium", "high", "xhigh",
    ]);
    expect(getThinkingLevels("opencode-go", "mimo-v2.6-flash-free")).toEqual([
      "low", "medium", "high", "xhigh",
    ]);
  });

  it("ships no reasoning_effort, whatever the client asks for", () => {
    for (const level of ["low", "medium", "high", "xhigh"]) {
      const body = applyThinking(
        "openai",
        "mimo-v2.6-flash-free",
        { model: "mimo-v2.6-flash-free", messages: [], reasoning_effort: level },
        "opencode"
      );
      expect(body.reasoning_effort).toBeUndefined();
      // The model always thinks — keep declaring that, only the effort is dropped.
      expect(body.thinking).toEqual({ type: "enabled" });
    }
  });

  it("ships no effort when the client sends none either", () => {
    const body = applyThinking(
      "openai",
      "mimo-v2.6-flash-free",
      { model: "mimo-v2.6-flash-free", messages: [] },
      "opencode"
    );
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("does not touch lanes where the effort really works", () => {
    const body = applyThinking(
      "openai",
      "space-bunny-free",
      { model: "space-bunny-free", messages: [], reasoning_effort: "low" },
      "opencode"
    );
    expect(body.reasoning_effort).toBe("low");
  });
});
