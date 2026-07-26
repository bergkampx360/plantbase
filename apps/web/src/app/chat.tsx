import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, generateId } from 'ai';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// a szerver /api/chat végpontja NEM az askAgent()-en keresztül megy — a CLI és a
// szerver két külön Node-folyamat, csak a tool/prompt/modell-építőelemeket osztják meg
// (docs/implementation/06-web-chat.md, G1 döntés #1)
const API_URL = 'http://localhost:3001/api/chat';

export function Chat() {
  // a chat id-t a kliens generálja, MIELŐTT az első üzenet elmenne — a szerver sosem
  // talál ki saját azonosítót, csak arra perzisztál, amit kap (AI SDK natív mintája,
  // docs/implementation/06-web-chat.md, G4)
  const [chatId] = useState(() => generateId());
  const [input, setInput] = useState('');

  const { messages, sendMessage, status } = useChat({
    id: chatId,
    transport: new DefaultChatTransport({
      api: API_URL,
      // csak az utolsó üzenetet küldjük — a szerver a DB-ből tölti be a korábbi
      // kört, a DB az igazságforrás (G-rész eredeti "Thread-perzisztencia" döntése)
      prepareSendMessagesRequest: ({ id, messages: currentMessages }) => ({
        body: { id, message: currentMessages[currentMessages.length - 1] },
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
    <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">
        <span role="img" aria-label="növény">
          🌱
        </span>{' '}
        Plantbase
      </h1>

      <div className="flex-1 space-y-4 overflow-y-auto">
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
              {message.parts.map((part, index) =>
                part.type === 'text' ? (
                  <span key={index}>{part.text}</span>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>

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
