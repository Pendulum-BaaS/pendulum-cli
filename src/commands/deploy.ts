import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { resolve } from "path";
import { existsSync } from "fs";
import { runCommand } from "../utils/runCommand";
import { checkAWSConfiguration } from "../utils/checkAWSConfiguration";
import { getAWSConfiguration } from "../utils/getAWSConfiguration";
import AWS from "aws-sdk";

async function getAdminApiKey(region: string): Promise<string | null> {
  const spinner = ora("Retrieving admin API key...").start();

  try {
    AWS.config.update({ region });
    const secretsManager = new AWS.SecretsManager();

    // Get secret ARN from CloudFormation exports
    const cloudFormation = new AWS.CloudFormation();
    const exports = await cloudFormation.listExports().promise();

    const adminKeyExport = exports.Exports?.find(
      (exp) => exp.Name === "PendulumAdminApiKeyArn",
    );

    if (!adminKeyExport?.Value) {
      spinner.fail(
        "Could not find admin API key ARN in CloudFormation exports",
      );
      return null;
    }

    // Get the secret value
    const secretResult = await secretsManager
      .getSecretValue({ SecretId: adminKeyExport.Value })
      .promise();

    if (!secretResult.SecretString) {
      spinner.fail("Admin API key secret has no value");
      return null;
    }

    const secretData = JSON.parse(secretResult.SecretString);
    const adminKey = secretData["admin-key"];

    if (!adminKey) {
      spinner.fail("Admin key not found in secret");
      return null;
    }

    spinner.succeed("Admin API key retrieved");
    return `${adminKey}`;
  } catch (error) {
    spinner.fail("Failed to retrieve admin API key");
    console.error(
      chalk.yellow(
        "Warning: Could not retrieve admin key. Check AWS permissions.",
      ),
    );
    return null;
  }
}

async function getLoadBalancerURL(region: string): Promise<string | null> {
  try {
    AWS.config.update({ region });
    const cloudFormation = new AWS.CloudFormation();

    const stacks = await cloudFormation
      .describeStacks({ StackName: "Pendulum-ApplicationStack" })
      .promise();

    const stack = stacks.Stacks?.[0];
    const albOutput = stack?.Outputs?.find(
      (output) => output.OutputKey === "LoadBalancerURL",
    );

    return albOutput?.OutputValue || null;
  } catch (error) {
    console.warn("Could not retrieve load balancer URL");
    return null;
  }
}

async function getCloudFrontURL(region: string): Promise<string | null> {
  try {
    AWS.config.update({ region });
    const cloudFormation = new AWS.CloudFormation();

    const stacks = await cloudFormation
      .describeStacks({ StackName: "Pendulum-FrontendStack" })
      .promise();

    const stack = stacks.Stacks?.[0];
    const cloudFrontOutput = stack?.Outputs?.find(
      (output) => output.OutputKey === "FrontendUrl",
    );

    return cloudFrontOutput?.OutputValue || null;
  } catch (error) {
    console.warn("Could not retrieve CloudFront URL");
    return null;
  }
}

async function installCDKDependencies(cliPath: string) {
  const spinner = ora("Installing CDK dependencies...").start();

  try {
    await runCommand("npm", ["install"], {
      cwd: cliPath,
      stdio: ["inherit", "ignore", "inherit"],
    });

    spinner.succeed("CDK dependencies installed");
  } catch (error) {
    spinner.fail("Failed to install CDK dependencies");
    throw error;
  }
}

async function bootstrapCDK(
  cliPath: string,
  accountId: string,
  region: string,
) {
  const spinner = ora("Bootstrapping AWS CDK environment...").start();

  try {
    await runCommand(
      "npx",
      ["cdk", "bootstrap", `aws://${accountId}/${region}`, "--ci"],
      {
        cwd: cliPath,
        env: {
          ...process.env,
          CDK_DEFAULT_ACCOUNT: accountId,
          CDK_DEFAULT_REGION: region,
        },
        stdio: ["inherit", "ignore", "inherit"],
      },
    );

    spinner.succeed("AWS CDK environment bootstrapped");
  } catch (error) {
    spinner.warn("CDK bootstrap may have already been completed or failed");
  }
}

async function deployBackendStacks(
  cliPath: string,
  accountId: string,
  region: string,
  projectName: string,
) {
  const spinner = ora("Deploying Pendulum backend stacks to AWS...").start();

  const backendStacks = [
    "Pendulum-NetworkStack",
    "Pendulum-SecurityStack",
    "Pendulum-DatabaseStack",
    "Pendulum-ApplicationStack",
  ];

  try {
    await runCommand(
      "npx",
      [
        "cdk",
        "deploy",
        ...backendStacks,
        "--require-approval",
        "never",
        "--outputs-file",
        "backend-outputs.json",
        "--ci",
      ],
      {
        cwd: cliPath,
        env: {
          ...process.env,
          CDK_DEFAULT_ACCOUNT: accountId,
          CDK_DEFAULT_REGION: region,
          PROJECT_NAME: projectName,
        },
        stdio: ["inherit", "ignore", "inherit"],
      },
    );

    spinner.succeed("Pendulum backend stacks deployed successfully");
  } catch (error) {
    spinner.fail("Failed to deploy Pendulum backend stacks");
    throw error;
  }
}

async function deployFrontendStack(
  cliPath: string,
  accountId: string,
  region: string,
  frontendConfig: any,
) {
  const spinner = ora("Deploying frontend stack to AWS...").start();

  try {
    await runCommand(
      "npx",
      [
        "cdk",
        "deploy",
        "Pendulum-FrontendStack",
        "--require-approval",
        "never",
        "--outputs-file",
        "frontend-outputs.json",
        "--ci",
      ],
      {
        cwd: cliPath,
        env: {
          ...process.env,
          CDK_DEFAULT_ACCOUNT: accountId,
          CDK_DEFAULT_REGION: region,
          PROJECT_NAME: frontendConfig.projectName,
          FRONTEND_BUILD_PATH: frontendConfig.frontendBuildPath,
        },
        stdio: ["inherit", "ignore", "inherit"],
      },
    );

    spinner.succeed("Frontend stack deployed successfully");
  } catch (error) {
    spinner.fail("Failed to deploy frontend stack");
    throw error;
  }
}

async function getFrontendConfigration() {
  console.log(chalk.blue("\nFrontend Deployment Configuration"));
  console.log(chalk.gray("Configure your frontend application deployment"));

  const frontendConfig = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: "Project name for your frontend:",
      default: "my-pendulum-app",
      validate: (input: string) => {
        if (!input.trim()) {
          return "project name is required";
        } else if (!/^[a-z0-9-_]+$/i.test(input)) {
          // checks that input only contains alphanumeric characters, hyphens, and underscores
          return (
            "Project name can only contain letters, numbers, hyphens, " +
            "and underscores"
          );
        } else {
          return true;
        }
      },
    },
    {
      type: "input",
      name: "frontendBuildPath",
      message: "Path to built frontend files (relative to current directory):",
      default: "./dist",
      validate: (input: string) => {
        const fullPath = resolve(process.cwd(), input);
        if (!existsSync(fullPath)) {
          return `Directory ${input} does not exist.`;
        } else if (!existsSync(resolve(fullPath, "index.html"))) {
          return `No index.html found in ${input}.`;
        } else {
          return true;
        }
      },
    },
  ]);

  frontendConfig.frontendBuildPath = resolve(
    process.cwd(),
    frontendConfig.frontendBuildPath,
  );

  return frontendConfig;
}

/*
`pendulum deploy`, when run from the root directory should do the following (happy path):
1. Prompt user for AWS account ID and region
2. Prompt for frontend configuration
3. Validate the inputs
4. Set up AWS CDK environment variables
5. Navigate to the CLI directory and run CDK deployment for backend
6. Deploy frontend stack
7. Display success message with deployment info
*/

export async function DeployCommand() {
  console.log(chalk.blue("Deploying Pendulum to AWS..."));

  const cliPath = resolve(__dirname, "../..");

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "This will deploy Pendulum backend to AWS using CDK. Continue?",
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow("Deployment cancelled."));
    return;
  }

  const { awsAccountId, awsRegion } = await getAWSConfiguration();
  const frontendConfig = await getFrontendConfigration();

  const deploymentSummary = [
    `Account: ${awsAccountId.trim()}`,
    `Region: ${awsRegion}`,
    `Backend: Pendulum BaaS (4 stacks)`,
    `Frontend: ${frontendConfig.projectName}`,
  ];

  console.log(chalk.blue("\nDeployment Summary:"));
  deploymentSummary.forEach((item) => console.log(item));

  const { confirmDeployment } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmDeployment",
      message: "Proceed with deployment?",
      default: false,
    },
  ]);

  if (!confirmDeployment) {
    console.log(chalk.yellow("Deployment cancelled."));
    return;
  }

  try {
    await checkAWSConfiguration();
    await installCDKDependencies(cliPath);
    await bootstrapCDK(cliPath, awsAccountId.trim(), awsRegion);
    await deployBackendStacks(
      cliPath,
      awsAccountId.trim(),
      awsRegion,
      frontendConfig.projectName,
    );
    await deployFrontendStack(
      cliPath,
      awsAccountId.trim(),
      awsRegion,
      frontendConfig,
    );

    const adminKey = await getAdminApiKey(awsRegion);
    const loadBalancerURL = await getLoadBalancerURL(awsRegion);
    const cloudFrontURL = await getCloudFrontURL(awsRegion);

    console.log(chalk.green("\n🎉 Pendulum successfully deployed to AWS!"));
    console.log(chalk.blue("\n📋 Deployment Information:"));
    console.log(chalk.white(`  Account: ${chalk.cyan(awsAccountId.trim())}`));
    console.log(chalk.white(`  Region: ${chalk.cyan(awsRegion)}`));

    if (loadBalancerURL) {
      console.log(
        chalk.white(
          `  Backend API: ${chalk.green(`${loadBalancerURL}/pendulum`)}`,
        ),
      );
      console.log(
        chalk.white(
          `  Events URL: ${chalk.green(`${loadBalancerURL}/pendulum-events`)}`,
        ),
      );
    }

    if (adminKey) {
      console.log(chalk.cyan("\n🔑 Admin Dashboard Access:"));
      console.log(chalk.white(`  ${chalk.magenta(`${cloudFrontURL}/admin/`)}`));
      console.log("");
      console.log(chalk.white(`  Admin Key: ${chalk.yellow(adminKey)}`));
      console.log(
        chalk.yellow(
          "  ⚠️  Save this key securely - you'll need it to access the dashboard!",
        ),
      );
    }

    console.log(chalk.blue("\n🚀 Access Your Deployment:"));
    if (cloudFrontURL) {
      console.log(chalk.white(`  ${chalk.green(cloudFrontURL)}`));
    } else {
      console.log(
        chalk.yellow(
          "  Frontend: Check CloudFormation outputs for CloudFront URL",
        ),
      );
    }

    console.log("");
    console.log(chalk.blue("Next Steps:"));
    if (adminKey) {
      console.log(chalk.white("  1. Save your admin key from above"));
      console.log(
        chalk.white(
          "  2. Your frontend is live and connected to your backend!",
        ),
      );
      console.log(
        chalk.white("  3. Access the dashboard using your admin key"),
      );
      console.log(
        chalk.white(
          "  4. API calls to /api/* & /auth/* are automatically proxied",
        ),
      );
    } else {
      console.log(
        chalk.white(
          "  1. Check AWS CloudFormation console for your stack outputs",
        ),
      );
      console.log(
        chalk.white(
          "  2. Your frontend is live and connected to your backend!",
        ),
      );
      console.log(
        chalk.white(
          "  3. API calls to /api/* & /auth/* are automatically proxied",
        ),
      );
      console.log(
        chalk.white(
          "  4. Check AWS Secrets Manager for 'AdminApiKey' to access dashboard",
        ),
      );
    }

    console.log("");
    console.log(chalk.gray("To update deployment, rerun 'pendulum deploy'"));

    if (!adminKey) {
      console.log(
        chalk.yellow("\n⚠️  Admin key could not be retrieved automatically."),
      );
      console.log(
        chalk.gray(
          "Check AWS Secrets Manager in your console for 'AdminApiKey'",
        ),
      );
    }
  } catch (error) {
    console.error(chalk.red("Deployment failed:"), error);
    console.log(chalk.yellow("\nTroubleshooting tips:"));
    console.log(
      chalk.white("  • Ensure AWS credentials are configured (aws configure)"),
    );
    console.log(
      chalk.white("  • Verify your AWS account ID and region are correct"),
    );
    console.log(
      chalk.white("  • Check that you have sufficient AWS permissions"),
    );
    console.log(
      chalk.white(
        "  • Ensure AWS CDK is installed globally: npm install -g aws-cdk",
      ),
    );
    console.log(
      chalk.white("  • Ensure Docker is running (required for CDK deployment)"),
    );
    console.log(chalk.white("  • Verify your frontend build path is correct"));
    console.log(
      chalk.white("  • Ensure your frontend project was built successfully"),
    );
    process.exit(1);
  }
}
