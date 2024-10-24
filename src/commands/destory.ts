import { Command } from 'commander';
import { ConfigParser } from '../config/parser';
import { CloudRunService } from '../services/cloudrun';

export function createDestroyCommand(): Command {
    return new Command('destroy')
        .description('Delete service from Cloud Run')
        .option('-c, --config <path>', 'Configuration file path', 'cloudrun.yaml')
        .action(async (options) => {
            const config = ConfigParser.parse(options.config);
            const service = new CloudRunService();
            await service.destroy(config);
        });
}
