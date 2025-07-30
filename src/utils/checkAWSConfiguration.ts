import ora from "ora";
import { runCommand } from "./runCommand";

export async function checkAWSConfiguration() {
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
};
