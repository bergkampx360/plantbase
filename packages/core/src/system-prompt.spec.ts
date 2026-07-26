import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from './system-prompt';

describe('SYSTEM_PROMPT', () => {
  it('instructs grounding via source-cited searchKnowledge results', () => {
    expect(SYSTEM_PROMPT).toContain('searchKnowledge toolt használd');
    expect(SYSTEM_PROMPT).toContain('forráshivatkozással (title) idézd');
    expect(SYSTEM_PROMPT).toContain('"weak": true');
    expect(SYSTEM_PROMPT).toContain('nincs erről infóm');
  });

  it('instructs the read-only SQL guard rule', () => {
    expect(SYSTEM_PROMPT).toContain('CSAK SELECT');
  });

  it('describes all three agent tools', () => {
    expect(SYSTEM_PROMPT).toContain('runSql(query):');
    expect(SYSTEM_PROMPT).toContain('listCategories():');
    expect(SYSTEM_PROMPT).toContain('searchKnowledge(query):');
  });

  it('stays in sync with docs/system-prompt.md', () => {
    const docsPath = resolve(__dirname, '../../../docs/system-prompt.md');
    const docsContent = readFileSync(docsPath, 'utf-8');

    const start = docsContent.indexOf('<role>');
    const endTag = '</tools>';
    const end = docsContent.lastIndexOf(endTag) + endTag.length;

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const docsPromptContent = docsContent.slice(start, end);

    // A docs/system-prompt.md prettier markdown-formázáson megy át (üres sor a kódblokkok
    // körül, 3↔4 backtick a beágyazott ```sql fence-eknél), a SYSTEM_PROMPT sima TS-string
    // nem — ez formázási zaj, nem tartalmi eltérés, ezért mindkettőt normalizáljuk
    // összevetés előtt (üres sorok eldobva, fence-hosszkülönbség eltüntetve).
    const normalize = (text: string): string =>
      text
        .replace(/^`{3,4}/gm, '```')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join('\n');

    expect(normalize(docsPromptContent)).toBe(normalize(SYSTEM_PROMPT));
  });
});
