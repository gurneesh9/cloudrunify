Made with ❤️ using TypeScript and Deno by [Gurneesh](https://github.com/gurneesh9)
# Vision: CloudRunify - Declarative Deployment Tool for Google Cloud Run

## 1. Problem Statement

Developers using Google Cloud Run lack a streamlined, declarative deployment tool similar to Wrangler for Cloudflare Workers. This gap results in complex deployment processes, increased potential for configuration errors, and reduced developer productivity.

## 2. Solution Overview

Create a comprehensive, user-friendly tool that enables declarative deployments for Google Cloud Run, simplifying the process and improving developer experience.

## 3. Key Objectives

1. Simplify Cloud Run deployments
2. Provide a declarative configuration approach
3. Enhance version control for service configurations
4. Enable easy management of multiple environments
5. Improve CI/CD integration for Cloud Run services

## 4. Core Features

### 4.1 Declarative Configuration

- Use a single YAML file (`cloudrun.yaml`) to define entire service configuration
- Support multiple environment definitions within one file

### 4.2 CLI Interface

- Develop an intuitive command-line interface for deployments and management
- Implement commands like `deploy`, `rollback`, and `status`

### 4.3 Version Management

- Enable uploading and managing different versions of services
- Provide easy rollback functionality

### 4.4 Traffic Management

- Support gradual rollouts and traffic splitting between versions
- Allow percentage-based traffic allocation

### 4.5 Environment Management

- Facilitate easy switching between development, staging, and production environments
- Support environment-specific configurations

## 5. Additional Features

### 5.1 Secrets Management

- Integrate with Google Secret Manager for secure handling of sensitive data

### 5.2 Custom Domain Management

- Allow declarative configuration of custom domain mappings

### 5.3 Monitoring and Alerting

- Enable setting up Cloud Monitoring alerts and dashboards via configuration

### 5.4 CI/CD Integration

- Provide plugins or actions for popular CI/CD platforms (e.g., GitHub Actions, GitLab CI)

## 6. User Experience

- Design an intuitive, developer-friendly interface
- Prioritize clear, helpful error messages and logs
- Develop comprehensive documentation and examples

## 7. Technical Architecture

- Implement the tool using a modern, maintainable programming language (e.g., TypeScript with Deno)
- Utilize Google Cloud APIs for interacting with Cloud Run and related services
- Design a modular architecture to allow for future expansions

## 8. Adoption Strategy

1. Open-source the tool to encourage community contributions and adoption
2. Create tutorials and blog posts to showcase the tool's capabilities
3. Engage with the Google Cloud community to gather feedback and iterate on features
4. Explore potential integration or partnership opportunities with Google Cloud

## 9. Success Metrics

- Number of active users and deployments
- Reduction in deployment time and errors for Cloud Run services
- Community engagement (GitHub stars, forks, contributions)
- User satisfaction and feedback

## 10. Roadmap

### Phase 1: MVP (3 months)
- Implement core declarative configuration and deployment features
- Develop basic CLI interface
- Release initial version and gather early adopter feedback

### Phase 2: Enhancement (3 months)
- Add version management and traffic splitting features
- Implement secrets management integration
- Improve CI/CD integration capabilities

### Phase 3: Advanced Features (6 months)
- Develop custom domain management
- Implement monitoring and alerting configuration
- Enhance user experience based on community feedback

### Phase 4: Ecosystem Growth (Ongoing)
- Continuously improve and expand features based on user needs
- Foster community contributions and plugins
- Explore advanced use cases and integrations

## 11. Conclusion

CloudRunify aims to significantly improve the developer experience, streamline deployments, and bring the simplicity of tools like Wrangler to the Cloud Run ecosystem. By focusing on user needs and leveraging the power of declarative configurations, we can create a valuable asset for the Google Cloud community.

---
# Example Usage Github Actions

* Save service account secret in GOOGLE_CREDENTIALS

name: CloudRunify Deployment

on:
  push:
    branches:
      - main  # Change to the branch you want to trigger the deployment

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GOOGLE_CREDENTIALS }}

      - name: Set Google Cloud Project
        run: |
          gcloud config set project scrape-429402
          curl -L -o cloudrunify.cjs "https://github.com/gurneesh9/cloudrunify/releases/download/v0.0.1/cloudrunify.cjs"
          node cloudrunify.cjs deploy

<img width="1111" alt="Screenshot 2024-10-26 at 11 20 20 PM" src="https://github.com/user-attachments/assets/11eeee41-5ca7-42ef-a3a1-1db550a6ae52">


# Example usage local
* Download cloudrunify.cjs
* cp cloudrunify.cjs /usr/local/bin/cloudrunify
* cloudrunify init / package / deploy

* Eample YAML for simple service deployment
<img width="1002" alt="Screenshot 2024-10-26 at 11 31 40 PM" src="https://github.com/user-attachments/assets/254a8d6c-dec2-4321-8838-91997d74086a">

### Secret Management

CloudRunify provides commands to manage secrets in Google Cloud Secret Manager.  These secrets can then be used in your Cloud Run deployments.

#### Create Secret

```bash
cloudrunify secret create -p [PROJECT_ID] -n [SECRET_NAME] -r [REGION] -k [KEY_FILE_PATH]
```

This command creates a new secret in Google Cloud Secret Manager.  It prompts you for the secret value.

*   `-p, --project <projectId>`: Google Cloud Project ID (required)
*   `-n, --name <secretName>`: Secret Name (required)
*   `-r, --region <region>`: Region (required, defaults to us-central1)
*   `-k, --key <path>`: Path to service account key file or 'json' for GitHub Actions (optional)

#### Delete Secret

```bash
cloudrunify secret delete -p [PROJECT_ID] -n [SECRET_NAME] -r [REGION] -k [KEY_FILE_PATH]
```

This command deletes a secret from Google Cloud Secret Manager. It prompts for confirmation.

*   `-p, --project <projectId>`: Google Cloud Project ID (required)
*   `-n, --name <secretName>`: Secret Name (required)
*   `-r, --region <region>`: Region (required, defaults to us-central1)
*   `-k, --key <path>`: Path to service account key file or 'json' for GitHub Actions (optional)

#### List Secrets

```bash
cloudrunify secret list -p [PROJECT_ID] -k [KEY_FILE_PATH]
```

This command lists all secrets in the specified project.

*   `-p, --project <projectId>`: Google Cloud Project ID (required)
*   `-k, --key <path>`: Path to service account key file or 'json' for GitHub Actions (optional)


### Using Secrets with Cloud Run Deployments

To use secrets in your Cloud Run deployments, add a `secrets` section to your `cloudrun.yaml` file:

```yaml
version: "1.0"
project_id: "your-project-id"
region: "us-central1"
service:
  name: "your-service-name"
  allow_unauthenticated: false
container:
  image: "your-image-name"
  port: 8080
  env_vars:
    - name: MY_SECRET_ENV
      value: "$(MY_SECRET)"
  resources:
    cpu: "1"
    memory: "256Mi"
  scaling:
    min_instances: 1
    max_instances: 2
    concurrency: 100
secrets:
  - name: MY_SECRET
    version: "1"
    mount_path: "/secrets/my-secret"
traffic:
  - tag: "latest"
    percent: 100
```

Remember to create the secret using the `secret create` command before deploying.  The `value` field in `env_vars` uses the syntax `$(SECRET_NAME)` to reference the secret.


## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
