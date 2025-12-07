"use client";

import { Loader2, Search, Brain, FileText, CheckCircle } from "lucide-react";

export type AgentState =
  | "idle"
  | "thinking"
  | "searching"
  | "analyzing"
  | "formatting"
  | "complete";

interface AgentStatusProps {
  state: AgentState;
  progress?: number;
}

const stateConfig = {
  idle: {
    icon: null,
    text: "Pronto",
    color: "text-gray-500",
  },
  thinking: {
    icon: Brain,
    text: "Analizzando la richiesta...",
    color: "text-blue-500",
  },
  searching: {
    icon: Search,
    text: "Cercando bandi...",
    color: "text-green-500",
  },
  analyzing: {
    icon: FileText,
    text: "Analizzando eligibilità...",
    color: "text-purple-500",
  },
  formatting: {
    icon: Loader2,
    text: "Preparando risultati...",
    color: "text-orange-500",
  },
  complete: {
    icon: CheckCircle,
    text: "Completato",
    color: "text-green-600",
  },
};

export function AgentStatus({ state, progress }: AgentStatusProps) {
  const config = stateConfig[state];
  const Icon = config.icon;

  if (state === "idle") {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
      {Icon && (
        <Icon
          className={`h-4 w-4 ${config.color} ${
            state !== "complete" ? "animate-spin" : ""
          }`}
        />
      )}
      <span className={`text-sm font-medium ${config.color}`}>
        {config.text}
      </span>
      {progress !== undefined && state !== "complete" && (
        <div className="flex-1 max-w-xs">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
