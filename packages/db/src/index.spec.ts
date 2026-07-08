import { describe, expect, it } from 'vitest';
import { prisma } from './index';

describe('index', () => {
  it('exports a configured Prisma Client with a product accessor', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.product.findMany).toBe('function');
  });
});
