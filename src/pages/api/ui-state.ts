import type { APIRoute } from "astro";
import { getUiState, type UiState, updateUiState } from "~/lib/server/store.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.json({ uiState: getUiState() });
};

export const PATCH: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as Partial<UiState>;
  return Response.json({ uiState: updateUiState(body) });
};
