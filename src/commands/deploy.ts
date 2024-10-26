import { Command } from "commander";
import { ConfigParser } from "../config/parser";
import { CloudRunService } from "../services/cloudrun";

export function createDeployCommand(): Command {
  return new Command("deploy")
    .description("Deploy service to Cloud Run")
    .option("-c, --config <path>", "Configuration file path", "cloudrun.yaml")
    .option("-e, --environment <env>", "Target environment", "development")
    .option("-k, --key", "Use service account key authentication from config")
    .action(async (options) => {
      const config = ConfigParser.parse(options.config);
      // Only use service account key if --key flag is present and key path is configured
      const service = new CloudRunService(options.key, config);

      if (options.key && !config.auth?.service_account_key_path) {
        console.warn(
          "Warning: --key flag provided but no service_account_key_path found in config",
        );
      }

      await service.deploy(config);
    });
}
