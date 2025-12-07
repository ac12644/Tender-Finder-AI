import { BaseMessage } from "@langchain/core/messages";
import type { TenderLite } from "./tools";

/**
 * Structured response format for frontend
 */
export interface StructuredAgentResponse {
  text: string; // Human-readable text response
  tenders?: TenderLite[]; // Structured tender data (if any)
  contractReview?: {
    contractId?: string;
    review?: unknown;
  };
  metadata?: {
    query?: string;
    filters?: Record<string, unknown>;
    resultCount?: number;
  };
}

/**
 * Extract tender data from agent messages.
 * Looks for tool call results that contain tender arrays.
 */
export function extractTendersFromMessages(
  messages: BaseMessage[]
): TenderLite[] {
  const tenders: TenderLite[] = [];

  // Process messages in reverse to get the most recent tool results
  for (const msg of messages) {
    // Check if this is a tool message with tender data
    const getMessageType = (m: BaseMessage): string | undefined => {
      if (typeof (m as { _getType?: () => string })._getType === "function") {
        return (m as { _getType: () => string })._getType();
      }
      return (m as { type?: string }).type;
    };

    const msgType = getMessageType(msg);
    if (msgType === "tool") {
      const toolName = (msg as { name?: string }).name;
      const content = msg.content;

      // Check if this is from search_tenders or advanced_search tool
      if (
        (toolName === "search_tenders" || toolName === "advanced_search") &&
        content
      ) {
        console.log(
          `[extractTendersFromMessages] Processing ${toolName} tool message, content type: ${typeof content}, isArray: ${Array.isArray(
            content
          )}`
        );
        try {
          // Content might be a string (JSON) or already parsed
          let parsed: unknown;
          if (typeof content === "string") {
            console.log(
              `[extractTendersFromMessages] Content is string, length: ${
                content.length
              }, preview: ${content.substring(0, 500)}`
            );
            // Try to parse JSON string
            try {
              parsed = JSON.parse(content);
              console.log(
                `[extractTendersFromMessages] Parsed JSON, type: ${typeof parsed}, isArray: ${Array.isArray(
                  parsed
                )}`
              );
            } catch {
              // If parsing fails, content might be a plain string representation
              // Try to extract JSON from the string
              const jsonMatch = content.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              } else {
                parsed = content;
              }
            }
          } else if (Array.isArray(content)) {
            // Content is already an array
            console.log(
              `[extractTendersFromMessages] Content is already array, length: ${content.length}`
            );
            parsed = content;
          } else {
            console.log(
              `[extractTendersFromMessages] Content is object, keys: ${Object.keys(
                content as Record<string, unknown>
              ).join(", ")}`
            );
            parsed = content;
          }

          // Handle array of tenders
          if (Array.isArray(parsed)) {
            const tenderArray = parsed as TenderLite[];
            console.log(
              `[extractTendersFromMessages] Parsed is array with ${tenderArray.length} items`
            );
            if (tenderArray.length > 0) {
              console.log(
                `[extractTendersFromMessages] Found ${
                  tenderArray.length
                } tenders from search_tenders tool, first tender keys: ${Object.keys(
                  tenderArray[0] as Record<string, unknown>
                ).join(", ")}`
              );
              tenders.push(...tenderArray);
            } else {
              console.log(
                `[extractTendersFromMessages] Array is empty, no tenders to add`
              );
            }
          }
          // Handle object with tenders array (advanced_search returns {tenders: [], query: "", filters: {}})
          else if (
            parsed &&
            typeof parsed === "object" &&
            "tenders" in parsed &&
            Array.isArray((parsed as { tenders: unknown }).tenders)
          ) {
            const tenderArray = (parsed as { tenders: TenderLite[] })
              .tenders as TenderLite[];
            console.log(
              `[extractTendersFromMessages] Object from ${toolName} has tenders array with ${
                tenderArray.length
              } items, keys: ${Object.keys(
                parsed as Record<string, unknown>
              ).join(", ")}`
            );
            if (tenderArray.length > 0) {
              console.log(
                `[extractTendersFromMessages] Found ${
                  tenderArray.length
                } tenders in object from ${toolName}, first tender: ${JSON.stringify(
                  tenderArray[0]
                ).substring(0, 200)}`
              );
              tenders.push(...tenderArray);
            } else {
              console.log(
                `[extractTendersFromMessages] Object has tenders array but it's empty. Full object keys: ${Object.keys(
                  parsed as Record<string, unknown>
                ).join(", ")}, sample: ${JSON.stringify(parsed).substring(
                  0,
                  500
                )}`
              );
            }
          } else {
            // If it's an object but not an array and doesn't have tenders, log it
            console.warn(
              `[extractTendersFromMessages] Unexpected format from ${toolName}:`,
              `type: ${typeof parsed}, isArray: ${Array.isArray(
                parsed
              )}, keys: ${
                parsed && typeof parsed === "object"
                  ? Object.keys(parsed as Record<string, unknown>).join(", ")
                  : "N/A"
              }`
            );
          }
        } catch (error) {
          console.error(
            "[extractTendersFromMessages] Error parsing tool content:",
            error
          );
        }
      }

      // Check if this is from contract review tools
      if (
        (toolName === "review_contract" || toolName === "process_contract") &&
        content
      ) {
        try {
          const contentStr =
            typeof content === "string" ? content : JSON.stringify(content);
          const parsed = JSON.parse(contentStr);

          if (parsed.review || parsed.contractId) {
            // Contract review data will be extracted in formatStructuredResponse
            // Store it for later extraction
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
  }

  return tenders;
}

/**
 * Extract query and filters from messages.
 */
export function extractMetadataFromMessages(
  messages: BaseMessage[]
): StructuredAgentResponse["metadata"] {
  const metadata: StructuredAgentResponse["metadata"] = {};

  for (const msg of messages) {
    const getMessageType = (m: BaseMessage): string | undefined => {
      if (typeof (m as { _getType?: () => string })._getType === "function") {
        return (m as { _getType: () => string })._getType();
      }
      return (m as { type?: string }).type;
    };

    const msgType = getMessageType(msg);
    if (msgType === "tool") {
      const toolName = (msg as { name?: string }).name;
      const content = msg.content;

      // Extract query from build_ted_query
      if (toolName === "build_ted_query" && typeof content === "string") {
        metadata.query = content;
      }

      // Extract filters from search_tenders (if available)
      if (toolName === "search_tenders") {
        try {
          const parsed =
            typeof content === "string" ? JSON.parse(content) : content;
          if (parsed && typeof parsed === "object" && "filters" in parsed) {
            metadata.filters = parsed.filters as Record<string, unknown>;
          }
        } catch {
          // Skip
        }
      }
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Extract contract review data from messages.
 */
function extractContractReviewFromMessages(
  messages: BaseMessage[]
): { contractId?: string; review?: unknown } | undefined {
  for (const msg of messages) {
    const getMessageType = (m: BaseMessage): string | undefined => {
      if (typeof (m as { _getType?: () => string })._getType === "function") {
        return (m as { _getType: () => string })._getType();
      }
      return (m as { type?: string }).type;
    };

    const msgType = getMessageType(msg);
    if (msgType === "tool") {
      const toolName = (msg as { name?: string }).name;
      const content = msg.content;

      if (
        (toolName === "review_contract" || toolName === "process_contract") &&
        content
      ) {
        try {
          const contentStr =
            typeof content === "string" ? content : JSON.stringify(content);
          const parsed = JSON.parse(contentStr);

          if (parsed.review || parsed.contractId) {
            return {
              contractId: parsed.contractId as string | undefined,
              review: parsed.review || parsed,
            };
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
  }
  return undefined;
}

/**
 * Format agent response with structured data.
 */
export function formatStructuredResponse(
  messages: BaseMessage[],
  finalText: string
): StructuredAgentResponse {
  const tenders = extractTendersFromMessages(messages);
  const metadata = extractMetadataFromMessages(messages);
  const contractReview = extractContractReviewFromMessages(messages);

  // Add result count to metadata
  if (tenders.length > 0 && metadata) {
    metadata.resultCount = tenders.length;
  }

  // Track tender discovery metrics
  if (tenders.length > 0) {
    trackTenderDiscoveryMetrics(tenders.length, metadata?.query).catch(
      (err) => {
        console.error("Failed to track tender discovery metrics:", err);
      }
    );
  }

  return {
    text: finalText,
    ...(tenders.length > 0 ? { tenders } : {}),
    ...(contractReview ? { contractReview } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

/**
 * Track tender discovery metrics for admin analytics.
 */
async function trackTenderDiscoveryMetrics(
  count: number,
  query?: string
): Promise<void> {
  try {
    const { db } = await import("../lib/firestore.js");
    await db.collection("tender_discovery_metrics").add({
      count,
      query: query?.substring(0, 200), // Truncate long queries
      timestamp: new Date(),
    });
  } catch (error) {
    // Silent fail - metrics shouldn't break the app
    console.warn("Failed to track tender discovery:", error);
  }
}
