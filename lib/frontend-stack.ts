import * as cdk from "aws-cdk-lib";
// import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

interface UserFrontEndStackProps extends cdk.StackProps {
  frontendBuildPath: string;
  projectName: string;
  apiEndpoint: string;
  // eventsEndpoint: string;
  // loadBalancer: elbv2.ApplicationLoadBalancer
  customDomainName?: string;
  // environmentVariables?: Record<string, string>;
  // buildCommand?: string;
  // cacheHeaders?: Record<string, string>;
}

export class UserFrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cf.Distribution;
  public readonly bucketDeployment: s3deploy.BucketDeployment;

  constructor(scope: Construct, id: string, props: UserFrontEndStackProps) {
    super(scope, id, props);

    // const apiEndpoint = `https://${props.loadBalancer.loadBalancerDnsName}`;

    const formattedProjectName = props.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // replaces any number of consecutive non-alphanumeric characters with dash (-)
      .replace(/^-+|-+$/g, ''); // deletes any number of consecutive dashes at the beginning or end of string

    // Create S3 bucket for hosting user's frontend
    this.bucket = new s3.Bucket(this, "UserFrontendBucket", {
      bucketName: `${formattedProjectName}-frontend-${this.account}-` +
        `${this.region}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      websiteIndexDocument: "index.html",
    });

    let apiHostname: string;
    let apiPort: number;
    let apiProtocol: string;

    if (cdk.Token.isUnresolved(props.apiEndpoint)) {
      if (props.apiEndpoint.startsWith("https://")) {
        apiHostname = props.apiEndpoint.substring(8);
        apiProtocol = "https";
        apiPort = 443;
      } else if (props.apiEndpoint.startsWith("http://")) {
        apiHostname = props.apiEndpoint.substring(7);
        apiProtocol = "http";
        apiPort = 80;
      } else {
        throw new Error(`Invalid API endpoint format: ${props.apiEndpoint}`);
      }
    } else {
      try {
        const apiUrl = new URL(props.apiEndpoint);
        apiHostname = apiUrl.hostname;
        apiProtocol = apiUrl.protocol;
        apiPort = apiUrl.port
          ? Number(apiUrl.port)
          : (apiUrl.protocol === "https:" ? 443 : 80);
      } catch {
        throw new Error(`Invalid API endpoint URL: ${props.apiEndpoint}`);
      }
    }

    // Create CloudFront distribution
    this.distribution = new cf.Distribution(
      this,
      "UserFrontendDistribution",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cf.CachedMethods.CACHE_GET_HEAD,
          compress: true,
        },
        additionalBehaviors: {
          "/api/*": {
            origin: new origins.HttpOrigin(apiHostname, {
              httpPort: apiPort,
              httpsPort: apiPort,
              protocolPolicy: apiProtocol === "https:"
                ? cf.OriginProtocolPolicy.HTTPS_ONLY
                : cf.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cf.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
            allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          },
          "/auth/*": {
            origin: new origins.HttpOrigin(apiHostname, {
              httpPort: apiPort,
              httpsPort: apiPort,
              protocolPolicy: apiProtocol === "https:"
                ? cf.OriginProtocolPolicy.HTTPS_ONLY
                : cf.OriginProtocolPolicy.HTTP_ONLY,
            }),
            viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cf.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
            allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          },
          "/events/*": {
            origin: new origins.HttpOrigin(apiHostname, {
              httpPort: apiPort,
              httpsPort: apiPort,
              protocolPolicy: apiProtocol === "https:"
                ? cf.OriginProtocolPolicy.HTTPS_ONLY
                : cf.OriginProtocolPolicy.HTTP_ONLY,
              // customHeaders: {
              //   "Cache-Control": "no-cache",
              //   "Connection": "keep-alive",
              // }
            }),
            viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cf.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
            allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD,
          },
        },
        defaultRootObject: "index.html",
        priceClass: cf.PriceClass.PRICE_CLASS_100,
        enabled: true,
        comment: `${props.projectName} Distribution (Powered by Pendulum)`,
      }
    );

    this.bucketDeployment = new s3deploy.BucketDeployment(
      this,
      "UserFrontendDeployment",
      {
        sources: [s3deploy.Source.asset(props.frontendBuildPath)],
        destinationBucket: this.bucket,
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
      }
    );

    // Outputs
    new cdk.CfnOutput(this, "FrontendUrl", {
      value: `https://${this.distribution.distributionDomainName}`,
      description: "Your frontend application URL",
      exportName: `${formattedProjectName}-frontend-url`,
    });

    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: props.apiEndpoint,
      description: "Pendulum BaaS API endpoint your app is using",
      exportName: `${formattedProjectName}-api-endpoint`,
    });

    new cdk.CfnOutput(this, "S3BucketName", {
      value: this.bucket.bucketName,
      description: "S3 bucket hosting your frontend your frontend",
      exportName: `${formattedProjectName}-bucket-name`,
    });
  }
}
