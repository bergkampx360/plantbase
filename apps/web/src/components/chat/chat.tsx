import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import { useState } from 'react';
import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
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
  // apiUrl/title prop-osítva (J5, docs/implementation/09-customer-facing-poc.md) — a default
  // a jelenlegi, változatlan belső API_URL/cím, hogy a belső App hívása ne változzon; a
  // customer-app.tsx (J6) ad át eltérő értéket a /api/customer/chat végponthoz
  apiUrl = API_URL,
  title = 'Plantbase',
}: {
  id: string;
  initialMessages: UIMessage[];
  onFinish?: () => void;
  apiUrl?: string;
  title?: string;
}) {
  const [input, setInput] = useState('');

  const { messages, sendMessage, status } = useChat({
    id,
    messages: initialMessages,
    onFinish,
    transport: new DefaultChatTransport({
      api: apiUrl,
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
        {title}
      </h1>

      <Conversation className="flex-1">
        <ConversationContent>
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    // csak az asszisztens szövege megy Markdown-renderelésen
                    // keresztül — a user véletlenül begépelt '*'/'_' karaktere
                    // ne alakuljon formázássá (H2 döntés)
                    return message.role === 'assistant' ? (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    ) : (
                      <span key={index} className="whitespace-pre-wrap">
                        {part.text}
                      </span>
                    );
                  }
                  if (isToolUIPart(part)) {
                    return <ToolCallCard key={index} part={part} />;
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
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
