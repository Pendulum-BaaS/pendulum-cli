import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { resolve } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { runCommand } from "../utils/runCommand";
import { checkAWSConfiguration } from "../utils/checkAWSConfiguration";
import { getAWSConfiguration } from "../utils/getAWSConfiguration";
import AWS from 'aws-sdk';

async function getAdminApiKey(region: string): Promise<string | null> {
  const spinner = ora("Retrieving admin API key...").start();

  try {
    AWS.config.update({ region });
    const secretsManager = new AWS.SecretsManager();

    // Get secret ARN from CloudFormation exports
    const cloudFormation = new AWS.CloudFormation();
    const exports = await cloudFormation.listExports().promise();

    const adminKeyExport = exports.Exports?.find(exp => 
      exp.Name === 'PendulumAdminApiKeyArn'
    );

    if (!adminKeyExport?.Value) {
      spinner.fail("Could not find admin API key ARN in CloudFormation exports");
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
    const adminKey = secretData['admin-key'];

    if (!adminKey) {
      spinner.fail("Admin key not found in secret");
      return null;
    }

    spinner.succeed(("Admin API key retrieved"));
    return `ak_${adminKey}`;
  } catch (error) {
    spinner.fail("Failed to retrieve admin API key");
    console.error(chalk.yellow("Warning: Could not retrieve admin key. Check AWS permissions."));
    return null;
  }
}

async function getDeploymentUrls(region: string): Promise<{
  appUrl: string | null;
  backendApiUrl: string | null;
  eventsUrl: string | null;
}> {
  try {
    AWS.config.update({ region });
    const cloudFormation = new AWS.CloudFormation();

    const stacks = await cloudFormation
      .describeStacks({ StackName: 'Pendulum-ApplicationStack' })
      .promise();

    const stack = stacks.Stacks?.[0];

    const appUrlOutput = stack?.Outputs?.find(output =>
      output.OutputKey === 'AppUrl'
    );

    const backendApiUrlOutput = stack?.Outputs?.find(output =>
      output.OutputKey === 'BackendApiUrl'
    );

    const eventsUrlOutput = stack?.Outputs?.find(output =>
      output.OutputKey === 'EventsUrl'
    );

    return {
      appUrl: appUrlOutput?.OutputValue || null,
      backendApiUrl: backendApiUrlOutput?.OutputValue || null,
      eventsUrl: eventsUrlOutput?.OutputValue || null
    }
  } catch (error) {
    console.warn("Could not retrieve deployment URLs");
    return {
      appUrl: null,
      backendApiUrl: null,
      eventsUrl: null,
    };
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
      }
    );

    spinner.succeed("AWS CDK environment bootstrapped");
  } catch (error) {
    spinner.warn("CDK bootstrap may have already been completed or failed");
  }
}

async function injectEnvironmentVariables(
  frontendBuildPath: string,
  apiUrl: string,
  eventsUrl: string
) {
  const spinner = ora("Injecting backend URLs into frontend build...").start();

  try {
    const indexHtmlPath = resolve(frontendBuildPath, "index.html");

    if (!existsSync(indexHtmlPath)) {
      throw new Error("index.html not found in build directory");
    }

    let indexHtml = readFileSync(indexHtmlPath, "utf8");

    const envScript = `
    <script>
      window.PENDULUM_CONFIG = {
        apiUrl: "${apiUrl}",
        eventsUrl: "${eventsUrl}",
      };
    </script>
    `;

    indexHtml = indexHtml.replace("</head>", `${envScript}</head>`);

    writeFileSync(indexHtmlPath, indexHtml);
    spinner.succeed("Backend URLs injected into frontend build");
  } catch (error) {
    spinner.fail("Failed to inject environment variables");
    throw error;
  }
}

async function deployStacks(
  cliPath: string,
  accountId: string,
  region: string,
  frontendConfig: any,
) {
  const spinner = ora("Deploying Pendulum stacks to AWS...").start();

  const stacks = [
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
        ...stacks,
        "--require-approval",
        "never",
        "--outputs-file",
        "deployment-outputs.json",
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
          CUSTOM_DOMAIN_NAME: frontendConfig.customDomainName || "",
          CERTIFICATE_ARN: frontendConfig.certificateArn || "",
        },
        stdio: ["inherit", "ignore", "inherit"],
      }
    );

    spinner.succeed("Pendulum stacks deployed successfully");
  } catch (error) {
    spinner.fail("Failed to deploy Pendulum stacks");
    throw error;
  }
}

// async function deployFrontendStack(
//   cliPath: string,
//   accountId: string,
//   region: string,
//   frontendConfig: any,
//   apiUrl: string,
// ) {
//   const spinner = ora("Deploying frontend stack to AWS...").start();

//   try {
//     await runCommand(
//       "npx",
//       [
//         "cdk",
//         "deploy",
//         "Pendulum-FrontendStack",
//         "--require-approval",
//         "never",
//         "--outputs-file",
//         "frontend-outputs.json",
//         "--ci",
//       ],
//       {
//         cwd: cliPath,
//         env: {
//           ...process.env,
//           CDK_DEFAULT_ACCOUNT: accountId,
//           CDK_DEFAULT_REGION: region,
//           PROJECT_NAME: frontendConfig.projectName,
//           FRONTEND_BUILD_PATH: frontendConfig.frontendBuildPath,
//           API_ENDPOINT: apiUrl,
//         },
//         stdio: ["inherit", "ignore", "inherit"],
//       });

//     spinner.succeed("Frontend stack deployed successfully");
//   } catch (error) {
//     spinner.fail("Failed to deploy frontend stack");
//     throw error;
//   }
// }

async function getFrontendConfiguration() {
  console.log(chalk.blue("\nPendulum Deployment Configuration"));
  console.log(chalk.gray("Configure your application deployment"));

  const { useCustomDomain } = await inquirer.prompt([
    {
      type: "confirm",
      name: "useCustomDomain",
      message: "Do you want to use a custom domain for your backend API? (optional)" +
        " You will need to have an SSL certificate ready in AWS Certificate Manager",
      default: false,
    }
  ]);

  let customDomainConfig: {
    customDomainName?: string;
    certificateArn?: string;
  } = {};

  if (useCustomDomain) {
    customDomainConfig = await inquirer.prompt([
      {
        type: "input",
        name: "customDomainName",
        message: "Enter your backend domain name (e.g., yourdomain.com):",
        validate: (input) => input.trim() ? true : "Domain name is required"
      },
      {
        type: "input", 
        name: "certificateArn",
        message: "Enter your SSL certificate ARN from AWS Certificate Manager:",
        validate: (input) => input.startsWith("arn:aws:acm:") ? true : "Invalid certificate ARN"     
      }
    ]);
  }

  const frontendConfig = await inquirer.prompt([
    {
      type: "input",
      name: "projectName",
      message: "Project name for your application:",
      default: "my-pendulum-app",
      validate: (input: string) => {
        if (!input.trim()) {
          return "Project name is required";
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
    frontendConfig.frontendBuildPath
  );

  return { ...frontendConfig, ...customDomainConfig };
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

  try {
    const fs = await import("fs/promises");
    await fs.access(resolve(cliPath, "package.json"));
    await fs.access(resolve(cliPath, "lib"));
  } catch (error) {
    console.log(chalk.red("Pendulum project not found!"));
    console.log(chalk.yellow("Run 'pendulum init' to set up your project."));
    return;
  }

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "This will deploy Pendulum to AWS using CDK. Continue?",
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow("Deployment cancelled."));
    return;
  }

  const { awsAccountId, awsRegion } = await getAWSConfiguration();
  const frontendConfig = await getFrontendConfiguration();

  const deploymentSummary = [
    `Account: ${awsAccountId.trim()}`,
    `Region: ${awsRegion}`,
    `Project: ${frontendConfig.projectName}`,
    `Custom Domain: ${frontendConfig.customDomainName ||
      'No (will use CloudFront domain)'}`
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

    // First, get the expected URLs to inject into frontend before deployment
    const expectedApiUrl = frontendConfig.customDomainName 
      ? `https://${frontendConfig.customDomainName}/pendulum`
      : 'https://CLOUDFRONT_DOMAIN/pendulum'; // Will be replaced after deployment

    const expectedEventsUrl = frontendConfig.customDomainName
      ? `https://${frontendConfig.customDomainName}/pendulum-events`
      : 'https://CLOUDFRONT_DOMAIN/pendulum-events'; // Will be replaced after deployment

    // Inject environment variables into frontend build before deployment
    if (!frontendConfig.customDomainName) {
      console.log(chalk.yellow("⚠️  Using CloudFront domain - URLs will be updated after deployment"));
    } else {
      await injectEnvironmentVariables(
        frontendConfig.frontendBuildPath,
        expectedApiUrl,
        expectedEventsUrl,
      );
    }

    await deployStacks(cliPath, awsAccountId.trim(), awsRegion, frontendConfig);

    // Get actual deployment URLs
    const { appUrl, backendApiUrl, eventsUrl } = await getDeploymentUrls(awsRegion);

    // If we used CloudFront domain, update the frontend with actual URLs
    if (!frontendConfig.customDomainName && appUrl) {
      const actualApiUrl = `${appUrl}/pendulum`;
      const actualEventsUrl = `${appUrl}/pendulum-events`;
      
      await injectEnvironmentVariables(
        frontendConfig.frontendBuildPath,
        actualApiUrl,
        actualEventsUrl,
      );

      // Redeploy only the ApplicationStack to update frontend with correct URLs
      const spinner = ora("Updating frontend with actual CloudFront URLs...").start();
      try {
        await runCommand(
          "npx",
          [
            "cdk",
            "deploy",
            "Pendulum-ApplicationStack",
            "--require-approval",
            "never",
            "--ci",
          ],
          {
            cwd: cliPath,
            env: {
              ...process.env,
              CDK_DEFAULT_ACCOUNT: awsAccountId.trim(),
              CDK_DEFAULT_REGION: awsRegion,
              PROJECT_NAME: frontendConfig.projectName,
              FRONTEND_BUILD_PATH: frontendConfig.frontendBuildPath,
              CUSTOM_DOMAIN_NAME: frontendConfig.customDomainName || "",
              CERTIFICATE_ARN: frontendConfig.certificateArn || "",
            },
            stdio: ["inherit", "ignore", "inherit"],
          }
        );
        spinner.succeed("Frontend updated with correct URLs");
      } catch (error) {
        spinner.warn("Frontend URL update failed - manually update if needed");
      }
    }

    const adminKey = await getAdminApiKey(awsRegion);

    console.log(chalk.green("\n🎉 Pendulum successfully deployed to AWS!"));
    console.log(chalk.blue("\n📋 Deployment Information:"));
    console.log(` Account: ${awsAccountId.trim()}`);
    console.log(` Region: ${awsRegion}`);
    console.log(`   Backend API: ${appUrl}`);
    console.log(`   Events URL: ${eventsUrl}`);

    if (appUrl) {
      console.log(chalk.blue("\n🌐 Application URLs:"));
      console.log(`  Frontend: ${appUrl}`);
      console.log(`  Backend API: ${backendApiUrl || appUrl + '/pendulum'}`);
      console.log(`  Events: ${eventsUrl || appUrl + '/pendulum-events'}`);
    }

    if (adminKey) {
      console.log(chalk.cyan("\n🔑 Admin Dashboard Access:"));
      console.log(chalk.bgBlack(chalk.white(`   Admin Key: ${adminKey}`)));
      console.log(chalk.yellow("   ⚠️  Save this key securely - you'll need it to access the dashboard!"));
    }

    console.log(chalk.blue("\n🚀 Access Your Deployment:"));
    console.log(" Backend: Check CloudFormation outputs for ALB URL");
    console.log(" Frontend: Check CloudFormation outputs for CloudFront URL");
    console.log("");
    console.log(chalk.blue("Next Steps:"));
    if (adminKey) {
      console.log("1. Save your admin key from above");
      console.log("2. Your frontend is live and connected to your backend!");
      console.log("3. Access the dashboard using your admin key");
      console.log("4. API calls to /api/* & /auth/* are automatically proxied");
    } else {
      console.log("1. Check AWS CloudFormation console for your stack outputs");
      console.log("2. Your frontend is live and connected to your backend!");
      console.log("3. API calls to /api/* & /auth/* are automatically proxied");
      console.log("4. Check AWS Secrets Manager for 'AdminApiKey' to access dashboard");
    }
    console.log("");
    console.log(chalk.gray("To update deployment, rerun 'pendulum deploy'"));

    if (!adminKey) {
      console.log(chalk.yellow("\n⚠️  Admin key could not be retrieved automatically."));
      console.log("Check AWS Secrets Manager in your console for 'AdminApiKey'");
    }

  } catch (error) {
    console.error(chalk.red("Deployment failed:"), error);
    console.log(chalk.yellow("\nTroubleshooting tips:"));
    console.log("- Ensure AWS credentials are configured (aws configure)");
    console.log("- Verify your AWS account ID and region are correct");
    console.log("- Check that you have sufficient AWS permissions");
    console.log("- Ensure AWS CDK is installed globally: npm install -g aws-cdk");
    console.log("- Ensure Docker is running (required for CDK deployment)");
    console.log("- Verify your frontend build path is correct");
    console.log("- Ensure your frontend project was built successfully");
    console.log("- Check AWS DocumentDB cluster is healthy");
    process.exit(1);
  }
};
