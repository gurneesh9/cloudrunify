import { Command } from 'npm:commander';
import { CloudRunService } from '../services/cloudrun.ts';
import { ConfigParser } from '../config/parser.ts';

export function createDestroyCommand(): Command {
    return new Command('destroy')
        .description('Delete service from Cloud Run')
        .option('-c, --config <path>', 'Configuration file path', 'cloudrun.yaml')
        .action(async (options) => {
            const config = ConfigParser.parse(options.config);
            const service = new CloudRunService(config);
            await service.destroy(config);
        });
}
