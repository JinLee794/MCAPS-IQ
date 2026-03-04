import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalQueue, resetApprovalQueue } from '../approval-queue.js';

describe('ApprovalQueue', () => {
  let queue;

  beforeEach(() => {
    resetApprovalQueue();
    queue = new ApprovalQueue({ ttlMs: 5000 });
  });

  afterEach(() => {
    queue.dispose();
  });

  function sampleOp(overrides = {}) {
    return {
      type: 'update_milestone',
      entitySet: 'msp_engagementmilestones(abc-123)',
      method: 'PATCH',
      payload: { msp_milestonedate: '2026-04-15' },
      beforeState: { msp_milestonedate: '2026-03-20' },
      description: 'Update milestone date',
      ...overrides,
    };
  }

  describe('stage', () => {
    it('assigns sequential IDs', () => {
      const op1 = queue.stage(sampleOp());
      const op2 = queue.stage(sampleOp());
      expect(op1.id).toBe('OP-1');
      expect(op2.id).toBe('OP-2');
    });

    it('sets status to pending', () => {
      const op = queue.stage(sampleOp());
      expect(op.status).toBe('pending');
    });

    it('emits staged event', () => {
      const handler = vi.fn();
      queue.on('staged', handler);
      const op = queue.stage(sampleOp());
      expect(handler).toHaveBeenCalledWith(op);
    });

    it('stores all provided fields', () => {
      const input = sampleOp();
      const op = queue.stage(input);
      expect(op.type).toBe(input.type);
      expect(op.entitySet).toBe(input.entitySet);
      expect(op.method).toBe(input.method);
      expect(op.payload).toEqual(input.payload);
      expect(op.beforeState).toEqual(input.beforeState);
      expect(op.description).toBe(input.description);
      expect(op.stagedAt).toBeTruthy();
      expect(op.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('approve', () => {
    it('approves a pending op', () => {
      const op = queue.stage(sampleOp());
      const approved = queue.approve(op.id);
      expect(approved).not.toBeNull();
      expect(approved.status).toBe('approved');
    });

    it('emits approved event', () => {
      const handler = vi.fn();
      queue.on('approved', handler);
      const op = queue.stage(sampleOp());
      queue.approve(op.id);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: op.id, status: 'approved' }));
    });

    it('returns null for non-existent ID', () => {
      expect(queue.approve('OP-999')).toBeNull();
    });

    it('returns null for already approved op', () => {
      const op = queue.stage(sampleOp());
      queue.approve(op.id);
      expect(queue.approve(op.id)).toBeNull();
    });
  });

  describe('reject', () => {
    it('rejects a pending op', () => {
      const op = queue.stage(sampleOp());
      const rejected = queue.reject(op.id);
      expect(rejected).not.toBeNull();
      expect(rejected.status).toBe('rejected');
    });

    it('emits rejected event', () => {
      const handler = vi.fn();
      queue.on('rejected', handler);
      const op = queue.stage(sampleOp());
      queue.reject(op.id);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: op.id }));
    });

    it('removes the op from the queue', () => {
      const op = queue.stage(sampleOp());
      queue.reject(op.id);
      expect(queue.get(op.id)).toBeNull();
    });

    it('returns null for non-existent ID', () => {
      expect(queue.reject('OP-999')).toBeNull();
    });
  });

  describe('markExecuted', () => {
    it('marks an approved op as executed', () => {
      const op = queue.stage(sampleOp());
      queue.approve(op.id);
      const executed = queue.markExecuted(op.id, { success: true });
      expect(executed.status).toBe('executed');
    });

    it('emits executed event with result', () => {
      const handler = vi.fn();
      queue.on('executed', handler);
      const op = queue.stage(sampleOp());
      queue.approve(op.id);
      queue.markExecuted(op.id, { data: 'ok' });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: op.id }),
        { data: 'ok' }
      );
    });

    it('removes the op from the queue', () => {
      const op = queue.stage(sampleOp());
      queue.approve(op.id);
      queue.markExecuted(op.id, {});
      expect(queue.get(op.id)).toBeNull();
    });
  });

  describe('markFailed', () => {
    it('resets op to pending for retry', () => {
      const op = queue.stage(sampleOp());
      queue.approve(op.id);
      queue.markFailed(op.id, 'CRM unavailable');
      const retrieved = queue.get(op.id);
      expect(retrieved.status).toBe('pending');
    });

    it('emits error event', () => {
      const handler = vi.fn();
      queue.on('op:error', handler);
      const op = queue.stage(sampleOp());
      queue.markFailed(op.id, 'fail');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: op.id }),
        'fail'
      );
    });
  });

  describe('listPending', () => {
    it('returns only pending ops', () => {
      queue.stage(sampleOp());
      queue.stage(sampleOp());
      const op3 = queue.stage(sampleOp());
      queue.approve(op3.id);
      expect(queue.listPending()).toHaveLength(2);
    });
  });

  describe('approveAll / rejectAll', () => {
    it('approves all pending ops', () => {
      queue.stage(sampleOp());
      queue.stage(sampleOp());
      queue.stage(sampleOp());
      const approved = queue.approveAll();
      expect(approved).toHaveLength(3);
      expect(queue.listPending()).toHaveLength(0);
    });

    it('rejects all pending ops', () => {
      queue.stage(sampleOp());
      queue.stage(sampleOp());
      const rejected = queue.rejectAll();
      expect(rejected).toHaveLength(2);
      expect(queue.listPending()).toHaveLength(0);
    });
  });

  describe('TTL expiry', () => {
    it('expires operations past TTL on get()', () => {
      const shortQueue = new ApprovalQueue({ ttlMs: 1 });
      const op = shortQueue.stage(sampleOp());

      // Wait just enough for expiry
      return new Promise(resolve => {
        setTimeout(() => {
          const handler = vi.fn();
          shortQueue.on('expired', handler);
          const result = shortQueue.get(op.id);
          expect(result).toBeNull();
          expect(handler).toHaveBeenCalled();
          shortQueue.dispose();
          resolve();
        }, 10);
      });
    });

    it('returns null when approving an expired op', () => {
      const shortQueue = new ApprovalQueue({ ttlMs: 1 });
      const op = shortQueue.stage(sampleOp());

      return new Promise(resolve => {
        setTimeout(() => {
          const result = shortQueue.approve(op.id);
          expect(result).toBeNull();
          shortQueue.dispose();
          resolve();
        }, 10);
      });
    });
  });

  describe('pendingCount', () => {
    it('returns the number of pending ops', () => {
      expect(queue.pendingCount).toBe(0);
      queue.stage(sampleOp());
      queue.stage(sampleOp());
      expect(queue.pendingCount).toBe(2);
    });
  });

  describe('clear', () => {
    it('removes all operations', () => {
      queue.stage(sampleOp());
      queue.stage(sampleOp());
      queue.clear();
      expect(queue.listAll()).toHaveLength(0);
    });
  });
});
