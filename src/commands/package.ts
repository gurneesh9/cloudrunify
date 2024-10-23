import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigParser } from '../config/parser';
import { existsSync } from 'fs';
import { join } from 'path';

const execPromise = promisify(exec);

export function createPackageCommand(): Command {
    return new Command('package')
        .description('Build and push Docker image to Artifact Registry')
        .option('-p, --project_id <id>', 'GCP Project ID')
        .option('-r, --region <region>', 'GCP Region')
        .action(async (options) => {
            let projectId = options.project_id;
            let region = options.region;

            // Check if cloudrun.yaml exists
            const configPath = join(process.cwd(), 'cloudrun.yaml');
            if (!projectId || !region) {
                if (existsSync(configPath)) {
                    const config = ConfigParser.parse(configPath);
                    projectId = projectId || config.project_id;
                    region = region || config.region;
                } else {
                    console.error('No cloudrun.yaml file found and no project_id or region provided.');
                    process.exit(1);
                }
            }

            // Check if projectId and region are still undefined
            if (!projectId || !region) {
                console.error('Project ID and region must be provided either via command line or in cloudrun.yaml.');
                process.exit(1);
            }

            const imageName = `${projectId}.gcr.io/my-service:latest`; // Adjust the image name as needed

            try {
                // Build the Docker image
                console.log(`Building Docker image: ${imageName}`);
                await execPromise(`docker build -t ${imageName} .`);

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
