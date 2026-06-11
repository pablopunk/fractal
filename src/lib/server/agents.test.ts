import { describe, it, expect } from "vitest";
import { renderAgentCommand, thinkingArgsForPreset, DEFAULT_AGENT_PRESETS } from "./agents.js";

const pi = DEFAULT_AGENT_PRESETS[0];
const claude = DEFAULT_AGENT_PRESETS[1];
const opencode = DEFAULT_AGENT_PRESETS[2];

describe("thinkingArgsForPreset", () => {
  it("returns --thinking for pi", () => {
    expect(thinkingArgsForPreset({ kind: "pi", binary: "pi", thinking: "high" })).toEqual([
      "--thinking",
      "high",
    ]);
  });

  it("returns --effort for claude", () => {
    expect(
      thinkingArgsForPreset({ kind: "claude", binary: "claude", thinking: "high" }),
    ).toEqual(["--effort", "high"]);
  });

  it("returns --variant for opencode", () => {
    expect(
      thinkingArgsForPreset({ kind: "opencode", binary: "opencode", thinking: "high" }),
    ).toEqual(["--variant", "high"]);
  });

  it("returns empty array when thinking is unset", () => {
    expect(thinkingArgsForPreset({ kind: "pi", binary: "pi" })).toEqual([]);
    expect(thinkingArgsForPreset({ kind: "claude", binary: "claude" })).toEqual([]);
    expect(thinkingArgsForPreset({ kind: "opencode", binary: "opencode" })).toEqual([]);
  });

  it("detects pi/opencenter by binary name regardless of kind", () => {
    expect(thinkingArgsForPreset({ kind: "custom", binary: "pi", thinking: "low" })).toEqual([
      "--thinking",
      "low",
    ]);
    expect(
      thinkingArgsForPreset({ kind: "custom", binary: "claude", thinking: "low" }),
    ).toEqual(["--effort", "low"]);
    expect(
      thinkingArgsForPreset({ kind: "custom", binary: "opencode", thinking: "low" }),
    ).toEqual(["--variant", "low"]);
  });
});

describe("renderAgentCommand", () => {
  it("produces a pi command starting with pi and containing model and prompt", () => {
    const cmd = renderAgentCommand(pi, "hello world");
    expect(cmd).toMatch(/^pi\b/);
    expect(cmd).toContain("hello world");
    expect(cmd).toContain("<<'EOF'");
  });

  it("produces a claude command starting with claude and containing model arg", () => {
    const cmd = renderAgentCommand(claude, "do the thing");
    expect(cmd).toMatch(/^claude\b/);
    expect(cmd).toContain("sonnet");
    expect(cmd).toContain("do the thing");
  });

  it("produces an opencode command with --model and --prompt flags", () => {
    const cmd = renderAgentCommand(opencode, "test prompt");
    expect(cmd).toMatch(/^opencode\b/);
    expect(cmd).toContain("--model");
    expect(cmd).toContain("--prompt");
    expect(cmd).toContain("test prompt");
  });

  it("shell-safety: dangerous shell metacharacters stay inside heredoc", () => {
    const dangerous = "'; rm -rf ~ #";
    const cmd = renderAgentCommand(pi, dangerous);
    expect(cmd).toContain("<<'EOF");
    const firstOccurrence = cmd.indexOf(dangerous);
    expect(firstOccurrence).not.toBe(-1);
    // Must not appear a second time (no accidental unquoted copy)
    expect(cmd.indexOf(dangerous, firstOccurrence + 1)).toBe(-1);
    // Heredoc open before prompt, close after prompt
    const heredocStart = cmd.indexOf("<<'EOF'");
    const heredocEnd = cmd.indexOf("EOF\n)\"");
    expect(heredocStart).toBeLessThan(firstOccurrence);
    expect(firstOccurrence).toBeLessThan(heredocEnd);
  });

  it("shell-safety: prompt containing an EOF line uses escalated delimiter", () => {
    const cmd = renderAgentCommand(pi, "line one\nEOF\nline three");
    // Must use an escalated delimiter, not plain EOF
    expect(cmd).not.toMatch(/<<'EOF'/);
    expect(cmd).toMatch(/<<'EOF_\d+'/);
    // The prompt content must appear intact
    expect(cmd).toContain("line one\nEOF\nline three");
  });
});
