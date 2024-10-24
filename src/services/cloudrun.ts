import { ServicesClient } from "@google-cloud/run";
import { CloudRunConfig } from "../config/parser";
import { env, exit } from "process";

export class CloudRunService {
  private client: ServicesClient;

  constructor() {
    this.client = new ServicesClient();
  }

  async deploy(config: CloudRunConfig) {
    const serviceName = config.service.name;
    const projectId = config.project_id;
    const region = config.region;

    // Validate the service name
    if (!/^[a-z][a-z0-9-]{0,48}[a-z0-9]$/.test(serviceName)) {
      throw new Error(
        `Invalid service name: "${serviceName}". It must start with a letter, end with a letter or digit, and can only contain lowercase letters, digits, and hyphens.`,
      );
    }

    // Validate container configuration
    if (
      !config.container ||
      !config.container.image ||
      !config.container.port
    ) {
      throw new Error(
        "Container configuration is invalid. Ensure that the image and port are specified.",
      );
    }

    // Ensure that the env_vars is defined and is an array
    const envVars = Array.isArray(config.container.env_vars)
      ? config.container.env_vars
      : [];
    const t = envVars.length > 0 && {
      env: envVars.map((envVar) => ({
        name: envVar.name,
        value: envVar.value,
      })),
    };
    console.log(t);
    // process.exit(0)

    // Construct the service object
    const service = {
      template: {
        containers: [
          {
            image: config.container.image,
            ports: [{ containerPort: config.container.port }],
            ...(envVars.length > 0 && {
              env: envVars.map((envVar) => ({
                name: envVar.name,
                value: envVar.value,
              })),
            }),
          },
        ],
        service_account: config.service.service_account,
      },
      // traffic: config.traffic
      invoker_iam_disabled: true,
    };

    // Log the service object before creating
    console.log("Service object:", service);

    try {
      // Initiate the service creation
      const response = await this.client.createService({
        parent: `projects/${projectId}/locations/${region}`,
        serviceId: serviceName, // Set the serviceId here
        service, // Pass the service object
      });
      console.log(`Service ${serviceName} creation initiated:`);

      // Polling logic to wait for service creation
      let serviceDetails: any;
      let status = "UNKNOWN";
      const maxRetries = 10; // Max number of polling attempts
      const retryDelay = 5000; // 5 seconds delay between retries

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Fetch the service details
          [serviceDetails] = await this.client.getService({
            name: `projects/${projectId}/locations/${region}/services/${serviceName}`,
          });
          console.log("ServiceDetails: ", serviceDetails);
          status = serviceDetails.status.conditions?.[0]?.state || "UNKNOWN";

          // Check if the service is ready
          if (status === "ACTIVE") {
            console.log("Service is active and ready.");
            break; // Exit the loop if the service is ready
          } else {
            console.log(
              `Service status: ${status}. Waiting for service to become active...`,
            );
          }
        } catch (fetchError) {
          console.error(
            `Error fetching service details: ${fetchError.message}`,
          );
        }

        // Wait for the retry delay before the next attempt
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }

      if (status !== "ACTIVE") {
        throw new Error(
          `Service ${serviceName} did not become active after ${maxRetries} retries.`,
        );
      }

      // If the service is ready, print the URL
      console.log("Service URL: ", serviceDetails.uri);
    } catch (error) {
      console.error("Error deploying service:", error);
      throw error;
    }
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
