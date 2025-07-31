import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { resolve, existsSync } from "path";
import { runCommand } from "../utils/runCommand";
import { checkAWSConfiguration } from "../utils/checkAWSConfiguration";
import { getAWSConfiguration } from "../utils/getAWSConfiguration";

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

async function deployBackendStacks(
  cliPath: string,
  accountId: string,
  region: string,
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
        "backend-outputs.json"
      ],
      {
      cwd: cliPath,
      env: {
        ...process.env,
        CDK_DEFAULT_ACCOUNT: accountId,
        CDK_DEFAULT_REGION: region,
      },
    });

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
      ],
    {
      cwd: cliPath,
      env: {
        ...process.env,
        CDK_DEFAULT_ACCOUNT: accountId,
        CDK_DEFAULT_REGION: region,
        PROJECT_NAME: frontendConfig.projectName,
        FRONTEND_BUILD_PATH: frontendConfig.frontendBuildPath,
      }
    });

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
        } else if (!/^[a-z0-9-_]+$/i.test(input)) { // checks that input only contains alphanumeric characters, hyphens, and underscores
          return "Project name can only contain letters, numbers, hyphens, " +
            "and underscores";
        } else {
          return true;
        }
      },
    },
    {
      type: "input",
      name: "frontendBuildPath",
      message: "Path to built frontend files (realtive to current directory):",
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

  const { awsAccountId, awsRegion } = await getAWSConfiguration();
  const frontendConfig = await getFrontendConfigration();

  const deploymentSummary = [
    `Account: ${awsAccountId.trim()}`,
    `Region: ${awsRegion}`,
    `Backend: Pendulum BaaS (4 stacks)`,
    `Frontend: ${frontendConfig.projectName}`,
  ];

  console.log(chalk.blue("\nDeployment Summary:"));
  deploymentSummary.forEach(item => console.log(item));

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
    await deployBackendStacks(cliPath, awsAccountId.trim(), awsRegion);
    await deployFrontendStack(
      cliPath,
      awsAccountId.trim(),
      awsRegion,
      frontendConfig
    );

    console.log(chalk.green("\nPendulum successfully deployed to AWS!"));
    console.log(chalk.blue("Deployment Details:"));
    console.log(` Account: ${awsAccountId.trim()}`);
    console.log(` Region: ${awsRegion}`);
    console.log("");
    console.log(chalk.blue("Access Your Deployment:"));
    console.log(" Backend: Check CloudFormation outputs for ALB URL");
    console.log(" Frontend: Check CloudFormation outputs for CloudFront URL");
    console.log("");
    console.log(chalk.blue("Next Steps:"));
    console.log("1. Check AWS CloudFormation console for your stack outputs");
    console.log("2. Your frontend is live and connected to your backend!");
    console.log("3. API calls to /api/* & /auth/* are automatically proxied");
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
    console.log("- Verify your frontend build path is correct");
    console.log("- Ensure your frontend project was built successfully");
    process.exit(1);
  }
};
