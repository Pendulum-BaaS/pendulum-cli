import { spawn } from "child_process";

export function runCommand(
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
