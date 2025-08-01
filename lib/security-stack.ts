import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as secretsManager from "aws-cdk-lib/aws-secretsmanager";

interface SecurityStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class SecurityStack extends cdk.Stack {
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly jwtSecret: secretsManager.Secret;
  public readonly adminApiKey: secretsManager.Secret;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    this.jwtSecret = new secretsManager.Secret(this, 'JWTSecret', {
      description: 'JWT Secret for Pendulum authentication',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'jwt-secret',
        excludeCharacters: '"@/\\`\'',
        passwordLength: 64
      }
    });

    this.adminApiKey = new secretsManager.Secret(this, 'AdminApiKey', {
      description: 'Admin API key for Pendulum dashboard access',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'admin-key',
        excludeCharacters: '"@/\\`\'',
        passwordLength: 32,
        includeSpace: false
      }
    });

    // CLI output for easy retrieval
    new cdk.CfnOutput(this, 'AdminApiKeyArn', {
      value: this.adminApiKey.secretArn,
      description: 'ARN of the admin API key secret',
      exportName: 'PendulumAdminApiKeyArn'
    });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSG", {
      vpc: props.vpc,
      description: "Security group for Application Load Balancer",
      allowAllOutbound: false,
    });

    this.ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSG", {
      vpc: props.vpc,
      description: "Security group for ECS tasks",
      allowAllOutbound: false,
    });

    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSG", {
      vpc: props.vpc,
      description: "Security group for DocumentDB cluster",
      allowAllOutbound: false,
    });

    this.configureSecurityGroupRules();
  }

  private configureSecurityGroupRules() {
    // ALB rules
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.HTTP,
      "Allow all inbound HTTP traffic",
    );

    this.albSecurityGroup.addEgressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(3000),
      "Allow traffic on port 3000 to ECS",
    );

    // ECS rules
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      "Allow traffic on port 3000 from ALB",
    );

    this.ecsSecurityGroup.addEgressRule(
      this.dbSecurityGroup,
      ec2.Port.tcp(27017),
      "Allow traffic on port 27107 to DocDB",
    );

    this.ecsSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.HTTPS,
      "Allow outbound HTTPS traffic for pulling images from ECR and" +
      "accessing AWS APIs",
    );

    this.ecsSecurityGroup.addEgressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(8080),
      "Allow ECS tasks to communicate with each other on port 8080",
    );

    // db rules
    this.dbSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(27017),
      "Allow traffic on port 27017 from ECS",
    );
  }
}
