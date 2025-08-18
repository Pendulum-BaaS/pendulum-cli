import { jest } from '@jest/globals';

// mock console to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// mock child_process spawn for command execution
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// mock fs for file operations
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
  },
}));

// mock path utilities
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  dirname: jest.fn(),
  basename: jest.fn(),
  extname: jest.fn(),
}));

// mock inquirer for user prompts
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

// mock chalk for colored output
jest.mock('chalk', () => ({
  green: jest.fn((text) => text),
  blue: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  red: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  bold: jest.fn((text) => text),
}));

// mock ora loading spinners
jest.mock('ora', () => () => ({
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  text: '',
}));

// mock dotenv for environment variables
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  
  // reset environment variables
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_REGION;
  delete process.env.CDK_DEFAULT_ACCOUNT;
  delete process.env.CDK_DEFAULT_REGION;
});
