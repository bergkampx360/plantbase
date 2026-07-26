import type { ModelMessage } from 'ai';

export function formatMessages(messages: ModelMessage[]): string {
  return messages.map(formatMessage).join('\n\n');
}

function formatMessage(message: ModelMessage): string {
  const role = message.role === 'user' ? '▶ user' : `▶ ${message.role}`;
  if (typeof message.content === 'string') {
    return `${role}\n${message.content}`;
  }
  return `${role}\n${message.content.map(formatPart).join('\n')}`;
}

function formatPart(part: unknown): string {
  const typed = part as { type: string };
  switch (typed.type) {
    case 'text':
      return (part as { text: string }).text;
    case 'tool-call': {
      const toolCall = part as { toolName: string; input: unknown };
      return `🔧 ${toolCall.toolName}(${JSON.stringify(toolCall.input)})`;
    }
    case 'tool-result': {
      const toolResult = part as { output: unknown };
      return `↩ eredmény: ${formatToolOutput(toolResult.output)}`;
    }
    default:
      return JSON.stringify(part);
  }
}

// az AI SDK a tool-eredményt egy {type: 'text'|'json'|'error-text'|'error-json', value}
// alakra csomagolja a ToolResultPart.output mezőben — itt csomagoljuk ki, hogy a
// --show-prompt kimenet ugyanolyan olvasható maradjon, mint a korábbi Anthropic-alapú
// formátumnál volt (nyers string, dupla JSON-becsomagolás nélkül)
function formatToolOutput(output: unknown): string {
  if (
    output !== null &&
    typeof output === 'object' &&
    'type' in output &&
    'value' in output &&
    typeof (output as { type: unknown }).type === 'string'
  ) {
    const { value } = output as { value: unknown };
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return typeof output === 'string' ? output : JSON.stringify(output);
}
