import { GoogleAuth } from "google-auth-library";

import { ServicesClient } from "@google-cloud/run";
import { CloudRunConfig } from "../config/parser";
import { env, exit } from "process";
import ora from "ora";

import * as fs from "fs";

export class CloudRunService {
  private client: ServicesClient;
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
      } catch (error) {
        console.error("Error initializing authentication:", error);
        throw error;
      }
    } else {
      this.client = new ServicesClient();
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
          },
        ],
        ...(config.container.scaling && {
          scaling: {
            min_instances_count: config.container.scaling.min_instances,
            max_instances_count: config.container.scaling.max_instances,
          },
        }),
        ...(config.service.service_account && {
          service_account: config.service.service_account,
        }),
      },
      // traffic: config.traffic
      // template_annotations: {
      //   "autoscaling.knative.dev/minScale": `${config.container.scaling.min_instances}`,
      //   "autoscaling.knative.dev/maxScale": `${config.container.scaling.max_instances}`,
      //   "run.googleapis.com/cpu-throttling": "false",
      //   "run.googleapis.com/containerConcurrency": `${config.container.scaling.concurrency}`,
      // },
    };

    // Log the service object before creating
    // console.log("Service object:", service);

    try {
      // Initiate the service creation
      const response = this.client.createService({
        parent: `projects/${projectId}/locations/${region}`,
        serviceId: serviceName, // Set the serviceId here
        service,
      });
      console.log(`Service ${serviceName} creation initiated:`);

      // Add initial delay to allow service creation to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Polling logic to wait for service creation
      let serviceDetails: any;
      let status = "UNKNOWN";

      const POLLING_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds
      const POLLING_INTERVAL = 5000; // 5 seconds

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
          // Handle gRPC errors more gracefully
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

      // If the service is ready, print the URL
      console.log("Service URL: ", serviceDetails.uri);
    } catch (error) {
      console.error("Error deploying service:", error);
      throw error;
    }
  }

  private formatError(error: any): string {
    // If we have a structured error with code and details
    if (error.code && error.details) {
      return `Error (${error.code}): ${error.details}`;
    }
    // If we have a message
    if (error.message) {
      return error.message;
    }
    // Fallback for unknown error formats
    return `Deployment failed: ${JSON.stringify(error)}`;
  }

  // TODO: Will add rollback later
  // async rollback(serviceName: string, version: string) {
  //   const projectId = 'your-project-id'; // Replace with your project ID
  //   const region = 'your-region'; // Replace with your region

  //   try {
  //     const response = await this.client.updateService({
  //       service: {
  //         // Cloud Run service object to be updated
  //         name: serviceName,
  //         traffic: [
  //           {
  //             revision: version, // Specify the revision to roll back to
  //             percent: 100,      // Set traffic to this revision
  //           },
  //         ],
  //       },
  //       // Instead of name, use the parent property
  //       // Here’s the correct way to reference the service
  //       // The name is actually constructed in the `parent` field
  //       // Make sure the service is correctly referenced
  //       // 'service' should not have a name property; use `name` as the parent parameter
  //       // e.g., projects/{project}/locations/{location}/services/{service}
  //       name: `projects/${projectId}/locations/${region}/services/${serviceName}`,
  //     });

  //     console.log(`Service ${serviceName} rolled back to version ${version}:`, response);
  //   } catch (error) {
  //     console.error('Error during rollback:', error);
  //     throw error;
  //   }
  // }

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
