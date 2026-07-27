import { describe, expect, it, vi } from 'vitest';

const { generateTextMock, anthropicMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  anthropicMock: vi.fn().mockReturnValue('mock-anthropic-model'),
}));

// title-agent.ts a resolveModel()-t './ask-agent'-ből importálja, ami modul-szinten
// a három tool-definíciót (RUN_SQL_TOOL stb.) is betölti — azok a 'tool' exportot
// hívják meg 'ai'-ból, ezért itt is kell (identitás-mock, ua. minta, mint
// ask-agent.spec.ts-ben)
vi.mock('ai', () => ({
  generateText: generateTextMock,
  tool: vi.fn((config: unknown) => config),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: anthropicMock,
}));

import { generateThreadTitle } from './title-agent';

describe('generateThreadTitle', () => {
  it('returns the trimmed generated title and includes the question in the prompt', async () => {
    generateTextMock.mockResolvedValue({ text: '  Kaktusz-ajánlás  ' });

    const result = await generateThreadTitle('milyen kaktuszotok van?');

    expect(result).toBe('Kaktusz-ajánlás');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-anthropic-model',
        prompt: expect.stringContaining('milyen kaktuszotok van?'),
      }),
    );
  });
});
