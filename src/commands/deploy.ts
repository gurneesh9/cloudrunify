import { Command } from "npm:commander";
import { ConfigParser, Environment } from "../config/parser.ts";
import { CloudRunService } from "../services/cloudrun.ts";
import { readFileSync, existsSync } from "node:fs";
import inquirer from "npm:inquirer";
import * as process from 'node:process'

export function createDeployCommand(): Command {
  return new Command("deploy")
    .description("Deploy or rollback service to Cloud Run")
    .option("-c, --config <path>", "Configuration file path", "cloudrun.yaml")
    .option("-e, --env <environment>", "Target environment (dev/staging/prod)", "dev")
    .option("-k, --key <path>", "Path to service account key file or 'json' for GitHub Actions")
    .option("--rollback", "Rollback to a previous revision")
    .option("--all-envs", "Deploy to all environments defined in config")
    .action(async (options) => {
      const baseConfig = ConfigParser.parse(options.config);

      let credentialsPath: string | undefined;
      if (options.key) {
        if (options.key === "json") {
          credentialsPath = "json";
        } else if (existsSync(options.key)) {
          credentialsPath = options.key;
        } else {
          console.error(`Service account key file not found: ${options.key}`);
          process.exit(1);
        }
      }

      // Determine which environments to deploy to
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

      // Deploy to each environment
      for (const env of envsToProcess) {
        console.log(`\nProcessing environment: ${env}`);
        
        // Get environment-specific configuration
        const envConfig = ConfigParser.getConfigForEnv(baseConfig, env);
        
        // Create service instance with environment-specific config
        const service = new CloudRunService(envConfig, credentialsPath);

        if (options.rollback) {
          const revisions = await service.getRevisions(envConfig);
          if (revisions.length === 0) {
            console.log(`No revisions found for rollback in ${env} environment.`);
            continue;
          }

          const answers = await inquirer.prompt([
            {
              type: "list",
              name: "revision",
              message: `Select revision to rollback to for ${env}:`,
              choices: revisions,
            },
          ]);

          await service.rollback(envConfig, answers.revision);
        } else {
          try {
            await service.deploy(envConfig);
            console.log(`Successfully deployed to ${env} environment`);
          } catch (error) {
            console.error(`Failed to deploy to ${env} environment:`, error);
            if (!options.allEnvs) {
              process.exit(1);
            }
          }
        }
      }
    });
}
