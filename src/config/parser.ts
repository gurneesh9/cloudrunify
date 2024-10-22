import { parse, stringify } from 'yaml';
import { readFileSync } from 'fs';

export interface CloudRunConfig {
  version: string; // Version of the configuration
  project_id: string; // User's GCP Project ID
  region: string; // Default region, can be overridden in environments

  service: {
    name: string; // Cloud Run service name
    allow_unauthenticated: boolean; // Whether the service should allow unauthenticated access
    service_account: string; // Service account email to use for this service
  };

  environments: {
    [key: string]: {
      region?: string; // Optional, override the default region
      memory: string; // Memory allocation for the service
      cpu: number; // CPU allocation for the service
      max_instances: number; // Maximum number of instances
      min_instances?: number; // Optional, for scaling down
      concurrency: number; // Number of requests the service can handle at the same time
      allow_unauthenticated: boolean; // Can be overridden for specific environments
      service_account?: string; // Can override default service account for this environment
    };
  };

  container: {
    image: string; // The container image URL from Artifact Registry or GCR
    port: number; // Default port for the container
    env_vars: Array<{
      name: string; // Environment variable name
      value: string; // Environment variable value
    }>; // Environment variables for the container
  };

  traffic: Array<{
    tag: string; // E.g., 'current', 'previous', or specific revision names
    percent: number; // Percent traffic distribution
  }>;

  secrets: Array<{
    name: string; // Secret name
    version: string; // Version of the secret to use
    mount_path?: string; // Optional, specify where to mount the secret
  }>;

  custom_domain?: {
    domain: string; // Optional custom domain
    certificate?: string; // Optional certificate for HTTPS
  };
}

export class ConfigParser {
  static parse(path: string): CloudRunConfig {
    const content = readFileSync(path, 'utf-8');
    return parse(content) as CloudRunConfig;
  }

  static validate(config: CloudRunConfig): boolean {
    // Implement validation logic
    return true;
  }
}
