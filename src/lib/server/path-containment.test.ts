import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvedPathIsWithin } from "./path-containment.js";

describe("resolvedPathIsWithin", () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "fractal-test-root-"));
    outside = mkdtempSync(join(tmpdir(), "fractal-test-outside-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("allows a real file inside the root", () => {
    writeFileSync(join(root, "test.png"), "image");
    expect(resolvedPathIsWithin(root, join(root, "test.png"))).toBe(true);
  });

  it("allows the root itself", () => {
    expect(resolvedPathIsWithin(root, root)).toBe(true);
  });

  it("rejects a real file outside the root", () => {
    writeFileSync(join(outside, "test.png"), "image");
    expect(resolvedPathIsWithin(root, join(outside, "test.png"))).toBe(false);
  });

  it("rejects a `..` traversal to an existing outside file", () => {
    writeFileSync(join(outside, "hosts.txt"), "secret");
    expect(resolvedPathIsWithin(root, join(root, "..", basename(outside), "hosts.txt"))).toBe(false);
  });

  it("rejects a symlink inside root pointing outside", () => {
    writeFileSync(join(outside, "secret.txt"), "secret");
    writeFileSync(join(root, "safe.txt"), "safe");
    symlinkSync(join(outside, "secret.txt"), join(root, "link-to-outside"));
    expect(resolvedPathIsWithin(root, join(root, "link-to-outside"))).toBe(false);
  });

  it("allows a symlink inside root pointing inside root", () => {
    writeFileSync(join(root, "real.png"), "image");
    symlinkSync(join(root, "real.png"), join(root, "link.png"));
    expect(resolvedPathIsWithin(root, join(root, "link.png"))).toBe(true);
  });

  it("returns false for a non-existent path", () => {
    expect(resolvedPathIsWithin(root, join(root, "nope"))).toBe(false);
  });

  it("returns false for a broken symlink", () => {
    symlinkSync(join(outside, "missing"), join(root, "broken"));
    expect(resolvedPathIsWithin(root, join(root, "broken"))).toBe(false);
  });
});
