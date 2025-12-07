import { onRequest } from "firebase-functions/v2/https";
import { BaseMessage } from "@langchain/core/messages";
// Supervisor imported dynamically to avoid circular dependencies
import { getServerDateISO } from "../utils/date";
import {
  normalizeIncoming,
  toLCMessages,
  simplifyMessageContent,
} from "./messageUtils";
import { formatStructuredResponse } from "./responseFormatter";
import { OPENROUTER_API_KEY } from "../lib/llm";
import { OPENAI_API_KEY } from "../lib/rag";

/**
 * CORS helper.
 */
function setCors(res: { set: (key: string, value: string) => void }) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-user-id"
  );
}

/**
 * Main agent chat endpoint (non-streaming).
 * Uses supervisor to route to specialized agents.
 */
export const agentChat = onRequest(
  {
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 180,
    memory: "512MiB",
    // OPENAI_API_KEY is used by Firebase Functions runtime for embeddings
    secrets: [OPENROUTER_API_KEY, OPENAI_API_KEY, "BREVO_API_KEY"],
  },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = (req.headers["x-user-id"] as string) || "anon";
      const cleaned = normalizeIncoming(req.body?.messages || []);

      // Filter to only user/assistant messages
      const userMsgs = cleaned.filter(
        (m) => m.role === "user" || m.role === "assistant"
      );

      if (!userMsgs.some((m) => m.role === "user" && m.content)) {
        res.status(400).json({
          error:
            "messages must include at least one user message with non-empty content",
          example: [{ role: "user", content: "Trova bandi in Italia oggi" }],
        });
        return;
      }

      // Inject server date
      const today = await getServerDateISO();
      const withDate = [
        {
          role: "user" as const,
          content: `Current date (from Firestore server): ${today}`,
        },
        ...userMsgs,
      ];

      // Convert to LangChain messages
      const lcMessages = toLCMessages(withDate);
      const thread_id = req.body?.thread_id || `thread-${userId}-${Date.now()}`;

      // Invoke supervisor with enhanced features (max steps, timeout, quotas)
      const { invokeSupervisor } = await import("./supervisor.js");
      const out = await invokeSupervisor(
        { messages: lcMessages },
        {
          configurable: {
            thread_id,
            user_id: userId !== "anon" ? userId : undefined,
          },
          maxSteps: 10, // Max 10 steps per conversation
          timeoutMs: 120000, // 2 minute timeout
        }
      );

      // Simplify and format response
      const messages = (out?.messages ?? []) as BaseMessage[];

      // Get the final assistant message text
      const assistantMessages = messages.filter((m) => {
        const type =
          typeof (m as { _getType?: () => string })._getType === "function"
            ? (m as { _getType: () => string })._getType()
            : (m as { type?: string }).type;
        return type === "ai" || type === "human";
      });
      const lastAssistantMsg = assistantMessages.reverse().find((m) => {
        const type =
          typeof (m as { _getType?: () => string })._getType === "function"
            ? (m as { _getType: () => string })._getType()
            : (m as { type?: string }).type;
        return type === "ai";
      });
      const finalText = lastAssistantMsg
        ? simplifyMessageContent(lastAssistantMsg.content)
        : "";

      // Format structured response
      const structuredResponse = formatStructuredResponse(messages, finalText);

      const simplified = messages.map((m) => {
        // Extract role from message - LangChain messages have _getType() method
        const getMessageType = (msg: BaseMessage): string | undefined => {
          if (
            typeof (msg as { _getType?: () => string })._getType === "function"
          ) {
            return (msg as { _getType: () => string })._getType();
          }
          return (msg as { type?: string }).type;
        };

        const role =
          (m as { role?: string }).role ?? getMessageType(m) ?? "assistant";

        return {
          role: role === "ai" ? "assistant" : role,
          content: simplifyMessageContent(m.content),
          name: (m as { name?: string }).name ?? undefined,
        };
      });

      res.json({
        messages: simplified,
        thread_id,
        ...(structuredResponse.tenders
          ? { tenders: structuredResponse.tenders }
          : {}),
        ...(structuredResponse.metadata
          ? { metadata: structuredResponse.metadata }
          : {}),
      });
    } catch (e: unknown) {
      console.error("Agent chat error:", e);
      const errorMessage =
        e instanceof Error ? e.message : "Unknown error occurred";

      res.status(500).json({
        error: "Agent error",
        message: errorMessage,
        suggestion:
          "Si è verificato un errore. Riprova con una richiesta più specifica o riprova più tardi.",
      });
    }
  }
);
