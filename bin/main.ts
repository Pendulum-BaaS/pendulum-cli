#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { SecurityStack } from "../lib/security-stack";
import { ApplicationStack } from "../lib/application-stack";
import { UserFrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();

const generateRandomVPCPrefix = () => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomStr = "";

  for (let i = 0; i < 10; i++) {
    const randIdx = Math.floor(Math.random() * charset.length);
    randomStr += charset[randIdx];
  }

  return randomStr;
};

const projectName = process.env.PROJECT_NAME || generateRandomVPCPrefix();

const environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

const networkStack = new NetworkStack(app, "Pendulum-NetworkStack", {
  projectName,
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

const applicationStack = new ApplicationStack(
  app,
  "Pendulum-ApplicationStack",
  {
    vpc: networkStack.vpc,
    ecsSecurityGroup: securityStack.ecsSecurityGroup,
    albSecurityGroup: securityStack.albSecurityGroup,
    databaseEndpoint: databaseStack.clusterEndpoint,
    databaseSecret: databaseStack.secret,
    containerEnvironment: {
      DB_NAME: "pendulum",
      PORT: "3000",
    },
    jwtSecret: securityStack.jwtSecret,
    adminApiKey: securityStack.adminApiKey,
    env: environment,
  },
);

const frontendStack = new UserFrontendStack(app, "Pendulum-FrontendStack", {
  projectName: process.env.PROJECT_NAME || "pendulum-user-app",
  frontendBuildPath: process.env.FRONTEND_BUILD_PATH || "./dist",
  apiEndpoint: `http://${applicationStack.loadBalancer.loadBalancerDnsName}`,
  env: environment,
});

securityStack.addDependency(networkStack);
databaseStack.addDependency(securityStack);
applicationStack.addDependency(databaseStack);
frontendStack.addDependency(applicationStack);
