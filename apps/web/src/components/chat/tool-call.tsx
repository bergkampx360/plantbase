import type { ToolUIPart, UITools } from 'ai';
import { useState } from 'react';

const TOOL_LABELS: Record<string, string> = {
  'tool-runSql': '🔍 Katalógus-lekérdezés',
  'tool-listCategories': '📋 Kategóriák',
  'tool-searchKnowledge': '🌿 Tudásbázis-keresés',
};

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function ToolCallCard({ part }: { part: ToolUIPart<UITools> }) {
  const [open, setOpen] = useState(false);
  const label =
    TOOL_LABELS[part.type] ?? `🔧 ${part.type.replace('tool-', '')}`;
  const isPending =
    part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <div className="my-1 rounded-lg border border-border bg-card text-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span>
          {label}
          {isPending && (
            <span className="text-muted-foreground"> — folyamatban…</span>
          )}
        </span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {part.input !== undefined && (
            <div>
              <div className="text-muted-foreground text-xs">Bemenet</div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                {formatValue(part.input)}
              </pre>
            </div>
          )}

          {part.state === 'output-available' && (
            <div>
              <div className="text-muted-foreground text-xs">Eredmény</div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                {formatValue(part.output)}
              </pre>
            </div>
          )}

          {part.state === 'output-error' && (
            <div className="text-destructive text-xs">
              Hiba: {part.errorText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
