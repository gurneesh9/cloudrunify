import { SecretManagerServiceClient } from "npm:@google-cloud/secret-manager";
import inquirer from "npm:inquirer";
import { GoogleAuth } from "npm:google-auth-library";
import * as fs from "node:fs";
import * as process from "node:process"
import { Buffer } from "node:buffer"

export class SecretsManagerService {
  private client: SecretManagerServiceClient;

  constructor(projectId: string, credentialsPath?: string) {
    let credentials;
    try {
      if (credentialsPath === "json") {
        const jsonCreds = process.env.GOOGLE_CREDENTIALS;
        if (!jsonCreds) {
          throw new Error("GOOGLE_CREDENTIALS environment variable not found");
        }
        credentials = JSON.parse(jsonCreds);
      } else if (credentialsPath) {
        const keyFileContent = fs.readFileSync(credentialsPath, "utf-8");
        credentials = JSON.parse(keyFileContent);
      }

      const auth = new GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      this.client = new SecretManagerServiceClient({ auth });
    } catch (error) {
      console.error("Error initializing authentication:", error);
      throw error;
    }
  }

  async deleteSecret(projectId: string, secretName: string, region: string): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmDelete",
        message: `Are you sure you want to delete secret ${secretName}?`,
        default: false,
      },
    ]);

    if (!answers.confirmDelete) {
      console.log("Secret deletion cancelled.");
      return;
    }

    try {
      await this.client.deleteSecret({
        name: `projects/${projectId}/secrets/${secretName}`,
      });
      console.log(`Secret ${secretName} deleted successfully.`);
    } catch (error) {
      console.error("Error deleting secret:", error);
      throw error;
    }
  }

  async listSecrets(projectId: string): Promise<void> {
    try {
      const [secrets] = await this.client.listSecrets({
        parent: `projects/${projectId}`,
      });
      console.log("Secrets:");
      secrets.forEach((secret) => console.log(`- ${secret.name}`));
    } catch (error) {
      console.error("Error listing secrets:", error);
      throw error;
    }
  }

  async createSecret(projectId: string, secretName: string, region: string): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: "password",
        name: "secretValue",
        message: `Enter the value for secret ${secretName}:`,
        mask: "*",
        validate: (input) => {
          if (input.trim() === "") {
            return "Secret value cannot be empty.";
          }
          return true;
        },
      },
    ]);

    const secret = {
      parent: `projects/${projectId}`,
      secretId: secretName,
      secret: {
        replication: {
          userManaged: {
            replicas: [{ location: region }],
          },
        },
      }
    };

    try {
      const [createResponse] = await this.client.createSecret(secret);
      console.log("Secret created:", createResponse);

      const addSecretPayload = {
        parent: createResponse.name,
        payload: {
          data: Buffer.from(answers.secretValue).toString("base64"),
        },
      };

      const [addResponse] = await this.client.addSecretVersion(addSecretPayload);
      console.log("Secret version added:", addResponse);
      console.log(`Secret ${secretName} created successfully.`);
    } catch (error) {
      console.error("Error creating secret:", error);
      throw error;
    }
  }
}
