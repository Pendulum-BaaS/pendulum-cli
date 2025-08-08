#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { DatabaseStack } from "../lib/database-stack";
import { SecurityStack } from "../lib/security-stack";
import { ApplicationStack } from "../lib/application-stack";
import { UserFrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();

const environment = {
  account: app.node.tryGetContext("accountId"),
  region: app.node.tryGetContext("region") || "us-east-1",
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
  containerEnvironment: { DB_NAME: "pendulumdb", PORT: "3000" },
  containerRegistryURI: "public.ecr.aws/m1y9r7r1/pendulum-ctr-repo", // need to make official ECR repo
  appImageTag: "app-latest",
  eventsImageTag: "events-latest",
  jwtSecret: securityStack.jwtSecret,
  adminApiKey: securityStack.adminApiKey,
  env: environment,
});

const frontendStack = new UserFrontendStack(app, "Pendulum-FrontendStack", {
  projectName: app.node.tryGetContext("projectName") || "pendulum-user-app",
  frontendBuildPath: app.node.tryGetContext("frontendBuildPath") || "./dist",
  apiEndpoint: `http://${applicationStack.loadBalancer.loadBalancerDnsName}`,
  env: environment,
});

securityStack.addDependency(networkStack);
databaseStack.addDependency(securityStack);
applicationStack.addDependency(databaseStack);
frontendStack.addDependency(applicationStack);
