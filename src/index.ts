#!/usr/bin/env bun
import { Command } from 'npm:commander';
import { createDeployCommand } from './commands/deploy.ts';
import { createInitCommand } from './commands/init.ts';
import { createPackageCommand } from './commands/package.ts';
import { createDestroyCommand } from './commands/destory.ts';
import { createSecretsCommand } from './commands/secrets.ts';

const VERSION = '0.0.1'
const program = new Command();

program
  .name('cloudrunify')
  .description('Declarative deployment tool for Google Cloud Run')
  .version(VERSION);

// Add commands here later
program.addCommand(createInitCommand())
program.addCommand(createDeployCommand())
program.addCommand(createPackageCommand())
program.addCommand(createDestroyCommand())
program.addCommand(createSecretsCommand())

program.parse();
