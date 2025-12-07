import { db } from "../lib/firestore";

/**
 * Agent telemetry data structure.
 */
export interface AgentTelemetry {
  agentId: string;
  userId?: string;
  threadId: string;
  intent: string;
  toolCalls: ToolCall[];
  decisions: Decision[];
  errors: ErrorLog[];
  performance: PerformanceMetrics;
  timestamp: Date;
}

export interface ToolCall {
  toolName: string;
  input: unknown;
  output?: unknown;
  duration: number;
  success: boolean;
  error?: string;
}

export interface Decision {
  node: string;
  reason: string;
  timestamp: Date;
}

export interface ErrorLog {
  type: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface PerformanceMetrics {
  totalLatency: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: number;
  toolCallCount: number;
  errorCount: number;
  steps?: number; // Number of steps taken
}

export interface NodeExecution {
  nodeId: string;
  agentId?: string;
  inputState?: Record<string, unknown>; // Snapshot of input state
  outputState?: Record<string, unknown>; // Snapshot of output state
  decision?: {
    reason: string;
    nextNode?: string;
    confidence?: number;
  };
  timestamp: Date;
  duration: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: string;
}

/**
 * Track agent execution for observability.
 */
export async function trackAgentExecution(
  telemetry: Partial<AgentTelemetry>
): Promise<void> {
  try {
    const fullTelemetry: AgentTelemetry = {
      agentId: telemetry.agentId || "unknown",
      userId: telemetry.userId,
      threadId: telemetry.threadId || "unknown",
      intent: telemetry.intent || "unknown",
      toolCalls: telemetry.toolCalls || [],
      decisions: telemetry.decisions || [],
      errors: telemetry.errors || [],
      performance: telemetry.performance || {
        totalLatency: 0,
        toolCallCount: 0,
        errorCount: 0,
      },
      timestamp: telemetry.timestamp || new Date(),
    };

    // Store in Firestore
    await db.collection("agent_telemetry").add({
      ...fullTelemetry,
      createdAt: new Date(),
    });

    // Also log for immediate debugging
    console.log("[Telemetry]", {
      agent: fullTelemetry.agentId,
      intent: fullTelemetry.intent,
      latency: fullTelemetry.performance.totalLatency,
      tools: fullTelemetry.toolCalls.length,
      errors: fullTelemetry.errors.length,
    });
  } catch (error) {
    console.error("Failed to track telemetry:", error);
    // Don't throw - telemetry failures shouldn't break the app
  }
}

/**
 * Track tool call for observability.
 */
export async function trackToolCall(
  toolName: string,
  input: unknown,
  output: unknown,
  duration: number,
  success: boolean,
  error?: string
): Promise<void> {
  try {
    await db.collection("tool_calls").add({
      toolName,
      input: JSON.stringify(input),
      output: success ? JSON.stringify(output) : null,
      duration,
      success,
      error,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Failed to track tool call:", error);
  }
}

/**
 * Track error for observability.
 */
export async function trackError(
  error: Error,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    await db.collection("agent_errors").add({
      type: error.name,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("Failed to track error:", err);
  }
}

/**
 * Get agent performance metrics.
 */
export async function getAgentMetrics(
  agentId: string,
  days: number = 7
): Promise<{
  avgLatency: number;
  successRate: number;
  errorRate: number;
  toolCallCount: number;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const snapshot = await db
      .collection("agent_telemetry")
      .where("agentId", "==", agentId)
      .where("timestamp", ">=", cutoffDate)
      .get();

    if (snapshot.empty) {
      return {
        avgLatency: 0,
        successRate: 0,
        errorRate: 0,
        toolCallCount: 0,
      };
    }

    let totalLatency = 0;
    let totalErrors = 0;
    let totalToolCalls = 0;
    const totalExecutions = snapshot.size;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalLatency += data.performance?.totalLatency || 0;
      totalErrors += data.errors?.length || 0;
      totalToolCalls += data.toolCalls?.length || 0;
    });

    return {
      avgLatency: totalLatency / totalExecutions,
      successRate: ((totalExecutions - totalErrors) / totalExecutions) * 100,
      errorRate: (totalErrors / totalExecutions) * 100,
      toolCallCount: totalToolCalls / totalExecutions,
    };
  } catch (error) {
    console.error("Failed to get agent metrics:", error);
    return {
      avgLatency: 0,
      successRate: 0,
      errorRate: 0,
      toolCallCount: 0,
    };
  }
}

/**
 * Track node execution for full observability.
 * Logs input/output state, decisions, and performance.
 */
export interface NodeExecution {
  nodeId: string;
  agentId?: string;
  inputState?: Record<string, unknown>; // Snapshot of input state
  outputState?: Record<string, unknown>; // Snapshot of output state
  decision?: {
    reason: string;
    nextNode?: string;
    confidence?: number;
  };
  timestamp: Date;
  duration: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  error?: string;
}

export async function trackNodeExecution(
  execution: NodeExecution
): Promise<void> {
  try {
    await db.collection("node_executions").add({
      ...execution,
      createdAt: new Date(),
    });

    // Log for debugging
    console.log("[Node Execution]", {
      node: execution.nodeId,
      agent: execution.agentId,
      duration: execution.duration,
      tokens: execution.tokenUsage?.total || 0,
      decision: execution.decision?.reason,
      error: execution.error,
    });
  } catch (error) {
    console.error("Failed to track node execution:", error);
    // Don't throw - telemetry failures shouldn't break the app
  }
}

/**
 * Track decision for routing and agent choices.
 */
export async function trackDecision(
  nodeId: string,
  decision: string,
  reason: string,
  confidence?: number,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    await db.collection("decisions").add({
      nodeId,
      decision,
      reason,
      confidence,
      context,
      timestamp: new Date(),
    });

    console.log("[Decision]", {
      node: nodeId,
      decision,
      reason,
      confidence,
    });
  } catch (error) {
    console.error("Failed to track decision:", error);
  }
}
