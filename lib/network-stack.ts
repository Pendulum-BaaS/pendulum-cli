import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class NetworkStack extends cdk.Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /*
		instantiates vpc that with following properties:
			- CIDR range of 10.0.0.0/16 (2^16 IPs available)
			- Uses 2 AZs
			- uses default provided IGW
			- the following subnet groups in each AZ:
				- public subnet
				- private 'app' subnet for ECS with configuration for egress (i.e., outbound comm via NGW)
				- private 'db' subnet for DocumentDBs with no egress allowed
			- 1 NAT Gateway automatically placed in one of the public subnets
	 */
    this.vpc = new Vpc(this, "VPC", {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "app",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: "db",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
    });
  }
}
