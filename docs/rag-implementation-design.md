# Vector Search Implementation Design for Heury

## Overview
This document outlines the design for implementing local vector search in Heury to enable:
1. **Semantic Code Search**: Find code units by meaning, not just keywords
2. **Pattern Discovery**: Surface similar code patterns across the codebase
3. **Contextual Retrieval**: Retrieve relevant code context for LLM-assisted workflows

---

## 1. Storage Design

### 1.1 Embedding Storage

Embeddings are stored alongside code unit metadata. Two approaches are viable:

**Option A: sqlite-vss (SQLite Virtual Table for Vector Search)**
```sql
-- Virtual table for vector similarity search
CREATE VIRTUAL TABLE code_unit_embeddings USING vss0(
  embedding(1536)  -- OpenAI text-embedding-3-small dimension
);

-- Mapping table linking embeddings to code units
CREATE TABLE embedding_metadata (
  id INTEGER PRIMARY KEY,
  code_unit_id TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (code_unit_id) REFERENCES code_units(id)
);
```

**Option B: hnswlib (In-Memory HNSW Index)**
```typescript
interface EmbeddingIndex {
  // HNSW index stored as a binary file alongside SQLite DB
  indexPath: string;         // e.g., ~/.heury/project-name/embeddings.hnsw
  dimension: number;         // 1536 for text-embedding-3-small
  maxElements: number;       // Grows with codebase

  // Metadata mapping (index position -> code unit ID)
  metadataPath: string;      // e.g., ~/.heury/project-name/embeddings-meta.json
}
```

### 1.2 Current Implementation

The initial implementation uses **InMemoryVectorSearch**, a pure-JavaScript cosine similarity search with no native dependencies:
- Zero external dependencies (no hnswlib, no sqlite-vss)
- Stores vectors in a Map keyed by ID
- Brute-force cosine similarity on search
- Suitable for small-to-medium codebases
- Can be replaced with hnswlib or sqlite-vss via the port interface when performance requires it

---

## 2. Embedding Generation

### 2.1 What Gets Embedded

Each code unit generates an embedding from a structured text representation. The builder accepts either a bare `CodeUnit` (backward compatible) or an `EmbeddingTextContext` with enrichment data from the call graph, event flows, summaries, and clusters.

Fields are ordered by priority for 128-token local model truncation:

```typescript
interface EmbeddingTextContext {
  readonly unit: CodeUnit;
  readonly summary?: string;       // LLM-generated summary (truncated to 50 words)
  readonly callers?: string[];     // Functions that call this unit
  readonly callees?: string[];     // Functions this unit calls
  readonly events?: string[];      // Events emitted/subscribed
  readonly clusterName?: string;   // Feature area cluster name
}

// Priority order in generated text:
// 1. Name and location
// 2. Flags (async, exported)
// 3. Summary (first 50 words)
// 4. Patterns (API_ENDPOINT, DATABASE_READ, etc.)
// 5. Complexity level
// 6. Callers
// 7. Callees
// 8. Events
// 9. Cluster
```

### 2.2 Embedding Provider Abstraction

Following DIP, the embedding provider is abstracted behind a port:

```typescript
// Port (domain layer)
interface IEmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
}

// Adapter: Local (default) - deterministic hash-based embeddings
class LocalEmbeddingProvider implements IEmbeddingProvider {
  // Uses SHA-256 hash expansion to produce deterministic vectors
  // Default: 384 dimensions, configurable
  // No external dependencies, no API key needed
  // Suitable as a placeholder; can be replaced with ONNX-based model later
}

// Adapter: OpenAI
class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  // Uses text-embedding-3-small (1536 dimensions)
  // Requires OPENAI_API_KEY environment variable
}
```

### 2.3 Embedding Generation Pipeline

```
Analysis Complete (code units, call graph, events, summaries, clusters)
      |
      v
EmbeddingPipeline.indexAll():
  1. Load all code units from repository
  2. Pre-load enrichment maps (summaries, callers, callees, events, clusters)
  3. For each code unit in batches of 50:
     a. Build EmbeddingTextContext from unit + enrichment maps
     b. Generate embedding text with priority-ordered fields
     c. Generate embedding via IEmbeddingProvider
     d. Store embedding in vector index with metadata
      |
      v
Index ready for semantic search
```

The `EmbeddingPipeline` accepts optional enrichment repositories (`IUnitSummaryRepository`, `IFunctionCallRepository`, `IEventFlowRepository`, `IFileClusterRepository`). When available, it pre-loads all enrichment data into in-memory lookup maps before batching, avoiding per-unit repository queries.

Embeddings are generated as a post-analysis step, not during the main analysis pipeline. This keeps the core analysis fast and allows re-embedding without re-analyzing.

---

## 3. Search Implementation

### 3.1 Semantic Search Flow

```
User Query: "find functions that handle user authentication"
  + optional filters: file_path_prefix, pattern_type, min_complexity, cluster_name
      |
      v
1. Generate query embedding via IEmbeddingProvider
2. Search vector index for k nearest neighbors
3. Retrieve code unit metadata from SQLite (enrich with full CodeUnit data)
4. Apply post-filters:
   - file_path_prefix: filePath.startsWith(prefix) — works even without codeUnitRepo
   - pattern_type: unit has at least one pattern of this type — requires codeUnitRepo
   - min_complexity: unit.complexityScore >= threshold — requires codeUnitRepo
   - cluster_name: unit belongs to named cluster — requires codeUnitRepo + fileClusterRepo
5. Return ranked results with similarity scores
      |
      v
Results: [
  { codeUnit: "validateSession", similarity: 0.89, file: "src/auth/session.ts" },
  { codeUnit: "checkPermissions", similarity: 0.82, file: "src/auth/permissions.ts" },
  ...
]
```

### 3.2 Search Interface

```typescript
// Port (domain layer) - low-level vector operations
interface IVectorSearchService {
  index(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void>;
  search(queryEmbedding: number[], limit: number): Promise<VectorSearchResult[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

interface VectorSearchResult {
  id: string;
  score: number;           // Cosine similarity score
  metadata: Record<string, unknown>;
}
```

The application layer (EmbeddingPipeline) coordinates between the embedding provider and vector search service, handling the higher-level workflow of embedding code units and searching by text query.

### 3.3 Hybrid Search

Combine vector search with keyword search for best results:

```typescript
interface HybridSearchOptions extends VectorSearchOptions {
  keywords?: string[];       // Additional keyword filters
  hybridWeight?: number;     // 0.0 = pure keyword, 1.0 = pure vector (default: 0.7)
}

// 1. Vector search produces semantic matches
// 2. Keyword search produces exact matches (SQL LIKE on name, filePath, patternValue)
// 3. Results are merged with weighted scoring
// 4. Deduplication by code unit ID
```

---

## 4. MCP Tool Integration

Vector search is exposed as an MCP tool for LLM consumption:

```typescript
const vectorSearchDefinition = {
  name: 'vector-search',
  description: 'Semantic search across code units using vector embeddings.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      limit: { type: 'number', description: 'Max results (default 10)' },
      file_path_prefix: { type: 'string', description: 'Only return results whose filePath starts with this prefix (e.g., "src/api/")' },
      pattern_type: { type: 'string', description: 'Only return results that have at least one pattern of this type (e.g., "API_ENDPOINT", "DATABASE_READ")' },
      min_complexity: { type: 'number', description: 'Only return results with complexity score >= this value' },
      cluster_name: { type: 'string', description: 'Only return results that belong to a cluster with this name' },
    },
    required: ['query'],
  },
};
```

---

## 5. Data Lifecycle

### 5.1 When Embeddings Are Generated
- After initial code analysis completes
- After re-analysis (incremental: only changed files)
- On explicit `heury embed` command

### 5.2 When Embeddings Are Invalidated
- When source code changes (detected by file hash comparison)
- When embedding model changes (stored in metadata)
- On explicit `heury reindex` command

### 5.3 Storage Location
```
~/.heury/
  projects/
    my-project/
      heury.db              # SQLite database (code units, patterns, dependencies)
      embeddings.hnsw       # HNSW vector index
      embeddings-meta.json  # Index position -> code unit ID mapping
```

---

## 6. Performance Considerations

- **Batch embedding generation**: Process code units in batches of 100 to minimize API calls
- **Incremental updates**: Only re-embed changed code units (track by file hash)
- **Index persistence**: Save HNSW index to disk, load on startup
- **Lazy loading**: Don't load vector index until first search query
- **Memory budget**: HNSW index for 10K code units at 1536 dimensions is ~60MB in memory

---

## 7. Future Considerations

- **ONNX-based local embeddings**: Replace the hash-based placeholder with all-MiniLM-L6-v2 via ONNX Runtime for real semantic similarity
- **hnswlib or sqlite-vss**: Upgrade from brute-force in-memory search to approximate nearest-neighbor for larger codebases
- **Multi-project search**: Search across multiple analyzed codebases
- **Embedding caching**: Cache embeddings for unchanged code to speed up re-analysis
- **Dimension reduction**: Use lower-dimension models for smaller codebases to save memory
- **Hybrid search**: Combine vector search with keyword search using weighted scoring
