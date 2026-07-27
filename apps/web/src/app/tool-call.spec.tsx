import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToolCallCard } from './tool-call';

describe('ToolCallCard', () => {
  it('is collapsed by default and shows the tool label', () => {
    render(
      <ToolCallCard
        part={{
          type: 'tool-runSql',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { query: 'SELECT 1' },
          output: '[]',
        }}
      />,
    );

    expect(screen.getByText(/Katalógus-lekérdezés/)).toBeInTheDocument();
    expect(screen.queryByText('Bemenet')).not.toBeInTheDocument();
  });

  it('expands to show input/output on click', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallCard
        part={{
          type: 'tool-runSql',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { query: 'SELECT 1' },
          output: '[{"name":"Öregember-kaktusz"}]',
        }}
      />,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Bemenet')).toBeInTheDocument();
    expect(screen.getByText(/SELECT 1/)).toBeInTheDocument();
    expect(screen.getByText('Eredmény')).toBeInTheDocument();
    expect(screen.getByText(/Öregember-kaktusz/)).toBeInTheDocument();
  });

  it('shows a pending indicator while the input is streaming', () => {
    render(
      <ToolCallCard
        part={{
          type: 'tool-searchKnowledge',
          toolCallId: 'call-2',
          state: 'input-streaming',
          input: undefined,
        }}
      />,
    );

    expect(screen.getByText(/folyamatban/)).toBeInTheDocument();
  });

  it('shows the error text when the tool call failed', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallCard
        part={{
          type: 'tool-listCategories',
          toolCallId: 'call-3',
          state: 'output-error',
          input: {},
          errorText: 'valami elromlott',
        }}
      />,
    );

    await user.click(screen.getByRole('button'));

    expect(screen.getByText(/valami elromlott/)).toBeInTheDocument();
  });
});
