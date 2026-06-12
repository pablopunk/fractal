import { describe, expect, it } from "vitest";
import { terminalTabTitle } from "./terminal-tab-title.js";

describe("terminalTabTitle", () => {
  const project = (name: string, path = `/home/me/${name}`) => ({ name, path });

  it("strips fractal- and the project name prefix", () => {
    expect(terminalTabTitle("fractal-monorepo-fix-login-ab12cd", project("monorepo"))).toBe(
      "fix-login-ab12cd",
    );
  });

  it("matches project names with characters tmux sanitizes away", () => {
    expect(terminalTabTitle("fractal-doce-dev-add-feed-ab12cd", project("doce.dev"))).toBe(
      "add-feed-ab12cd",
    );
    expect(terminalTabTitle("fractal-pi-tweak-config-ab12cd", project(".pi"))).toBe(
      "tweak-config-ab12cd",
    );
  });

  it("falls back to the repo directory name when it differs from the project name", () => {
    expect(
      terminalTabTitle("fractal-my-repo-do-thing-ab12cd", {
        name: "My Project",
        path: "/home/me/my-repo",
      }),
    ).toBe("do-thing-ab12cd");
  });

  it("leaves project terminal sessions untouched", () => {
    expect(terminalTabTitle("monorepo", project("monorepo"))).toBe("monorepo");
  });

  it("returns the session when stripping would leave nothing", () => {
    expect(terminalTabTitle("fractal-", project("anything"))).toBe("fractal-");
  });
});
