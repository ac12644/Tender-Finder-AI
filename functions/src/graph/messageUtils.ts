import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";

/**
 * Message normalization types.
 */
export type PlainMsg = {
  role: "user" | "assistant" | "system" | "developer";
  content: string;
  name?: string;
};

/**
 * Convert any content to plain text string.
 */
export function toText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content))
    return content
      .map((p) =>
        typeof p === "string" ? p : p?.text ?? p?.content ?? p?.value ?? ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  if (content && typeof content === "object") {
    if (typeof (content as { text?: unknown }).text === "string")
      return (content as { text: string }).text.trim();
    if (typeof (content as { content?: unknown }).content === "string")
      return (content as { content: string }).content.trim();
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return "";
}

/**
 * Convert plain messages to LangChain message classes.
 */
export function toLCMessages(
  msgs: Array<{ role: string; content: string; name?: string }>
): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of msgs) {
    const content = (m.content ?? "").trim();
    if (!content) continue;

    switch (m.role) {
      case "system":
        out.push(new SystemMessage({ content }));
        break;
      case "user":
      case "human":
        out.push(new HumanMessage({ content, name: m.name }));
        break;
      case "assistant":
      case "ai":
        out.push(new AIMessage({ content, name: m.name }));
        break;
      case "developer":
        out.push(new SystemMessage({ content }));
        break;
      default:
        // Drop unknown message types
        break;
    }
  }
  return out;
}

/**
 * Normalize incoming messages from client.
 */
export function normalizeIncoming(raw: unknown[]): PlainMsg[] {
  return (Array.isArray(raw) ? raw : [])
    .map((m: unknown): PlainMsg | null => {
      const msg = m as {
        role?: string;
        type?: string;
        content?: unknown;
        name?: string;
        _getType?: () => string;
      };

      const guess =
        (msg?.role === "ai" ? "assistant" : msg?.role) ??
        (typeof msg?._getType === "function" ? msg._getType() : undefined) ??
        msg?.type ??
        "user";

      const role =
        guess === "human"
          ? "user"
          : guess === "ai"
          ? "assistant"
          : (guess as PlainMsg["role"]);

      const content = toText(msg?.content);
      const out: PlainMsg = {
        role:
          role === "user" ||
          role === "assistant" ||
          role === "system" ||
          role === "developer"
            ? role
            : "user",
        content,
        name: msg?.name ?? undefined,
      };
      return out.content ? out : null;
    })
    .filter(Boolean) as PlainMsg[];
}

/**
 * Simplify message content for client response.
 */
export function simplifyMessageContent(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c
      .map((p) =>
        typeof p === "string"
          ? p
          : (p as { text?: unknown; content?: unknown; value?: unknown })
              ?.text ??
            (p as { text?: unknown; content?: unknown; value?: unknown })
              ?.content ??
            (p as { text?: unknown; content?: unknown; value?: unknown })
              ?.value ??
            ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  if (c && typeof c === "object") {
    const obj = c as { text?: unknown; content?: unknown };
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    try {
      return JSON.stringify(c);
    } catch {
      return String(c);
    }
  }
  return "";
}
