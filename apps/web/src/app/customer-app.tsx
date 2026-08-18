import { generateId } from 'ai';
import { useState } from 'react';
import { Chat } from '../components/chat/chat';

// külön, teljes URL a /api/customer/chat-hez (ugyanaz a hardkódolt-host minta, mint a
// belső Chat API_URL-jénél) — J6, docs/implementation/09-customer-facing-poc.md
const CUSTOMER_API_URL = 'http://localhost:3001/api/customer/chat';

export function CustomerApp() {
  // nincs thread-sidebar/szál-váltás az ügyfél-felületen (7. döntés: nincs
  // ügyfél-azonosítás/session-modell) — egy böngésző-munkamenet, egy folyamatos beszélgetés,
  // a szál-id a komponens élettartama alatt állandó
  const [threadId] = useState(() => generateId());

  return (
    <div className="flex h-screen flex-col">
      {/* Állandó AI-jelzés sáv (HF4 AI Act-elemzés, docs/hf/hf4/HF4-megoldas.md, Határeset-
          elemzés 3. sora) — ügyfél-felületen kötelező explicit kimondani, hogy AI-jal
          beszélget, nem munkatárssal */}
      <div className="bg-muted text-muted-foreground border-b px-4 py-2 text-sm">
        <span role="img" aria-label="robot">
          🤖
        </span>{' '}
        Ezt egy AI-asszisztens válaszolja, nem élő munkatárs. Bizonytalan
        esetben kollégának továbbítjuk a kérdésed.
      </div>
      <Chat
        id={threadId}
        initialMessages={[]}
        apiUrl={CUSTOMER_API_URL}
        title="Plantbase — Ügyfélszolgálati asszisztens"
      />
    </div>
  );
}

export default CustomerApp;
