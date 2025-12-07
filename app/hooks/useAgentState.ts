"use client";

import { useState, useEffect } from "react";

/**
 * Agent state detection from streaming content.
 * Infers what the agent is doing based on content patterns.
 */
export type AgentState =
  | "idle"
  | "thinking"
  | "searching"
  | "analyzing"
  | "formatting"
  | "complete";

export function useAgentState(
  content: string,
  isStreaming: boolean
): AgentState {
  const [state, setState] = useState<AgentState>("idle");

  useEffect(() => {
    if (!isStreaming && !content) {
      setState("idle");
      return;
    }

    if (!isStreaming && content) {
      setState("complete");
      return;
    }

    if (isStreaming) {
      const lowerContent = content.toLowerCase();

      // Detect state from content patterns
      if (
        lowerContent.includes("| pubno") ||
        lowerContent.includes("| noticeid")
      ) {
        setState("formatting");
      } else if (
        lowerContent.includes("eligibilità") ||
        lowerContent.includes("score") ||
        lowerContent.includes("analisi")
      ) {
        setState("analyzing");
      } else if (
        lowerContent.includes("bando") ||
        lowerContent.includes("tender") ||
        lowerContent.includes("trovato")
      ) {
        setState("searching");
      } else if (content.length > 0) {
        setState("formatting");
      } else {
        setState("thinking");
      }
    }
  }, [content, isStreaming]);

  return state;
}
