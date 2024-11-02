#!/usr/bin/env bun
import { Command } from 'commander';
import { createDeployCommand } from './commands/deploy';
import { createInitCommand } from './commands/init';
import { createPackageCommand } from './commands/package';
import { createDestroyCommand } from './commands/destory';
import { createSecretsCommand } from './commands/secrets';

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
