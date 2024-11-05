import { Command } from "npm:commander";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import * as process from "node:process"

const DEFAULT_TEMPLATE = `
  version: # Version of the YAML schema
  project_id: # GCP Project ID
  region: # Default region for the service

  service: # Service configuration
    name: # Cloud Run service name
    allow_unauthenticated: <boolean> # Whether to allow unauthenticated access
    service_account: # Service account email for the service

  container: # Container configuration
    image: # Container image URL (Artifact Registry or GCR)
    port: # Port for the container
    env_vars: # Environment variables for the container
      - name: # Environment variable name
        value: # Environment variable value
    resources:
      cpu: # CPU resource limit
      memory: # Memory resource limit
    scaling:
      min_instances: # Minimum number of instances
      max_instances: # Maximum number of instances
      target_cpu_utilization: # Target CPU utilization

  traffic: # Traffic routing configuration
    - tag: # Traffic tag (e.g., 'current', 'previous')
      percent: # Percentage of traffic routed to this tag

  secrets: # Secrets management
    - name: # Secret name
      version: # Version of the secret
      mount_path: # Path to mount the secret (optional)

  custom_domain: # Custom domain configuration
    domain: # Custom domain (optional)
    certificate: # Certificate for HTTPS (optional)
`;

export function createInitCommand(): Command {
  return new Command("init").description("Scaffold a new empty YAML template").action(async () => {
    const outputPath = join(process.cwd(), "cloudrun.yaml");

    // Check if cloudrun.yaml already exists
    if (existsSync(outputPath)) {
      console.log("cloudrun.yaml already exists in the current directory.");
      return;
    }

    // Check if Dockerfile exists in the current directory
    const dockerfilePath = join(process.cwd(), "Dockerfile");
    if (!existsSync(dockerfilePath)) {
      console.log(
        "No Dockerfile found in the current directory. Please add a Dockerfile for deployment.",
      );
    }

    try {
      await writeFile(outputPath, DEFAULT_TEMPLATE);
      console.log(`Created ${outputPath}. Please populate the YAML file with your configuration.`);
    } catch (error) {
      console.error("Error writing file:", error);
    }
  });
}
