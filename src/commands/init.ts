import chalk from "chalk";
import inquirer from "inquirer";
import { spawn } from "child_process";
import ora from "ora";

export async function InitCommand() {
	console.log(chalk.blue("⏰ Initializing new Pendulum project..."));

	const { proceed } = await inquirer.prompt([
		{
			type: "confirm",
			name: "proceed",
			message:
				"This will create a 'pendulum' directory with the backend code. Wish to continue?",
			default: true,
		},
	]);

	if (!proceed) {
		console.log(chalk.yellow("Setup cancelled."));
		return;
	}

	const projectPath = process.cwd();

	/*
	1. Copy pendulum core backend to ./pendulum dir
	2. Install backend dependencies
	3. Create package.json file in cwd with pendulum scripts
	*/

	try {
		await addPendulumBackend(projectPath);

		console.log(chalk.green("\n Pendulum backend setup complete!"));
		console.log(chalk.blue("Next steps:"));
		console.log("    pendulum dev           # start pendulum backend\n");
		console.log(chalk.blue("Development backend will be available at:"));
		console.log("   🧑‍💻 apiUrl: http://localhost:3000");
		console.log("   🔁 eventsUrl: http://localhost:8080/events\n");
		console.log(
			chalk.gray("Initialize your frontend however you like, then use:"),
		);
		console.log(chalk.gray("    cd frontend-dir && npm install @pendulum/sdk"));
	} catch (error) {
		console.error(chalk.red("Failed to initialize project:"), error);
		process.exit(1);
	}
}

async function addPendulumBackend(projectPath: string) {
	const spinner = ora("Cloning Pendulum backend from GitHub...").start();

	try {
		await runCommand(
			"git",
			["clone", "https://github.com/Pendulum-BaaS/pendulum.git"],
			{
				cwd: projectPath,
			},
		);

		spinner.succeed("Pendulum backend cloned");
	} catch (error) {
		spinner.fail("Failed to clone Pendulum backend");
		throw error;
	}
}

function runCommand(
	command: string,
	args: string[],
	options: any = {},
): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			stdio: "inherit",
			...options,
		});

		proc.on("close", (code) => {
			code === 0
				? resolve()
				: reject(new Error(`Command failed with exit code ${code}`));
		});

		proc.on("error", reject);
	});
}
