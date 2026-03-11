/**
 * EmbeddingStore - Manages paper embeddings loaded from binary files.
 *
 * Embeddings are stored as concatenated Float32Arrays in YYMM_embeddings.bin files.
 * Each embedding is 128 floats (512 bytes), truncated via Matryoshka representation.
 */

const EMBEDDING_DIM = 128;

export class EmbeddingStore {
  constructor() {
    // Map of paperId -> Float32Array embedding
    this.embeddings = new Map();
    // Map of paperId -> index in the month's paper list
    this.paperIndices = new Map();
    // Set of loaded months
    this.loadedMonths = new Set();
  }

  /**
   * Load embeddings for a specific month.
   * @param {string} month - Month string like "2603"
   * @param {Array} papers - Array of paper objects for that month (in order)
   */
  async loadMonth(month, papers) {
    if (this.loadedMonths.has(month)) {
      return;
    }

    try {
      const response = await fetch(`/data/${month}_embeddings.bin`);
      if (!response.ok) {
        console.warn(`No embeddings file for month ${month}`);
        return;
      }

      const buffer = await response.arrayBuffer();
      const allEmbeddings = new Float32Array(buffer);

      // Map each paper to its embedding
      for (let i = 0; i < papers.length; i++) {
        const paper = papers[i];
        const start = i * EMBEDDING_DIM;
        const end = start + EMBEDDING_DIM;

        if (end <= allEmbeddings.length) {
          const embedding = allEmbeddings.slice(start, end);

          // Check if it's a zero vector (no embedding)
          const isZero = embedding.every(v => v === 0);
          if (!isZero) {
            this.embeddings.set(paper.id, embedding);
          }
        }

        this.paperIndices.set(paper.id, i);
      }

      this.loadedMonths.add(month);
      console.log(`Loaded ${this.embeddings.size} embeddings for month ${month}`);
    } catch (error) {
      console.error(`Error loading embeddings for month ${month}:`, error);
    }
  }

  /**
   * Get the embedding for a paper.
   * @param {string} paperId - The arXiv paper ID
   * @returns {Float32Array|null} The embedding or null if not found
   */
  get(paperId) {
    return this.embeddings.get(paperId) || null;
  }

  /**
   * Check if a paper has an embedding.
   * @param {string} paperId - The arXiv paper ID
   * @returns {boolean}
   */
  has(paperId) {
    return this.embeddings.has(paperId);
  }

  /**
   * Get all paper IDs that have embeddings.
   * @returns {string[]}
   */
  getAllPaperIds() {
    return Array.from(this.embeddings.keys());
  }

  /**
   * Get the embedding dimension.
   * @returns {number}
   */
  get dimension() {
    return EMBEDDING_DIM;
  }

  /**
   * Get the number of loaded embeddings.
   * @returns {number}
   */
  get size() {
    return this.embeddings.size;
  }
}

// Singleton instance
export const embeddingStore = new EmbeddingStore();
