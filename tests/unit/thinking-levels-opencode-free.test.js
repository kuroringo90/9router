import { describe, it, expect } from "vitest";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";

// OpenCode Free (probed live 2026-10-14): mimo-v2.6-flash-free answers 200 to any
// reasoning_effort but ignores it — same prompt, six levels, identical
// reasoning_tokens (17) — and models.dev publishes no reasoning_options for the
// id. The deepseek branch of applyFormat() then coerces every choice to "high",
// so a multi-level picker would advertise a choice the model does not honour:
// the free lane exposes "high" only. Other mimo lanes keep the generic set.
describe("OpenCode Free thinking levels stay honest", () => {
  it("offers only high for mimo v2.6 on the opencode free lane", () => {
    expect(getThinkingLevels("opencode", "mimo-v2.6-flash-free")).toEqual(["high"]);
  });

  it("keeps the generic mimo v2.6 set on other lanes", () => {
    expect(getThinkingLevels("xiaomi", "mimo-v2.6-flash-free")).toEqual([
      "low", "medium", "high", "xhigh",
    ]);
    expect(getThinkingLevels("opencode-go", "mimo-v2.6-flash-free")).toEqual([
      "low", "medium", "high", "xhigh",
    ]);
  });

  it("still normalises every requested level to high on the wire", () => {
    for (const level of ["low", "medium", "high", "xhigh"]) {
      const body = applyThinking(
        "openai",
        "oc/mimo-v2.6-flash-free",
        { model: "oc/mimo-v2.6-flash-free", messages: [], reasoning_effort: level },
        "oc"
      );
      expect(body.reasoning_effort).toBe("high");
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
    // upstream returns; only the effort picker was dishonest.
    expect(body.reasoning_effort).toBeUndefined();
  });
});
