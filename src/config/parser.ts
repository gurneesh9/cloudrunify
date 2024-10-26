import { parse, stringify } from "yaml";
import { readFileSync } from "fs";
export interface CloudRunConfig {
  version: string;
  project_id: string;
  region: string;
  service: {
    name: string;
    allow_unauthenticated: boolean;
    service_account?: string;
  };
  container: {
    image: string;
    port: number;
    env_vars: Array<{ name: string; value: string }>;
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
  traffic: Array<{ tag: string; percent: number }>;
  secrets: Array<{ name: string; version: string; mount_path?: string }>;
  custom_domain?: {
    domain: string;
    certificate: string;
  };
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
      !config.container.scaling?.min_instances ||
      !config.container.scaling?.max_instances ||
      !config.container.scaling?.concurrency
    ) {
      console.error("Invalid scaling configuration");
      return false;
    }

    // Traffic validation
    if (
      !Array.isArray(config.traffic) ||
      !config.traffic.every((t) => typeof t.tag === "string" && typeof t.percent === "number")
    ) {
      console.error("Invalid traffic configuration");
      return false;
    }

    return true;
  }
}
