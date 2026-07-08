#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program.name('plantbase').version('0.0.1');

program
  .command('ask')
  .argument('<question>', 'a kérdésed a növény-katalógusról')
  .action((question: string) => {
    console.log('TODO', question);
  });

program.parse();
