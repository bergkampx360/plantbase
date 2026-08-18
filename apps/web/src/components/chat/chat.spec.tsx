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

  it('renders assistant Markdown as formatted HTML, not raw syntax', () => {
    useChatMock.mockReturnValue({
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: 'Az **Öregember-kaktusz** a legolcsóbb.',
            },
          ],
        },
      ],
      sendMessage,
      status: 'ready',
    });

    render(<Chat id="thread-1" initialMessages={[]} />);

    // a Streamdown a félkövért egy data-streamdown="strong" span-ként rendereli,
    // nem natív <strong>-ként
    expect(
      screen.getByText('Öregember-kaktusz', {
        selector: '[data-streamdown="strong"]',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('renders a literal asterisk in a user message as plain text, not Markdown', () => {
    useChatMock.mockReturnValue({
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'Mennyi a *pontos* ára?' }],
        },
      ],
      sendMessage,
      status: 'ready',
    });

    render(<Chat id="thread-1" initialMessages={[]} />);

    expect(screen.getByText('Mennyi a *pontos* ára?')).toBeInTheDocument();
  });

  it('renders the message list inside the ai-elements Conversation container', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage, status: 'ready' });

    render(<Chat id="thread-1" initialMessages={[]} />);

    // a Conversation komponens (apps/web/src/components/ai-elements/conversation.tsx)
    // role="log"-ot állít a StickToBottom wrapperen — ez igazolja, hogy be van kötve,
    // a use-stick-to-bottom belső scroll-fizikáját magát nem kell újratesztelni
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it('defaults to the internal /api/chat endpoint and "Plantbase" title when apiUrl/title are not given', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage, status: 'ready' });

    render(<Chat id="thread-1" initialMessages={[]} />);

    expect(
      screen.getByRole('heading', { name: /Plantbase/ }),
    ).toBeInTheDocument();
    const transport = useChatMock.mock.calls[0][0].transport;
    expect(transport.api).toBe('http://localhost:3001/api/chat');
  });

  it('uses the given apiUrl/title when provided (J6, customer-app.tsx)', () => {
    useChatMock.mockReturnValue({ messages: [], sendMessage, status: 'ready' });

    render(
      <Chat
        id="thread-1"
        initialMessages={[]}
        apiUrl="http://localhost:3001/api/customer/chat"
        title="Plantbase — Ügyfélszolgálati asszisztens"
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: /Ügyfélszolgálati asszisztens/,
      }),
    ).toBeInTheDocument();
    const transport = useChatMock.mock.calls[0][0].transport;
    expect(transport.api).toBe('http://localhost:3001/api/customer/chat');
  });
});
