#!/usr/bin/env node
import { Command } from "commander";
import { InitCommand } from "./commands/init";
import { DevCommand } from "./commands/dev";
import { DeployCommand } from "./commands/deploy";
import { DestroyCommand } from "./commands/destroy";

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

program
  .command("deploy")
  .description("Deploy Pendulum backend to AWS")
  .action(DeployCommand);

program
  .command("destroy")
  .description("Destroy Pendulum backend from AWS")
  .action(DestroyCommand);

program.parse();
