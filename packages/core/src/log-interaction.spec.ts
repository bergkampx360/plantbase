import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  appendFile: vi.fn(),
}));

import { appendFile, mkdir } from 'node:fs/promises';
import { logInteraction } from './log-interaction';

const mockedMkdir = vi.mocked(mkdir);
const mockedAppendFile = vi.mocked(appendFile);

beforeEach(() => {
  mockedMkdir.mockReset().mockResolvedValue(undefined);
  mockedAppendFile.mockReset().mockResolvedValue(undefined);
});

describe('logInteraction', () => {
  it('creates the logs directory (recursively) before writing', async () => {
    await logInteraction({
      system: 'system prompt',
      messages: [],
      answer: 'válasz',
      tokenUsage: { inputTokens: 10, outputTokens: 5 },
    });

    expect(mockedMkdir).toHaveBeenCalledWith(join(process.cwd(), 'logs'), {
      recursive: true,
    });
  });

  it('appends a single JSON line with the full log entry to a timestamped file under logs/', async () => {
    const log = {
      system: 'system prompt',
      messages: [{ role: 'user' as const, content: 'kérdés' }],
      answer: 'válasz',
      tokenUsage: { inputTokens: 10, outputTokens: 5 },
      generatedSql: 'SELECT 1',
    };

    await logInteraction(log);

    expect(mockedAppendFile).toHaveBeenCalledTimes(1);
    const [filePath, content] = mockedAppendFile.mock.calls[0];

    expect(String(filePath)).toMatch(
      new RegExp(`^${join(process.cwd(), 'logs').replace(/[/\\]/g, '\\$&')}[/\\\\].+\\.jsonl$`),
    );
    expect(content).toBe(`${JSON.stringify(log)}\n`);
    expect(JSON.parse(String(content).trim())).toEqual(log);
  });

  it('mkdir runs before appendFile (directory must exist first)', async () => {
    const order: string[] = [];
    mockedMkdir.mockImplementation(async () => {
      order.push('mkdir');
      return undefined;
    });
    mockedAppendFile.mockImplementation(async () => {
      order.push('appendFile');
      return undefined;
    });

    await logInteraction({
      system: 'system prompt',
      messages: [],
      answer: 'válasz',
      tokenUsage: { inputTokens: 1, outputTokens: 1 },
    });

    expect(order).toEqual(['mkdir', 'appendFile']);
  });
});
