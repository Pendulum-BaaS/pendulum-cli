import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import dotenv from "dotenv";

dotenv.config();

interface ApplicationStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  ecsSecurityGroup: ec2.SecurityGroup;
  albSecurityGroup: ec2.SecurityGroup;
  databaseEndpoint: string;
  containerEnvironment: Record<string, string>;
  containerRegistryURI: string;
}

export class ApplicationStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    const MONGO_URL =
      `mongodb://${process.env.DB_USER}:${process.env.DB_PW}@` +
      `${props.databaseEndpoint}:27017/` +
      `${process.env.DB_NAME}?tls=true&tlsCAFile=/tmp/global-bundle.pem&` +
      `replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false&` +
      `authMechanism=SCRAM-SHA-1`;

    this.cluster = new ecs.Cluster(this, "BaaSCoreCluster", {
      vpc: props.vpc,
    });

    // create task definition to attach container to
    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 512, // default
      cpu: 256, // default
    });

    // add container
    const container = taskDefinition.addContainer("BaaSContainer", {
      image: ecs.ContainerImage.fromRegistry(props.containerRegistryURI),
      environment: { ...props.containerEnvironment, MONGO_URL },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "baas-container",
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
