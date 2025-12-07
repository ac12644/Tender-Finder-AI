import {
  START,
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
} from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { searchAgent } from "./agents/search";
import { analysisAgent } from "./agents/analysis";
import { personalizationAgent } from "./agents/personalization";
import { rankingAgent } from "./agents/ranking";
import { applicationAgent } from "./agents/application";
import { contractReviewAgent } from "./agents/contractReview";
import {
  trackAgentExecution,
  trackError,
  trackNodeExecution,
  trackDecision,
} from "./telemetry";
import { extractTokenUsageAndCost } from "../utils/tokenTracking";

/**
 * User intent classification.
 */
export type UserIntent =
  | "search"
  | "analyze"
  | "personalize"
  | "rank"
  | "apply"
  | "review_contract"
  | "general"
  | "unknown";

/**
 * Classify user intent from the last message.
 * TODO: Use small LLM model for better classification accuracy
 */
function classifyIntent(messages: BaseMessage[]): UserIntent {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.content) return "unknown";

  const content = String(lastMessage.content).toLowerCase();

  // Track classification decision
  // Note: In production, this could use a small LLM model for better accuracy

  // Analysis intent
  if (
    content.includes("analizza") ||
    content.includes("eligibilità") ||
    content.includes("compatibile") ||
    content.includes("adatto") ||
    content.includes("score") ||
    content.includes("punteggio")
  ) {
    return "analyze";
  }

  // Application intent
  if (
    content.includes("applica") ||
    content.includes("candidati") ||
    content.includes("invia") ||
    content.includes("domanda") ||
    content.includes("partecipa") ||
    content.includes("apply") ||
    content.includes("submit")
  ) {
    return "apply";
  }

  // Contract review intent
  if (
    content.includes("contratto") ||
    content.includes("contract") ||
    content.includes("revisione") ||
    content.includes("review") ||
    content.includes("analizza contratto") ||
    content.includes("rischi") ||
    content.includes("clausole") ||
    content.includes("clauses") ||
    content.includes("upload") ||
    content.includes("carica")
  ) {
    return "review_contract";
  }

  // Ranking intent (but NOT simple sorting - that's handled by search agent)
  // Only route to rank if it's about ranking/scoring with user preferences
  if (
    (content.includes("classifica") &&
      !content.includes("cerca") &&
      !content.includes("trova")) ||
    (content.includes("migliori") &&
      (content.includes("per me") || content.includes("personalizzato"))) ||
    content.includes("shortlist") ||
    (content.includes("priorità") &&
      !content.includes("cerca") &&
      !content.includes("trova")) ||
    (content.includes("rank") &&
      !content.includes("search") &&
      !content.includes("find"))
  ) {
    return "rank";
  }

  // If it's a search query with "ordinati" or "ordina", it's still a search (search agent can sort)
  // Only route to rank if it's explicitly about ranking/scoring, not just sorting results

  // Personalization intent
  if (
    content.includes("suggerimenti") ||
    content.includes("raccomandazioni") ||
    content.includes("per me") ||
    content.includes("personalizzato") ||
    content.includes("consigli")
  ) {
    return "personalize";
  }

  // Search intent (default for tender-related queries)
  if (
    content.includes("bando") ||
    content.includes("tender") ||
    content.includes("appalto") ||
    content.includes("gara") ||
    content.includes("trova") ||
    content.includes("cerca") ||
    content.includes("mostra")
  ) {
    return "search";
  }

  return "general";
}

/**
 * Route to appropriate agent based on intent.
 */
async function routeByIntent(state: {
  messages: BaseMessage[];
}): Promise<string> {
  const intent = classifyIntent(state.messages);
  const nextNode =
    intent === "search"
      ? "search"
      : intent === "analyze"
      ? "analyze"
      : intent === "personalize"
      ? "personalize"
      : intent === "rank"
      ? "rank"
      : intent === "apply"
      ? "apply"
      : "search"; // Default to search

  // Track routing decision
  await trackDecision(
    "classify",
    nextNode,
    `Routed to ${nextNode} based on intent: ${intent}`,
    0.8,
    {
      intent,
      messagePreview: String(
        state.messages[state.messages.length - 1]?.content || ""
      ).substring(0, 100),
    }
  );

  return nextNode;
}

/**
 * Format final response from agent output.
 */
async function formatResponse(state: { messages: BaseMessage[] }) {
  // The agents already format their responses, so we just pass through
  return state;
}

/**
 * Supervisor Agent - Routes requests to specialized agents.
 *
 * Architecture:
 * - Classifies user intent
 * - Routes to appropriate specialized agent
 * - Formats final response
 * - Manages conversation flow
 */
const checkpointer = new MemorySaver();

// Create agent instances (lazy-loaded to avoid secret access during deployment)
let searchAgentInstance: Awaited<ReturnType<typeof searchAgent>> | null = null;
let analysisAgentInstance: Awaited<ReturnType<typeof analysisAgent>> | null =
  null;
let personalizationAgentInstance: Awaited<
  ReturnType<typeof personalizationAgent>
> | null = null;
let rankingAgentInstance: Awaited<ReturnType<typeof rankingAgent>> | null =
  null;
let applicationAgentInstance: Awaited<
  ReturnType<typeof applicationAgent>
> | null = null;
let contractReviewAgentInstance: Awaited<
  ReturnType<typeof contractReviewAgent>
> | null = null;

// Agent timeout configuration (in milliseconds)
const AGENT_TIMEOUTS: Record<string, number> = {
  search_agent: 60000, // 1 minute
  analysis_agent: 90000, // 1.5 minutes
  personalization_agent: 60000, // 1 minute
  ranking_agent: 60000, // 1 minute
  application_agent: 120000, // 2 minutes (email sending can be slow)
  contract_review_agent: 180000, // 3 minutes (RAG processing can be slow)
};

// Max steps per agent are enforced via LangGraph config in invokeSupervisor
// Individual agent step limits can be configured per-agent if needed

export const supervisor = new StateGraph(MessagesAnnotation)
  .addNode("classify", async (state) => {
    const startTime = Date.now();
    // Intent classification happens in routing
    const intent = classifyIntent(state.messages);

    // Track decision
    await trackDecision(
      "classify",
      intent,
      `Classified user intent from message: "${String(
        state.messages[state.messages.length - 1]?.content || ""
      ).substring(0, 100)}"`,
      0.8 // Confidence
    );

    // Track node execution
    await trackNodeExecution({
      nodeId: "classify",
      inputState: {
        messageCount: state.messages.length,
        lastMessage: String(
          state.messages[state.messages.length - 1]?.content || ""
        ).substring(0, 200),
      },
      outputState: {
        intent,
      },
      decision: {
        reason: `Intent classified as: ${intent}`,
        nextNode: intent,
        confidence: 0.8,
      },
      timestamp: new Date(),
      duration: Date.now() - startTime,
    });

    console.log("[Supervisor] Intent classified:", intent);
    return state;
  })
  .addNode("search", async (state, config) => {
    const startTime = Date.now();
    const agentId = "search_agent";
    const timeout = AGENT_TIMEOUTS[agentId] || 60000;

    // Track node input
    await trackNodeExecution({
      nodeId: "search",
      agentId,
      inputState: {
        messageCount: state.messages.length,
        lastMessage: String(
          state.messages[state.messages.length - 1]?.content || ""
        ).substring(0, 200),
      },
      timestamp: new Date(),
      duration: 0,
    });

    try {
      if (!searchAgentInstance) {
        searchAgentInstance = await searchAgent();
      }

      // Execute with timeout
      const invokePromise = searchAgentInstance.invoke(state, config);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Agent ${agentId} timed out after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([invokePromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      // Extract token usage and cost
      const { tokenUsage, cost } = extractTokenUsageAndCost(result, agentId);

      // Extract tool calls and tender counts from result
      const resultMessages = (result?.messages ?? []) as BaseMessage[];
      const toolCalls: Array<{
        toolName: string;
        input: unknown;
        output?: unknown;
        duration: number;
        success: boolean;
        error?: string;
      }> = [];
      let tenderCount = 0;

      for (const msg of resultMessages) {
        const getMessageType = (m: BaseMessage): string | undefined => {
          if (
            typeof (m as { _getType?: () => string })._getType === "function"
          ) {
            return (m as { _getType: () => string })._getType();
          }
          return (m as { type?: string }).type;
        };

        if (getMessageType(msg) === "tool") {
          const toolName = (msg as { name?: string }).name || "unknown";
          const content = msg.content;

          // Count tenders from search_tenders tool
          if (toolName === "search_tenders" && content) {
            try {
              const parsed =
                typeof content === "string" ? JSON.parse(content) : content;
              if (Array.isArray(parsed)) {
                tenderCount = parsed.length;
              }
            } catch {
              // Skip
            }
          }

          toolCalls.push({
            toolName,
            input: {}, // Simplified for metrics
            output: tenderCount > 0 ? { count: tenderCount } : undefined,
            duration: 0, // Tool duration tracked separately
            success: true,
          });
        }
      }

      // Track node output
      await trackNodeExecution({
        nodeId: "search",
        agentId: "search_agent",
        outputState: {
          messageCount: resultMessages.length,
          toolCallsCount: toolCalls.length,
          tenderCount,
        },
        timestamp: new Date(),
        duration,
        tokenUsage: tokenUsage || undefined,
      });

      // Track telemetry
      await trackAgentExecution({
        agentId: "search_agent",
        userId: config?.configurable?.user_id as string | undefined,
        threadId: (config?.configurable?.thread_id as string) || "unknown",
        intent: "search",
        toolCalls,
        performance: {
          totalLatency: duration,
          toolCallCount: toolCalls.length,
          errorCount: 0,
          tokenUsage: tokenUsage || undefined,
          cost: cost || undefined,
        },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await trackNodeExecution({
        nodeId: "search",
        agentId: "search_agent",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        duration,
      });
      await trackError(error as Error, { agent: "search_agent", state });
      throw error;
    }
  })
  .addNode("analyze", async (state, config) => {
    const startTime = Date.now();
    const agentId = "analysis_agent";
    const timeout = AGENT_TIMEOUTS[agentId] || 90000;

    await trackNodeExecution({
      nodeId: "analyze",
      agentId,
      inputState: {
        messageCount: state.messages.length,
      },
      timestamp: new Date(),
      duration: 0,
    });

    try {
      if (!analysisAgentInstance) {
        analysisAgentInstance = await analysisAgent();
      }

      const invokePromise = analysisAgentInstance.invoke(state, config);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Agent ${agentId} timed out after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([invokePromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      // Extract token usage and cost
      const { tokenUsage, cost } = extractTokenUsageAndCost(result, agentId);

      await trackNodeExecution({
        nodeId: "analyze",
        agentId: "analysis_agent",
        outputState: {
          messageCount: (result?.messages?.length || 0) as number,
        },
        timestamp: new Date(),
        duration,
        tokenUsage: tokenUsage || undefined,
      });

      await trackAgentExecution({
        agentId: "analysis_agent",
        userId: config?.configurable?.user_id as string | undefined,
        threadId: (config?.configurable?.thread_id as string) || "unknown",
        intent: "analyze",
        performance: {
          totalLatency: duration,
          toolCallCount: 0,
          errorCount: 0,
          tokenUsage: tokenUsage || undefined,
          cost: cost || undefined,
        },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await trackNodeExecution({
        nodeId: "analyze",
        agentId: "analysis_agent",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        duration,
      });
      await trackError(error as Error, { agent: "analysis_agent", state });
      throw error;
    }
  })
  .addNode("personalize", async (state, config) => {
    const startTime = Date.now();
    const agentId = "personalization_agent";
    const timeout = AGENT_TIMEOUTS[agentId] || 60000;

    await trackNodeExecution({
      nodeId: "personalize",
      agentId,
      inputState: { messageCount: state.messages.length },
      timestamp: new Date(),
      duration: 0,
    });

    try {
      if (!personalizationAgentInstance) {
        personalizationAgentInstance = await personalizationAgent();
      }

      const invokePromise = personalizationAgentInstance.invoke(state, config);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Agent ${agentId} timed out after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([invokePromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      await trackNodeExecution({
        nodeId: "personalize",
        agentId: "personalization_agent",
        outputState: {
          messageCount: (result?.messages?.length || 0) as number,
        },
        timestamp: new Date(),
        duration,
      });

      await trackAgentExecution({
        agentId: "personalization_agent",
        userId: config?.configurable?.user_id as string | undefined,
        threadId: (config?.configurable?.thread_id as string) || "unknown",
        intent: "personalize",
        performance: {
          totalLatency: duration,
          toolCallCount: 0,
          errorCount: 0,
        },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await trackNodeExecution({
        nodeId: "personalize",
        agentId: "personalization_agent",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        duration,
      });
      await trackError(error as Error, {
        agent: "personalization_agent",
        state,
      });
      throw error;
    }
  })
  .addNode("rank", async (state, config) => {
    const startTime = Date.now();
    const agentId = "ranking_agent";
    const timeout = AGENT_TIMEOUTS[agentId] || 60000;

    await trackNodeExecution({
      nodeId: "rank",
      agentId,
      inputState: { messageCount: state.messages.length },
      timestamp: new Date(),
      duration: 0,
    });

    try {
      if (!rankingAgentInstance) {
        rankingAgentInstance = await rankingAgent();
      }

      const invokePromise = rankingAgentInstance.invoke(state, config);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Agent ${agentId} timed out after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([invokePromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      await trackNodeExecution({
        nodeId: "rank",
        agentId: "ranking_agent",
        outputState: {
          messageCount: (result?.messages?.length || 0) as number,
        },
        timestamp: new Date(),
        duration,
      });

      await trackAgentExecution({
        agentId: "ranking_agent",
        userId: config?.configurable?.user_id as string | undefined,
        threadId: (config?.configurable?.thread_id as string) || "unknown",
        intent: "rank",
        performance: {
          totalLatency: duration,
          toolCallCount: 0,
          errorCount: 0,
        },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await trackNodeExecution({
        nodeId: "rank",
        agentId: "ranking_agent",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        duration,
      });
      await trackError(error as Error, {
        agent: "ranking_agent",
        state,
      });
      throw error;
    }
  })
  .addNode("apply", async (state, config) => {
    const startTime = Date.now();
    const agentId = "application_agent";
    const timeout = AGENT_TIMEOUTS[agentId] || 120000;

    await trackNodeExecution({
      nodeId: "apply",
      agentId,
      inputState: { messageCount: state.messages.length },
      timestamp: new Date(),
      duration: 0,
    });

    try {
      if (!applicationAgentInstance) {
        applicationAgentInstance = await applicationAgent();
      }

      const invokePromise = applicationAgentInstance.invoke(state, config);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Agent ${agentId} timed out after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([invokePromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      await trackNodeExecution({
        nodeId: "apply",
        agentId: "application_agent",
        outputState: {
          messageCount: (result?.messages?.length || 0) as number,
        },
        timestamp: new Date(),
        duration,
      });

      await trackAgentExecution({
        agentId: "application_agent",
        userId: config?.configurable?.user_id as string | undefined,
        threadId: (config?.configurable?.thread_id as string) || "unknown",
        intent: "apply",
        performance: {
          totalLatency: duration,
          toolCallCount: 0,
          errorCount: 0,
        },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await trackNodeExecution({
        nodeId: "apply",
        agentId: "application_agent",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        duration,
      });
      await trackError(error as Error, {
        agent: "application_agent",
        state,
      });
      throw error;
    }
  })
  .addNode("review_contract", async (state, config) => {
    const startTime = Date.now();
    const agentId = "contract_review_agent";
    const timeout = AGENT_TIMEOUTS[agentId] || 180000;

    await trackNodeExecution({
      nodeId: "review_contract",
      agentId,
      inputState: { messageCount: state.messages.length },
      timestamp: new Date(),
      duration: 0,
    });

    try {
      if (!contractReviewAgentInstance) {
        contractReviewAgentInstance = await contractReviewAgent();
      }

      const invokePromise = contractReviewAgentInstance.invoke(state, config);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Agent ${agentId} timed out after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([invokePromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      // Extract token usage and cost
      const { tokenUsage, cost } = extractTokenUsageAndCost(result, agentId);

      await trackNodeExecution({
        nodeId: "review_contract",
        agentId: "contract_review_agent",
        outputState: {
          messageCount: (result?.messages?.length || 0) as number,
        },
        timestamp: new Date(),
        duration,
        tokenUsage: tokenUsage || undefined,
      });

      await trackAgentExecution({
        agentId: "contract_review_agent",
        userId: config?.configurable?.user_id as string | undefined,
        threadId: (config?.configurable?.thread_id as string) || "unknown",
        intent: "review_contract",
        performance: {
          totalLatency: duration,
          toolCallCount: 0,
          errorCount: 0,
          tokenUsage: tokenUsage || undefined,
          cost: cost || undefined,
        },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await trackNodeExecution({
        nodeId: "review_contract",
        agentId: "contract_review_agent",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        duration,
      });
      await trackError(error as Error, {
        agent: "contract_review_agent",
        state,
      });
      throw error;
    }
  })
  .addNode("format", formatResponse)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", routeByIntent, {
    search: "search",
    analyze: "analyze",
    rank: "rank",
    personalize: "personalize",
    apply: "apply",
    review_contract: "review_contract",
  })
  .addEdge("search", "format")
  .addEdge("analyze", "format")
  .addEdge("personalize", "format")
  .addEdge("rank", "format")
  .addEdge("apply", "format")
  .addEdge("review_contract", "format")
  .compile({
    name: "supervisor_graph",
    checkpointer,
  });

/**
 * Enhanced supervisor invocation with max steps, timeout, and quotas.
 */
export async function invokeSupervisor(
  state: { messages: BaseMessage[] },
  config?: {
    configurable?: {
      thread_id?: string;
      user_id?: string;
    };
    maxSteps?: number;
    timeoutMs?: number;
  }
): Promise<{ messages: BaseMessage[] }> {
  const maxSteps = config?.maxSteps ?? 10; // Default max 10 steps
  const timeoutMs = config?.timeoutMs ?? 120000; // Default 2 minutes
  const userId = config?.configurable?.user_id;

  // Check per-user quota (simplified - would use Firestore in production)
  if (userId && userId !== "anon") {
    // TODO: Implement quota checking from Firestore
    // const quota = await checkUserQuota(userId);
    // if (quota.exceeded) {
    //   throw new Error("User quota exceeded. Please try again later.");
    // }
  }

  // Wrap invoke with timeout
  const invokePromise = supervisor.invoke(state, {
    ...config,
    configurable: {
      ...config?.configurable,
      maxSteps, // Pass to LangGraph
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Supervisor timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = (await Promise.race([invokePromise, timeoutPromise])) as {
      messages: BaseMessage[];
    };
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("timeout")) {
      await trackError(error, {
        agent: "supervisor",
        userId,
        timeout: true,
      });
    }
    throw error;
  }
}

/**
 * Main app export - use supervisor for all requests.
 */
export const app = supervisor;
