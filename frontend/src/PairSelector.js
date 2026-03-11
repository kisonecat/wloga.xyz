/**
 * PairSelector - Active learning pair selection for preference elicitation.
 *
 * Strategy:
 * 1. In early rounds (< 5 comparisons), pick diverse pairs (far apart in embedding space)
 * 2. Later, use uncertainty sampling: prefer pairs where model is least sure
 * 3. Diversity constraint: don't show papers from last few rounds
 */

import { embeddingStore } from './EmbeddingStore.js';
import { preferenceModel } from './PreferenceModel.js';

// Number of comparisons before switching from diversity to uncertainty sampling
const WARMUP_ROUNDS = 5;

// Number of recent papers to avoid showing again
const RECENCY_BUFFER = 6;

// Number of candidate pairs to sample when selecting
const CANDIDATE_POOL_SIZE = 30;

export class PairSelector {
  constructor() {
    // Track recently shown paper IDs to ensure diversity
    this.recentlyShown = [];
  }

  /**
   * Compute Euclidean distance between two embeddings.
   */
  _distance(e1, e2) {
    let sum = 0;
    for (let i = 0; i < e1.length; i++) {
      const d = e1[i] - e2[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  /**
   * Shuffle array in place (Fisher-Yates).
   */
  _shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Select the next pair of papers to compare.
   * @param {string[]} paperIds - Available paper IDs to choose from
   * @returns {{id1: string, id2: string}|null} The selected pair, or null if not enough papers
   */
  selectPair(paperIds) {
    // Filter to papers with embeddings and not recently shown
    const recentSet = new Set(this.recentlyShown.slice(-RECENCY_BUFFER));
    const available = paperIds.filter(id =>
      embeddingStore.has(id) && !recentSet.has(id)
    );

    if (available.length < 2) {
      // Fall back to all papers with embeddings if not enough available
      const allWithEmbeddings = paperIds.filter(id => embeddingStore.has(id));
      if (allWithEmbeddings.length < 2) {
        return null;
      }
      return this._selectFromPool(allWithEmbeddings);
    }

    return this._selectFromPool(available);
  }

  /**
   * Select the best pair from a pool of available papers.
   */
  _selectFromPool(available) {
    const numComparisons = preferenceModel.comparisonCount;

    // Generate candidate pairs
    const candidates = this._generateCandidates(available);

    if (candidates.length === 0) {
      return null;
    }

    let bestPair;

    if (numComparisons < WARMUP_ROUNDS) {
      // Early rounds: prefer diverse pairs (far apart in embedding space)
      bestPair = this._selectDiversePair(candidates);
    } else {
      // Later rounds: prefer uncertain pairs
      bestPair = this._selectUncertainPair(candidates);
    }

    return bestPair;
  }

  /**
   * Generate random candidate pairs from available papers.
   */
  _generateCandidates(available) {
    const candidates = [];
    const shuffled = this._shuffle([...available]);
    const numPairs = Math.min(CANDIDATE_POOL_SIZE, Math.floor(shuffled.length * (shuffled.length - 1) / 2));

    // Generate random pairs
    for (let attempt = 0; attempt < numPairs * 3 && candidates.length < numPairs; attempt++) {
      const i = Math.floor(Math.random() * shuffled.length);
      let j = Math.floor(Math.random() * shuffled.length);
      if (i === j) continue;

      const id1 = shuffled[Math.min(i, j)];
      const id2 = shuffled[Math.max(i, j)];

      // Avoid duplicate pairs
      const pairKey = `${id1}:${id2}`;
      if (!candidates.some(c => `${c.id1}:${c.id2}` === pairKey)) {
        candidates.push({ id1, id2 });
      }
    }

    return candidates;
  }

  /**
   * Select the most diverse pair (farthest apart in embedding space).
   */
  _selectDiversePair(candidates) {
    let bestPair = candidates[0];
    let maxDistance = -Infinity;

    for (const { id1, id2 } of candidates) {
      const e1 = embeddingStore.get(id1);
      const e2 = embeddingStore.get(id2);

      if (e1 && e2) {
        const dist = this._distance(e1, e2);
        if (dist > maxDistance) {
          maxDistance = dist;
          bestPair = { id1, id2 };
        }
      }
    }

    return bestPair;
  }

  /**
   * Select the most uncertain pair (closest to 50/50 prediction).
   */
  _selectUncertainPair(candidates) {
    let bestPair = candidates[0];
    let maxUncertainty = -Infinity;

    for (const { id1, id2 } of candidates) {
      const uncertainty = preferenceModel.uncertainty(id1, id2);

      if (uncertainty > maxUncertainty) {
        maxUncertainty = uncertainty;
        bestPair = { id1, id2 };
      }
    }

    return bestPair;
  }

  /**
   * Record that a pair was shown (for diversity tracking).
   * @param {string} id1 - First paper ID
   * @param {string} id2 - Second paper ID
   */
  recordShown(id1, id2) {
    this.recentlyShown.push(id1, id2);

    // Keep buffer from growing too large
    if (this.recentlyShown.length > RECENCY_BUFFER * 4) {
      this.recentlyShown = this.recentlyShown.slice(-RECENCY_BUFFER * 2);
    }
  }

  /**
   * Reset the selector state.
   */
  reset() {
    this.recentlyShown = [];
  }
}

// Singleton instance
export const pairSelector = new PairSelector();
