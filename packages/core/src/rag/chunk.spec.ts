import { describe, expect, it } from 'vitest';
import {
  MAX_CHUNK_TOKENS,
  OVERLAP_SENTENCES,
  chunkArticle,
  packIntoTokenChunks,
  parseArticle,
  splitByH2,
  stripStoreNoise,
} from './chunk';

function makeArticle(
  body: string,
  overrides: Partial<Record<'title' | 'category', string>> = {},
) {
  const title = overrides.title ?? 'Snake Plant Care';
  const category = overrides.category ?? 'plants-101';
  return `---
title: ${title}
source: https://example.com/snake-plant
category: ${category}
---

# ${title}

${body}
`;
}

describe('parseArticle', () => {
  it('extracts title/category from frontmatter and strips frontmatter+H1 from body', () => {
    const content = makeArticle(
      'Intro paragraph.\n\n## Water\n\nWater it sometimes.',
    );
    const article = parseArticle(content, 'plants-101__snake-plant.md');

    expect(article.title).toBe('Snake Plant Care');
    expect(article.category).toBe('plants-101');
    expect(article.source).toBe('plants-101__snake-plant.md');
    expect(article.body).not.toContain('---');
    expect(article.body).not.toContain('# Snake Plant Care');
    expect(article.body).toContain('Intro paragraph.');
  });

  it('throws when frontmatter is missing', () => {
    expect(() => parseArticle('# No frontmatter\n\nBody.', 'bad.md')).toThrow(
      /frontmatter/i,
    );
  });

  it('throws when title or category is missing from frontmatter', () => {
    const content =
      '---\nsource: https://example.com\n---\n\n# Title\n\nBody.\n';
    expect(() => parseArticle(content, 'bad.md')).toThrow(/title\/category/i);
  });
});

describe('stripStoreNoise', () => {
  it('removes everything from the "Perfect Pairings" heading onward', () => {
    const body =
      'Real content.\n\n## Perfect Pairings For Your Plants\n\n* Premium Potting Mix';
    expect(stripStoreNoise(body)).toBe('Real content.\n\n');
  });

  it('is a no-op when the noise heading is absent', () => {
    const body = 'Real content.\n\n## Water\n\nWater it.';
    expect(stripStoreNoise(body)).toBe(body);
  });
});

describe('splitByH2', () => {
  it('splits only at H2 boundaries, keeping H3 subheadings inside their section', () => {
    const body = [
      'Intro text before any heading.',
      '',
      '## Learn More',
      '',
      'Some background.',
      '',
      '### How To Repot',
      '',
      'Repotting details.',
      '',
      '## Water',
      '',
      'Water thoroughly.',
    ].join('\n');

    const sections = splitByH2(body);

    expect(sections).toHaveLength(3);
    expect(sections[0].sectionTitle).toBeNull();
    expect(sections[0].text).toContain('Intro text before any heading.');
    expect(sections[1].sectionTitle).toBe('Learn More');
    expect(sections[1].text).toContain('### How To Repot');
    expect(sections[1].text).toContain('Repotting details.');
    expect(sections[2].sectionTitle).toBe('Water');
    expect(sections[2].text).toBe('Water thoroughly.');
  });

  it('has no intro section when the body starts directly with an H2', () => {
    const body = '## Water\n\nWater thoroughly.';
    const sections = splitByH2(body);

    expect(sections).toHaveLength(1);
    expect(sections[0].sectionTitle).toBe('Water');
  });

  it('drops empty sections', () => {
    const body = '## Water\n\nWater thoroughly.\n\n## Empty\n\n';
    const sections = splitByH2(body);

    expect(sections.map((s) => s.sectionTitle)).toEqual(['Water']);
  });
});

describe('packIntoTokenChunks', () => {
  it('keeps short text as a single chunk', () => {
    const chunks = packIntoTokenChunks(
      'Water it every two weeks. Keep soil dry between waterings.',
    );
    expect(chunks).toHaveLength(1);
  });

  it('splits text exceeding MAX_CHUNK_TOKENS into multiple chunks', () => {
    const sentence =
      'Snake plants tolerate low light and thrive in bright indirect sunlight near a window.';
    const longText = Array.from({ length: 80 }, () => sentence).join(' ');

    const chunks = packIntoTokenChunks(longText);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('repeats the last OVERLAP_SENTENCES sentences at the start of the next chunk', () => {
    const sentences = Array.from(
      { length: 60 },
      (_, i) =>
        `This is sentence number ${i} about snake plant care and watering habits.`,
    );
    const chunks = packIntoTokenChunks(sentences.join(' '));

    expect(chunks.length).toBeGreaterThan(1);

    const firstChunkSentences = chunks[0].split(/(?<=\.)\s+/);
    const expectedOverlap = firstChunkSentences.slice(-OVERLAP_SENTENCES);
    for (const sentence of expectedOverlap) {
      expect(chunks[1]).toContain(sentence);
    }
  });
});

describe('chunkArticle', () => {
  it('prefixes intro chunks with just the title, and section chunks with title — section', () => {
    const content = makeArticle(
      'Intro paragraph.\n\n## Water\n\nWater it sometimes.',
    );
    const result = chunkArticle(content, 'plants-101__snake-plant.md');

    expect(result.chunks[0].content.startsWith('Snake Plant Care\n\n')).toBe(
      true,
    );
    expect(
      result.chunks[1].content.startsWith('Snake Plant Care — Water\n\n'),
    ).toBe(true);
  });

  it('assigns sequential chunkIndex starting from 0', () => {
    const content = makeArticle(
      'Intro.\n\n## Water\n\nText.\n\n## Sunlight\n\nText.',
    );
    const result = chunkArticle(content, 'x.md');

    expect(result.chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
  });

  it('excludes the store-noise section entirely from the output', () => {
    const content = makeArticle(
      'Real content about watering.\n\n## Perfect Pairings For Your Plants\n\n* Premium Potting Mix\n\nDo Some Plant Shopping',
    );
    const result = chunkArticle(content, 'x.md');

    const allContent = result.chunks.map((c) => c.content).join('\n');
    expect(allContent).not.toContain('Perfect Pairings');
    expect(allContent).not.toContain('Premium Potting Mix');
  });

  it('keeps every chunk within MAX_CHUNK_TOKENS plus a small overlap/prefix margin', () => {
    const sentence =
      'Snake plants tolerate low light and thrive in bright indirect sunlight.';
    const body = `## Water\n\n${Array.from({ length: 80 }, () => sentence).join(' ')}`;
    const content = makeArticle(body);

    const result = chunkArticle(content, 'x.md');

    expect(result.chunks.length).toBeGreaterThan(1);
    for (const chunk of result.chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }
    expect(MAX_CHUNK_TOKENS).toBe(400);
  });
});
