import type Anthropic from '@anthropic-ai/sdk';

export function formatMessages(messages: Anthropic.MessageParam[]): string {
  return messages.map(formatMessage).join('\n\n');
}

function formatMessage(message: Anthropic.MessageParam): string {
  const role = message.role === 'user' ? '▶ user' : '▶ assistant';
  if (typeof message.content === 'string') {
    return `${role}\n${message.content}`;
  }
  return `${role}\n${message.content.map(formatBlock).join('\n')}`;
}

function formatBlock(block: Anthropic.ContentBlockParam): string {
  switch (block.type) {
    case 'text':
      return block.text;
    case 'tool_use':
      return `🔧 ${block.name}(${JSON.stringify(block.input)})`;
    case 'tool_result': {
      const content =
        typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content);
      return `↩ eredmény: ${content}`;
    }
    default:
      return JSON.stringify(block);
  }
}
