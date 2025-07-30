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

async function checkStackExists(region: string) {
  const spinner = ora("Checking if Pendulum stack exists...").start();

  try {
    await runCommand("aws", [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      "PendulumStack",
      "--region",
      region
    ]);

    spinner.succeed("Pendulum stack found");
    return true;
  } catch (error) {
    spinner.warn("No pendulum stack found to destroy");
    return false;
  }
}

async function destroyCDKStack(
  cliPath: string,
  accountId: string,
  region: string,
) {
  const spinner = ora("Destroying Pendulum stack from AWS...").start();

  try {
    await runCommand("npx", ["cdk", "destroy", "--force"], {
      cwd: cliPath,
      env: {
        ...process.env,
        CDK_DEFAULT_ACCOUNT: accountId,
        CDK_DEFAULT_REGION: region,
      }
    });

    spinner.succeed("Pendulum stack destroyed successfully");
  } catch (error) {
    spinner.fail("Failed to destroy Pendulum stack");
    throw error;
  }
}

/*
`pendulum destroy`, when run from the root directory should do the following (happy path):
1. Prompt user for AWS account ID and region
2. Validate the inputs and check if stack exists
3. Display warning about permanent deletion
4. Navigate to the CLI directory and run CDK destroy
5. Display success message confirming destruction
*/

export async function DestroyCommand() {
  console.log(chalk.red("Destroying from AWS..."));

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
      message: "This will permanently destroy your Pendulum deployment from " +
        "AWS. Continue?",
      default: false,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow("Desctruction cancelled."));
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

  console.log(chalk.yellow("\nWARNING: This action is irreversible!"));
  console.log(chalk.yellow(
    "All data in your Pendulum deployment will be permanently lost."
  ));
  console.log(chalk.yellow("This includes:"));
  console.log(chalk.yellow("- Database and all stored data"));
  console.log(chalk.yellow("- Container images and logs"));
  console.log(chalk.yellow("- Load balancer and networking"));
  console.log(chalk.yellow("- All infrastructure resources"));

  const { confirmDestruction } = await inquirer.prompt([
    {
      type: "input",
      name: "confirmDestruction",
      message: "Type 'DESTROY' to confirm deletion",
      validate: (input: string) => {
        if (input.trim() !== "DESTROY") {
          return "You must type 'DESTROY' exactly to confirm";
        } else {
          return true;
        }
      }
    }
  ]);

  if (confirmDestruction.trim() !== "DESTROY") {
    console.log(chalk.yellow("Destruction cancelled."));
    return;
  }

  try {
    await checkAWSConfiguration();

    const stackExists = await checkStackExists(awsRegion);
    if (!stackExists) {
      console.log(chalk.yellow("No Pendulum stack found to destroy."));
      console.log(chalk.gray("Your AWS account appears to be clean already."));
      return;
    }

    await destroyCDKStack(cliPath, awsAccountId.trim(), awsRegion);

    console.log(chalk.green("\nPendulum successfully destroyed from AWS!"));
    console.log(chalk.blue("Destruction details:"));
    console.log(` Account: ${awsAccountId.trim()}`);
    console.log(` Region: ${awsRegion}`);
    console.log("");
    console.log(chalk.blue("What was destroyed:"));
    console.log("- ECS Fargate cluster and services");
    console.log("- Application Load Balancer");
    console.log("- DocumentDB cluster and data");
    console.log("- VPC and networking components");
    console.log("- Security groups and IAM roles");
    console.log("- ECR repositories and container images");
    console.log("");
    console.log(chalk.gray("AWS billing should stop for these resources."));
  } catch (error) {
    console.error(chalk.red("Destruction failed:"), error);
    console.log(chalk.yellow("\nTroubleshooting tips:"));
    console.log("- Ensure AWS credentials are configured (aws configure)");
    console.log("- Verify your AWS account ID and region are correct");
    console.log("- Check that you have sufficient AWS permissions");
    console.log("- Some resources may have deletion protection enabled");
    console.log("- Check AWS CloudFormation console for stuck resources");
    process.exit(1);
  }
};
