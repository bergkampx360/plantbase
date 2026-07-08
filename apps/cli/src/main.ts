#!/usr/bin/env node
import { askAgent } from '@plantbase/core';
import type { AskResult } from '@plantbase/core';
import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import { createInterface } from 'node:readline';

// a repo gyökerén lévő .env-et tölti be — a plantbase globálisan telepített
// bináris nem örökli a direnv shell-integrációt, ezért ezt a CLI-nek magának
// kell megtennie induláskor, mielőtt az askAgent bármelyik Anthropic-hívása lefutna
loadEnv();

type ConversationHistory = AskResult['messages'];

export async function handleQuestion(
  question: string,
  history: ConversationHistory = [],
): Promise<AskResult> {
  return askAgent(question, history);
}

async function runInteractive(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let closed = false;
  rl.on('close', () => {
    closed = true;
  });

  // a session teljes élettartamáig megőrzött beszélgetés-előzmény —
  // exit-nél elvész, az ask parancs (egyszeri process) ezt nem használja
  let history: ConversationHistory = [];

  // pipe-olt/beillesztett bemenetnél readline több 'line' eseményt is
  // szinkronban kiadhat, mielőtt egy rl.pause() érvénybe lépne — emiatt a
  // kérdéseket várólistán, egyesével dolgozzuk fel, hogy a history mindig
  // a ténylegesen megelőző kör eredményét lássa
  const pending: string[] = [];
  let processing = false;

  async function processPending(): Promise<void> {
    if (processing) {
      return;
    }
    processing = true;
    while (pending.length > 0) {
      const question = pending.shift() as string;
      const result = await handleQuestion(question, history);
      history = result.messages;
      console.log(result.answer);
    }
    processing = false;
    if (!closed) {
      rl.prompt();
    }
  }

  rl.setPrompt('plantbase> ');
  rl.prompt();

  rl.on('line', (line) => {
    const question = line.trim();
    if (question === 'exit') {
      rl.close();
      return;
    }
    pending.push(question);
    void processPending();
  });

  return new Promise((resolve) => rl.on('close', resolve));
}

if (process.argv.length <= 2) {
  runInteractive();
} else {
  const program = new Command();

  program.name('plantbase').version('0.0.1');

  program
    .command('ask')
    .argument('<question>', 'a kérdésed a növény-katalógusról')
    .option(
      '--show-prompt',
      'a teljes üzenet-tömb kiírása a válasz mellett (FR5)',
    )
    .action(async (question: string, options: { showPrompt?: boolean }) => {
      const result = await handleQuestion(question);
      console.log(result.answer);
      if (options.showPrompt) {
        console.log(JSON.stringify(result.messages, null, 2));
      }
    });

  program.parse();
}
