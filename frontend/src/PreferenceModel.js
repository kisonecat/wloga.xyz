/**
 * PreferenceModel - Bradley-Terry preference model with logistic regression.
 *
 * The log-strength of paper i is s_i = w · e_i, where e_i is the embedding
 * and w is the learned preference vector.
 *
 * Under Bradley-Terry, P(i > j) = σ(s_i - s_j) = σ(w · (e_i - e_j))
 */

import { embeddingStore } from './EmbeddingStore.js';

const STORAGE_KEY = 'wloga_preference_model';

export class PreferenceModel {
  /**
   * @param {number} dimension - Embedding dimension (default 128, Matryoshka truncated)
   * @param {number} l2Lambda - L2 regularization strength
   */
  constructor(dimension = 128, l2Lambda = 0.01) {
    this.dimension = dimension;
    this.l2Lambda = l2Lambda;

    // Weight vector (initialized to small random values)
    this.w = new Float32Array(dimension);
    this._initializeWeights();

    // Comparison history: [{winnerId, loserId}, ...]
    this.comparisons = [];
  }

  /**
   * Initialize weights with small random values to avoid degenerate start.
   */
  _initializeWeights() {
    for (let i = 0; i < this.dimension; i++) {
      this.w[i] = (Math.random() - 0.5) * 0.01;
    }
  }

  /**
   * Sigmoid function.
   */
  _sigmoid(x) {
    if (x > 20) return 1;
    if (x < -20) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Compute dot product of two vectors.
   */
  _dot(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Add a comparison result.
   * @param {string} winnerId - ID of the preferred paper
   * @param {string} loserId - ID of the less preferred paper
   */
  addComparison(winnerId, loserId) {
    this.comparisons.push({ winnerId, loserId });
  }

  /**
   * Run gradient descent to update weights based on all comparisons.
   * @param {number} steps - Number of gradient descent steps
   * @param {number} learningRate - Learning rate
   */
  update(steps = 50, learningRate = 0.1) {
    if (this.comparisons.length === 0) {
      return;
    }

    // Pre-compute difference vectors for all comparisons
    const diffs = [];
    for (const { winnerId, loserId } of this.comparisons) {
      const eWinner = embeddingStore.get(winnerId);
      const eLoser = embeddingStore.get(loserId);

      if (eWinner && eLoser) {
        const diff = new Float32Array(this.dimension);
        for (let i = 0; i < this.dimension; i++) {
          diff[i] = eWinner[i] - eLoser[i];
        }
        diffs.push(diff);
      }
    }

    if (diffs.length === 0) {
      return;
    }

    // Gradient descent
    const gradient = new Float32Array(this.dimension);

    for (let step = 0; step < steps; step++) {
      // Reset gradient
      gradient.fill(0);

      // Compute gradient of negative log-likelihood
      // For each comparison where winner > loser:
      // Loss contribution: -log(σ(w · d)) where d = e_winner - e_loser
      // Gradient: -(1 - σ(w · d)) * d
      for (const diff of diffs) {
        const score = this._dot(this.w, diff);
        const prob = this._sigmoid(score);
        const factor = -(1 - prob); // gradient of -log(σ(x)) is -(1-σ(x))

        for (let i = 0; i < this.dimension; i++) {
          gradient[i] += factor * diff[i];
        }
      }

      // Add L2 regularization gradient: λ * w
      for (let i = 0; i < this.dimension; i++) {
        gradient[i] += this.l2Lambda * this.w[i];
      }

      // Update weights
      for (let i = 0; i < this.dimension; i++) {
        this.w[i] -= learningRate * gradient[i];
      }
    }
  }

  /**
   * Score a paper by computing w · e_i.
   * @param {string} paperId - The paper ID
   * @returns {number} The score (higher = more preferred)
   */
  score(paperId) {
    const embedding = embeddingStore.get(paperId);
    if (!embedding) {
      return 0;
    }
    return this._dot(this.w, embedding);
  }

  /**
   * Get probability that paper i is preferred over paper j.
   * @param {string} paperId1 - First paper ID
   * @param {string} paperId2 - Second paper ID
   * @returns {number} P(paper1 > paper2)
   */
  probability(paperId1, paperId2) {
    const score1 = this.score(paperId1);
    const score2 = this.score(paperId2);
    return this._sigmoid(score1 - score2);
  }

  /**
   * Compute uncertainty for a pair (how close to 50/50 the model thinks it is).
   * Returns value between 0 (certain) and 1 (maximally uncertain).
   * @param {string} paperId1 - First paper ID
   * @param {string} paperId2 - Second paper ID
   * @returns {number} Uncertainty score
   */
  uncertainty(paperId1, paperId2) {
    const prob = this.probability(paperId1, paperId2);
    // 1 - |P - 0.5| * 2 gives 1 at P=0.5, 0 at P=0 or P=1
    return 1 - Math.abs(prob - 0.5) * 2;
  }

  /**
   * Rank all papers by score (descending).
   * @param {string[]} paperIds - Optional list of paper IDs to rank. If not provided, uses all papers with embeddings.
   * @returns {Array<{id: string, score: number}>} Ranked papers
   */
  rank(paperIds = null) {
    const ids = paperIds || embeddingStore.getAllPaperIds();

    const scored = ids
      .map(id => ({ id, score: this.score(id) }))
      .filter(p => p.score !== 0 || embeddingStore.has(p.id));

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /**
   * Get the number of comparisons made.
   * @returns {number}
   */
  get comparisonCount() {
    return this.comparisons.length;
  }

  /**
   * Serialize the model to a plain object for localStorage.
   * @returns {object}
   */
  serialize() {
    return {
      w: Array.from(this.w),
      comparisons: this.comparisons,
      dimension: this.dimension,
      l2Lambda: this.l2Lambda
    };
  }

  /**
   * Deserialize the model from a plain object.
   * @param {object} data - Serialized model data
   */
  deserialize(data) {
    if (data.dimension !== this.dimension) {
      console.warn('Dimension mismatch, reinitializing weights');
      this._initializeWeights();
      this.comparisons = [];
      return;
    }

    this.w = new Float32Array(data.w);
    this.comparisons = data.comparisons || [];
    this.l2Lambda = data.l2Lambda || 0.01;
  }

  /**
   * Save model to localStorage.
   */
  save() {
    try {
      const data = this.serialize();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log(`Saved model with ${this.comparisons.length} comparisons`);
    } catch (error) {
      console.error('Error saving model:', error);
    }
  }

  /**
   * Load model from localStorage.
   * @returns {boolean} True if model was loaded successfully
   */
  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.deserialize(data);
        console.log(`Loaded model with ${this.comparisons.length} comparisons`);
        return true;
      }
    } catch (error) {
      console.error('Error loading model:', error);
    }
    return false;
  }

  /**
   * Reset the model to initial state.
   */
  reset() {
    this._initializeWeights();
    this.comparisons = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Singleton instance
export const preferenceModel = new PreferenceModel();
