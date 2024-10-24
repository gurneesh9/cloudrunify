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
      await service.deploy(config);
    });
}