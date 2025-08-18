jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

import { InitCommand } from '../commands/init';
import { runCommand } from '../utils/runCommand';
import inquirer from 'inquirer';
import path from 'path';

// mock dependencies
jest.mock('../utils/runCommand');
jest.mock('inquirer');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));
jest.mock('path');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockInquirer = inquirer as jest.Mocked<typeof inquirer>;
const mockPath = path as jest.Mocked<typeof path>;

describe('InitCommand - Happy Path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // setup default mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    
    // Setup fs/promises mocks
    const fsPromises = require('fs/promises');
    fsPromises.readFile.mockResolvedValue('{"scripts": {}}');
    fsPromises.writeFile.mockResolvedValue(undefined);
    
    jest.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  it('successfully initializes a new project', async () => {
    // user confirms setup
    mockInquirer.prompt.mockResolvedValue({ proceed: true });
    
    // packages install successfully
    mockRunCommand.mockResolvedValue();

    // mock process.exit to capture but not actually exit
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });

    await InitCommand();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockInquirer.prompt).toHaveBeenCalled();
    expect(mockRunCommand).toHaveBeenCalledWith('npm', ['install', '@pendulum-baas/sdk'], {
      cwd: '/test/project',
    });
    expect(mockRunCommand).toHaveBeenCalledWith('npm', ['install', '@pendulum-baas/core'], {
      cwd: '/test/project',
    });

    exitSpy.mockRestore();
  });

  it('handles user cancellation', async () => {
    // user declines setup
    mockInquirer.prompt.mockResolvedValue({ proceed: false });

    await InitCommand();

    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('adds npm scripts to package.json', async () => {
    mockInquirer.prompt.mockResolvedValue({ proceed: true });
    mockRunCommand.mockResolvedValue();

    // mock process.exit 
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });

    await InitCommand();

    expect(exitSpy).not.toHaveBeenCalled();
    
    const fsPromises = require('fs/promises');
    const writeCall = fsPromises.writeFile.mock.calls[0];
    const writtenContent = JSON.parse(writeCall[1]);
    
    expect(writtenContent.scripts['pendulum-backend:start']).toBeDefined();
    expect(writtenContent.scripts['pendulum-backend:stop']).toBeDefined();

    exitSpy.mockRestore();
  });
});
