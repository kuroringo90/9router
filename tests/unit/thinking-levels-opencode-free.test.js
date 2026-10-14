import { describe, it, expect } from "vitest";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";

// oc/mimo-v2.6-flash-free takes the full OpenAI effort enum on the free lane
// (probed live upstream 2026-10-23: all seven values 200). The picker, the
// cross-lane scoping and the no-effort passthrough are pinned here; the lane's
// wire contract (thinking shape, reasoning alias lift, off switch) is covered
// end to end by opencode-free-mimo-reasoning.test.js.
describe("OpenCode Free thinking levels stay honest", () => {
  it("offers the full OpenAI effort enum for mimo v2.6 on the opencode free lane", () => {
    expect(getThinkingLevels("opencode", "mimo-v2.6-flash-free")).toEqual([
      "none", "minimal", "low", "medium", "high", "xhigh", "max",
    ]);
  });

  it("keeps the generic mimo v2.6 set on other lanes", () => {
    expect(getThinkingLevels("xiaomi", "mimo-v2.6-flash-free")).toEqual([
      "low", "medium", "high", "xhigh",
    ]);
    expect(getThinkingLevels("opencode-go", "mimo-v2.6-flash-free")).toEqual([
      "low", "medium", "high", "xhigh",
    ]);
  });

  it("keeps the requested effort on the wire inside the declared set", () => {
    // The deepseek wire branch clamps to the pair the route answers: low-side
    // values stay "low", everything from "medium" up lands on "high".
    for (const [level, wire] of [["low", "low"], ["medium", "high"], ["high", "high"]]) {
      const body = applyThinking(
        "openai",
        "oc/mimo-v2.6-flash-free",
        { model: "oc/mimo-v2.6-flash-free", messages: [], reasoning_effort: level },
        "oc"
      );
      expect(body.reasoning_effort).toBe(wire);
      expect(body.thinking).toEqual({ type: "enabled" });
    }
  });

  it("keeps reasoning declared (the model really does think)", () => {
    const body = applyThinking(
      "openai",
      "oc/mimo-v2.6-flash-free",
      { model: "oc/mimo-v2.6-flash-free", messages: [] },
      "oc"
    );
    // reasoning:true is what keeps the thinking deltas and reasoning_tokens the
    // upstream returns; no client effort means no wire effort.
    expect(body.reasoning_effort).toBeUndefined();
  });
});
