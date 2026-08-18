import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffHandoffsPage } from './staff-handoffs-page';

const pendingHandoff = {
  id: 5,
  question: '50 db pozsgás növényt szeretnék rendelni céges ajándéknak',
  context: 'Nagytételes céges rendelés.',
  reason: 'out_of_scope',
  draftReply: null,
  createdAt: '2026-01-01T10:00:00.000Z',
};

describe('StaffHandoffsPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [pendingHandoff],
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches pending handoffs on mount and renders the question, reason label, and context', async () => {
    render(<StaffHandoffsPage />);

    expect(
      await screen.findByText(pendingHandoff.question),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hatókörön kívüli kérés/)).toBeInTheDocument();
    expect(screen.getByText(/Nagytételes céges rendelés/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/handoffs?status=pending',
    );
  });

  it('shows a draft reply when the agent suggested one', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        { ...pendingHandoff, draftReply: 'Kollégánk hamarosan jelentkezik.' },
      ],
    });

    render(<StaffHandoffsPage />);

    expect(
      await screen.findByText(/Kollégánk hamarosan jelentkezik/),
    ).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no pending handoffs', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    render(<StaffHandoffsPage />);

    expect(
      await screen.findByText(/Nincs függőben lévő eszkaláció/),
    ).toBeInTheDocument();
  });

  it('approving a handoff calls the approve endpoint and removes it from the list after refresh', async () => {
    const user = userEvent.setup();
    render(<StaffHandoffsPage />);

    const approveButton = await screen.findByRole('button', {
      name: 'Jóváhagyás',
    });

    // a jóváhagyás utáni refetch már üres listát ad vissza
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await user.click(approveButton);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/handoffs/5/approve',
      { method: 'POST' },
    );
    await waitFor(() =>
      expect(
        screen.queryByText(pendingHandoff.question),
      ).not.toBeInTheDocument(),
    );
  });

  it('rejecting a handoff calls the reject endpoint', async () => {
    const user = userEvent.setup();
    render(<StaffHandoffsPage />);

    const rejectButton = await screen.findByRole('button', {
      name: 'Elutasítás',
    });

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await user.click(rejectButton);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/handoffs/5/reject',
      { method: 'POST' },
    );
  });
});
