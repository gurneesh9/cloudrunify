import { GoogleAuth } from "npm:google-auth-library";

import { ServicesClient, RevisionsClient } from "npm:@google-cloud/run";
import { CloudRunConfig } from "../config/parser.ts";
import * as process from "node:process"
import ora from "npm:ora";

import * as fs from "node:fs";

import { exec } from "node:child_process";

interface IRevisionScaling {
  minInstanceCount?: number;
  maxInstanceCount?: number;
  concurrency?: number;
}

export class CloudRunService {
  private client: ServicesClient;
  private revisionsClient: RevisionsClient;
  constructor(config: CloudRunConfig, credentialsPath?: string) {
    if (credentialsPath) {
      let credentials;
      try {
        if (credentialsPath === "json") {
          // Use JSON string from environment variable
          const jsonCreds = process.env.GOOGLE_CREDENTIALS;
          if (!jsonCreds) {
            throw new Error("GOOGLE_CREDENTIALS environment variable not found");
          }
          credentials = JSON.parse(jsonCreds);
        } else {
          console.log("BBBB ", credentialsPath);
          // Use file path
          const keyFileContent = fs.readFileSync(credentialsPath, "utf-8");
          credentials = JSON.parse(keyFileContent);
        }

        const auth = new GoogleAuth({
          credentials,
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
        this.client = new ServicesClient({ auth });
        this.revisionsClient = new RevisionsClient({ auth });
      } catch (error: unknown) {
        console.error("Error initializing authentication:", error);
        throw error;
      }
    } else {
      this.client = new ServicesClient();
      this.revisionsClient = new RevisionsClient();
    }
  }

  async allowUnauthenticated(servicePath: string) {
    const policy = {
      bindings: [
        {
          role: "roles/run.invoker",
          members: ["allUsers"],
        },
      ],
    };
    try {
      await this.client.setIamPolicy({
        resource: servicePath,
        policy,
      });
      console.log("Allowed unauthenticated access to service");
    } catch (error: unknown) {
      console.error("Error setting IAM policy:", error);
      throw error;
    }
  }

  private validateResourceConfig(config: CloudRunConfig) {
    // Validate CPU format
    const cpuPattern = /^(\d+(\.\d+)?|(\d+m))$/;
    if (config.container.resources && !cpuPattern.test(config.container.resources.cpu as string)) {
      throw new Error(
        'Invalid CPU format. Must be a number or a millicpu value (e.g., "1" or "1000m")',
      );
    }

    // Validate memory format
    const memoryPattern = /^\d+[KMGTPEZYkmgtpezy]i?[Bb]?$/;
    if (config.container.resources && !memoryPattern.test(config.container.resources.memory as string)) {
      throw new Error(
        'Invalid memory format. Must be a number followed by a unit (e.g., "256Mi", "1Gi")',
      );
    }

    // Validate scaling configuration
    if (config.container.scaling && config.container.scaling.min_instances < 0) {
      throw new Error("Minimum instances cannot be negative");
    }

    if (
      config.container.scaling &&
      config.container.scaling.max_instances < (config.container.scaling.min_instances || 0)
    ) {
      throw new Error("Maximum instances must be greater than or equal to minimum instances");
    }

    if (
      (config.container.scaling && config.container.scaling.concurrency < 1) ||
      (config.container.scaling && config.container.scaling.concurrency > 1000)
    ) {
      throw new Error("Concurrency must be between 1 and 1000");
    }
  }

  async deploy(config: CloudRunConfig) {
    this.validateResourceConfig(config);

    const serviceName = config.service.name;
    const projectId = config.project_id;
    const region = config.region;

    const location = `projects/${projectId}/locations/${region}`;
    const servicePath = `${location}/services/${serviceName}`;

    // Validate the service name
    if (!/^[a-z][a-z0-9-]{0,48}[a-z0-9]$/.test(serviceName)) {
      throw new Error(
        `Invalid service name: "${serviceName}". It must start with a letter, end with a letter or digit, and can only contain lowercase letters, digits, and hyphens.`,
      );
    }

    // Validate container configuration
    if (!config.container || !config.container.image || !config.container.port) {
      throw new Error(
        "Container configuration is invalid. Ensure that the image and port are specified.",
      );
    }

    const envVars = Array.isArray(config.container.env_vars) ? config.container.env_vars : [];
    const secrets = config.secrets || [];
    const volumes = config.volumes || [];

    const service = {
      template: {
        containers: [
          {
            image: config.container.image,
            ports: [{ containerPort: config.container.port }],
            ...(config.container.resources && {
              resources: {
                limits: {
                  cpu: config.container.resources.cpu,
                  memory: config.container.resources.memory,
                },
              },
            }),
            ...(envVars.length > 0 && {
              env: envVars.map((envVar) => ({
                name: envVar.name,
                value: envVar.value,
              })),
            }),
            ...(secrets.length > 0 && {
              volumeMounts: this.createVolumeMounts(secrets),
            }),
            ...(volumes.length > 0 && {
              volumeMounts: [
                ...(this.createVolumeMounts(secrets)),
                ...this.createVolumeMountsFromVolumes(volumes),
              ],
            }),
          },
        ],
        ...(config.container.scaling && {
          scaling: {
            minInstanceCount: config.container.scaling.min_instances,
            maxInstanceCount: config.container.scaling.max_instances,
            concurrency: config.container.scaling.concurrency,
          } as IRevisionScaling,
        }),
        ...(config.service.service_account && {
          serviceAccount: config.service.service_account,
        }),
        volumes: this.createVolumes(secrets, volumes),
      },
      traffic: this.createTrafficConfiguration(config.traffic || []),
    };

    try {
      await this.client.createService({
        parent: `projects/${projectId}/locations/${region}`,
        serviceId: serviceName,
        service,
      });
      console.log(`Service ${serviceName} creation initiated:`);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // deno-lint-ignore no-explicit-any
      let serviceDetails: any;
      let status = "UNKNOWN";

      const POLLING_TIMEOUT = 10 * 60 * 1000;
      const POLLING_INTERVAL = 5000;

      const startTime = Date.now();
      const spinner = ora({
        text: "Deploying service...",
        spinner: "dots",
      }).start();
      while (true) {
        if (Date.now() - startTime > POLLING_TIMEOUT) {
          let errorMessage = `Service ${serviceName} deployment timed out after ${POLLING_TIMEOUT / 1000} seconds`;
          if (serviceDetails && serviceDetails.conditions) {
            const conditions = serviceDetails.conditions;
            const lastCondition = conditions[conditions.length -1];
            errorMessage += `\nLast known status: ${lastCondition.state}`;
            if (lastCondition.message) {
              errorMessage += `\nMessage: ${lastCondition.message}`;
            }
          }
          throw new Error(errorMessage);
        }

        try {
          [serviceDetails] = await this.client.getService({
            name: `projects/${projectId}/locations/${region}/services/${serviceName}`,
          });

          if (!serviceDetails || !serviceDetails.conditions) {
            spinner.text = "Waiting for service details to be available...";
            await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
            continue;
          }
          const conditions = serviceDetails.conditions || [];
          status = conditions[0]?.state || "UNKNOWN";

          if (status === "CONDITION_SUCCEEDED") {
            spinner.succeed("Service is active and ready!");
            break;
          } else {
            spinner.text = `Service status: ${status}. Waiting for service to become active...`;
          }
        } catch (error: unknown) {
          if (error instanceof Error && error.message) {
            spinner.fail("Deployment failed");
            const errorMessage = this.formatError(error);
            throw new Error(errorMessage);
          }
          spinner.fail(`Error fetching service details: ${error}`);
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      }

      if (config.service.allow_unauthenticated) {
        await this.allowUnauthenticated(servicePath);
      }

      // Configure load balancer if specified
      if (config.load_balancer) {
        
        await this.setupLoadBalancer(
          projectId, 
          serviceName, 
          region, 
          config.load_balancer.backend_service?.name,
          config.load_balancer.backend_service?.existing
        );
      }

      console.log("Service URL: ", serviceDetails.uri);
    } catch (error: unknown) {
      console.error("Error deploying service:", error);
      throw error;
    }
  }

  private async setupLoadBalancer(projectId: string, serviceName: string, region: string, backendServiceName?: string, existing?: boolean) {
    const negName = `${serviceName}-neg`;
    const newBackendServiceName = backendServiceName || `${serviceName}-backend-service`;

    // Create Serverless NEG for the Cloud Run service
    console.log(`Creating Serverless NEG for service: ${serviceName}...`);
    await this.executeCommand(`gcloud compute network-endpoint-groups create ${negName} \
        --region=${region} \
        --network-endpoint-type=serverless \
        --cloud-run-service=${serviceName}`);
    console.log(`Serverless NEG ${negName} created successfully.`);

    // Create backend service with EXTERNAL_MANAGED scheme
    console.log(`Creating backend service: ${newBackendServiceName}...`);
    await this.executeCommand(`gcloud compute backend-services create ${newBackendServiceName} \
        --global \
        --load-balancing-scheme=EXTERNAL_MANAGED \
        --port-name=http \
        --protocol=HTTP`);

    // Add NEG to backend service
    console.log(`Adding Serverless NEG to backend service...`);
    await this.executeCommand(`gcloud compute backend-services add-backend ${newBackendServiceName} \
        --global \
        --network-endpoint-group=${negName} \
        --network-endpoint-group-region=${region}`);

    if (existing) {
        console.log(`Adding new backend service to existing load balancer...`);
        try {
            // First, list all forwarding rules to see what's available
            console.log('Listing all forwarding rules...');
            const allForwardingRules = await this.executeCommand(`gcloud compute forwarding-rules list --format="table(name,target)"`);
            console.log('Available forwarding rules:', allForwardingRules);

            // Get the forwarding rule without filtering first
            const forwardingRules: any = await this.executeCommand(`gcloud compute forwarding-rules list --format="get(name,target)"`);
            console.log('Found forwarding rules:', forwardingRules);

            if (!forwardingRules.trim()) {
                throw new Error('No forwarding rules found');
            }

            const rules = forwardingRules.trim().split('\n');
            const targetRule = rules.find((rule: string) => rule.includes('test-lb') || rule.includes('http-proxy'));
            
            if (!targetRule) {
                throw new Error('Could not find appropriate forwarding rule');
            }

            const [ruleName, targetProxy] = targetRule.split(/\s+/);
            console.log(`Found rule: ${ruleName} with target: ${targetProxy}`);

            if (!targetProxy) {
                throw new Error('Could not find target proxy for the load balancer');
            }

            // Extract the proxy name from the full path
            const proxyName = targetProxy.split('/').pop();
            console.log(`Using proxy name: ${proxyName}`);

            // Get the URL map from the target proxy
            const urlMapInfo = await this.executeCommand(`gcloud compute target-http-proxies describe ${proxyName} --format="get(urlMap)" --global`) as string;
            console.log('URL Map Info:', urlMapInfo);

            const urlMapName = urlMapInfo.trim().split('/').pop();
            console.log(`Extracted URL map name: ${urlMapName}`);

            if (!urlMapName) {
                throw new Error('Could not find URL map for the load balancer');
            }

            // Update the URL map's default service
            console.log(`Updating URL map ${urlMapName} with new backend service...`);
            await this.executeCommand(`gcloud compute url-maps set-default-service ${urlMapName} \
                --global \
                --default-service=${newBackendServiceName}`);

            console.log(`Backend service ${newBackendServiceName} set as default for load balancer successfully.`);
        } catch (error) {
            console.error('Error updating load balancer:', error);
            throw error;
        }
    } else {
        // Create new load balancer components
        const urlMapName = `${serviceName}-url-map`;
        const targetProxyName = `${serviceName}-target-proxy`;
        const forwardingRuleName = `${serviceName}-forwarding-rule`;
        const ipAddressName = `${serviceName}-ip`;

        // Reserve a global static IP address
        console.log(`Creating static IP address: ${ipAddressName}...`);
        await this.executeCommand(`gcloud compute addresses create ${ipAddressName} \
            --global \
            --ip-version=IPV4`);

        // Get the reserved IP address
        const ipAddress: string = await this.executeCommand(`gcloud compute addresses describe ${ipAddressName} \
            --global \
            --format="get(address)"`) as string;
        console.log(`Reserved IP address: ${ipAddress.trim()}`);

        // Create URL map
        console.log(`Creating URL map: ${urlMapName}...`);
        await this.executeCommand(`gcloud compute url-maps create ${urlMapName} \
            --global \
            --default-service=${newBackendServiceName}`);

        // Create HTTP proxy
        console.log(`Creating Target HTTP Proxy: ${targetProxyName}...`);
        await this.executeCommand(`gcloud compute target-http-proxies create ${targetProxyName} \
            --url-map=${urlMapName} \
            --global`);

        // Create forwarding rule with EXTERNAL_MANAGED scheme
        console.log(`Creating Forwarding Rule: ${forwardingRuleName}...`);
        await this.executeCommand(`gcloud compute forwarding-rules create ${forwardingRuleName} \
            --load-balancing-scheme=EXTERNAL_MANAGED \
            --network-tier=PREMIUM \
            --address=${ipAddressName} \
            --target-http-proxy=${targetProxyName} \
            --global \
            --ports=80`);

        console.log(`New load balancer created successfully with IP: ${ipAddress.trim()}`);
    }

    console.log('Load balancer setup completed successfully.');
  }

  private createVolumeMounts(secrets: Array<{ name: string; version: string; mount_path?: string }>): Array<{ name: string; mountPath: string; readOnly: boolean }> {
    return secrets.map((secret) => ({
      name: secret.name,
      mountPath: secret.mount_path || `/secrets/${secret.name}`,
      readOnly: true,
    }));
  }

  private createVolumeMountsFromVolumes(volumes: Array<{ name: string; path: string; type: string }>): Array<{ name: string; mountPath: string; readOnly: boolean }> {
    return volumes.map((volume) => ({
      name: volume.name,
      mountPath: volume.path,
      readOnly: volume.type === 'read-only',
    }));
  }

  private createVolumes(secrets: Array<{ name: string; version: string; mount_path?: string }>, volumes: Array<{ name: string; path: string; type: string; bucket?: string }>): Array<{ name: string; secret?: { secret: string }; gcs?: { bucket: string }; persistentVolumeClaim?: { claimName: string } }> {
    const secretVolumes = secrets.map((secret) => ({
      name: secret.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
      secret: {
        secret: secret.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
      },
    }));

    const volumeDefinitions = volumes.map((volume) => {
      if (volume.bucket) {
        return {
          name: volume.name,
          gcs: {
            bucket: volume.bucket,
          },
        };
      } else {
        return {
          name: volume.name,
          persistentVolumeClaim: {
            claimName: volume.name,
          },
        };
      }
    });

    return [...secretVolumes, ...volumeDefinitions];
  }

  private createTrafficConfiguration(traffic: Array<{ revision: string; percent: number; tag?: string }>): any[] {
    return traffic.map((target) => ({
      revision: target.revision,
      percent: target.percent,
      tag: target.tag,
    }));
  }

  private formatError(error: any): string {
    if (error.code && error.details) {
      return `Error (${error.code}): ${error.details}`;
    }
    if (error.message) {
      return error.message;
    }
    return `Deployment failed: ${JSON.stringify(error)}`;
  }

  async getRevisions(config: CloudRunConfig): Promise<string[]> {
    const projectId = config.project_id;
    const region = config.region;
    const serviceName = config.service.name;
    const request = {
      parent: `projects/${projectId}/locations/${region}/services/${serviceName}`,
    };

    try {
      const [revisions] = await this.revisionsClient.listRevisions(request);
      //@ts-ignore
      return revisions.map((revision) => revision.name);
    } catch (error: unknown) {
      console.error("Error fetching service revisions:", error);
      throw error;
    }
  }

  async rollback(config: CloudRunConfig, revision: string) {
    const projectId = config.project_id;
    const region = config.region;
    const serviceName = config.service.name;

    try {
      const response = await this.client.updateService({
        service: {
          name: `projects/${projectId}/locations/${region}/services/${serviceName}`,
          traffic: [
            {
              revision: revision,
              percent: 100,
            },
          ],
        },
      });

      console.log(`Service ${serviceName} rolled back to revision ${revision}:`, response);
    } catch (error: unknown) {
      console.error("Error during rollback:", error);
      throw error;
    }
  }

  async getStatus(config: CloudRunConfig) {
    const projectId = config.project_id;
    const region = config.region;
    const serviceName = config.service.name;

    try {
      const [response] = await this.client.getService({
        name: `projects/${projectId}/locations/${region}/services/${serviceName}`,
      });
      console.log(`Status of service ${serviceName}:`, response);
      return response;
    } catch (error: unknown) {
      console.error("Error fetching service status:", error);
      throw error;
    }
  }

  async destroy(config: CloudRunConfig) {
    const projectId = config.project_id;
    const serviceName = config.service.name;
    const region = config.region;
    const negName = `${serviceName}-neg`;
    const backendServiceName = config.load_balancer?.backend_service?.name || `${serviceName}-backend-service`;

    try {
        // First delete the Cloud Run service
        console.log(`Deleting Cloud Run service ${serviceName}...`);
        await this.client.deleteService({
            name: `projects/${projectId}/locations/${region}/services/${serviceName}`,
        });
        console.log(`Service ${serviceName} deleted successfully.`);

        // If load balancer was configured, clean up those resources
        if (config.load_balancer) {
            console.log('Cleaning up load balancer resources...');

            // If this is a new load balancer (not existing), clean up all components
            if (!config.load_balancer.backend_service?.existing) {
                const urlMapName = `${serviceName}-url-map`;
                const targetProxyName = `${serviceName}-target-proxy`;
                const forwardingRuleName = `${serviceName}-forwarding-rule`;
                const ipAddressName = `${serviceName}-ip`;

                try {
                    // Delete forwarding rule first
                    console.log(`Deleting forwarding rule ${forwardingRuleName}...`);
                    await this.executeCommand(`gcloud compute forwarding-rules delete ${forwardingRuleName} \
                        --global \
                        --quiet`);
                } catch (error) {
                    console.warn('Warning: Could not delete forwarding rule:', error);
                }

                try {
                    // Delete target proxy
                    console.log(`Deleting target proxy ${targetProxyName}...`);
                    await this.executeCommand(`gcloud compute target-http-proxies delete ${targetProxyName} \
                        --global \
                        --quiet`);
                } catch (error) {
                    console.warn('Warning: Could not delete target proxy:', error);
                }

                try {
                    // Delete URL map
                    console.log(`Deleting URL map ${urlMapName}...`);
                    await this.executeCommand(`gcloud compute url-maps delete ${urlMapName} \
                        --global \
                        --quiet`);
                } catch (error) {
                    console.warn('Warning: Could not delete URL map:', error);
                }

                try {
                    // Delete static IP address
                    console.log(`Deleting static IP address ${ipAddressName}...`);
                    await this.executeCommand(`gcloud compute addresses delete ${ipAddressName} \
                        --global \
                        --quiet`);
                } catch (error) {
                    console.warn('Warning: Could not delete static IP address:', error);
                }
            }

            // Remove the NEG from backend service
            try {
                console.log(`Removing NEG ${negName} from backend service...`);
                await this.executeCommand(`gcloud compute backend-services remove-backend ${backendServiceName} \
                    --global \
                    --network-endpoint-group=${negName} \
                    --network-endpoint-group-region=${region}`);
            } catch (error) {
                console.warn('Warning: Could not remove NEG from backend service:', error);
            }

            // Delete the NEG
            try {
                console.log(`Deleting NEG ${negName}...`);
                await this.executeCommand(`gcloud compute network-endpoint-groups delete ${negName} \
                    --region=${region} \
                    --quiet`);
            } catch (error) {
                console.warn('Warning: Could not delete NEG:', error);
            }

            // Finally delete the backend service
            if (!config.load_balancer.backend_service?.existing) {
                try {
                    console.log(`Deleting backend service ${backendServiceName}...`);
                    await this.executeCommand(`gcloud compute backend-services delete ${backendServiceName} \
                        --global \
                        --quiet`);
                } catch (error) {
                    console.warn('Warning: Could not delete backend service:', error);
                }
            }
        }

        console.log('All resources cleaned up successfully.');
    } catch (error) {
        console.error("Error during cleanup:", error);
        throw error;
    }
  }

  private executeCommand(command: string) {
    return new Promise((resolve, reject) => {
      exec(command, (error: any, stdout: string, stderr: string) => {
        if (error) {
          console.error(`Error executing command: ${command}`, error);
          return reject(error);
        }
        console.log(`Command output: ${stdout}`);
        resolve(stdout);
      });
    });
  }
}
