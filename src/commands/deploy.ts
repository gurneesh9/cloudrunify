import { Command } from "commander";
import { ConfigParser } from "../config/parser";
import { CloudRunService } from "../services/cloudrun";
import { readFileSync, existsSync } from "fs";
import inquirer from "inquirer";

export function createDeployCommand(): Command {
  return new Command("deploy")
    .description("Deploy or rollback service to Cloud Run")
    .option("-c, --config <path>", "Configuration file path", "cloudrun.yaml")
    .option("-e, --environment <env>", "Target environment", "development")
    .option("-k, --key <path>", "Path to service account key file or 'json' for GitHub Actions")
    .option("--rollback", "Rollback to a previous revision")
    .action(async (options) => {
      const config = ConfigParser.parse(options.config);

      let credentialsPath: string | undefined;

      if (options.key) {
        if (options.key === "json") {
          credentialsPath = "json"; // Signal to use GOOGLE_CREDENTIALS env var
        } else if (existsSync(options.key)) {
          credentialsPath = options.key; // Use provided key file path
        } else {
          console.error(`Service account key file not found: ${options.key}`);
          process.exit(1);
        }
      }

      const service = new CloudRunService(config, credentialsPath);

      if (options.rollback) {
        const revisions = await service.getRevisions(config);
        if (revisions.length === 0) {
          console.log("No revisions found for rollback.");
          return;
        }

        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "revision",
            message: "Select revision to rollback to:",
            choices: revisions,
          },
        ]);

        await service.rollback(config, answers.revision);
      } else {
        await service.deploy(config);
      }
    });
}
