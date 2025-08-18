// test/utils/runCommand.test.ts
import { runCommand } from '../../src/utils/runCommand';
import { spawn } from 'child_process';

// mock child_process.spawn
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('runCommand - Happy Path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes commands successfully', async () => {
    const mockProc = {
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10); // success
        }
      }),
    } as any;

    mockSpawn.mockReturnValue(mockProc);

    await expect(runCommand('npm', ['install'])).resolves.toBeUndefined();
    
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install'], {
      stdio: ['inherit', 'ignore', 'inherit']
    });
  });

  it('handles command failures', async () => {
    const mockProc = {
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10); // failure
        }
      }),
    } as any;

    mockSpawn.mockReturnValue(mockProc);

    await expect(runCommand('invalid-command', [])).rejects.toThrow(
      'Command failed with exit code 1'
    );
  });

  it('passes custom options correctly', async () => {
    const mockProc = {
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
    } as any;

    mockSpawn.mockReturnValue(mockProc);

    await runCommand('docker', ['compose', 'up'], { cwd: '/test/path' });
    
    expect(mockSpawn).toHaveBeenCalledWith('docker', ['compose', 'up'], {
      stdio: ['inherit', 'ignore', 'inherit'],
      cwd: '/test/path'
    });
  });

  it('handles process errors when command not found', async () => {
    const mockProc = {
      on: jest.fn((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('ENOENT: command not found')), 10);
        }
      }),
    } as any;

    mockSpawn.mockReturnValue(mockProc);

    await expect(runCommand('nonexistent-cmd', [])).rejects.toThrow('ENOENT: command not found');
  });

  it('handles different exit codes for specific failures', async () => {
    const mockProc = {
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(127), 10); // command not found exit code
        }
      }),
    } as any;

    mockSpawn.mockReturnValue(mockProc);

    await expect(runCommand('aws', ['--version'])).rejects.toThrow(
      'Command failed with exit code 127'
    );
  });
});
