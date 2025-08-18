import { checkAWSConfiguration } from '../utils/checkAWSConfiguration';
import { runCommand } from '../utils/runCommand';

// mock dependencies
jest.mock('../utils/runCommand');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('checkAWSConfiguration - Happy Path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates AWS credentials successfully', async () => {
    // mock successful AWS CLI call
    mockRunCommand.mockResolvedValue();

    await expect(checkAWSConfiguration()).resolves.toBeUndefined();

    expect(mockRunCommand).toHaveBeenCalledWith('aws', ['sts', 'get-caller-identity'], {
      cwd: process.cwd(),
    });
  });

  it('handles AWS credentials not configured', async () => {
    mockRunCommand.mockRejectedValue(new Error('AWS CLI not configured'));

    await expect(checkAWSConfiguration()).rejects.toThrow(
      'Run \'aws configure\' to set up your AWS credentials'
    );

    expect(mockRunCommand).toHaveBeenCalledWith('aws', ['sts', 'get-caller-identity'], {
      cwd: process.cwd(),
    });
  });

  it('handles AWS CLI not installed', async () => {
    mockRunCommand.mockRejectedValue(new Error('ENOENT: aws command not found'));

    await expect(checkAWSConfiguration()).rejects.toThrow(
      'Run \'aws configure\' to set up your AWS credentials'
    );
  });

  it('handles network connectivity issues', async () => {
    mockRunCommand.mockRejectedValue(new Error('Network timeout'));

    await expect(checkAWSConfiguration()).rejects.toThrow(
      'Run \'aws configure\' to set up your AWS credentials'
    );
  });
});
