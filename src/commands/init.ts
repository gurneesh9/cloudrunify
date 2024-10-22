// src/commands/init.ts

import { Command } from 'commander';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export function createInitCommand(): Command {
  return new Command('init')
    .description('Scaffold a new empty YAML template')
    .action(async () => {
      const templatePath = join(__dirname, '../../templates/cloudrun.yaml');
      const outputPath = join(process.cwd(), 'cloudrun.yaml');

      // Check if Dockerfile exists in the current directory
      const dockerfilePath = join(process.cwd(), 'Dockerfile');
      if (!existsSync(dockerfilePath)) {
        console.log('No Dockerfile found in the current directory. Please add a Dockerfile for deployment.');
      }

      try {
        const templateContent = await readFile(templatePath, 'utf-8');

        await writeFile(outputPath, templateContent.trim());
        console.log(`Created ${outputPath}. Please populate the YAML file with your configuration.`);
      } catch (error) {
        console.error('Error reading or writing files:', error);
      }
    });
}
