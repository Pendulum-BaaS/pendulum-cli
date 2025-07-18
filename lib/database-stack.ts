import dotenv from "dotenv";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { DatabaseCluster } from "aws-cdk-lib/aws-docdb";

dotenv.config();

interface DatabaseStackProps extends cdk.StackProps {
	vpc: ec2.Vpc;
	securityGroup: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
	public readonly cluster: DatabaseCluster;
	public readonly clusterEndpoint: string;

	constructor(scope: Construct, id: string, props: DatabaseStackProps) {
		super(scope, id, props);

		this.cluster = new DatabaseCluster(this, "Database", {
			masterUser: {
				username: process.env.DB_USER || "admin",
				// CHANGE BELOW TO USE AWS sECRETS MANAGER FOR PRODUCTION!!!
				password: cdk.SecretValue.unsafePlainText(
					process.env.DB_PW || "password123",
				),
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
			deletionProtection: true,
		});

		this.clusterEndpoint = this.cluster.clusterEndpoint.hostname;
	}
}
