const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("node:fs");
const path = require("node:path");
const { homedir } = require("node:os");

const configDir = path.join(homedir(), ".fractal");
const configPath = path.join(configDir, "remote-config.json");

function defaultConfig() {
  return { mode: "host", remoteUrl: "", keepAwakeEnabled: false };
}

function readConfig() {
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === "remote" ? "remote" : "host",
      remoteUrl: typeof parsed.remoteUrl === "string" ? parsed.remoteUrl : "",
      keepAwakeEnabled: Boolean(parsed.keepAwakeEnabled),
    };
  } catch {
    return defaultConfig();
  }
}

function writeConfig(partial) {
  mkdirSync(configDir, { recursive: true });
  const current = readConfig();
  const next = Object.assign({}, current, partial);
  writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

module.exports = { readConfig, writeConfig, defaultConfig, hasSavedConfig, getMode };

function hasSavedConfig() {
  return existsSync(configPath);
}

function getMode() {
  const config = readConfig();
  return {
    mode: config.mode,
    remoteUrl: config.mode === "remote" ? config.remoteUrl : "",
    keepAwakeEnabled: config.keepAwakeEnabled,
  };
}
