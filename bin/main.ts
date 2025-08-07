#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { SecurityStack } from "../lib/security-stack";
import { ApplicationStack } from "../lib/application-stack";
// import { UserFrontendStack } from "../lib/frontend-stack";
import dotenv from "dotenv";

dotenv.config();

const app = new cdk.App();

const environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

const networkStack = new NetworkStack(app, "Pendulum-NetworkStack", {
  env: environment,
});

const securityStack = new SecurityStack(app, "Pendulum-SecurityStack", {
  vpc: networkStack.vpc,
  env: environment,
});

const databaseStack = new DatabaseStack(app, "Pendulum-DatabaseStack", {
  vpc: networkStack.vpc,
  securityGroup: securityStack.dbSecurityGroup,
  env: environment,
});

const applicationStack = new ApplicationStack(app, "Pendulum-ApplicationStack", {
  vpc: networkStack.vpc,
  ecsSecurityGroup: securityStack.ecsSecurityGroup,
  albSecurityGroup: securityStack.albSecurityGroup,
  databaseEndpoint: databaseStack.clusterEndpoint,
  databaseSecret: databaseStack.secret,
  containerEnvironment: {
    DB_NAME: process.env.DB_NAME || "pendulum",
    PORT: process.env.PORT || "3000",
  },
  containerRegistryURI: process.env.CONTAINER_URI as string,
  appImageTag: process.env.APP_IMAGE_TAG || "app-latest",
  eventsImageTag: process.env.EVENTS_IMAGE_TAG || "events-latest",
  jwtSecret: securityStack.jwtSecret,
  adminApiKey: securityStack.adminApiKey,
  projectName: process.env.PROJECT_NAME || "pendulum-user-app",
  frontendBuildPath: process.env.FRONTEND_BUILD_PATH || "./dist",
  customDomainName: process.env.CUSTOM_DOMAIN_NAME || undefined,
  certificateArn: process.env.CERTIFICATE_ARN || undefined,
  env: environment,
});

// const frontendStack = new UserFrontendStack(app, "Pendulum-FrontendStack", {
//   projectName: process.env.PROJECT_NAME || "pendulum-user-app",
//   frontendBuildPath: process.env.FRONTEND_BUILD_PATH || "./dist",
//   apiEndpoint: process.env.API_ENDPOINT || applicationStack.apiUrl,
//   env: environment,
// });

// frontendStack.addDependency(applicationStack);
securityStack.addDependency(networkStack);
databaseStack.addDependency(securityStack);
applicationStack.addDependency(databaseStack);
