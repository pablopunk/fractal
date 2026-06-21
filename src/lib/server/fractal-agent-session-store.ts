import { eq } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { type AgentSession, agentSessions, type NewAgentSession } from "./db/schema.js";

export type { AgentSession };

function now(): Date {
  return new Date();
}

export async function createSession(provider: string, modelId: string): Promise<AgentSession> {
  const db = getDb();
  const id = crypto.randomUUID();
  const ts = now();
  const row: NewAgentSession = {
    id,
    provider,
    modelId,
    messagesJson: "[]",
    createdAt: ts,
    updatedAt: ts,
  };
  await db.insert(agentSessions).values(row);
  return { ...row, messagesJson: "[]" } as AgentSession;
}

export async function getSession(id: string): Promise<AgentSession | undefined> {
  const db = getDb();
  const rows = await db.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1);
  return rows[0];
}

export async function updateSessionMessages(id: string, messagesJson: string): Promise<void> {
  const db = getDb();
  await db
    .update(agentSessions)
    .set({ messagesJson, updatedAt: now() })
    .where(eq(agentSessions.id, id));
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.delete(agentSessions).where(eq(agentSessions.id, id));
}
