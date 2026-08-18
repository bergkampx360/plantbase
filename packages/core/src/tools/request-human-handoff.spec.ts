import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHandoffPool } from '../infra/db-pool';
import {
  REQUEST_HUMAN_HANDOFF_TOOL,
  requestHumanHandoff,
} from './request-human-handoff';

vi.mock('../infra/db-pool', () => ({
  getHandoffPool: vi.fn(),
}));

const mockedGetHandoffPool = vi.mocked(getHandoffPool);
const queryMock = vi.fn();

beforeEach(() => {
  queryMock.mockReset();
  mockedGetHandoffPool.mockReturnValue({
    query: queryMock,
  } as unknown as ReturnType<typeof getHandoffPool>);
});

describe('requestHumanHandoff', () => {
  it('inserts a pending row with the given fields, without RETURNING (plantbase_handoff has no SELECT, not even on its own inserts)', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const result = await requestHumanHandoff({
      question: 'Tudtok egyedi árat adni 50 db pozsgásra?',
      reason: 'out_of_scope',
      context: 'céges ajándék',
      draftReply: 'Kollégánk hamarosan jelentkezik.',
    });

    const [query, values] = queryMock.mock.calls[0];
    expect(query).toContain('INSERT INTO customer_handoffs');
    expect(query).not.toMatch(/returning/i);
    expect(values).toEqual([
      'Tudtok egyedi árat adni 50 db pozsgásra?',
      'céges ajándék',
      'out_of_scope',
      'Kollégánk hamarosan jelentkezik.',
    ]);
    expect(result).toBe(JSON.stringify({ status: 'pending' }));
  });

  it('defaults optional fields to null', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    await requestHumanHandoff({
      question: 'Milyen kártevő eszi a levelet?',
      reason: 'weak_knowledge',
    });

    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [
      'Milyen kártevő eszi a levelet?',
      null,
      'weak_knowledge',
      null,
    ]);
  });

  it('rejects an unknown reason', async () => {
    await expect(
      requestHumanHandoff({ question: 'x', reason: 'not_a_real_reason' }),
    ).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects input that fails schema validation', async () => {
    await expect(requestHumanHandoff({ question: '' })).rejects.toThrow();
    await expect(requestHumanHandoff({})).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('REQUEST_HUMAN_HANDOFF_TOOL.execute', () => {
  it('catches a query rejection and returns it as a plain string instead of throwing', async () => {
    queryMock.mockRejectedValue(
      new Error('permission denied for table customer_handoffs'),
    );

    const output = await REQUEST_HUMAN_HANDOFF_TOOL.execute?.(
      { question: 'x', reason: 'weak_knowledge' },
      { toolCallId: 'test', messages: [] },
    );

    expect(output).toBe('permission denied for table customer_handoffs');
  });

  it('returns the pending-status JSON on a successful insert, same as requestHumanHandoff directly', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const output = await REQUEST_HUMAN_HANDOFF_TOOL.execute?.(
      { question: 'x', reason: 'complaint_or_judgment' },
      { toolCallId: 'test', messages: [] },
    );

    expect(output).toBe(JSON.stringify({ status: 'pending' }));
  });
});
