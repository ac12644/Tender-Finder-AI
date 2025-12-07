/**
 * Pinecone Vector Database Integration
 *
 * Provides functions for storing and searching document chunks using Pinecone
 * vector database. This module handles lazy initialization of the Pinecone client
 * and provides a high-level interface for vector operations.
 *
 * The implementation uses a hybrid storage approach: vectors are stored in Pinecone
 * for efficient similarity search, while full metadata is maintained in Firestore
 * for quick access and fallback scenarios.
 */

import { db } from "./firestore";
import type { DocumentChunk } from "./rag";

// Lazy-loaded Pinecone client and index instances
// Using dynamic imports to avoid loading the SDK when not needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pineconeClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pineconeIndex: any = null;

/** Pinecone index name for document chunks */
const PINECONE_INDEX_NAME = "contract-chunks";

/** Namespace within the index for contract documents */
const PINECONE_NAMESPACE = "contracts";

/**
 * Initializes and returns the Pinecone client instance.
 *
 * Uses lazy initialization to avoid loading the Pinecone SDK until it's actually
 * needed. The client is cached after the first initialization.
 *
 * @returns The Pinecone client instance
 * @throws Error if PINECONE_API_KEY is not configured
 */
async function getPineconeClient() {
  if (!pineconeClient) {
    const PineconeModule = await import("@pinecone-database/pinecone");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Pinecone = PineconeModule.Pinecone || (PineconeModule as any).default;

    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "PINECONE_API_KEY not configured. Set it as a Firebase Secret or " +
          "environment variable."
      );
    }

    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

/**
 * Retrieves the Pinecone index instance.
 *
 * Checks if the index exists and logs a warning if it doesn't. The index
 * should be created manually via the Pinecone console or MCP tools before use.
 *
 * @returns The Pinecone index instance
 * @throws Error if the Pinecone client cannot be initialized
 */
async function getPineconeIndex() {
  if (!pineconeIndex) {
    const client = await getPineconeClient();

    const indexes = await client.listIndexes();
    const indexExists = indexes.indexes?.some(
      (idx: { name: string }) => idx.name === PINECONE_INDEX_NAME
    );

    if (!indexExists) {
      console.warn(
        `Pinecone index "${PINECONE_INDEX_NAME}" not found. ` +
          "Please create it using the Pinecone console or MCP tools."
      );
    }

    pineconeIndex = client.index(PINECONE_INDEX_NAME);
  }
  return pineconeIndex;
}

/**
 * Stores document chunks in Pinecone vector database.
 *
 * This function performs a hybrid storage approach:
 * - Vectors are stored in Pinecone for efficient similarity search
 * - Full metadata is stored in Firestore for quick access and fallback scenarios
 *
 * @param documentId - Unique identifier for the parent document
 * @param chunks - Array of document chunks with embeddings to store
 * @throws Error if chunks are empty or missing embeddings
 */
export async function storeChunksInPinecone(
  documentId: string,
  chunks: DocumentChunk[]
): Promise<void> {
  if (!chunks.length || !chunks[0].embedding) {
    throw new Error(
      "Chunks must have embeddings to store in Pinecone. " +
        "Ensure embeddings are generated before calling this function."
    );
  }

  const index = await getPineconeIndex();

  const vectors = chunks.map((chunk) => ({
    id: chunk.id,
    values: chunk.embedding!,
    metadata: {
      documentId: chunk.metadata.documentId,
      documentType: chunk.metadata.documentType,
      chunkIndex: chunk.metadata.chunkIndex,
      source: chunk.metadata.source,
      title: chunk.metadata.title || "",
      language: chunk.metadata.language || "it",
      content: chunk.content.substring(0, 1000),
      createdAt: chunk.metadata.createdAt.toISOString(),
    },
  }));

  await index.namespace(PINECONE_NAMESPACE).upsert(vectors);

  // Store full metadata in Firestore for quick access
  const batch = db.batch();
  for (const chunk of chunks) {
    const chunkRef = db.collection("document_chunks").doc(chunk.id);
    batch.set(chunkRef, {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        createdAt: chunk.metadata.createdAt || new Date(),
      },
      embedding: null,
      pineconeId: chunk.id,
      pineconeNamespace: PINECONE_NAMESPACE,
    });
  }
  await batch.commit();

  console.log(
    `Stored ${chunks.length} chunks in Pinecone index "${PINECONE_INDEX_NAME}"`
  );
}

/**
 * Searches for relevant document chunks using Pinecone vector similarity search.
 *
 * Performs a vector similarity search in Pinecone and retrieves full chunk content
 * from Firestore. Results are filtered by minimum similarity score and document type.
 *
 * @param queryEmbedding - Vector embedding of the search query
 * @param options - Search options
 * @param options.limit - Maximum number of results to return (default: 5)
 * @param options.documentType - Filter by document type (default: "contract")
 * @param options.minScore - Minimum similarity score threshold (default: 0.7)
 * @param options.filter - Additional metadata filters
 * @returns Array of matching chunks with similarity scores
 */
export async function searchChunksInPinecone(
  queryEmbedding: number[],
  options?: {
    limit?: number;
    documentType?: "contract" | "tender" | "legal_reference";
    minScore?: number;
    filter?: Record<string, unknown>;
  }
): Promise<Array<DocumentChunk & { score: number }>> {
  const limit = options?.limit || 5;
  const minScore = options?.minScore || 0.7;

  try {
    const index = await getPineconeIndex();

    const filter: Record<string, unknown> = {
      documentType: options?.documentType || "contract",
      ...options?.filter,
    };

    const queryResponse = await index.namespace(PINECONE_NAMESPACE).query({
      vector: queryEmbedding,
      topK: limit * 2,
      includeMetadata: true,
      filter,
    });

    const results: Array<DocumentChunk & { score: number }> = [];

    for (const match of queryResponse.matches || []) {
      const score = match.score || 0;
      if (score < minScore) {
        continue;
      }

      const metadata = match.metadata || {};
      const chunkId = match.id;

      // Fetch full content from Firestore
      const chunkDoc = await db
        .collection("document_chunks")
        .doc(chunkId)
        .get();

      let fullContent = (metadata.content as string) || "";
      if (chunkDoc.exists) {
        const chunkData = chunkDoc.data() as DocumentChunk;
        fullContent = chunkData.content;
      }

      results.push({
        id: chunkId,
        content: fullContent,
        metadata: {
          documentId: metadata.documentId as string,
          documentType: metadata.documentType as
            | "contract"
            | "tender"
            | "legal_reference",
          chunkIndex: metadata.chunkIndex as number,
          source: metadata.source as string,
          title: metadata.title as string | undefined,
          language: (metadata.language as "it" | "en") || "it",
          createdAt: new Date(metadata.createdAt as string),
        },
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  } catch (error) {
    console.error("Error searching chunks in Pinecone:", error);
    console.warn("Falling back to Firestore search");
    return [];
  }
}

/**
 * Deletes document chunks from Pinecone by their IDs.
 *
 * This function removes vectors from Pinecone but does not delete the
 * corresponding Firestore records. Firestore records should be deleted
 * separately if needed.
 *
 * @param documentId - Unique identifier for the parent document (for logging)
 * @param chunkIds - Array of chunk IDs to delete
 * @throws Error if deletion fails
 */
export async function deleteChunksFromPinecone(
  documentId: string,
  chunkIds: string[]
): Promise<void> {
  try {
    const index = await getPineconeIndex();
    await index.namespace(PINECONE_NAMESPACE).deleteMany(chunkIds);
    console.log(
      `Deleted ${chunkIds.length} chunks from Pinecone for document ${documentId}`
    );
  } catch (error) {
    console.error("Error deleting chunks from Pinecone:", error);
    throw error;
  }
}

/**
 * Checks if Pinecone is properly configured.
 *
 * @returns True if PINECONE_API_KEY is set, false otherwise
 */
export function isPineconeConfigured(): boolean {
  return !!process.env.PINECONE_API_KEY;
}
