import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

// külön, teljes URL, a Chat/ThreadSidebar mintáját követve (J7,
// docs/implementation/09-customer-facing-poc.md)
const HANDOFFS_URL = 'http://localhost:3001/api/handoffs';

type Handoff = {
  id: number;
  question: string;
  context: string | null;
  reason: string;
  draftReply: string | null;
  createdAt: string;
};

const REASON_LABELS: Record<string, string> = {
  weak_knowledge: 'Bizonytalan válasz (gyenge tudásbázis-találat)',
  out_of_scope: 'Hatókörön kívüli kérés',
  complaint_or_judgment: 'Panasz / ítélőképességet igénylő ügy',
};

export function StaffHandoffsPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    fetch(`${HANDOFFS_URL}?status=pending`)
      .then((res) => (res.ok ? (res.json() as Promise<Handoff[]>) : []))
      .then(setHandoffs)
      .catch(() => {
        // a lista betöltése nem kritikus — üresen marad, a felhasználó frissítheti az oldalt
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function review(id: number, action: 'approve' | 'reject') {
    setPendingActionId(id);
    try {
      await fetch(`${HANDOFFS_URL}/${id}/${action}`, { method: 'POST' });
      refresh();
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-semibold">Ügyfél-eszkalációk</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Ezek a kérdések emberi jóváhagyásra várnak — amíg nem hagyod jóvá, semmi nem jut el az
        ügyfélhez.
      </p>

      {handoffs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nincs függőben lévő eszkaláció.
        </p>
      )}

      <div className="space-y-4">
        {handoffs.map((handoff) => (
          <div key={handoff.id} className="rounded-md border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {REASON_LABELS[handoff.reason] ?? handoff.reason}
            </p>
            <p className="mt-1 font-medium">{handoff.question}</p>
            {handoff.context && (
              <p className="mt-1 text-sm text-muted-foreground">
                Kontextus: {handoff.context}
              </p>
            )}
            {handoff.draftReply && (
              <p className="mt-2 rounded-md bg-muted p-2 text-sm">
                Javasolt válasz: {handoff.draftReply}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={pendingActionId === handoff.id}
                onClick={() => review(handoff.id, 'approve')}
              >
                Jóváhagyás
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pendingActionId === handoff.id}
                onClick={() => review(handoff.id, 'reject')}
              >
                Elutasítás
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StaffHandoffsPage;
