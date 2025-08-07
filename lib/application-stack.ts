import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsManager from "aws-cdk-lib/aws-secretsmanager";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

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
  projectName: string;
  frontendBuildPath: string;
  customDomainName?: string;
  certificateArn?: string;
}

export class ApplicationStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly appService: ecs.FargateService;
  public readonly eventsService: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly frontendBucket: s3.Bucket;
  public readonly distribution: cf.Distribution;
  public readonly appUrl: string;

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
        SERVICE_TYPE: "app",
        EVENTS_SERVICE_URL: "http://events:8080",
        PORT: "3000",
        NODE_ENV: "production", 
        DB_NAME: "pendulum",
        DATABASE_ENDPOINT: props.databaseEndpoint,
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
        PORT: "8080",
        NODE_ENV: "production",
        DB_NAME: "pendulum",
        DATABASE_ENDPOINT: props.databaseEndpoint,
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

    // create target group for app service
    const appTargetGroup = new elbv2.ApplicationTargetGroup(this, "AppTargetGroup", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/pendulum/health",
        healthyHttpCodes: "200",
      },
    });

    // create target group for app service
    const eventsTargetGroup = new elbv2.ApplicationTargetGroup(this, "EventsTargetGroup", {
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc: props.vpc,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/pendulum-events/health",
        healthyHttpCodes: "200",
      },
    });

    // add targets to target group
    this.appService.attachToApplicationTargetGroup(appTargetGroup);
    this.eventsService.attachToApplicationTargetGroup(eventsTargetGroup);

    // Create HTTP listener for load balancer (CloudFront will handle HTTPS)
    const httpListener = this.loadBalancer.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [appTargetGroup],
    });
    	
    // Add listener rule for events service
    httpListener.addTargetGroups("EventsRule", {
      targetGroups: [eventsTargetGroup],
      conditions: [
        elbv2.ListenerCondition.pathPatterns(["/pendulum-events/*"])
      ],
      priority: 100,
    });

    if (!props.frontendBuildPath || !props.projectName) {
      throw new Error("Frontend build path and project name are required for deployment");
    }

    // Format project name for S3 bucket
    const formattedProjectName = props.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // replaces any number of consecutive non-alphanumeric characters with dash (-)
      .replace(/^-+|-+$/g, ''); // deletes any number of consecutive dashes at the beginning or end of string

    // Create S3 bucket for frontend
    this.frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `${formattedProjectName}-frontend-${this.account}-${this.region}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      websiteIndexDocument: "index.html",
    });

    // Cloudfront distribution config
    const distributionConfig: cf.DistributionProps = {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(
          this.frontendBucket
        ),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cf.CachedMethods.CACHE_GET_HEAD,
        compress: true,
      },
      additionalBehaviors: {
        // Backend API routes
        "/pendulum/*": {
          origin: new origins.HttpOrigin(
            this.loadBalancer.loadBalancerDnsName,
            { httpPort: 80, protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY }
          ),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachedMethods: cf.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
          compress: false,
        },
        // Events service routes
        "/pendulum-events/*": {
          origin: new origins.HttpOrigin(
            this.loadBalancer.loadBalancerDnsName,
            { 
              httpPort: 80, 
              protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY 
            }
          ),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachedMethods: cf.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
          compress: false,
        },
      },
      defaultRootObject: "index.html",
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      enabled: true,
      comment: "Pendulum BaaS - Unified Frontend & Backend Distribution",
      // Add custom domain if provided
      ...(props.customDomainName && props.certificateArn && {
        domainNames: [props.customDomainName],
        certificate: acm.Certificate.fromCertificateArn(
          this,
          "CustomCertificate",
          props.certificateArn
        )
      })
    };

    this.distribution = new cf.Distribution(
      this,
      "Distribution",
      distributionConfig
    );

    // Deploy frontend files to S3
    new s3deploy.BucketDeployment(this, "FrontendDeployment", {
      sources: [s3deploy.Source.asset(props.frontendBuildPath)],
      destinationBucket: this.frontendBucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
      prune: true,
      exclude: [
        "*.map",
        ".DS_Store",
        "*.log",
        "node_modules/**/*",
        ".git/**/*",
        ".env*"
      ],
      memoryLimit: 1024,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
    });

    // Set the API URL based on whether custom domain is used
    this.appUrl = props.customDomainName
      ? `https://${props.customDomainName}`
      : `https://${this.distribution.distributionDomainName}`;

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerURL', {
      value: `http://${this.loadBalancer.loadBalancerDnsName}`,
      description: 'URL of the Application Load Balancer (internal use)',
    });

    new cdk.CfnOutput(this, 'AppUrl', {
      value: this.appUrl,
      description: 'Main application URL (frontend + backend)',
      exportName: "PendulumAppUrl",
    });

    new cdk.CfnOutput(this, 'BackendApiUrl', {
      value: `${this.appUrl}/pendulum`,
      description: 'Backend API base URL',
      exportName: 'PendulumBackendApiUrl',
    });

    new cdk.CfnOutput(this, 'EventsUrl', {
      value: `${this.appUrl}/pendulum-events/events`,
      description: 'Events endpoint URL',
      exportName: 'PendulumEventsUrl',
    });

    new cdk.CfnOutput(this, 'FrontendBucketOutput', {
      value: this.frontendBucket.bucketName,
      description: 'S3 bucket hosting frontend',
      exportName: 'PendulumFrontendBucket',
    });

    if (props.customDomainName) {
      new cdk.CfnOutput(this, 'DNSRecord', {
        value: `${props.customDomainName} → ${this.distribution.distributionDomainName}`,
        description: 'Add this CNAME record to your DNS provider',
      });
    }
  }
}
