import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT_CUSTOMER } from './system-prompt-customer';

describe('SYSTEM_PROMPT_CUSTOMER', () => {
  it('discloses that it is an AI, not a human colleague', () => {
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('NEM élő munkatárs');
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('sosem adod ki magad embernek');
  });

  it('never declares runSql as a callable tool — the prompt only mentions it to rule it out', () => {
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('nincs runSql tool');
    expect(SYSTEM_PROMPT_CUSTOMER).not.toContain('runSql(');
  });

  it('describes exactly the three customer-safe tools', () => {
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('searchProducts(');
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('searchKnowledge(query):');
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('requestHumanHandoff(');
  });

  it('instructs escalation on the second weak searchKnowledge result, same threshold as the internal prompt', () => {
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('"weak": true');
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('weak_knowledge');
  });

  it('instructs escalation for out-of-scope and complaint/judgment cases, not fabrication', () => {
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('out_of_scope');
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('complaint_or_judgment');
    expect(SYSTEM_PROMPT_CUSTOMER).toContain(
      'NE generálj végleges választ helyette',
    );
  });

  it('prohibits artificial urgency / dark-pattern language', () => {
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('mesterséges sürgetést');
    expect(SYSTEM_PROMPT_CUSTOMER).toContain('tiltott gyakorlat');
  });

  it('stays in sync with docs/system-prompt-customer.md', () => {
    const docsPath = resolve(
      __dirname,
      '../../../../docs/system-prompt-customer.md',
    );
    const docsContent = readFileSync(docsPath, 'utf-8');

    const start = docsContent.indexOf('<role>');
    const endTag = '</tools>';
    const end = docsContent.lastIndexOf(endTag) + endTag.length;

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const docsPromptContent = docsContent.slice(start, end);

    // Ugyanaz a normalizálás, mint system-prompt.spec.ts-ben — prettier üres sorokat
    // szúrhat be a markdown-fájlban, ami a sima TS-stringben nincs; ez formázási zaj,
    // nem tartalmi eltérés.
    const normalize = (text: string): string =>
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .join('\n');

    expect(normalize(docsPromptContent)).toBe(
      normalize(SYSTEM_PROMPT_CUSTOMER),
    );
  });
});
