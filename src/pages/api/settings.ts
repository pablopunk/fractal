import type { APIRoute } from "astro";
import { getSettings, updateSettings, type AppSettings } from "~/lib/server/store.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.json({ settings: getSettings() });
};

export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({})) as Partial<AppSettings>;
  return Response.json({ settings: updateSettings(body) });
};
