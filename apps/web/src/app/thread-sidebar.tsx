import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const THREADS_URL = 'http://localhost:3001/api/threads';

type ThreadSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('hu-HU', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function ThreadSidebar({
  activeThreadId,
  refreshKey,
  onSelectThread,
  onNewChat,
}: {
  activeThreadId: string;
  refreshKey: number;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
}) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch(THREADS_URL)
      .then((res) => (res.ok ? (res.json() as Promise<ThreadSummary[]>) : []))
      .then((data) => {
        if (!cancelled) {
          setThreads(data);
        }
      })
      .catch(() => {
        // a lista betöltése nem kritikus — üresen marad, a chat funkcionálisan
        // működik nélküle is
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <aside className="flex w-64 flex-col border-r border-border p-3">
      <Button type="button" onClick={onNewChat} className="mb-3 w-full">
        + Új chat
      </Button>

      <div className="flex-1 space-y-1 overflow-y-auto">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => onSelectThread(thread.id)}
            className={
              'w-full rounded-md px-2 py-2 text-left text-sm ' +
              (thread.id === activeThreadId
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50')
            }
          >
            {thread.title ?? formatDate(thread.updatedAt)}
          </button>
        ))}

        {threads.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            Még nincs korábbi beszélgetés.
          </p>
        )}
      </div>
    </aside>
  );
}
