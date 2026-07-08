import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('index', () => {
  it('exports the current placeholder version', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
