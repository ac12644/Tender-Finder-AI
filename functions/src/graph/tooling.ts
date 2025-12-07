import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";

type ToolFn<I, O> = (input: I) => Promise<O>;

/**
 * Error classification for better error handling.
 * Based on LangChain best practices for error handling.
 */
enum ErrorType {
  TRANSIENT = "transient", // Network issues, rate limits - should retry
  LLM_RECOVERABLE = "llm_recoverable", // Tool failures, parsing - LLM can fix
  USER_FIXABLE = "user_fixable", // Missing info, unclear instructions
  UNEXPECTED = "unexpected", // Unknown errors - let bubble up
}

/**
 * Classify error type for appropriate handling strategy.
 */
function classifyError(error: unknown): ErrorType {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Transient errors (network, rate limits)
  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("etimedout") ||
    lowerMessage.includes("503") ||
    lowerMessage.includes("429")
  ) {
    return ErrorType.TRANSIENT;
  }

  // LLM recoverable errors (tool failures, parsing)
  if (
    lowerMessage.includes("parse") ||
    lowerMessage.includes("validation") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("not found") ||
    lowerMessage.includes("empty result")
  ) {
    return ErrorType.LLM_RECOVERABLE;
  }

  // User fixable errors (missing information)
  if (
    lowerMessage.includes("missing") ||
    lowerMessage.includes("required") ||
    lowerMessage.includes("unclear")
  ) {
    return ErrorType.USER_FIXABLE;
  }

  return ErrorType.UNEXPECTED;
}

/**
 * Enhanced safe tool wrapper with better error handling.
 *
 * Based on LangChain best practices:
 * - Transient errors: Automatic retry with exponential backoff
 * - LLM-recoverable errors: Return error message so LLM can see and adjust
 * - User-fixable errors: Return clear error message
 * - Unexpected errors: Let them bubble up for debugging
 */
export function safeTool<I, O>({
  name,
  description,
  schema,
  fn,
  timeoutMs = 15_000,
  retries = 2,
}: {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  fn: ToolFn<I, O>;
  timeoutMs?: number;
  retries?: number;
}) {
  return new DynamicStructuredTool({
    name,
    description,
    schema,
    func: async (raw) => {
      let input: I;

      // Validate input with better error messages
      try {
        input = schema.parse(raw);
      } catch (parseError) {
        const errorType = classifyError(parseError);
        if (errorType === ErrorType.LLM_RECOVERABLE) {
          // Extract schema keys safely for object schemas
          let schemaKeys: string[] = [];
          try {
            // Check if schema is a ZodObject and extract keys
            // Access internal Zod structure with type assertion
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const def = (schema as any)._def as
              | {
                  typeName?: string;
                  shape?: () => Record<string, unknown>;
                }
              | undefined;
            if (
              def?.typeName === "ZodObject" &&
              typeof def.shape === "function"
            ) {
              const shape = def.shape();
              schemaKeys = Object.keys(shape);
            }
          } catch {
            // If extraction fails, use empty array
            schemaKeys = [];
          }

          // Return error message so LLM can see and adjust
          throw new Error(
            `Invalid input for ${name}: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }. ` +
              (schemaKeys.length > 0
                ? `Expected schema fields: ${schemaKeys.join(", ")}. `
                : "") +
              `Please adjust your tool call parameters.`
          );
        }
        throw parseError;
      }

      let lastErr: unknown;
      let lastErrorType: ErrorType | null = null;

      // Proper timeout wrapper that doesn't rely on AbortController propagation.
      const withTimeout = <T>(p: Promise<T>) =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => {
            const timeoutError = new Error(
              `tool:${name} timed out after ${timeoutMs}ms. This is a transient error - please retry.`
            );
            reject(timeoutError);
          }, timeoutMs);
          p.then((v) => {
            clearTimeout(t);
            resolve(v);
          }).catch((e) => {
            clearTimeout(t);
            reject(e);
          });
        });

      // Retry loop with exponential backoff for transient errors
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Ensure serializable return
          const out = await withTimeout(fn(input));
          return out as O;
        } catch (e) {
          lastErr = e;
          lastErrorType = classifyError(e);

          // Don't retry non-transient errors
          if (lastErrorType !== ErrorType.TRANSIENT) {
            break;
          }

          // For transient errors, retry with exponential backoff
          if (attempt < retries) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }
        }
      }

      // Handle errors based on type (LangChain best practice)
      if (lastErrorType === ErrorType.LLM_RECOVERABLE) {
        // Return error message so LLM can see and try again
        const errorMessage =
          lastErr instanceof Error ? lastErr.message : String(lastErr);
        throw new Error(
          `Tool ${name} failed: ${errorMessage}. ` +
            `This error can be recovered - please try again with adjusted parameters.`
        );
      }

      if (lastErrorType === ErrorType.USER_FIXABLE) {
        // Return clear message for user-fixable errors
        const errorMessage =
          lastErr instanceof Error ? lastErr.message : String(lastErr);
        throw new Error(
          `Tool ${name} requires additional information: ${errorMessage}. ` +
            `Please ask the user for clarification or missing information.`
        );
      }

      // For unexpected errors, let them bubble up
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    },
  });
}
