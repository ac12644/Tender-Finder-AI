import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";

/**
 * Message normalization and conversion utilities.
 */

export type PlainMsg = {
  role: "user" | "assistant" | "system" | "developer";
  content: string;
  name?: string;
};

/**
 * Convert content to text string.
 */
export function toText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content))
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        const part = p as { text?: string; content?: string; value?: string };
        return part?.text ?? part?.content ?? part?.value ?? "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  if (content && typeof content === "object") {
    const obj = content as { text?: string; content?: string };
    if (typeof obj.text === "string") return obj.text.trim();
    if (typeof obj.content === "string") return obj.content.trim();
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return "";
}

/**
 * Convert plain messages to LangChain messages.
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
      case "developer": // map 'developer' to system
        out.push(new SystemMessage({ content }));
        break;
      default:
        // drop anything else (incl. serialized LC blobs)
        break;
    }
  }
  return out;
}

/**
 * Normalize incoming messages from API requests.
 */
export function normalizeIncoming(raw: unknown[]): PlainMsg[] {
  return (Array.isArray(raw) ? raw : [])
    .map((m: unknown): PlainMsg | null => {
      const msg = m as
        | {
            role?: string;
            _getType?: () => string;
            type?: string;
            content?: unknown;
            name?: string;
          }
        | null
        | undefined;
      if (!msg) return null;

      const guess =
        (msg.role === "ai" ? "assistant" : msg.role) ??
        (typeof msg._getType === "function" ? msg._getType() : undefined) ??
        msg.type ??
        "user";
      const role =
        guess === "human"
          ? "user"
          : guess === "ai"
          ? "assistant"
          : (guess as PlainMsg["role"]);
      const content = toText(msg.content);
      const out: PlainMsg = {
        role:
          role === "user" ||
          role === "assistant" ||
          role === "system" ||
          role === "developer"
            ? role
            : "user",
        content,
        name: msg.name ?? undefined,
      };
      return out.content ? out : null;
    })
    .filter(Boolean) as PlainMsg[];
}
