# Pendulum CLI
Command-line interface for managing Pendulum BaaS projects - from local development to AWS production deployment.

## Overview
The Pendulum CLI provides a complete development and deployment workflow:

- Local Development - Docker Compose orchestration with hot reload
- AWS Deployment - Infrastructure-as-Code using AWS CDK
- Project Management - Initialize, build, and destroy Pendulum projects

## Installation
Install globally via npm:
```bash
npm install -g @pendulum-baas/cli
```

Or use directly with npx:
```bash
npx @pendulum-baas/cli <command>
```

## Commands
`pendulum init`
Initialize a new Pendulum project in the current directory.
```bash
npx pendulum init
```

This will:

- Install @pendulum-baas/core and @pendulum-baas/sdk
- Add npm scripts for backend management
- Set up project structure

`pendulum dev`
Start the Pendulum backend for local development.
```bash
npx pendulum dev
```

Starts:

- MongoDB container
- App service (port 3000)
- Events service (port 8080)
- Admin dashboard at http://localhost:3000/admin

`pendulum deploy`
Deploy your application to AWS using CDK.
```bash
npx pendulum deploy
```

Interactive prompts for:

- AWS account ID and region
- Project name
- Frontend build path
- Deployment confirmation

Creates:

- ECS Fargate cluster
- DocumentDB database
- Application Load Balancer
- CloudFront distribution
- VPC with security groups

`pendulum destroy`
Remove all AWS infrastructure and resources.
```bash
npx pendulum destroy
```

Warning: This permanently deletes all data and infrastructure.

# Prerequisites
## For Local Development

- Node.js 18+
- Docker and Docker Compose
- npm or yarn

# For AWS Deployment

- AWS CLI configured (`aws configure`)
- Docker (for container building)
- Valid AWS credentials with appropriate permissions

# AWS Permissions Required
Your AWS user/role needs permissions for:

- CloudFormation (full access)
- ECS (full access)
- DocumentDB (full access)
- VPC/EC2 (networking)
- IAM (role creation)
- S3 (CDK assets)
- Secrets Manager (credentials)

## Project Structure
After running `pendulum init`:
your-project/
├── package.json                # Updated with Pendulum scripts
├── node_modules/
│   ├── @pendulum-baas/core/    # Backend services
│   └── @pendulum-baas/sdk/     # Client library
└── .env                        # Optional environment config

# Environment Variables
## Local Development (.env in your project root directory)
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=your_app_name
JWT_SECRET=your_secret_key
PORT=3000
NODE_ENV=development
```

## AWS Deployment
Environment variables are automatically managed via:

- AWS Secrets Manager (database credentials, JWT secrets)
- ECS task definitions (service configuration)
- CDK stack parameters (infrastructure settings)

## Management Scripts
Added to your package.json by pendulum init:
```json
{
  "scripts": {
    "pendulum-backend:start": "cd node_modules/@pendulum-baas/core && docker compose start",
    "pendulum-backend:stop": "cd node_modules/@pendulum-baas/core && docker compose stop"
  }
}
```

## AWS Infrastructure
The CLI deploys a complete stack:
┌─────────────────┐    ┌─────────────────┐
│   CloudFront    │    │       ALB       │
│  (Frontend CDN) │    │ (Load Balancer) │
└─────────────────┘    └─────────────────┘
                                │
                        ┌─────────────────┐
                        │   ECS Cluster   │
                        │ ┌─────┐ ┌─────┐ │
                        │ │ App │ │Event│ │
                        │ └─────┘ └─────┘ │
                        └─────────────────┘
                                │
                        ┌─────────────────┐
                        │   DocumentDB    │
                        │    Cluster      │
                        └─────────────────┘

## Output Information
After successful deployment, you'll receive:

- Frontend URL - CloudFront distribution
- API Endpoint - Load balancer DNS
- Admin Dashboard - Management interface
- Admin API Key - Dashboard access credentials

# Troubleshooting
## Common Issues
Docker not running:
```bash
# Start Docker service
sudo systemctl start docker  # Linux
# Or start Docker Desktop on macOS/Windows
```

AWS credentials not configured:
```bash
aws configure
# Enter your Access Key ID, Secret, region, and output format
```

Build directory not found:

- Ensure your frontend is built (`npm run build`)
- Verify the build path contains `index.html`

## Dependencies

- AWS CDK - Infrastructure as Code
- AWS CLI - AWS resource management
- Docker - Container orchestration
- Inquirer - Interactive prompts
- Chalk - Terminal colors
- Ora - Loading spinners

# Examples
## Complete Workflow
```bash
# Initialize project
mkdir my-app && cd my-app
npx pendulum init

# Start development
npx pendulum dev

# Deploy to production
npx pendulum deploy

# Clean up resources
npx pendulum destroy
```

# Frontend Integration
```typescript
import { PendulumClient } from '@pendulum-baas/sdk';

const client = new PendulumClient({
  apiUrl: process.env.NODE_ENV === 'production' 
    ? 'https://your-deployed-api.com'
    : 'http://localhost:3000'
});
```
