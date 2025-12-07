import { onRequest } from "firebase-functions/v2/https";
import { BaseMessage } from "@langchain/core/messages";
import { supervisor } from "./supervisor";
import { getServerDateISO } from "../utils/date";
import { normalizeIncoming, toLCMessages } from "./messageUtils";
import { formatStructuredResponse } from "./responseFormatter";
import { OPENROUTER_API_KEY } from "../lib/llm";
import { OPENAI_API_KEY } from "../lib/rag";

/**
 * Streaming agent chat endpoint using Server-Sent Events (SSE).
 *
 * Provides real-time token-by-token streaming for better UX.
 */
export const agentChatStream = onRequest(
  {
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 180,
    memory: "512MiB",
    // OPENAI_API_KEY is used by Firebase Functions runtime for embeddings
    secrets: [OPENROUTER_API_KEY, OPENAI_API_KEY, "BREVO_API_KEY"],
  },
  async (req, res): Promise<void> => {
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-user-id"
    );

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
        res.write(
          `data: ${JSON.stringify({ error: "No user message provided" })}\n\n`
        );
        res.end();
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

      // Stream agent response
      const stream = await supervisor.stream(
        { messages: lcMessages },
        {
          configurable: {
            thread_id,
            user_id: userId !== "anon" ? userId : undefined,
          },
          streamMode: "messages",
        }
      );

      let accumulatedContent = "";
      const allMessages: BaseMessage[] = [];
      const seenMessageIds = new Set<string>();

      // Send chunks as they arrive
      // With streamMode: "messages", chunks are StreamMessageOutput
      // The structure varies, so we handle multiple cases
      for await (const chunk of stream) {
        // StreamMessageOutput structure: handle different possible formats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunkAny = chunk as any;
        let messages: unknown[] = [];

        // Check if chunk has messages property (state output)
        if (chunkAny.messages && Array.isArray(chunkAny.messages)) {
          messages = chunkAny.messages;
        }
        // Check if chunk is an array of messages
        else if (Array.isArray(chunkAny)) {
          messages = chunkAny;
        }
        // Check if chunk is a single message
        else if (chunkAny && typeof chunkAny === "object") {
          messages = [chunkAny];
        }

        for (const message of messages) {
          const baseMsg = message as BaseMessage;

          // Create a unique ID for this message to avoid duplicates
          // Use content hash or message type + content as ID
          const msgType = getMessageType(baseMsg);
          const toolName = (baseMsg as { name?: string }).name;
          const contentStr = baseMsg.content
            ? typeof baseMsg.content === "string"
              ? baseMsg.content.substring(0, 100)
              : JSON.stringify(baseMsg.content).substring(0, 100)
            : "";
          const msgId = `${msgType}-${toolName || ""}-${contentStr}`;

          // Log tool messages for debugging
          if (msgType === "tool") {
            console.log(
              `[agentChatStream] Tool message: ${toolName}, content type: ${typeof baseMsg.content}, isArray: ${Array.isArray(
                baseMsg.content
              )}`
            );
            if (
              toolName === "search_tenders" ||
              toolName === "advanced_search"
            ) {
              const contentPreview =
                typeof baseMsg.content === "string"
                  ? baseMsg.content.substring(0, 500)
                  : Array.isArray(baseMsg.content)
                  ? `Array[${baseMsg.content.length}]`
                  : JSON.stringify(baseMsg.content).substring(0, 500);
              console.log(
                `[agentChatStream] ${toolName} content preview: ${contentPreview}`
              );
            }
          }

          // Only add if we haven't seen this message before
          if (!seenMessageIds.has(msgId)) {
            seenMessageIds.add(msgId);
            allMessages.push(baseMsg);
          }

          const content = extractContent(baseMsg);
          if (content) {
            // Send only new content (incremental updates)
            if (content.length > accumulatedContent.length) {
              const newContent = content.slice(accumulatedContent.length);
              res.write(
                `data: ${JSON.stringify({
                  content: newContent,
                  done: false,
                })}\n\n`
              );
              accumulatedContent = content;
            }
          }
        }
      }

      // Log message types for debugging
      const messageTypes = allMessages.map((msg) => {
        const type = getMessageType(msg);
        const name = (msg as { name?: string }).name;
        return `${type}${name ? `:${name}` : ""}`;
      });
      console.log(
        `[agentChatStream] Collected ${allMessages.length} messages:`,
        messageTypes.join(", ")
      );

      // Format structured response with tender data
      const structuredResponse = formatStructuredResponse(
        allMessages,
        accumulatedContent
      );

      console.log(
        `[agentChatStream] Extracted ${
          structuredResponse.tenders?.length || 0
        } tenders, ${structuredResponse.metadata ? "with" : "without"} metadata`
      );

      // Send completion with structured data
      res.write(
        `data: ${JSON.stringify({
          done: true,
          thread_id,
          ...(structuredResponse.tenders
            ? { tenders: structuredResponse.tenders }
            : {}),
          ...(structuredResponse.contractReview
            ? { contractReview: structuredResponse.contractReview }
            : {}),
          ...(structuredResponse.metadata
            ? { metadata: structuredResponse.metadata }
            : {}),
        })}\n\n`
      );
      res.end();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.write(
        `data: ${JSON.stringify({ error: errorMessage, done: true })}\n\n`
      );
      res.end();
    }
  }
);

/**
 * Extract content from LangChain message.
 */
function extractContent(message: BaseMessage): string | null {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((p) => {
        if (typeof p === "string") return p;
        const part = p as { text?: string; content?: string };
        if (part?.text) return part.text;
        if (part?.content) return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return null;
}

/**
 * Get message type from LangChain message.
 */
function getMessageType(message: BaseMessage): string {
  if (typeof (message as { _getType?: () => string })._getType === "function") {
    return (message as { _getType: () => string })._getType();
  }
  return (message as { type?: string }).type || "unknown";
}
