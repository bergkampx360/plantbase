import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import { useState } from 'react';
import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToolCallCard } from './tool-call';

// a szerver /api/chat végpontja NEM az askAgent()-en keresztül megy — a CLI és a
// szerver két külön Node-folyamat, csak a tool/prompt/modell-építőelemeket osztják meg
// (docs/implementation/06-web-chat.md, G1 döntés #1)
const API_URL = 'http://localhost:3001/api/chat';

export function Chat({
  id,
  initialMessages,
  onFinish,
}: {
  id: string;
  initialMessages: UIMessage[];
  onFinish?: () => void;
}) {
  const [input, setInput] = useState('');

  const { messages, sendMessage, status } = useChat({
    id,
    messages: initialMessages,
    onFinish,
    transport: new DefaultChatTransport({
      api: API_URL,
      // csak az utolsó üzenetet küldjük — a szerver a DB-ből tölti be a korábbi
      // kört, a DB az igazságforrás (G-rész eredeti "Thread-perzisztencia" döntése)
      prepareSendMessagesRequest: ({
        id: chatId,
        messages: currentMessages,
      }) => ({
        body: {
          id: chatId,
          message: currentMessages[currentMessages.length - 1],
        },
      }),
    }),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (input.trim() === '') {
      return;
    }
    sendMessage({ text: input });
    setInput('');
  }

  return (
    <div className="flex flex-1 flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">
        <span role="img" aria-label="növény">
          🌱
        </span>{' '}
        Plantbase
      </h1>

      <Conversation className="flex-1">
        <ConversationContent>
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'text-right' : 'text-left'}
            >
              <div
                className={
                  'inline-block rounded-lg px-3 py-2 whitespace-pre-wrap ' +
                  (message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground')
                }
              >
                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return <span key={index}>{part.text}</span>;
                  }
                  if (isToolUIPart(part)) {
                    return <ToolCallCard key={index} part={part} />;
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </ConversationContent>
      </Conversation>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Kérdezz a növényekről vagy a gondozásukról…"
          disabled={status !== 'ready'}
        />
        <Button type="submit" disabled={status !== 'ready'}>
          Küldés
        </Button>
      </form>
    </div>
  );
}
