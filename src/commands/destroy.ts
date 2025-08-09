import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { runCommand } from "../utils/runCommand";
import { checkAWSConfiguration } from "../utils/checkAWSConfiguration";
import { getAWSConfiguration } from "../utils/getAWSConfiguration";

async function listAllStacks() {
  const spinner = ora("Finding known Pendulum stacks...").start();

  try {
    await runCommand("aws", ["sts", "get-caller-identity"], { stdio: "pipe" });

    const potentialStacks = [
      "Pendulum-FrontendStack",
      "Pendulum-ApplicationStack",
      "Pendulum-DatabaseStack",
      "Pendulum-SecurityStack",
      "Pendulum-NetworkStack",
    ];

    return potentialStacks;
  } catch (error: any) {
    spinner.fail("Failed to connect to AWS");
    throw new Error(`AWS CLI error: ${error.message}`);
  }
}

async function destroyStacks(
  accountId: string,
  region: string,
  stacks: string[],
) {
  console.log(chalk.blue("\nDestroy Info:"));
  console.log(chalk.gray(`  Account: ${accountId}`));
  console.log(chalk.gray(`  Region: ${region}`));

  for (const stack of stacks) {
    try {
      await runCommand(
        "aws",
        [
          "cloudformation",
          "delete-stack",
          "--stack-name",
          stack,
          "--region",
          region,
        ],
        {
          env: {
            ...process.env,
          },
          stdio: "pipe",
        },
      );

      console.log(chalk.yellow(`Initiated deletion of: ${stack}`));

      await runCommand(
        "aws",
        [
          "cloudformation",
          "wait",
          "stack-delete-complete",
          "--stack-name",
          stack,
          "--region",
          region,
        ],
        {
          env: {
            ...process.env,
          },
          stdio: "pipe",
        },
      );

      console.log(chalk.green(`Successfully destroyed: ${stack}`));
    } catch (error: any) {
      console.log(chalk.yellow(`Couldn't destroy ${stack}: ${error.message}`));
      console.log(chalk.gray("This might be normal if stack doesn't exist"));
    }
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

  try {
    await runCommand("aws", ["--version"], { stdio: "pipe" });
  } catch (error) {
    console.log(chalk.red("AWS CLI not found!"));
    console.log(
      chalk.yellow("Please install AWS CLI: https://aws.amazon.com/cli/"),
    );
    return;
  }

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message:
        "This will permanently destroy your Pendulum deployment from " +
        "AWS. Continue?",
      default: false,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow("Desctruction cancelled."));
    return;
  }

  const { awsAccountId, awsRegion } = await getAWSConfiguration();

  console.log(chalk.yellow("\nWARNING: This action is irreversible!"));
  console.log(
    chalk.yellow(
      "All data in your Pendulum deployment will be permanently lost.",
    ),
  );
  console.log(chalk.yellow("This includes:"));
  console.log(chalk.yellow("- S3 bucket and all website files"));
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
      },
    },
  ]);

  if (confirmDestruction.trim() !== "DESTROY") {
    console.log(chalk.yellow("Destruction cancelled."));
    return;
  }

  try {
    await checkAWSConfiguration();

    const stacksToDestroy = await listAllStacks();
    await destroyStacks(awsAccountId.trim(), awsRegion, stacksToDestroy);

    console.log(chalk.green("\nPendulum successfully destroyed from AWS!"));
    console.log(chalk.blue("Destruction details:"));
    console.log(` Account: ${awsAccountId.trim()}`);
    console.log(` Region: ${awsRegion}`);
    console.log("");
    console.log(chalk.blue("What was destroyed:"));
    console.log("- Frontend application and CDN");
    console.log("- ECS Fargate cluster and services");
    console.log("- Application Load Balancer");
    console.log("- DocumentDB cluster and data");
    console.log("- VPC and networking components");
    console.log("- Security groups and IAM roles");
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
    console.log("- S3 buckets with versioning may need manual cleanup");
    process.exit(1);
  }
}
