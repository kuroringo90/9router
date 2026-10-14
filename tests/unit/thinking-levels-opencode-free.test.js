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

// cat-jam-free (probed live 2026-10-14, 3 reps per level): the upstream answers
// 400 to none AND minimal with {"param":"reasoning_effort","type":"invalid_value"},
// while low/medium/high/xhigh return 200. Without any effort the model thinks less
// (57-117 reasoning tokens) than with one (85-219), and the levels do not order
// each other, so the picker only advertises what the gateway accepts.
describe("OpenCode Free: cat-jam-free offers only what the gateway accepts", () => {
  it("advertises low..xhigh, never none or minimal", () => {
    expect(getThinkingLevels("opencode", "cat-jam-free")).toEqual([
      "low", "medium", "high", "xhigh",
    ]);
  });

  it("clamps unsupported levels instead of forwarding a 400", () => {
    const wire = (level) => applyThinking(
      "openai",
      "cat-jam-free",
      { model: "cat-jam-free", messages: [], reasoning_effort: level },
      "opencode"
    ).reasoning_effort;
    expect(wire("none")).toBe("low");
    expect(wire("minimal")).toBe("low");
    expect(wire("low")).toBe("low");
    expect(wire("high")).toBe("high");
    expect(wire("xhigh")).toBe("xhigh");
    expect(wire("max")).toBe("xhigh");
  });

  it("keeps the max/ultra clamp behaviour that already existed", () => {
    const wire = (level) => applyThinking(
      "openai",
      "space-bunny-free",
      { model: "space-bunny-free", messages: [], reasoning_effort: level },
      "opencode"
    ).reasoning_effort;
    // space-bunny declares up to xhigh: max and ultra both land on xhigh.
    expect(wire("max")).toBe("xhigh");
    expect(wire("ultra")).toBe("xhigh");
  });
});
