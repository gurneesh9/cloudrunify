import { Command } from 'npm:commander';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ConfigParser, Environment } from '../config/parser.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as process from 'node:process'

const execPromise = promisify(exec);

export function createPackageCommand(): Command {
    return new Command('package')
        .description('Build and push Docker image to Artifact Registry')
        .option('-c, --config <path>', 'Configuration file path', 'cloudrun.yaml')
        .option('-e, --env <environment>', 'Target environment (dev/staging/prod)', 'dev')
        .option('--all-envs', 'Build and push for all environments')
        .action(async (options) => {
            const configPath = join(process.cwd(), options.config);
            if (!existsSync(configPath)) {
                console.error('No cloudrun.yaml file found.');
                process.exit(1);
            }

            const baseConfig = ConfigParser.parse(configPath);

            // Determine which environments to process
            const envsToProcess: Environment[] = [];
            
            if (options.allEnvs) {
                // Get all environments defined in the config
                if (baseConfig.environments.dev) envsToProcess.push('dev');
                if (baseConfig.environments.staging) envsToProcess.push('staging');
                if (baseConfig.environments.prod) envsToProcess.push('prod');
            } else {
                // Validate single environment
                const targetEnv = options.env as Environment;
                if (!baseConfig.environments[targetEnv]) {
                    console.error(`Environment '${targetEnv}' not defined in config`);
                    process.exit(1);
                }
                envsToProcess.push(targetEnv);
            }

            console.log('Environments to process:', envsToProcess);

            // Build the base image once
            const baseImageName = `gcr.io/${baseConfig.project_id}/${baseConfig.service.name}`;
            
            try {
                // Build the Docker image
                console.log(`Building base Docker image: ${baseImageName}`);
                await execPromise(`docker build --platform linux/amd64 -t ${baseImageName} .`);

                // Tag and push for each environment
                for (const env of envsToProcess) {
                    const envConfig = ConfigParser.getConfigForEnv(baseConfig, env);
                    const envImageName = `${baseImageName}-${env}:latest`;

                    console.log(`\nProcessing environment: ${env}`);
                    console.log(`Tagging image for ${env}: ${envImageName}`);
                    
                    // Tag the image for this environment
                    await execPromise(`docker tag ${baseImageName} ${envImageName}`);

                    // Push the Docker image to Artifact Registry
                    console.log(`Pushing Docker image to Artifact Registry: ${envImageName}`);
                    await execPromise(`docker push ${envImageName}`);

                    console.log(`Successfully pushed image for ${env} environment`);
                }

                console.log('\nAll Docker images built and pushed successfully.');
            } catch (error) {
                console.error('Error during Docker build or push:', error);
                process.exit(1);
            }
        });
}
