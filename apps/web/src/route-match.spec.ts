import { describe, expect, it } from 'vitest';
import { matchesRoute } from './route-match';

describe('matchesRoute', () => {
  it('matches the exact route', () => {
    expect(matchesRoute('/customer', '/customer')).toBe(true);
    expect(matchesRoute('/staff/handoffs', '/staff/handoffs')).toBe(true);
  });

  it('matches a nested path under the route', () => {
    expect(matchesRoute('/customer/thread-1', '/customer')).toBe(true);
  });

  it('does NOT match a different route that merely shares the prefix as a substring', () => {
    expect(matchesRoute('/customers', '/customer')).toBe(false);
    expect(matchesRoute('/customer-service', '/customer')).toBe(false);
    expect(matchesRoute('/staff/handoffs-archive', '/staff/handoffs')).toBe(false);
  });

  it('does not match an unrelated path', () => {
    expect(matchesRoute('/', '/customer')).toBe(false);
    expect(matchesRoute('/staff', '/customer')).toBe(false);
  });
});
