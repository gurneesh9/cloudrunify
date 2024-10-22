import { Command } from 'commander';
import Docker from 'dockerode';
import { ConfigParser } from '../config/parser';
import { existsSync } from 'fs';
import { join } from 'path';

export function createPackageCommand(): Command {
    return new Command('package')
        .description('Build and push Docker image to Artifact Registry')
        .option('-p, --project_id <id>', 'GCP Project ID')
        .option('-r, --region <region>', 'GCP Region')
        .option('-s, --service_name <name>', 'Service name for the Docker image')
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

            const imageName = `gcr.io/${projectId}/${serviceName}:latest`;

            const docker = new Docker();

            try {
                // Build the Docker image
                console.log(`Building Docker image: ${imageName}`);
                const stream = await docker.buildImage(
                    {
                        context: process.cwd(),
                        src: ['Dockerfile'],
                    },
                    { t: imageName }
                );

                // Stream the build output
                stream.on('data', (data) => {
                    console.log(data.toString());
                });

                stream.on('end', async () => {
                    console.log('Docker image built successfully.');

                    // Push the Docker image to Artifact Registry
                    console.log(`Pushing Docker image to Artifact Registry: ${imageName}`);
                    const pushStream = await docker.getImage(imageName).push({});

                    // Stream the push output
                    pushStream.on('data', (data) => {
                        console.log(data.toString());
                    });

                    pushStream.on('end', () => {
                        console.log('Docker image pushed successfully.');
                    });
                });
            } catch (error) {
                console.error('Error during Docker build or push:', error);
                process.exit(1);
            }
        });
}
