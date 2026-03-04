// Lightweight approval queue for CRM write operations.
// Stages operations for human-in-the-loop review without blocking the agent.
// Emits events so frontends / agent flows can subscribe to queue changes.

import { EventEmitter } from 'node:events';

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

let counter = 0;

/**
 * @typedef {Object} StagedOperation
 * @property {string}      id           - Unique operation ID (OP-1, OP-2, …)
 * @property {string}      type         - Tool name that created this (e.g. "update_milestone")
 * @property {string}      entitySet    - CRM entity set path
 * @property {string}      method       - HTTP method ("POST" | "PATCH")
 * @property {object}      payload      - Request body to send to CRM
 * @property {object|null} beforeState  - Snapshot of current record (for diff)
 * @property {string}      description  - Human-readable summary of the change
 * @property {string}      stagedAt     - ISO timestamp
 * @property {number}      expiresAt    - Unix ms when this op expires
 * @property {'pending'|'approved'|'rejected'|'executed'|'expired'} status
 */

/**
 * Events emitted:
 *   'staged'   (op)           – new operation added to queue
 *   'approved' (op)           – operation approved by human
 *   'rejected' (op)           – operation rejected by human
 *   'executed' (op, result)   – operation executed against CRM
 *   'expired'  (op)           – operation expired via TTL
 *   'op:error' (op, error)    – execution failed
 */
export class ApprovalQueue extends EventEmitter {
  /** @type {Map<string, StagedOperation>} */
  #ops = new Map();
  #ttlMs;
  #sweepTimer;

  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    super();
    this.#ttlMs = ttlMs;
    // Periodic sweep for expired ops (every 60s)
    this.#sweepTimer = setInterval(() => this.#sweep(), 60_000);
    if (this.#sweepTimer.unref) this.#sweepTimer.unref(); // don't keep process alive
  }

  /** Stage a new write operation. Returns the operation with its assigned ID. */
  stage({ type, entitySet, method, payload, beforeState = null, description }) {
    counter += 1;
    const id = `OP-${counter}`;
    const now = Date.now();
    /** @type {StagedOperation} */
    const op = {
      id,
      type,
      entitySet,
      method,
      payload,
      beforeState,
      description,
      stagedAt: new Date(now).toISOString(),
      expiresAt: now + this.#ttlMs,
      status: 'pending',
    };
    this.#ops.set(id, op);
    this.emit('staged', op);
    return op;
  }

  /** Approve a pending operation. Returns the approved op or null. */
  approve(id) {
    const op = this.#ops.get(id);
    if (!op || op.status !== 'pending') return null;
    if (Date.now() > op.expiresAt) {
      op.status = 'expired';
      this.emit('expired', op);
      this.#ops.delete(id);
      return null;
    }
    op.status = 'approved';
    this.emit('approved', op);
    return op;
  }

  /** Reject / cancel a pending operation. Returns the rejected op or null. */
  reject(id) {
    const op = this.#ops.get(id);
    if (!op || op.status !== 'pending') return null;
    op.status = 'rejected';
    this.emit('rejected', op);
    this.#ops.delete(id);
    return op;
  }

  /** Mark an approved operation as executed. Stores result and cleans up. */
  markExecuted(id, result) {
    const op = this.#ops.get(id);
    if (!op) return null;
    op.status = 'executed';
    this.emit('executed', op, result);
    this.#ops.delete(id);
    return op;
  }

  /** Mark an approved operation as failed. */
  markFailed(id, err) {
    const op = this.#ops.get(id);
    if (!op) return null;
    this.emit('op:error', op, err);
    // Keep in map so caller can retry or cancel
    op.status = 'pending';
    return op;
  }

  /** Get a single operation by ID. */
  get(id) {
    const op = this.#ops.get(id);
    if (op && Date.now() > op.expiresAt && op.status === 'pending') {
      op.status = 'expired';
      this.emit('expired', op);
      this.#ops.delete(id);
      return null;
    }
    return op ?? null;
  }

  /** List all pending operations. */
  listPending() {
    this.#sweep();
    return [...this.#ops.values()].filter(op => op.status === 'pending');
  }

  /** List all operations regardless of status (still in map). */
  listAll() {
    this.#sweep();
    return [...this.#ops.values()];
  }

  /** Number of pending operations. */
  get pendingCount() {
    return this.listPending().length;
  }

  /** Approve all pending operations. Returns approved ops. */
  approveAll() {
    const approved = [];
    for (const op of this.#ops.values()) {
      if (op.status === 'pending') {
        const result = this.approve(op.id);
        if (result) approved.push(result);
      }
    }
    return approved;
  }

  /** Reject all pending operations. Returns rejected ops. */
  rejectAll() {
    const rejected = [];
    for (const [, op] of [...this.#ops.entries()]) {
      if (op.status === 'pending') {
        const result = this.reject(op.id);
        if (result) rejected.push(result);
      }
    }
    return rejected;
  }

  /** Clear the entire queue (for testing / shutdown). */
  clear() {
    this.#ops.clear();
  }

  /** Stop the sweep timer (for clean shutdown). */
  dispose() {
    clearInterval(this.#sweepTimer);
  }

  // Expire stale operations
  #sweep() {
    const now = Date.now();
    for (const [id, op] of this.#ops) {
      if (op.status === 'pending' && now > op.expiresAt) {
        op.status = 'expired';
        this.emit('expired', op);
        this.#ops.delete(id);
      }
    }
  }
}

/** Singleton instance — shared across MCP tools and external consumers. */
let _instance = null;

export function getApprovalQueue(opts) {
  if (!_instance) {
    _instance = new ApprovalQueue(opts);
  }
  return _instance;
}

/** Reset singleton (for testing). */
export function resetApprovalQueue() {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
  counter = 0;
}
