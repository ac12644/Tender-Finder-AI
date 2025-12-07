/**
 * RAG (Retrieval-Augmented Generation) Pipeline
 *
 * Provides document chunking, vector storage, and semantic retrieval capabilities
 * for contract review and analysis. Supports both Pinecone vector database and
 * Firestore fallback storage.
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import { defineSecret } from "firebase-functions/params";
import { db } from "./firestore";
import { storeChunksInPinecone, isPineconeConfigured } from "./pinecone.js";

/** Firebase secret for OpenAI API key (used for embeddings) */
export const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

/**
 * Configuration for text chunking operations.
 */
export interface ChunkConfig {
  /** Maximum number of characters per chunk */
  chunkSize: number;
  /** Number of characters to overlap between adjacent chunks */
  chunkOverlap: number;
  /** Hierarchical list of separators to use for splitting (ordered by preference) */
  separators: string[];
}

const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", ". ", " ", ""],
};

/**
 * Represents a document chunk with its content, metadata, and optional embedding.
 */
export interface DocumentChunk {
  /** Unique identifier for the chunk */
  id: string;
  /** The text content of the chunk */
  content: string;
  /** Metadata associated with the chunk */
  metadata: {
    /** ID of the parent document */
    documentId: string;
    /** Type of document this chunk belongs to */
    documentType: "contract" | "tender" | "legal_reference";
    /** Index of this chunk within the document */
    chunkIndex: number;
    /** Source URL or file path of the original document */
    source: string;
    /** Optional title of the document */
    title?: string;
    /** Language of the document content */
    language?: "it" | "en";
    /** Timestamp when the chunk was created */
    createdAt: Date;
  };
  /** Optional vector embedding for semantic search */
  embedding?: number[];
}

/**
 * Splits text into chunks using a recursive hierarchical splitting strategy.
 *
 * The algorithm attempts to split on natural boundaries (paragraphs, sentences, words)
 * before falling back to character-based splitting. This preserves semantic coherence
 * while ensuring chunks stay within size limits.
 *
 * @param text - The text to chunk
 * @param config - Chunking configuration (defaults to DEFAULT_CHUNK_CONFIG)
 * @returns Array of text chunks
 */
export function chunkText(
  text: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): string[] {
  const textChunks: string[] = [];
  const { chunkSize, chunkOverlap, separators } = config;

  function splitRecursive(
    text: string,
    separators: string[],
    currentLevel: number
  ): string[] {
    if (text.length <= chunkSize) {
      textChunks.push(text);
      return textChunks;
    }

    const separator = separators[currentLevel] || "";
    const splits = separator ? text.split(separator) : [text];

    // If we can't split further, fall back to size-based chunking
    if (splits.length === 1 && currentLevel >= separators.length - 1) {
      const sizeChunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        sizeChunks.push(text.slice(i, i + chunkSize));
      }
      return sizeChunks;
    }

    // Combine splits into chunks of appropriate size
    const result: string[] = [];
    let currentChunk = "";

    for (const split of splits) {
      const testChunk = currentChunk ? currentChunk + separator + split : split;

      if (testChunk.length <= chunkSize) {
        currentChunk = testChunk;
      } else {
        if (currentChunk) {
          result.push(currentChunk);
        }
        // If a single split is too large, recurse to split it further
        if (split.length > chunkSize) {
          result.push(...splitRecursive(split, separators, currentLevel + 1));
          currentChunk = "";
        } else {
          currentChunk = split;
        }
      }
    }

    if (currentChunk) {
      result.push(currentChunk);
    }

    return result;
  }

  return splitRecursive(text, separators, 0);
}

/**
 * Generates a vector embedding for the given text using OpenAI's embedding model.
 *
 * Uses OpenAI's text-embedding-3-small model, which provides a good balance
 * between quality, cost, and performance. The model generates 1536-dimensional
 * vectors suitable for semantic search and similarity calculations.
 *
 * @param text - The text to generate an embedding for
 * @returns Promise resolving to a vector embedding array (1536 dimensions)
 * @throws Error if OpenAI API key is not configured
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = OPENAI_API_KEY.value() || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OpenAI API key not configured. Set OPENAI_API_KEY as a Firebase Secret " +
        "or environment variable."
    );
  }

  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: apiKey,
    modelName: "text-embedding-3-small",
  });

  return await embeddings.embedQuery(text);
}

/**
 * Stores document chunks in the configured storage backend.
 *
 * Attempts to use Pinecone if configured, otherwise falls back to Firestore.
 * This provides flexibility for different deployment scenarios and allows
 * graceful degradation when vector database services are unavailable.
 *
 * @param documentId - Unique identifier for the parent document
 * @param chunks - Array of document chunks to store
 * @throws Error if storage operation fails
 */
export async function storeDocumentChunks(
  documentId: string,
  chunks: DocumentChunk[]
): Promise<void> {
  if (isPineconeConfigured()) {
    try {
      await storeChunksInPinecone(documentId, chunks);
      return;
    } catch (error) {
      console.error(
        "Failed to store chunks in Pinecone, falling back to Firestore:",
        error
      );
      // Continue to Firestore fallback
    }
  }

  // Fallback to Firestore storage
  const batch = db.batch();

  for (const chunk of chunks) {
    const chunkRef = db.collection("document_chunks").doc(chunk.id);

    batch.set(chunkRef, {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        createdAt: chunk.metadata.createdAt || new Date(),
      },
      embedding: chunk.embedding || null,
    });
  }

  await batch.commit();
}

/**
 * Searches for document chunks using semantic similarity.
 *
 * Generates an embedding for the query and compares it against stored chunk
 * embeddings using cosine similarity. Returns the most relevant chunks above
 * the minimum similarity threshold.
 *
 * @param query - The search query text
 * @param options - Search options
 * @param options.limit - Maximum number of results to return (default: 5)
 * @param options.documentType - Filter by document type (default: "contract")
 * @param options.minScore - Minimum similarity score threshold (default: 0.7)
 * @returns Array of matching chunks with similarity scores
 */
export async function searchChunks(
  query: string,
  options?: {
    limit?: number;
    documentType?: "contract" | "tender" | "legal_reference";
    minScore?: number;
  }
): Promise<Array<DocumentChunk & { score: number }>> {
  const limit = options?.limit || 5;
  const minScore = options?.minScore || 0.7;

  try {
    const queryEmbedding = await generateEmbedding(query);

    const chunksSnapshot = await db
      .collection("document_chunks")
      .where("metadata.documentType", "==", options?.documentType || "contract")
      .get();

    const results: Array<DocumentChunk & { score: number }> = [];

    for (const doc of chunksSnapshot.docs) {
      const chunk = doc.data() as DocumentChunk;
      if (!chunk.embedding || chunk.embedding.length === 0) {
        continue;
      }

      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= minScore) {
        results.push({
          ...chunk,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  } catch (error) {
    console.error("Error searching chunks:", error);
    return [];
  }
}

/**
 * Calculates the cosine similarity between two vectors.
 *
 * Cosine similarity measures the cosine of the angle between two vectors,
 * providing a value between -1 and 1. A value of 1 indicates identical
 * vectors, while 0 indicates orthogonal (unrelated) vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score between 0 and 1 (0 if vectors differ in length)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Processes a contract document by chunking, embedding, and storing it.
 *
 * This is a convenience function that orchestrates the full document processing
 * pipeline: splitting the document into chunks, generating embeddings for each
 * chunk, and storing them in the configured storage backend.
 *
 * @param documentId - Unique identifier for the document
 * @param content - The full text content of the document
 * @param metadata - Document metadata
 * @param metadata.source - Source URL or file path
 * @param metadata.title - Optional document title
 * @param metadata.language - Document language (defaults to "it")
 * @returns Array of processed document chunks
 */
export async function processContractDocument(
  documentId: string,
  content: string,
  metadata: {
    source: string;
    title?: string;
    language?: "it" | "en";
  }
): Promise<DocumentChunk[]> {
  const textChunks = chunkText(content);
  const chunks: DocumentChunk[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    const chunkId = `${documentId}_chunk_${i}`;
    const embedding = await generateEmbedding(textChunks[i]);

    const chunk: DocumentChunk = {
      id: chunkId,
      content: textChunks[i],
      metadata: {
        documentId,
        documentType: "contract",
        chunkIndex: i,
        source: metadata.source,
        title: metadata.title,
        language: metadata.language || "it",
        createdAt: new Date(),
      },
      embedding,
    };
    chunks.push(chunk);
  }

  await storeDocumentChunks(documentId, chunks);
  return chunks;
}

/**
 * Performs a hybrid search combining semantic and keyword matching.
 *
 * This approach combines the strengths of semantic search (understanding meaning)
 * with keyword search (exact term matching) to provide more comprehensive results.
 * Results are weighted and re-ranked based on the specified semantic/keyword ratio.
 *
 * @param query - The search query text
 * @param options - Search options
 * @param options.limit - Maximum number of results to return (default: 5)
 * @param options.documentType - Filter by document type
 * @param options.semanticWeight - Weight for semantic results (0-1, default: 0.7)
 * @returns Array of matching chunks with combined similarity scores
 */
export async function hybridSearch(
  query: string,
  options?: {
    limit?: number;
    documentType?: "contract" | "tender" | "legal_reference";
    semanticWeight?: number;
  }
): Promise<Array<DocumentChunk & { score: number }>> {
  const semanticWeight = options?.semanticWeight ?? 0.7;
  const keywordWeight = 1 - semanticWeight;

  const semanticResults = await searchChunks(query, {
    limit: options?.limit ? options.limit * 2 : 10,
    documentType: options?.documentType,
    minScore: 0.5,
  });

  const keywordResults = await keywordSearch(query, {
    limit: options?.limit ? options.limit * 2 : 10,
    documentType: options?.documentType,
  });

  // Combine results with weighted scoring
  const combined = new Map<string, DocumentChunk & { score: number }>();

  for (const result of semanticResults) {
    const existing = combined.get(result.id);
    if (existing) {
      existing.score =
        existing.score * keywordWeight + result.score * semanticWeight;
    } else {
      combined.set(result.id, {
        ...result,
        score: result.score * semanticWeight,
      });
    }
  }

  for (const result of keywordResults) {
    const existing = combined.get(result.id);
    if (existing) {
      existing.score = existing.score + result.score * keywordWeight;
    } else {
      combined.set(result.id, {
        ...result,
        score: result.score * keywordWeight,
      });
    }
  }

  const finalResults = Array.from(combined.values());
  finalResults.sort((a, b) => b.score - a.score);

  return finalResults.slice(0, options?.limit || 5);
}

/**
 * Performs keyword-based search using simple text matching.
 *
 * Splits the query into terms and scores chunks based on how many query terms
 * appear in the chunk content. This provides a baseline for hybrid search
 * when semantic search is unavailable or needs to be combined with exact matching.
 *
 * @param query - The search query text
 * @param options - Search options
 * @param options.limit - Maximum number of results to return (default: 5)
 * @param options.documentType - Filter by document type (default: "contract")
 * @returns Array of matching chunks with keyword match scores
 */
async function keywordSearch(
  query: string,
  options?: {
    limit?: number;
    documentType?: "contract" | "tender" | "legal_reference";
  }
): Promise<Array<DocumentChunk & { score: number }>> {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  const chunksSnapshot = await db
    .collection("document_chunks")
    .where("metadata.documentType", "==", options?.documentType || "contract")
    .get();

  const results: Array<DocumentChunk & { score: number }> = [];

  for (const doc of chunksSnapshot.docs) {
    const chunk = doc.data() as DocumentChunk;
    const contentLower = chunk.content.toLowerCase();

    let matchCount = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matchCount++;
      }
    }

    const score = matchCount / queryTerms.length;
    if (score > 0) {
      results.push({
        ...chunk,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, options?.limit || 5);
}
