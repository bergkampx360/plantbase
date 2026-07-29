import { generateId, type UIMessage } from 'ai';
import { useState } from 'react';
import { Chat } from '../components/chat/chat';
import { ThreadSidebar } from '../components/chat/thread-sidebar';

const THREADS_URL = 'http://localhost:3001/api/threads';

type StoredMessage = {
  id: number;
  role: string;
  content: string;
  parts?: unknown;
};

function isUIMessageParts(value: unknown): value is UIMessage['parts'] {
  return Array.isArray(value) && value.length > 0;
}

function toUIMessages(messages: StoredMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: String(message.id),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    // a H4 óta mentett assistant-üzeneteknek van parts mezőjük (tool-hívás/-eredmény
    // is benne, már a helyes alakban, mert a szerver a natív responseMessage.parts-ot
    // mentette) — a H4 előtti, parts nélküli üzeneteknél a content marad az egyetlen
    // forrás, csak-szöveges rekonstrukcióval
    parts: isUIMessageParts(message.parts)
      ? message.parts
      : [{ type: 'text', text: message.content }],
  }));
}

export function App() {
  // a chat id-t a kliens generálja, MIELŐTT az első üzenet elmenne — a szerver
  // sosem talál ki saját azonosítót (AI SDK natív mintája, G4)
  const [activeThreadId, setActiveThreadId] = useState(() => generateId());
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  // minden kör lezárultával bump-olva (Chat onFinish-e) — a sidebar ekkor frissül,
  // hogy az új/frissült szál megjelenjen
  const [refreshKey, setRefreshKey] = useState(0);

  function handleNewChat() {
    setActiveThreadId(generateId());
    setInitialMessages([]);
  }

  async function handleSelectThread(id: string) {
    const response = await fetch(`${THREADS_URL}/${id}`);
    if (!response.ok) {
      return;
    }
    const thread = (await response.json()) as { messages: StoredMessage[] };
    setActiveThreadId(id);
    setInitialMessages(toUIMessages(thread.messages));
  }

  return (
    <div className="flex h-screen">
      <ThreadSidebar
        activeThreadId={activeThreadId}
        refreshKey={refreshKey}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
      />
      {/* key={activeThreadId}: tiszta remount szál-váltáskor, nem a useChat belső
          id-cache-ére hagyatkozva (G6 terv, Context7-vel megerősítve) */}
      <Chat
        key={activeThreadId}
        id={activeThreadId}
        initialMessages={initialMessages}
        onFinish={() => setRefreshKey((key) => key + 1)}
      />
    </div>
  );
}

export default App;
