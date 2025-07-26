import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsManager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import dotenv from "dotenv";

dotenv.config();

interface ApplicationStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
  albSecurityGroup: ec2.SecurityGroup;
  databaseEndpoint: string;
  databaseSecret: secretsManager.Secret;
  containerEnvironment: Record<string, string>;
  containerRegistryURI: string;
}

export class ApplicationStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    this.cluster = new ecs.Cluster(this, "PendulumCoreCluster", {
      vpc: props.vpc,
    });

    // create task definition to attach container to
    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 512, // default
      cpu: 256, // default
    });

    // Grant the task permission to read from Secrets Manager
    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["secretsManager:GetSecretValue"],
      resources: [props.databaseSecret.secretArn],
    }));

    // add container
    const container = taskDefinition.addContainer("PendulumContainer", {
      image: ecs.ContainerImage.fromRegistry(props.containerRegistryURI),
      environment: {
        ...props.containerEnvironment,
        DATABASE_ENDPOINT: props.databaseEndpoint,
        DATABASE_SECRET_ARN: props.databaseSecret.secretArn,
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "pendulum-container",
      }),
    });

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // create fargate service
    this.service = new ecs.FargateService(this, "Service", {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 1, // default
      securityGroups: [props.ecsSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
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
    this.service.attachToApplicationTargetGroup(targetGroup);

    // create Listener for load balancer to send traffic to target group
    this.loadBalancer.addListener("Listened", {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });
  }
}
