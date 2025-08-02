import chalk from "chalk";
import ora from "ora";
import { runCommand } from "../utils/runCommand";
import { resolve, join } from "path";
import { existsSync, copyFileSync } from "fs";

/*
`pendulum dev`, when run from the root directory should do the following (happy path):
1. run `docker compose up -d` from within the cwd's `pendulum` directory
2. display success message and the apiUrl & eventsUrl
3. instruct user on how to install sdk in frontend with new endpoint URLs
*/

export async function DevCommand() {
  const spinner = ora("Starting Pendulum backend...").start();

  const projectPath = process.cwd();
  console.log(projectPath);
  const envPath = join(projectPath, ".env");
  console.log(envPath);
  const corePackagePath = resolve(projectPath, "node_modules", "@pendulum", "core");
  console.log(corePackagePath);
  const coreEnvPath = join(corePackagePath, ".env");
  console.log(coreEnvPath);

  try {
      console.log('test1');

    if (existsSync(envPath)) {
      console.log('test2');
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
      chalk.blue("To connect your frontend to the Pendulum backend, run:"),
    );
    console.log(chalk.blue("    npm install @pendulum/sdk"));
    console.log(
      chalk.blue("then import it into your top-level frontend file with:"),
    );
    console.log(
      chalk.blue("    import { PendulumClient } from '@pendulum/sdk`;"),
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
