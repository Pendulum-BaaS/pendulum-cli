# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

# Pendulum CLI

This is a command-line interface for managing Pendulum BaaS projects.

## Useful Commands

`pendulum init`

Initialize a new Pendulum project in the current directory.
This command will:

- Clone the Pendulum backend code to a `pendulum` directory
- Install backend dependencies
- Create a root `package.json` with Pendulum scripts

`pendulum dev`

Start the Pendulum backend in development mode using Docker Compose.
This command will:

- Build and start the Pendulum backend containers
- Make the API available at `http://localhost:3000`
- Make the events service available at `http://localhost:8080/events`

`pendulum deploy`

Deploy the Pendulum backend to AWS using CDK.
This command will:

- Prompt for AWS account ID and region
- Validate AWS credentials
- Bootstrap the CDK environment if needed
- Deploy the Pendulum infrastructure to AWS
- Provide deployment details and next steps

## Prerequisites

## For `pendulum init` and `pendulum dev`:

- Node.js (v18 or later)
- Docker and Docker Compose
- Git

## For `pendulum deploy`:

- All of the above, plus:
- AWS CLI configured with appropriate credentials (`aws configure`)
- Sufficient AWS permissions for CDK deployment
- Docker (required for CDK asset building)

## Usage

```bash
# Initialize a new project
pendulum init

# Start development server
pendulum dev

# Deploy to AWS
pendulum deploy
```

## AWS Deployment
The `pendulum deploy` command uses AWS CDK to provision:

- ECS Fargate cluster for containerized services
- Application Load Balancer for traffic distribution
- DocumentDB cluster for data persistence
- VPC with public/private subnets
- Security groups and IAM roles
- ECR repositories for container images

Make sure you have the necessary AWS permissions for these services before deploying.
