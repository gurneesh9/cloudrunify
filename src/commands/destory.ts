import { Command } from 'npm:commander';
import { CloudRunService } from '../services/cloudrun.ts';
import { ConfigParser, Environment } from '../config/parser.ts';
import * as process from 'node:process';

export function createDestroyCommand(): Command {
    return new Command('destroy')
        .description('Delete service from Cloud Run')
        .option('-c, --config <path>', 'Configuration file path', 'cloudrun.yaml')
        .option('-e, --env <environment>', 'Target environment (dev/staging/prod)', 'dev')
        .option('--all-envs', 'Destroy from all environments defined in config')
        .action(async (options) => {
            const baseConfig = ConfigParser.parse(options.config);

            // Determine which environments to destroy from
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

            // Destroy from each environment
            for (const env of envsToProcess) {
                console.log(`\nProcessing environment: ${env}`);
                
                // Get environment-specific configuration
                const envConfig = ConfigParser.getConfigForEnv(baseConfig, env);
                
                // Create service instance with environment-specific config
                const service = new CloudRunService(envConfig);

                try {
                    await service.destroy(envConfig);
                    console.log(`Successfully destroyed service in ${env} environment`);
                } catch (error) {
                    console.error(`Failed to destroy service in ${env} environment:`, error);
                    if (!options.allEnvs) {
                        process.exit(1);
                    }
                }
            }
        });
}
