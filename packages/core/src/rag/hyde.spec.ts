import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, anthropicMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  anthropicMock: vi.fn().mockReturnValue('mock-anthropic-model'),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: anthropicMock,
}));

import { generateHypotheticalAnswer } from './hyde';

describe('generateHypotheticalAnswer', () => {
  it('returns the generated text and includes the question in the prompt', async () => {
    generateTextMock.mockResolvedValue({ text: 'Öntözd meg hetente egyszer.' });

    const result = await generateHypotheticalAnswer(
      'Milyen gyakran öntözzem a monsterát?',
    );

    expect(result).toBe('Öntözd meg hetente egyszer.');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-anthropic-model',
        prompt: expect.stringContaining('Milyen gyakran öntözzem a monsterát?'),
      }),
    );
  });

  describe('ANTHROPIC_MODEL fallback', () => {
    const originalModel = process.env['ANTHROPIC_MODEL'];

    beforeEach(() => {
      delete process.env['ANTHROPIC_MODEL'];
      generateTextMock.mockResolvedValue({ text: 'válasz' });
      anthropicMock.mockClear();
    });

    afterEach(() => {
      if (originalModel === undefined) {
        delete process.env['ANTHROPIC_MODEL'];
      } else {
        process.env['ANTHROPIC_MODEL'] = originalModel;
      }
    });

    it('falls back to claude-haiku-4-5 when ANTHROPIC_MODEL is unset', async () => {
      await generateHypotheticalAnswer('kérdés');

      expect(anthropicMock).toHaveBeenCalledWith('claude-haiku-4-5');
    });
  });
});
