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
  .action(InitCommand);

program
  .command("dev")
  .description("Start your Pendulum backend for local development")
  .action(DevCommand);

program.parse();
