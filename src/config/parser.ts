import { parse, stringify } from 'yaml';
import { readFileSync } from 'fs';

export interface CloudRunConfig {
  version: string;
  project_id: string;
  region: string;
  service: {
      name: string;
      allow_unauthenticated: boolean;
      service_account: string;
  };
  container: {
      image: string;
      port: number;
      env_vars: Array<{ name: string; value: string }>;
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
    const content = readFileSync(path, 'utf-8');
    return parse(content) as CloudRunConfig;
  }

  static validate(config: CloudRunConfig): boolean {
    // Implement validation logic
    return true;
  }
}
