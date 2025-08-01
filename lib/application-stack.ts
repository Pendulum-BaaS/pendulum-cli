import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsManager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { effect } from "zod";

interface ApplicationStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
  albSecurityGroup: ec2.SecurityGroup;
  databaseEndpoint: string;
  databaseSecret: secretsManager.Secret;
  containerEnvironment: Record<string, string>;
  containerRegistryURI: string;
  appImageTag: string;
  eventsImageTag: string;
  jwtSecret: secretsManager.Secret;
  adminApiKey: secretsManager.Secret;
}

export class ApplicationStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly appService: ecs.FargateService;
  public readonly eventsService: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    this.cluster = new ecs.Cluster(this, "PendulumCoreCluster", {
      vpc: props.vpc,
    });

    // create app task definition to attach container to
    const appTaskDef = new ecs.FargateTaskDefinition(this, "AppTaskDef", {
      memoryLimitMiB: 512, // default
      cpu: 256, // default
    });

    // Grant the task permission to read from Secrets Manager
    appTaskDef.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsManager:GetSecretValue"],
      resources: [
        props.databaseSecret.secretArn,
        props.jwtSecret.secretArn,
        props.adminApiKey.secretArn,
      ],
    }));

    // Add ECR permissions to task execution role
    appTaskDef.addToExecutionRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability", 
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      resources: ["*"]
    }));

    // add app container
    const appContainer = appTaskDef.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromRegistry(
        `${props.containerRegistryURI}:${props.appImageTag}`
      ),
      environment: {
        ...props.containerEnvironment,
        DATABASE_ENDPOINT: props.databaseEndpoint,
        SERVICE_TYPE: "app",
        EVENTS_SERVICE_URL: "http://events:8080",
        PORT: "3000",
        NODE_ENV: "production", 
        DB_NAME: "pendulum-test",
      },
      secrets: {
        DB_USER: ecs.Secret.fromSecretsManager(
          props.databaseSecret,
          "username"
        ),
        DB_PW: ecs.Secret.fromSecretsManager(
          props.databaseSecret,
          "password"
        ),
        JWT_SECRET: ecs.Secret.fromSecretsManager(
          props.jwtSecret,
          "jwt-secret"
        ),
        ADMIN_API_KEY: ecs.Secret.fromSecretsManager(
          props.adminApiKey,
          "admin-key"
        ),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "app-container",
      }),
    });

    appContainer.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    const eventsTaskDef = new ecs.FargateTaskDefinition(this, "EventsTaskDef", {
      memoryLimitMiB: 512, // default
      cpu: 256, // default
    });

    eventsTaskDef.addToExecutionRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer", 
        "ecr:BatchGetImage"
      ],
      resources: ["*"]
    }));

    // add events container
    const eventsContainer = eventsTaskDef.addContainer("EventsContainer", {
      image: ecs.ContainerImage.fromRegistry(
        `${props.containerRegistryURI}:${props.eventsImageTag}`
      ),
      environment: {
        ...props.containerEnvironment,
        SERVICE_TYPE: "events",
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "events-container",
      }),
    });

    eventsContainer.addPortMappings({
      containerPort: 8080,
      protocol: ecs.Protocol.TCP,
    });

    // create app fargate service
    this.appService = new ecs.FargateService(this, "AppService", {
      cluster: this.cluster,
      taskDefinition: appTaskDef,
      desiredCount: 1, // default
      securityGroups: [props.ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      serviceName: "app",
    });

    // create events fargate service
    this.eventsService = new ecs.FargateService(this, "EventsService", {
      cluster: this.cluster,
      taskDefinition: eventsTaskDef,
      desiredCount: 1, // default
      securityGroups: [props.ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      serviceName: "events",
    });

    // create ALB
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    // create target group for ALB to send traffic to
    const targetGroup = new elbv2.ApplicationTargetGroup(this, "TargetGroup", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
      },
    });

    // add targets to target group
    this.appService.attachToApplicationTargetGroup(targetGroup);

    // create Listener for load balancer to send traffic to target group
    this.loadBalancer.addListener("Listened", {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    // Output the Load Balancer URL
    new cdk.CfnOutput(this, 'LoadBalancerURL', {
      value: `http://${this.loadBalancer.loadBalancerDnsName}`,
      description: 'URL of the Application Load Balancer'
    });
  }
}
