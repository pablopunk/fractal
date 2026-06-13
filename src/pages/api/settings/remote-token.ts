import { randomBytes } from "node:crypto";
import type { APIRoute } from "astro";
import { updateSettings } from "~/lib/server/store.js";

export const prerender = false;

export const POST: APIRoute = async () => {
  const token = randomBytes(32).toString("hex");
  updateSettings({ remoteAccessToken: token });
  return Response.json({ token });
};
