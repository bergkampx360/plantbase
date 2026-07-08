#!/usr/bin/env node
import { Command } from 'commander';
import { createInterface } from 'node:readline';

export async function handleQuestion(question: string): Promise<string> {
  return `Ezt mondtad: "${question}"`;
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
      .then((answer) => console.log(answer))
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
    .action(async (question: string) => {
      console.log(await handleQuestion(question));
    });

  program.parse();
}
