import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { resolve } from "path";
import { readFile, writeFile } from "fs/promises";
import { runCommand } from "../utils/runCommand";
import path from "path";

export async function InitCommand() {
  console.log(chalk.blue("⏰ Initializing new Pendulum project..."));

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message:
        "This will install the necessary packages and add some npm scripts for managing your local Pendulum backend.",
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow("Setup cancelled."));
    return;
  }

  const projectPath = process.cwd();

  try {
    await installPendulumDependencies(projectPath);
    await addNpmScripts(projectPath);

    console.log(chalk.green("\n Pendulum backend setup complete!"));
    console.log(chalk.blue("Next steps:"));
    console.log("    pendulum dev           # start pendulum backend\n");
    console.log(chalk.blue("Development backend will be available at:"));
    console.log("   🧑‍💻 apiUrl: http://localhost:3000");
    console.log("   🔁 eventsUrl: http://localhost:8080/events\n");
    console.log(
      chalk.gray("Initialize your frontend however you like, then use:"),
    );
    console.log(chalk.gray("    npm install @pendulum/sdk"));
  } catch (error) {
    console.error(chalk.red("Failed to initialize project:"), error);
    process.exit(1);
  }
}

async function installPendulumDependencies(projectPath: string) {
  const spinner = ora("Installing Pendulum dependencies...").start();

  try {
    spinner.text = "installing @pendulum/sdk";
    await runCommand("npm", ["install", "@pendulum/sdk"], {
      cwd: projectPath,
    });

    spinner.text = "installing @pendulum/core";
    await runCommand("npm", ["install", "@pendulum/core"], {
      cwd: projectPath,
    });

    spinner.succeed("Pendulum dependencies installed successfully");
  } catch (error) {
    spinner.fail("Failed to install Pendulum dependencies");
    throw error;
  }
}

async function addNpmScripts(projectPath: string) {
  const currentPackageJson = await readFile(
    path.join(projectPath, "package.json"),
    "utf8",
  );

  const currentPackageJsonObj = JSON.parse(currentPackageJson);

  if (!currentPackageJsonObj.scripts) {
    currentPackageJsonObj.scripts = {};
  }

  currentPackageJsonObj.scripts["pendulum-backend:start"] =
    "cd node_modules/@pendulum/core && docker compose start";
  currentPackageJsonObj.scripts["pendulum-backend:stop"] =
    "cd node_modules/@pendulum/core && docker compose stop";

  await writeFile(
    resolve(projectPath, "package.json"),
    JSON.stringify(currentPackageJsonObj, null, 2),
  );
}
