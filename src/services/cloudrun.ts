import { GoogleAuth } from "google-auth-library";

import { ServicesClient, RevisionsClient } from "@google-cloud/run";
import { CloudRunConfig } from "../config/parser";
import { env, exit } from "process";
import ora from "ora";

import * as fs from "fs";

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
      } catch (error) {
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
    } catch (error) {
      console.error("Error setting IAM policy:", error);
      throw error;
    }
  }

  private validateResourceConfig(config: CloudRunConfig) {
    // Validate CPU format
    const cpuPattern = /^(\d+(\.\d+)?|(\d+m))$/;
    if (config.container.resources && !cpuPattern.test(config.container.resources.cpu)) {
      throw new Error(
        'Invalid CPU format. Must be a number or a millicpu value (e.g., "1" or "1000m")',
      );
    }

    // Validate memory format
    const memoryPattern = /^\d+[KMGTPEZYkmgtpezy]i?[Bb]?$/;
    if (config.container.resources && !memoryPattern.test(config.container.resources.memory)) {
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
      config.container.scaling.max_instances < config.container.scaling.min_instances
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

    // Ensure that the env_vars is defined and is an array
    const envVars = Array.isArray(config.container.env_vars) ? config.container.env_vars : [];
    const secrets = config.secrets || [];

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
        volumes: this.createVolumes(secrets),
      },
    };

    try {
      const response = await this.client.createService({
        parent: `projects/${projectId}/locations/${region}`,
        serviceId: serviceName,
        service,
      });
      console.log(`Service ${serviceName} creation initiated:`);

      await new Promise((resolve) => setTimeout(resolve, 2000));

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
          throw new Error(
            `Service ${serviceName} deployment timed out after ${POLLING_TIMEOUT / 1000} seconds`,
          );
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
        } catch (error) {
          if (error.code) {
            spinner.fail("Deployment failed");
            const errorMessage = this.formatError(error);
            throw new Error(errorMessage);
          }
          spinner.fail(`Error fetching service details: ${error.message}`);
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      }

      if (config.service.allow_unauthenticated) {
        await this.allowUnauthenticated(servicePath);
      }

      console.log("Service URL: ", serviceDetails.uri);
    } catch (error) {
      console.error("Error deploying service:", error);
      throw error;
    }
  }

  private createVolumeMounts(secrets: Array<{ name: string; version: string; mount_path?: string }>): any[] {
    return secrets.map((secret) => ({
      name: secret.name,
      mountPath: secret.mount_path || `/secrets/${secret.name}`,
      readOnly: true,
    }));
  }

  private createVolumes(secrets: Array<{ name: string; version: string; mount_path?: string }>): any[] {
    return secrets.map((secret) => ({
      name: secret.name.replace(/[^a-zA-Z0-9_-]/g, "_"), //sanitize secret name
      secret: {
        secret: secret.name.replace(/[^a-zA-Z0-9_-]/g, "_"), //sanitize secret name
      },
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
      return revisions.map((revision) => revision.name);
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error("Error fetching service status:", error);
      throw error;
    }
  }

  async destroy(config: CloudRunConfig) {
    const projectId = config.project_id;
    const serviceName = config.service.name;
    const region = config.region;

    try {
      await this.client.deleteService({
        name: `projects/${projectId}/locations/${region}/services/${serviceName}`,
      });
      console.log(`Service ${serviceName} deleted successfully.`);
    } catch (error) {
      console.error("Error deleting service:", error);
      throw error;
    }
  }
}
