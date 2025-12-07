/**
 * Contract Review Tools using RAG
 */

import { z } from "zod";
import { safeTool } from "../tooling";
import { processContractDocument, hybridSearch } from "../../lib/rag";
import { llmFactory } from "../../lib/llm";

const ReviewContractInput = z.object({
  contractId: z.string().min(1),
  contractText: z.string().min(100), // Minimum contract length
  language: z.enum(["it", "en"]).default("it"),
});

/**
 * Process and store a contract for review
 */
export const processContractTool = safeTool({
  name: "process_contract",
  description:
    "Process a contract document: chunk it, generate embeddings, and store for review. Use this when a user uploads a contract.",
  schema: ReviewContractInput,
  fn: async ({ contractId, contractText, language }) => {
    try {
      const chunks = await processContractDocument(contractId, contractText, {
        source: `contract_${contractId}`,
        title: `Contract ${contractId}`,
        language,
      });

      return {
        success: true,
        chunksCreated: chunks.length,
        contractId,
        message: `Contract processed into ${chunks.length} chunks`,
      };
    } catch (error) {
      console.error("Error processing contract:", error);
      return {
        success: false,
        chunksCreated: 0,
        contractId,
        message: "Failed to process contract",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

const ReviewContractQueryInput = z.object({
  contractId: z.string().min(1),
  questions: z.array(z.string()).optional(), // Specific questions to answer
  focusAreas: z
    .array(
      z.enum([
        "risk",
        "obligations",
        "rights",
        "payment",
        "termination",
        "liability",
        "disputes",
        "compliance",
      ])
    )
    .optional(), // Areas to focus on
});

/**
 * Review a contract using RAG to find relevant clauses
 */
export const reviewContractTool = safeTool({
  name: "review_contract",
  description:
    "Review a contract using RAG to extract relevant clauses, identify risks, and answer questions. Use this to analyze uploaded contracts.",
  schema: ReviewContractQueryInput,
  fn: async ({ contractId, questions = [], focusAreas = [] }) => {
    try {
      const llm = await llmFactory();

      // Build query from questions and focus areas
      const queryParts: string[] = [];
      if (questions.length > 0) {
        queryParts.push(...questions);
      }
      if (focusAreas.length > 0) {
        queryParts.push(
          ...focusAreas.map(
            (area) => `${area} clauses obligations risks terms conditions`
          )
        );
      }

      const query =
        queryParts.length > 0
          ? queryParts.join(" ")
          : "contract terms conditions obligations rights risks";

      // Search for relevant chunks using hybrid search
      const relevantChunks = await hybridSearch(query, {
        limit: 10,
        documentType: "contract",
        semanticWeight: 0.7,
      });

      if (relevantChunks.length === 0) {
        return {
          contractId,
          review: {
            summary: "No relevant contract clauses found",
            risks: [],
            opportunities: [],
            questions: [],
          },
          message: "Contract not found or not processed yet",
        };
      }

      // Build context from relevant chunks
      const context = relevantChunks
        .map(
          (chunk, idx) =>
            `[Chunk ${idx + 1}, Score: ${chunk.score.toFixed(2)}]\n${
              chunk.content
            }`
        )
        .join("\n\n---\n\n");

      // Generate review using LLM
      const prompt = `
You are a contract review expert specializing in Italian public procurement contracts.

CONTRACT CONTEXT (from RAG retrieval):
${context}

${
  questions.length > 0
    ? `SPECIFIC QUESTIONS:\n${questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n")}\n`
    : ""
}
${
  focusAreas.length > 0
    ? `FOCUS AREAS:\n${focusAreas.map((a) => `- ${a}`).join("\n")}\n`
    : ""
}

Analyze this contract and provide a comprehensive review. Return ONLY a valid JSON object with these exact fields:

{
  "summary": "Brief summary of the contract (2-3 sentences)",
  "keyClauses": [
    {
      "type": "obligation" | "right" | "risk" | "payment" | "termination" | "liability" | "dispute" | "compliance",
      "description": "Description of the clause",
      "relevance": "high" | "medium" | "low",
      "chunkIndex": number
    }
  ],
  "risks": [
    {
      "severity": "high" | "medium" | "low",
      "description": "Description of the risk",
      "recommendation": "What to do about it"
    }
  ],
  "opportunities": [
    {
      "type": "advantage" | "flexibility" | "benefit",
      "description": "Description of the opportunity"
    }
  ],
  "questions": [
    {
      "question": "Question to ask the contracting authority",
      "priority": "high" | "medium" | "low",
      "reason": "Why this question is important"
    }
  ],
  "overallAssessment": {
    "riskLevel": "high" | "medium" | "low",
    "recommendation": "proceed" | "proceed_with_caution" | "review_carefully" | "do_not_proceed",
    "reasoning": "Explanation of the recommendation"
  },
  "complianceCheck": {
    "italianLaw": "compliant" | "potential_issues" | "non_compliant" | "unclear",
    "issues": ["list of compliance issues if any"]
  }
}

Be thorough and specific. Reference the actual contract clauses in your analysis.
`;

      const response = await llm.invoke(prompt);
      const content =
        typeof response === "string"
          ? response
          : (response as { content?: string }).content || String(response);

      // Extract JSON from response
      let jsonStr = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      jsonStr = jsonStr.replace(/```json\n?|\n?```/g, "").trim();

      const review = JSON.parse(jsonStr);

      return {
        contractId,
        review,
        relevantChunks: relevantChunks.length,
        message: "Contract review completed",
      };
    } catch (error) {
      console.error("Error reviewing contract:", error);
      return {
        contractId,
        review: {
          summary: "Review failed",
          risks: [
            {
              severity: "high" as const,
              description: "Unable to complete review due to error",
              recommendation: "Please try again or contact support",
            },
          ],
          opportunities: [],
          questions: [],
        },
        message: "Failed to review contract",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

const SearchLegalReferenceInput = z.object({
  query: z.string().min(1),
  topic: z
    .enum([
      "public_procurement",
      "contract_law",
      "liability",
      "payment",
      "termination",
      "disputes",
    ])
    .optional(),
});

/**
 * Search legal references and precedents using RAG
 */
export const searchLegalReferenceTool = safeTool({
  name: "search_legal_reference",
  description:
    "Search legal references, precedents, and Italian public procurement law using RAG. Use this to find relevant legal information.",
  schema: SearchLegalReferenceInput,
  fn: async ({ query, topic }) => {
    try {
      const enhancedQuery = topic
        ? `${query} ${topic} Italian public procurement law`
        : query;

      const results = await hybridSearch(enhancedQuery, {
        limit: 5,
        documentType: "legal_reference",
        semanticWeight: 0.8,
      });

      return {
        query,
        results: results.map((r) => ({
          content: r.content,
          source: r.metadata.source,
          title: r.metadata.title,
          score: r.score,
        })),
        count: results.length,
      };
    } catch (error) {
      console.error("Error searching legal references:", error);
      return {
        query,
        results: [],
        count: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
