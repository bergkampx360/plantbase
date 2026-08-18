import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerApp } from './customer-app';

const { useChatMock } = vi.hoisted(() => ({ useChatMock: vi.fn() }));

vi.mock('@ai-sdk/react', () => ({ useChat: useChatMock }));

describe('CustomerApp', () => {
  beforeEach(() => {
    useChatMock.mockReset();
    useChatMock.mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: 'ready',
    });
  });

  it('shows a persistent AI-disclosure banner', () => {
    render(<CustomerApp />);

    expect(
      screen.getByText(/Ezt egy AI-asszisztens válaszolja, nem élő munkatárs/),
    ).toBeInTheDocument();
  });

  it('renders the customer-facing chat, pointed at /api/customer/chat', () => {
    render(<CustomerApp />);

    expect(
      screen.getByRole('heading', {
        name: /Ügyfélszolgálati asszisztens/,
      }),
    ).toBeInTheDocument();
    const transport = useChatMock.mock.calls[0][0].transport;
    expect(transport.api).toBe('http://localhost:3001/api/customer/chat');
  });

  it('has no thread sidebar — a single, session-lifetime conversation, no customer identity model', () => {
    render(<CustomerApp />);

    expect(screen.queryByText(/Új chat/)).not.toBeInTheDocument();
  });
});
