import { describe, expect, it, vi } from 'vitest';

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue('mock-anthropic-model'),
}));

import { generateHypotheticalAnswer } from './hyde';

describe('generateHypotheticalAnswer', () => {
  it('returns the generated text and includes the question in the prompt', async () => {
    generateTextMock.mockResolvedValue({ text: 'Öntözd meg hetente egyszer.' });

    const result = await generateHypotheticalAnswer('Milyen gyakran öntözzem a monsterát?');

    expect(result).toBe('Öntözd meg hetente egyszer.');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-anthropic-model',
        prompt: expect.stringContaining('Milyen gyakran öntözzem a monsterát?'),
      }),
    );
  });
});
