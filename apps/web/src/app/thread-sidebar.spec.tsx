import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from './thread-sidebar';

describe('ThreadSidebar', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 'thread-a', createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-02T10:00:00.000Z' },
          { id: 'thread-b', createdAt: '2026-01-03T10:00:00.000Z', updatedAt: '2026-01-04T10:00:00.000Z' },
        ],
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the fetched threads and highlights the active one', async () => {
    render(
      <ThreadSidebar
        activeThreadId="thread-a"
        refreshKey={0}
        onSelectThread={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    const buttons = await screen.findAllByRole('button', { name: /2026/ });
    expect(buttons).toHaveLength(2);
  });

  it('calls onNewChat when the button is clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(
      <ThreadSidebar
        activeThreadId="thread-a"
        refreshKey={0}
        onSelectThread={vi.fn()}
        onNewChat={onNewChat}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Új chat/ }));

    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('calls onSelectThread with the clicked thread id', async () => {
    const user = userEvent.setup();
    const onSelectThread = vi.fn();
    render(
      <ThreadSidebar
        activeThreadId="thread-a"
        refreshKey={0}
        onSelectThread={onSelectThread}
        onNewChat={vi.fn()}
      />,
    );

    const buttons = await screen.findAllByRole('button', { name: /2026/ });
    await user.click(buttons[1]);

    await waitFor(() => expect(onSelectThread).toHaveBeenCalledWith('thread-b'));
  });
});
