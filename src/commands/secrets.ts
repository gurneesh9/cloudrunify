import { Command } from "commander";
import { SecretsManagerService } from "../services/secrets_manager";
import * as fs from "fs";

export function createSecretsCommand(): Command {
  const secretsCommand = new Command("secret")
    .description("Manage secrets in Google Cloud Secret Manager");

  // Create command nested under the secrets command
  secretsCommand
    .command("create")
    .description("Create a new secret")
    .requiredOption("-p, --project <projectId>", "Google Cloud Project ID")
    .requiredOption("-n, --name <secretName>", "Secret Name", null, (value, previous) => {
      if (previous) {
        return previous + ',' + value;
      }
      return value;
    })
    .requiredOption("-r, --region <region>", "Region", "us-central1")
    .option("-k, --key <path>", "Path to service account key file or 'json' for GitHub Actions")
    .action(async (options) => {
      if (!options.project || !options.name || !options.region) {
        console.error("Project ID, secret name, and region are required.");
        process.exit(1);
      }

      let credentialsPath: string | undefined;
      if (options.key) {
        if (options.key === "json") {
          credentialsPath = "json";
        } else if (fs.existsSync(options.key)) {
          credentialsPath = options.key;
        } else {
          console.error(`Service account key file not found: ${options.key}`);
          process.exit(1);
        }
      }

      const service = new SecretsManagerService(options.project, credentialsPath);
      const secretNames = options.name.split(',');
      for (const secretName of secretNames) {
        await service.createSecret(options.project, secretName, options.region);
      }
    });

    secretsCommand
    .command("delete")
    .description("Delete a secret")
    .requiredOption("-p, --project <projectId>", "Google Cloud Project ID")
    .requiredOption("-n, --name <secretName>", "Secret Name")
    .requiredOption("-r, --region <region>", "Region", "us-central1")
    .option("-k, --key <path>", "Path to service account key file or 'json' for GitHub Actions")
    .action(async (options) => {
      const service = new SecretsManagerService(options.project, options.key);
      await service.deleteSecret(options.project, options.name, options.region);
    });

    secretsCommand
    .command("list")
    .description("list all secret")
    .requiredOption("-p, --project <projectId>", "Google Cloud Project ID")
    .requiredOption("-n, --name <secretName>", "Secret Name")
    .requiredOption("-r, --region <region>", "Region", "us-central1")
    .option("-k, --key <path>", "Path to service account key file or 'json' for GitHub Actions")
    .action(async (options) => {
      const service = new SecretsManagerService(options.project, options.key);
      await service.listSecrets(options.project);
    });

  return secretsCommand;
}
