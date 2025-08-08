import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsManager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { DatabaseCluster } from "aws-cdk-lib/aws-docdb";

interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
  public readonly cluster: DatabaseCluster;
  public readonly clusterEndpoint: string;
  public readonly secret: secretsManager.Secret;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.secret = new secretsManager.Secret(this, "DatabaseSecret", {
      description: "Pendulum DocumentDB cluster credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: "admin",
        }),
        generateStringKey: "password",
        excludeCharacters: '"@/\\:?#[]%&=+',
        passwordLength: 16,
      },
    });

    this.cluster = new DatabaseCluster(this, "Database", {
      masterUser: {
        username: this.secret.secretValueFromJson("username").unsafeUnwrap(),
        password: this.secret.secretValueFromJson("password"),
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM,
      ),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      vpc: props.vpc,
      securityGroup: props.securityGroup,
      port: 27017,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.clusterEndpoint = this.cluster.clusterEndpoint.hostname;
  }
}
