import { onRequest } from "firebase-functions/v2/https";
import { db } from "../../lib/firestore";
import { setCors } from "../../utils/cors";

/**
 * Admin metrics endpoint - provides comprehensive analytics
 */
export const getAdminMetrics = onRequest(
  {
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 30,
  },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      // TODO: Add admin authentication check
      // const userId = req.headers["x-user-id"] as string;
      // if (!isAdmin(userId)) {
      //   res.status(403).json({ error: "Forbidden" });
      //   return;
      // }

      const { period = "7d" } = req.query;
      const periodDays = parsePeriod(period as string);

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      // 1. Agent Usage Metrics
      const agentMetrics = await getAgentUsageMetrics(startDate, endDate);

      // 2. User Activity Metrics
      const userMetrics = await getUserActivityMetrics(startDate, endDate);

      // 3. Search Performance Metrics
      const searchMetrics = await getSearchPerformanceMetrics(
        startDate,
        endDate
      );

      // 4. Error Metrics
      const errorMetrics = await getErrorMetrics(startDate, endDate);

      // 5. Tool Usage Metrics
      const toolMetrics = await getToolUsageMetrics(startDate, endDate);

      // 6. Tender Discovery Metrics
      const tenderMetrics = await getTenderDiscoveryMetrics(startDate, endDate);

      // 7. System Health Metrics
      const healthMetrics = await getSystemHealthMetrics(startDate, endDate);

      res.json({
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: periodDays,
        },
        metrics: {
          agents: agentMetrics,
          users: userMetrics,
          search: searchMetrics,
          errors: errorMetrics,
          tools: toolMetrics,
          tenders: tenderMetrics,
          health: healthMetrics,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching admin metrics:", error);
      res.status(500).json({
        error: "Failed to fetch metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * Parse period string (e.g., "7d", "30d", "90d") to days
 */
function parsePeriod(period: string): number {
  const match = period.match(/^(\d+)([dwmy])$/);
  if (!match) return 7; // Default to 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "d":
      return value;
    case "w":
      return value * 7;
    case "m":
      return value * 30;
    case "y":
      return value * 365;
    default:
      return 7;
  }
}

/**
 * Get agent usage metrics
 */
async function getAgentUsageMetrics(startDate: Date, endDate: Date) {
  const telemetryRef = db.collection("agent_telemetry");
  const snapshot = await telemetryRef
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
    .get();

  const metrics: {
    totalExecutions: number;
    byAgent: Record<
      string,
      {
        count: number;
        totalLatency: number;
        errors: number;
        averageLatency: number;
      }
    >;
    byIntent: Record<string, { count: number }>;
    averageLatency: number;
    totalLatency: number;
    errorRate: number;
    totalErrors: number;
  } = {
    totalExecutions: snapshot.size,
    byAgent: {},
    byIntent: {},
    averageLatency: 0,
    totalLatency: 0,
    errorRate: 0,
    totalErrors: 0,
  };

  const latencies: number[] = [];
  let totalErrors = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    const agentId = data.agentId || "unknown";
    const intent = data.intent || "unknown";
    const latency = data.performance?.totalLatency || 0;
    const errorCount = data.errors?.length || 0;

    // By agent
    if (!metrics.byAgent[agentId]) {
      metrics.byAgent[agentId] = {
        count: 0,
        totalLatency: 0,
        errors: 0,
        averageLatency: 0,
      };
    }
    metrics.byAgent[agentId].count++;
    metrics.byAgent[agentId].totalLatency += latency;
    metrics.byAgent[agentId].errors += errorCount;

    // By intent
    if (!metrics.byIntent[intent]) {
      metrics.byIntent[intent] = { count: 0 };
    }
    metrics.byIntent[intent].count++;

    if (latency > 0) latencies.push(latency);
    totalErrors += errorCount;
  });

  // Calculate averages
  if (latencies.length > 0) {
    metrics.totalLatency = latencies.reduce((a, b) => a + b, 0);
    metrics.averageLatency = metrics.totalLatency / latencies.length;
  }

  metrics.totalErrors = totalErrors;
  metrics.errorRate =
    metrics.totalExecutions > 0 ? totalErrors / metrics.totalExecutions : 0;

  // Calculate per-agent averages
  Object.keys(metrics.byAgent).forEach((agentId) => {
    const agent = metrics.byAgent[agentId];
    agent.averageLatency =
      agent.count > 0 ? agent.totalLatency / agent.count : 0;
  });

  return metrics;
}

/**
 * Get user activity metrics
 */
async function getUserActivityMetrics(startDate: Date, endDate: Date) {
  const telemetryRef = db.collection("agent_telemetry");
  const snapshot = await telemetryRef
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
    .get();

  const uniqueUsers = new Set<string>();
  const userActivity: Record<string, number> = {};

  snapshot.forEach((doc) => {
    const userId = doc.data().userId;
    if (userId && userId !== "anon" && userId !== "unknown") {
      uniqueUsers.add(userId);
      userActivity[userId] = (userActivity[userId] || 0) + 1;
    }
  });

  // Top active users
  const topUsers = Object.entries(userActivity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([userId, count]) => ({ userId, count }));

  return {
    totalUsers: uniqueUsers.size,
    totalSessions: snapshot.size,
    anonymousSessions: Array.from(
      new Set(
        snapshot.docs
          .map((d) => d.data().threadId)
          .filter((t) => t && t !== "unknown")
      )
    ).length,
    topUsers,
    averageSessionsPerUser:
      uniqueUsers.size > 0 ? snapshot.size / uniqueUsers.size : 0,
  };
}

/**
 * Get search performance metrics
 */
async function getSearchPerformanceMetrics(startDate: Date, endDate: Date) {
  const telemetryRef = db.collection("agent_telemetry");
  const snapshot = await telemetryRef
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
    .where("agentId", "==", "search_agent")
    .get();

  const metrics = {
    totalSearches: snapshot.size,
    averageLatency: 0,
    toolCalls: {
      build_ted_query: 0,
      search_tenders: 0,
      advanced_search: 0,
      framework_agreement_search: 0,
    },
    averageResultsPerSearch: 0,
    totalResults: 0,
  };

  const latencies: number[] = [];
  const totalResults = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    const latency = data.performance?.totalLatency || 0;
    if (latency > 0) latencies.push(latency);

    // Count tool calls
    const toolCalls = data.toolCalls || [];
    toolCalls.forEach((tool: { name?: string }) => {
      if (tool.name && tool.name in metrics.toolCalls) {
        metrics.toolCalls[tool.name as keyof typeof metrics.toolCalls]++;
      }
    });

    // Estimate results from tool calls (if available)
    // This would need to be tracked in telemetry
  });

  if (latencies.length > 0) {
    metrics.averageLatency =
      latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  metrics.averageResultsPerSearch =
    metrics.totalSearches > 0 ? totalResults / metrics.totalSearches : 0;

  return metrics;
}

/**
 * Get error metrics
 */
async function getErrorMetrics(startDate: Date, endDate: Date) {
  const errorsRef = db.collection("agent_errors");
  const snapshot = await errorsRef
    .where("timestamp", ">=", startDate)
    .where("timestamp", "<=", endDate)
    .get();

  const metrics = {
    totalErrors: snapshot.size,
    byAgent: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    recentErrors: [] as Array<{
      id: string;
      type: string;
      message: string;
      timestamp: string;
      stack?: string;
      context?: Record<string, unknown>;
    }>,
  };

  snapshot.forEach((doc) => {
    const data = doc.data();
    const agent = data.agent || data.agentId || "unknown";
    const errorType = data.type || "unknown";

    metrics.byAgent[agent] = (metrics.byAgent[agent] || 0) + 1;
    metrics.byType[errorType] = (metrics.byType[errorType] || 0) + 1;
  });

  // Get recent errors (last 10)
  const recentSnapshot = await errorsRef
    .orderBy("timestamp", "desc")
    .limit(10)
    .get();

  metrics.recentErrors = recentSnapshot.docs.map((doc) => {
    const data = doc.data();
    const timestamp = data.timestamp;
    return {
      id: doc.id,
      type: data.type || "unknown",
      message: data.message || "Unknown error",
      stack: data.stack,
      context: data.context,
      timestamp:
        timestamp?.toDate?.()?.toISOString() ||
        (timestamp instanceof Date
          ? timestamp.toISOString()
          : new Date().toISOString()),
    };
  });

  return metrics;
}

/**
 * Get tool usage metrics
 */
async function getToolUsageMetrics(startDate: Date, endDate: Date) {
  const telemetryRef = db.collection("agent_telemetry");
  const snapshot = await telemetryRef
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
    .get();

  const toolUsage: Record<string, number> = {};
  const toolLatencies: Record<string, number[]> = {};

  snapshot.forEach((doc) => {
    const toolCalls = doc.data().toolCalls || [];
    toolCalls.forEach(
      (tool: { name?: string; duration?: number; latency?: number }) => {
        if (tool.name) {
          toolUsage[tool.name] = (toolUsage[tool.name] || 0) + 1;
          const toolDuration = tool.duration || tool.latency || 0;
          if (toolDuration > 0) {
            if (!toolLatencies[tool.name]) {
              toolLatencies[tool.name] = [];
            }
            toolLatencies[tool.name].push(toolDuration);
          }
        }
      }
    );
  });

  // Calculate averages
  const toolMetrics = Object.keys(toolUsage).map((toolName) => {
    const latencies = toolLatencies[toolName] || [];
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    return {
      name: toolName,
      count: toolUsage[toolName],
      averageLatency: avgLatency,
    };
  });

  return {
    totalToolCalls: Object.values(toolUsage).reduce((a, b) => a + b, 0),
    byTool: toolMetrics.sort((a, b) => b.count - a.count),
  };
}

/**
 * Get tender discovery metrics
 */
async function getTenderDiscoveryMetrics(startDate: Date, endDate: Date) {
  // This would need to be tracked separately or extracted from tool results
  // For now, we'll estimate from search agent executions
  const telemetryRef = db.collection("agent_telemetry");
  const snapshot = await telemetryRef
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
    .where("agentId", "==", "search_agent")
    .get();

  // TODO: Track actual tender counts in telemetry
  return {
    totalSearches: snapshot.size,
    estimatedTendersFound: snapshot.size * 5, // Rough estimate
    note: "Actual tender counts should be tracked in tool results",
  };
}

/**
 * Get system health metrics
 */
async function getSystemHealthMetrics(startDate: Date, endDate: Date) {
  const telemetryRef = db.collection("agent_telemetry");
  const errorsRef = db.collection("agent_errors");

  const [telemetrySnapshot, errorsSnapshot] = await Promise.all([
    telemetryRef
      .where("createdAt", ">=", startDate)
      .where("createdAt", "<=", endDate)
      .get(),
    errorsRef
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .get(),
  ]);

  const totalExecutions = telemetrySnapshot.size;
  const totalErrors = errorsSnapshot.size;

  // Calculate uptime/health score
  const errorRate = totalExecutions > 0 ? totalErrors / totalExecutions : 0;
  const healthScore = Math.max(0, 100 - errorRate * 100);

  // Get average latency
  const latencies: number[] = [];
  telemetrySnapshot.forEach((doc) => {
    const latency = doc.data().performance?.totalLatency;
    if (latency && latency > 0) {
      latencies.push(latency);
    }
  });

  const averageLatency =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

  return {
    healthScore: Math.round(healthScore * 100) / 100,
    errorRate: Math.round(errorRate * 10000) / 100, // Percentage
    averageLatency: Math.round(averageLatency),
    totalExecutions,
    totalErrors,
    uptime:
      errorRate < 0.05 ? "healthy" : errorRate < 0.1 ? "degraded" : "unhealthy",
  };
}
