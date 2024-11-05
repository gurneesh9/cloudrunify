import { Command } from 'npm:commander';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ConfigParser } from '../config/parser.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as process from 'node:process'

const execPromise = promisify(exec);

export function createPackageCommand(): Command {
    return new Command('package')
        .description('Build and push Docker image to Artifact Registry')
        .option('-p, --project_id <id>', 'GCP Project ID')
        .option('-r, --region <region>', 'GCP Region')
        .option('-s, --service_name <name>', 'Service Name')
        .action(async (options) => {
            let projectId = options.project_id;
            let region = options.region;
            let serviceName = options.service_name;

            // Check if cloudrun.yaml exists
            const configPath = join(process.cwd(), 'cloudrun.yaml');
            if (!projectId || !region || !serviceName) {
                if (existsSync(configPath)) {
                    const config = ConfigParser.parse(configPath);
                    projectId = projectId || config.project_id;
                    region = region || config.region;
                    serviceName = serviceName || config.service.name;
                } else {
                    console.error('No cloudrun.yaml file found and no project_id, region, or service_name provided.');
                    process.exit(1);
                }
            }

            // Check if projectId, region, and serviceName are still undefined
            if (!projectId || !region || !serviceName) {
                console.error('Project ID, region, and service name must be provided either via command line or in cloudrun.yaml.');
                process.exit(1);
            }

            const imageName = `gcr.io/${projectId}/${serviceName}:latest`; // Adjust the image name as needed

            try {
                // Build the Docker image
                console.log(`Building Docker image: ${imageName}`);
                await execPromise(`docker build --platform linux/amd64 -t ${imageName} .`);

                // Push the Docker image to Artifact Registry
                console.log(`Pushing Docker image to Artifact Registry: ${imageName}`);
                await execPromise(`docker push ${imageName}`);

                console.log('Docker image built and pushed successfully.');
            } catch (error) {
                console.error('Error during Docker build or push:', error);
                process.exit(1);
            }
        });
}
