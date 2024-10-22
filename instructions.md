# Building CloudRunify: Step-by-Step Development Guide

## Table of Contents
1. Project Setup
2. Core Architecture
3. CLI Implementation
4. Configuration Management
5. Google Cloud Integration
6. Testing & Packaging

## 1. Project Setup

### 1.1 Initialize Project
```bash
# Create project directory
mkdir cloudrunify
cd cloudrunify

# Initialize Bun project
bun init -y

# Initialize Git repository
git init
```

### 1.2 Configure TypeScript
Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

### 1.3 Install Dependencies
```bash
bun add commander yaml @google-cloud/run @google-cloud/secret-manager
bun add -d @types/node typescript @types/yaml
```

## 2. Core Architecture

### 2.1 Project Structure
```
cloudrunify/
├── src/
│   ├── commands/         # CLI commands
│   ├── config/          # Configuration management
│   ├── services/        # Cloud Run integration
│   ├── utils/           # Helper functions
│   └── index.ts         # Entry point
├── templates/           # YAML templates
├── tests/              # Test files
├── package.json
└── tsconfig.json
```

### 2.2 Basic Entry Point
Create `src/index.ts`:
```typescript
#!/usr/bin/env bun
import { Command } from 'commander';
import { version } from '../package.json';

const program = new Command();

program
  .name('cloudrunify')
  .description('Declarative deployment tool for Google Cloud Run')
  .version(version);

// Add commands here later

program.parse();
```

## 3. Core Components Implementation

### 3.1 Configuration Parser
Create `src/config/parser.ts`:
```typescript
import { parse, stringify } from 'yaml';
import { readFileSync } from 'fs';

export interface CloudRunConfig {
  service: {
    name: string;
    region: string;
    image: string;
    environment?: Record<string, string>;
    resources?: {
      cpu?: string;
      memory?: string;
    };
  };
  environments: Record<string, any>;
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
```

### 3.2 Cloud Run Service Manager
Create `src/services/cloudrun.ts`:
```typescript
import { Run } from '@google-cloud/run';

export class CloudRunService {
  private client: Run;
  
  constructor() {
    this.client = new Run();
  }

  async deploy(config: CloudRunConfig, env: string) {
    // Implement deployment logic
  }

  async rollback(serviceName: string, version: string) {
    // Implement rollback logic
  }

  async getStatus(serviceName: string) {
    // Implement status check
  }
}
```

## 4. CLI Commands Implementation

### 4.1 Deploy Command
Create `src/commands/deploy.ts`:
```typescript
import { Command } from 'commander';
import { ConfigParser } from '../config/parser';
import { CloudRunService } from '../services/cloudrun';

export function createDeployCommand(): Command {
  return new Command('deploy')
    .description('Deploy service to Cloud Run')
    .option('-c, --config <path>', 'Configuration file path', 'cloudrun.yaml')
    .option('-e, --environment <env>', 'Target environment', 'development')
    .action(async (options) => {
      const config = ConfigParser.parse(options.config);
      const service = new CloudRunService();
      await service.deploy(config, options.environment);
    });
}
```

## 5. Configuration Templates

### 5.1 Sample Configuration
Create `templates/cloudrun.yaml`:
```yaml
service:
  name: my-service
  region: us-central1
  image: gcr.io/project-id/image:tag
  resources:
    cpu: 1
    memory: 512Mi

environments:
  development:
    scaling:
      minInstances: 0
      maxInstances: 2
    environment:
      NODE_ENV: development
  
  production:
    scaling:
      minInstances: 1
      maxInstances: 10
    environment:
      NODE_ENV: production
```

## 6. Building & Packaging

### 6.1 Update package.json
```json
{
  "name": "cloudrunify",
  "bin": {
    "cloudrunify": "./dist/index.js"
  },
  "scripts": {
    "build": "bun build ./src/index.ts --outfile=dist/index.js --target=node",
    "package": "bun build ./src/index.ts --compile --outfile=cloudrunify"
  }
}
```

## Next Steps

1. Implement remaining commands:
   - `status`: Check service status
   - `rollback`: Revert to previous version
   - `logs`: View service logs
   - `init`: Create new configuration

2. Add validation and error handling:
   - Configuration validation
   - Google Cloud credentials check
   - Network error handling

3. Implement advanced features:
   - Traffic splitting
   - Secret management
   - Custom domain configuration

4. Add tests:
   - Unit tests for configuration parser
   - Integration tests for deployment
   - E2E tests for CLI commands

5. Create documentation:
   - Installation guide
   - Configuration reference
   - Command reference
   - Example workflows

## Usage Example

Once implemented, users will be able to use CloudRunify like this:

```bash
# Deploy service
cloudrunify deploy -c ./cloudrun.yaml -e production

# Check status
cloudrunify status my-service

# Rollback to previous version
cloudrunify rollback my-service --version v1
```