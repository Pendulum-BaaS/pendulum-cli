#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { SecurityStack } from "../lib/security-stack";
import { ApplicationStack } from "../lib/application-stack";
import dotenv from "dotenv";

dotenv.config();

const app = new cdk.App();

const environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.DEFAULT_REGION || "us-east-1",
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
    DB_NAME: process.env.DB_NAME || "test",
    PORT: process.env.PORT || "3000",
  },
  containerRegistryURI: process.env.CONTAINER_URI as string,
  appImageTag: process.env.APP_IMAGE_TAG || "app-latest",
  
  env: environment,
});

securityStack.addDependency(networkStack);
databaseStack.addDependency(securityStack);
applicationStack.addDependency(databaseStack);
