import inquirer from "inquirer";

export async function getAWSConfiguration() {
  return await inquirer.prompt([
    {
      type: "input",
      name: "awsAccountId",
      message: "Enter your AWS Account ID:",
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return "AWS Account ID is required";
        } else if (!/^\d{12}$/.test(input.trim())) { // checks for exactly 12 digits
          return "AWS Account ID must be exactly 12 digits";
        } else {
          return true;
        }
      },
    },
    {
      type: "list",
      name: "awsRegion",
      message: "Select your AWS region:",
      choices: [
        {
          name: "US East (N. Virginia) - us-east-1",
          value: "us-east-1",
        },
        {
          name: "US East (Ohio) - us-east-2",
          value: "us-east-2",
        },
        {
          name: "US West (Oregon) - us-west-2",
          value: "us-west-2",
        },
        {
          name: "US West (N. California) - us-west-1",
          value: "us-west-1",
        },
        {
          name: "Europe (Ireland) - eu-west-1",
          value: "eu-west-1",
        },
        {
          name: "Europe (London) - eu-west-2",
          value: "eu-west-2",
        },
        {
          name: "Europe (Frankfurt) - eu-central-1",
          value: "eu-central-1",
        },
        {
          name: "Asia Pacific (Sydney) - ap-southeast-2",
          value: "ap-southeast-2"
        },
        {
          name: "Asia Pacific (Tokyo) - ap-northeast-1",
          value: "ap-northeast-1",
        },
        {
          name: "Asia Pacific (Singapore) - ap-southeast-1",
          value: "ap-southeast-1",
        },
      ],
      default: "us-east-1",
    },
  ]);
}
