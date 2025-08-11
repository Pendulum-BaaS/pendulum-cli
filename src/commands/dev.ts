import chalk from "chalk";
import ora from "ora";
import { runCommand } from "../utils/runCommand";
import { resolve, join } from "path";
import { existsSync, copyFileSync } from "fs";

export async function DevCommand() {
  const spinner = ora("Starting Pendulum backend...").start();

  const projectPath = process.cwd();
  const envPath = join(projectPath, ".env");
  const corePackagePath = resolve(
    projectPath,
    "node_modules",
    "@pendulum-baas",
    "core",
  );
  const coreEnvPath = join(corePackagePath, ".env");

  try {
    if (existsSync(envPath)) {
      copyFileSync(envPath, coreEnvPath);
    }

    await runCommand("docker", ["compose", "up", "--build", "-d"], {
      cwd: corePackagePath,
    });

    spinner.succeed("Pendulum backend successfully started!");
    console.log(chalk.blue("Pendulum backend info:"));
    console.log("");
    console.log(chalk.blue("    apiurl: http://localhost:3000"));
    console.log(chalk.blue("    eventsUrl: http://localhost:8080/events"));
    console.log("");
    console.log(
      chalk.blue("To connect your frontend to the Pendulum backend:"),
    );
    console.log(
      chalk.blue("import it into your top-level frontend file with:"),
    );
    console.log(
      chalk.blue("    import { PendulumClient } from '@pendulum-baas/sdk`;"),
    );
    console.log("");
    console.log(
      chalk.blue("View your admin dashboard at http://localhost:3000/admin"),
    );
  } catch (error) {
    spinner.fail(`Error starting the Pendulum backend: ${error}`);
    process.exit(1);
  }
}
