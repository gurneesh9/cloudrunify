import {ServicesClient} from '@google-cloud/run'
import { CloudRunConfig } from '../config/parser';

export class CloudRunService {
  private client: ServicesClient
  
  constructor() {
    this.client = new ServicesClient();
  }

  async deploy(config: CloudRunConfig, env: string) {
    // Implement deployment logic
  }

  async rollback(serviceName: string, version: string) {
    // Implement rollback logic
  }

  async getStatus(serviceName: string) {
    // Implement status check
  }
}
