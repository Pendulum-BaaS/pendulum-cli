#!/usr/bin/env node
import { Command } from "commander";
import { InitCommand } from "./commands/init";

const program = new Command();

program
	.name("pendulum")
	.description("CLI to manage and deploy your Pendulum backend")
	.version("1.0.0");

program
	.command("init")
	.description("Initialize a new Pendulum project")
	.option(
		"-n, --name <string>",
		"name for your newly initializes Pendulum project",
		"my-pendulum-app",
	)
	.action(InitCommand);

program.parse();
