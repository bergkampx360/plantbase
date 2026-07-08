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

export async function handleQuestion(question: string): Promise<AskResult> {
  return askAgent(question);
}

async function runInteractive(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let closed = false;
  rl.on('close', () => {
    closed = true;
  });

  rl.setPrompt('plantbase> ');
  rl.prompt();

  rl.on('line', (line) => {
    const question = line.trim();
    if (question === 'exit') {
      rl.close();
      return;
    }
    // szüneteltetve, amíg a válasz megérkezik, hogy egy időben beérkező
    // "exit" sor ne zárja be a readline-t egy még függőben lévő kérdés alatt
    rl.pause();
    handleQuestion(question)
      .then((result) => console.log(result.answer))
      .finally(() => {
        if (!closed) {
          rl.resume();
          rl.prompt();
        }
      });
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
    .option('--show-prompt', 'a teljes üzenet-tömb kiírása a válasz mellett (FR5)')
    .action(async (question: string, options: { showPrompt?: boolean }) => {
      const result = await handleQuestion(question);
      console.log(result.answer);
      if (options.showPrompt) {
        console.log(JSON.stringify(result.messages, null, 2));
      }
    });

  program.parse();
}
