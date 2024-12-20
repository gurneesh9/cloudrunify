import { parse, stringify } from "npm:yaml";
import { readFileSync } from "node:fs";

export interface EnvironmentConfig {
  project_id: string;
  region: string;
}

export type Environment = 'dev' | 'staging' | 'prod';
export interface CloudRunConfig {
  version: string;
  project_id: string;
  region: string;
  environments: {
    dev: EnvironmentConfig;
    staging: EnvironmentConfig;
    prod: EnvironmentConfig;
  };
  service: {
    name: string;
    allow_unauthenticated: boolean;
    service_account?: string;
  };
  container: {
    image: string;
    port: number;
    env_vars: Array<
      | { name: string; value: string } // Regular environment variable
      | { name: string; valueFrom: { secretKeyRef: { name: string } } } // Secret reference
    >;
    resources: {
      cpu: string;
      memory: string;
    };
    scaling?: {
      min_instances: number;
      max_instances: number;
      concurrency: number;
    };
  };
  secrets: Array<{ name: string; version: string; mount_path?: string }>;
  volumes?: Array<{ name: string; path: string; type: string; bucket?: string }>;
  custom_domain?: {
    domain: string;
    certificate: string;
  };
  load_balancer?: {
    name: string; // Name of the load balancer
    backend_service?: {
      name: string;
      existing: boolean;
    };
  }; // New load balancer configuration
  traffic?: Array<{ revision: string; percent: number; tag?: string }>; // New traffic configuration
}

export class ConfigParser {
  static parse(path: string): CloudRunConfig {
    const content = readFileSync(path, "utf-8");
    return parse(content) as CloudRunConfig;
  }

  static validate(config: CloudRunConfig): boolean {
    // Basic validation checks
    if (!config.version || !config.project_id || !config.region) {
      console.error("Missing required top-level fields");
      return false;
    }

    // Service validation
    if (!config.service?.name || typeof config.service.allow_unauthenticated !== "boolean") {
      console.error("Invalid service configuration");
      return false;
    }

    // Container validation
    if (!config.container?.image || !config.container.port) {
      console.error("Invalid container configuration");
      return false;
    }

    // Resources validation
    if (!config.container.resources?.cpu || !config.container.resources?.memory) {
      console.error("Invalid resources configuration");
      return false;
    }

    // Scaling validation
    if (
      config.container.scaling &&
      (config.container.scaling.min_instances < 0 ||
        config.container.scaling.max_instances < config.container.scaling.min_instances ||
        config.container.scaling.concurrency < 1 ||
        config.container.scaling.concurrency > 1000)
    ) {
      console.error("Invalid scaling configuration");
      return false;
    }

    // Environment variables validation
    if (Array.isArray(config.container.env_vars)) {
      for (const envVar of config.container.env_vars) {
        // Type guard to check if envVar has valueFrom
        const hasValueFrom = 'valueFrom' in envVar;

        if (
          !envVar.name ||
          (hasValueFrom ? !('value' in envVar) && !envVar.valueFrom : !envVar.value) ||
          (hasValueFrom && !envVar.valueFrom.secretKeyRef)
        ) {
          console.error("Invalid environment variable configuration");
          return false;
        }
      }
    } else {
      console.error("Environment variables must be an array");
      return false;
    }

    // Traffic validation
    if (
      !Array.isArray(config.traffic) ||
      !config.traffic.every((t) => typeof t.revision === "string" && typeof t.percent === "number")
    ) {
      console.error("Invalid traffic configuration");
      return false;
    }

    // Add environments validation to existing validation
    if (!config.environments?.dev || !config.environments?.staging || !config.environments?.prod) {
      console.error("Missing required environment configurations");
      return false;
    }

    // Validate each environment has required fields
    for (const env of ['dev', 'staging', 'prod'] as const) {
      if (!config.environments[env].project_id || !config.environments[env].region) {
        console.error(`Missing required fields in ${env} environment configuration`);
        return false;
      }
    }

    return true;
  }

  static getServiceNameForEnv(config: CloudRunConfig, env: Environment): string {
    return `${config.service.name}-${env}`;
  }

  static getConfigForEnv(config: CloudRunConfig, env: Environment): CloudRunConfig {
    return {
      ...config,
      service: {
        ...config.service,
        name: this.getServiceNameForEnv(config, env)
      }
    };
  }
}
