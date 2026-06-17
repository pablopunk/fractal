import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import type { APIRoute } from "astro";
import {
  archivePrompt,
  captureTerminal,
  createProject,
  createPrompt,
  deleteProject,
  deletePrompt,
  launchPrompt,
  readSettings,
  readState,
  updatePrompt,
  updateSettings,
  webFetch,
  webSearch,
} from "~/lib/server/agent-tools.js";
import { getSettings } from "~/lib/server/store.js";

export const prerender = false;

const SYSTEM_PROMPT = `You are the Fractal global agent. Your job is to help the user manage Fractal.

You are embedded inside Fractal, a desktop application for managing AI coding agents across multiple projects.

## Core concepts
- A **project** is a directory on disk that Fractal watches. Each has a kanban board with prompt cards.
- A **prompt** is a task card with text, a column (PROMPTS, RUN_IN_PLACE, RUN_IN_WORKTREE), an agent preset, and a model profile.
- **RUN_IN_PLACE** runs the agent in the project directory. **RUN_IN_WORKTREE** runs it in an isolated git worktree.
- **Archiving** marks a prompt as done. Worktree prompts may need a PR created, merged, or discarded.

## Your tools
Use readState for an overview. Then act through the other tools to create projects, manage prompts, change settings, read terminal output, and search the web.

## Rules
- Always read state first before acting. Do not guess.
- Be concise. One action at a time unless they are independent.
- When creating a prompt, use the project's default preset if not specified.
- When archiving a worktree prompt, check what action is needed (create PR, merge, discard).
- Never expose API keys in your responses.`;

function resolveProvider() {
  const settings = getSettings();
  const keys = settings.apiKeys ?? {};

  if (keys.anthropic) return "anthropic";
  if (keys.google) return "google";
  if (keys.openai) return "openai";
  if (keys.openrouter) return "openrouter";

  return null;
}

async function getModel() {
  const provider = resolveProvider();
  const settings = getSettings();
  const keys = settings.apiKeys ?? {};

  if (provider === "anthropic") {
    const anthropic = await import("@ai-sdk/anthropic").then((m) => m.createAnthropic);
    return anthropic({ apiKey: keys.anthropic })("claude-sonnet-4-20250514");
  }
  if (provider === "google") {
    const google = await import("@ai-sdk/google").then((m) => m.createGoogleGenerativeAI);
    return google({ apiKey: keys.google })("gemini-2.5-pro-exp-03-25");
  }
  if (provider === "openai") {
    const openai = await import("@ai-sdk/openai").then((m) => m.createOpenAI);
    return openai({ apiKey: keys.openai })("gpt-4o");
  }
  if (provider === "openrouter") {
    // OpenRouter speaks the OpenAI API protocol, so we reuse the OpenAI client
    // with a different baseURL and the OpenRouter API key.
    const openai = await import("@ai-sdk/openai").then((m) => m.createOpenAI);
    return openai({
      apiKey: keys.openrouter,
      baseURL: "https://openrouter.ai/api/v1",
    })("anthropic/claude-sonnet-4-5");
  }

  return null;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      messages?: UIMessage[];
    };
    const rawMessages = body.messages ?? [];
    if (rawMessages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    const model = await getModel();
    if (!model) {
      return Response.json(
        { error: "No API key configured. Add one in Settings → AI Provider." },
        { status: 400 },
      );
    }

    const messages = await convertToModelMessages(rawMessages);
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        readState,
        createProject,
        deleteProject,
        createPrompt,
        updatePrompt,
        deletePrompt,
        launchPrompt,
        archivePrompt,
        readSettings,
        updateSettings,
        captureTerminal,
        webFetch,
        webSearch,
      },
      stopWhen: stepCountIs(25),
    });

    return result.toUIMessageStreamResponse();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
};
