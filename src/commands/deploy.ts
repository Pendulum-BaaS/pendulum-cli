import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { resolve } from "path";
import { runCommand } from "../utils/runCommand";

async function checkAWSConfiguration() {
  const spinner = ora("Checking AWS configuration...").start();

  try {
    await runCommand("aws", ["sts", "get-caller-identity"], {
      cwd: process.cwd(),
    });

    spinner.succeed("AWS credentials configured");
  } catch (error) {
    spinner.fail("AWS credentials not configured");
    throw new Error("Run 'aws configure' to set up your AWS credentials");
  }
}

async function installCDKDependencies(cliPath: string) {
  const spinner = ora("Intalling CDK dependencies...").start();

  try {
    await runCommand("npm", ["install"], { cwd: cliPath });
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
      ["cdk", "bootstrap", `aws://${accountId}/${region}`],
      {
        cwd: cliPath,
        env: {
          ...process.env,
          CDK_DEFAULT_ACCOUNT: accountId,
          CDK_DEFAULT_REGION: region,
        },
      }
    );

    spinner.succeed("AWS CDK environment bootstrapped");
  } catch (error) {
    spinner.warn("CDK bootstrap may have already been completed or failed");
  }
}

async function deployCDKStack(
  cliPath: string,
  accountId: string,
  region: string,
) {
  const spinner = ora("Deploying Pendulum stack to AWS...").start();

  try {
    await runCommand("npx", ["cdk", "deploy", "--require-approval", "never"], {
      cwd: cliPath,
      env: {
        ...process.env,
        CDK_DEFAULT_ACCOUNT: accountId,
        CDK_DEFAULT_REGION: region,
      },
    });

    spinner.succeed("Pendulum stacked deployed successfully");
  } catch (error) {
    spinner.fail("Failed to deploy Pendulum stack");
    throw error;
  }
}

/*
`pendulum deploy`, when run from the root directory should do the following (happy path):
1. Prompt user for AWS account ID and region
2. Validate the inputs
3. Set up AWS CDK environment variables
4. Navigate to the CLI directory and run CDK deployment
5. Display success message with deployment info
*/

export async function DeployCommand() {
  console.log(chalk.blue("Deploying Pendulum to AWS..."));

  const projectPath = process.cwd();
  const cliPath = resolve(projectPath, "pendulum-cli");

  try {
    const fs = await import("fs/promises");
    await fs.access(resolve(projectPath, "pendulum"));
    await fs.access(cliPath);
  } catch (error) {
    console.log(chalk.red("Pendulum project not found!"));
    console.log(chalk.yellow("Run 'pendulum init' to set up your project."));
    return;
  }

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

  const { awsAccountId, awsRegion } = await inquirer.prompt([
    {
      type: "input",
      name: "awsAccountId",
      message: "Enter your AWS Account ID:",
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return "AWS Account ID is required";
        } else if (!/^\d{12}$/.test(input.trim())) { // checks for exactly 12 digits
          return "AWS Account ID must be exactly 12 digits";
        } else {
          return true;
        }
      },
    },
    {
      type: "list",
      name: "awsRegion",
      message: "Select your AWS region:",
      choices: [
        {
          name: "US East (N. Virginia) - us-east-1",
          value: "us-east-1",
        },
        {
          name: "US East (Ohio) - us-east-2",
          value: "us-east-2",
        },
        {
          name: "US West (Oregon) - us-west-2",
          value: "us-west-2",
        },
        {
          name: "US West (N. California) - us-west-1",
          value: "us-west-1",
        },
        {
          name: "Europe (Ireland) - eu-west-1",
          value: "eu-west-1",
        },
        {
          name: "Europe (London) - eu-west-2",
          value: "eu-west-2",
        },
        {
          name: "Europe (Frankfurt) - eu-central-1",
          value: "eu-central-1",
        },
        {
          name: "Asia Pacific (Sydney) - ap-southeast-2",
          value: "ap-southeast-2"
        },
        {
          name: "Asia Pacific (Tokyo) - ap-northeast-1",
          value: "ap-northeast-1",
        },
        {
          name: "Asia Pacific (Singapore) - ap-southeast-1",
          value: "ap-southeast-1",
        },
      ],
      default: "us-east-1",
    },
  ]);

  const { confirmDeployment: finalConfirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmDeployment",
      message: `Deploy to AWS Account ${awsAccountId.trim()} in region` +
        `${awsRegion}?`,
      default: false,
    },
  ]);

  if (!finalConfirm) {
    console.log(chalk.yellow("Deployment cancelled."));
    return;
  }

  try {
    await checkAWSConfiguration();
    await installCDKDependencies(cliPath);
    await bootstrapCDK(cliPath, awsAccountId.trim(), awsRegion);
    await deployCDKStack(cliPath, awsAccountId.trim(), awsRegion);

    console.log(chalk.green("\nPendulum successfully deployed to AWS!"));
    console.log(chalk.blue("Deployment Details:"));
    console.log(` Account: ${awsAccountId.trim()}`);
    console.log(` Region: ${awsRegion}`);
    console.log("");
    console.log(chalk.blue("Next Steps:"));
    console.log("1. Check AWS CloudFormation console for your stack outputs");
    console.log("2. Update frontend SDK configuration with the new endpoints");
    console.log("3. Your Pendulum backend is now running in production!");
    console.log("");
    console.log(chalk.gray("To update deployment, rerun 'pendulum deploy'"));
  } catch (error) {
    console.error(chalk.red("Deployment failed:"), error);
    console.log(chalk.yellow("\nTroubleshooting tips:"));
    console.log("- Ensure AWS credentials are configured (aws configure)");
    console.log("- Verify your AWS account ID and region are correct");
    console.log("- Check that you have sufficient AWS permissions");
    console.log(
      "- Ensure AWS CDK is installed globally: npm install -g aws-cdk"
    );
    console.log("- Ensure Docker is running (required for CDK deployment)");
    process.exit(1);
  }
};
