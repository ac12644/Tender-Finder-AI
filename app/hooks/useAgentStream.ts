"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { API_BASE_URL } from "@/lib/apiConfig";

const BASE_URL = API_BASE_URL;

export interface StreamChunk {
  content?: string;
  done?: boolean;
  error?: string;
  thread_id?: string;
  tenders?: unknown[];
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

export function useAgentStream() {
  const { uid, idToken } = useAuth();
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [tenders, setTenders] = useState<unknown[]>([]);
  const [contractReview, setContractReview] =
    useState<StreamChunk["contractReview"]>(undefined);
  const [metadata, setMetadata] = useState<StreamChunk["metadata"]>(undefined);
  const eventSourceRef = useRef<EventSource | null>(null);

  const stream = useCallback(
    async (
      messages: Array<{ role: string; content: string }>,
      existingThreadId?: string
    ) => {
      setContent("");
      setIsStreaming(true);
      setError(null);

      try {
        // Use fetch for POST with SSE
        const response = await fetch(`${BASE_URL}/agentChatStream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": uid ?? "anon",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            messages,
            thread_id: existingThreadId,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data: StreamChunk = JSON.parse(line.slice(6));

                if (data.error) {
                  setError(data.error);
                  setIsStreaming(false);
                  return;
                }

                if (data.content) {
                  setContent((prev) => prev + data.content);
                }

                if (data.thread_id) {
                  setThreadId(data.thread_id);
                }

                // Capture structured data from final message
                if (data.tenders && Array.isArray(data.tenders)) {
                  setTenders(data.tenders);
                }
                if (data.contractReview) {
                  setContractReview(data.contractReview);
                }
                if (data.metadata) {
                  setMetadata(data.metadata);
                }

                if (data.done) {
                  setIsStreaming(false);
                  return;
                }
              } catch (e) {
                console.warn("Failed to parse SSE data:", e);
              }
            }
          }
        }

        setIsStreaming(false);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        setIsStreaming(false);
      }
    },
    [uid, idToken]
  );

  const stop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    setContent("");
    setError(null);
    setThreadId(null);
    setTenders([]);
    setContractReview(undefined);
    setMetadata(undefined);
    stop();
  }, [stop]);

  return {
    content,
    isStreaming,
    error,
    threadId,
    tenders,
    contractReview,
    metadata,
    stream,
    stop,
    reset,
  };
}
