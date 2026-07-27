import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from './chat';

const { useChatMock } = vi.hoisted(() => ({ useChatMock: vi.fn() }));

vi.mock('@ai-sdk/react', () => ({ useChat: useChatMock }));

describe('Chat', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    useChatMock.mockReset();
  });

  it('renders text and tool-call parts from the messages array', () => {
    useChatMock.mockReturnValue({
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'milyen kaktuszotok van?' }],
        },
        {
          id: 'm2',
          role: 'assistant',
          parts: [
            {
              type: 'tool-runSql',
              toolCallId: 'call-1',
              state: 'output-available',
              input: { query: 'SELECT 1' },
              output: '[]',
            },
            { type: 'text', text: 'Íme a kaktuszaink.' },
          ],
        },
      ],
      sendMessage,
      status: 'ready',
    });

    render(<Chat id="thread-1" initialMessages={[]} />);

    expect(screen.getByText('milyen kaktuszotok van?')).toBeInTheDocument();
    expect(screen.getByText('Íme a kaktuszaink.')).toBeInTheDocument();
    expect(screen.getByText(/Katalógus-lekérdezés/)).toBeInTheDocument();
  });

  it('sends the typed message and clears the input on submit', async () => {
    const user = userEvent.setup();
    useChatMock.mockReturnValue({ messages: [], sendMessage, status: 'ready' });

    render(<Chat id="thread-1" initialMessages={[]} />);

    const input = screen.getByPlaceholderText(/Kérdezz/);
    await user.type(input, 'hány szobanövény van?');
    await user.click(screen.getByRole('button', { name: /Küldés/ }));

    expect(sendMessage).toHaveBeenCalledWith({ text: 'hány szobanövény van?' });
    expect(input).toHaveValue('');
  });

  it('disables the input while a response is streaming', () => {
    useChatMock.mockReturnValue({
      messages: [],
      sendMessage,
      status: 'streaming',
    });

    render(<Chat id="thread-1" initialMessages={[]} />);

    expect(screen.getByPlaceholderText(/Kérdezz/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Küldés/ })).toBeDisabled();
  });
});
