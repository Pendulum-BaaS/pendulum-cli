import chalk from "chalk";
import inquirer from "inquirer";
import { writeFile, mkdir } from "fs/promises";
import { resolve } from "path";

interface InitOptions {
	name?: string;
}

export async function InitCommand(options: InitOptions) {
	console.log(chalk.blue("⏰ Initializing new Pendulum project..."));

	const answers = await inquirer.prompt([
		{
			type: "input",
			name: "projectName",
			message: "Project name:",
			default: options.name,
		},
		{
			type: "list",
			name: "template",
			message: "Choose a template:",
			choices: [
				{ name: "React + JavaScript", value: "react-js" },
				{ name: "React + TypeScript", value: "react-ts" },
				{ name: "Vanilla JavaScript", value: "vanilla" },
			],
		},
	]);

	try {
		await mkdir(answers.projectName, { recursive: true });

		const packageJson = {
			name: answers.projectName,
			version: "1.0.0",
			// sets scripts to run pendulum commands
			scripts: {
				dev: "pendulum dev",
				deploy: "pendulum deploy",
			},
			dependencies: {
				"@pendulum/sdk": "^1.0.0",
			},
		};

		await writeFile(
			resolve(answers.projectName, "package.json"),
			JSON.stringify(packageJson, null, 2),
		);

		console.log(chalk.green(`✅ Created ${answers.projectName}`));
		console.log(chalk.blue("Next steps:"));
		console.log(`  cd ${answers.projectName}`);
		console.log("  npm install");
		console.log("  npm run dev");
	} catch (error) {
		console.error(chalk.red("Failed to create project:"), error);
		process.exit(1);
	}
}
