import { getAWSConfiguration } from '../utils/getAWSConfiguration';
import inquirer from 'inquirer';

jest.mock('inquirer');
const mockInquirer = inquirer as jest.Mocked<typeof inquirer>;

describe('getAWSConfiguration - Happy Path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prompts user for AWS account ID and region', async () => {
    mockInquirer.prompt.mockResolvedValue({
      awsAccountId: '123456789012',
      awsRegion: 'us-east-1'
    });

    const result = await getAWSConfiguration();

    expect(result).toEqual({
      awsAccountId: '123456789012',
      awsRegion: 'us-east-1'
    });

    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      {
        type: 'input',
        name: 'awsAccountId',
        message: 'Enter your AWS Account ID:',
        validate: expect.any(Function)
      },
      {
        type: 'list',
        name: 'awsRegion',
        message: 'Select your AWS region:',
        choices: expect.arrayContaining([
          { name: 'US East (N. Virginia) - us-east-1', value: 'us-east-1' },
          { name: 'Europe (Ireland) - eu-west-1', value: 'eu-west-1' },
          { name: 'Asia Pacific (Tokyo) - ap-northeast-1', value: 'ap-northeast-1' }
        ]),
        default: 'us-east-1'
      }
    ]);
  });

  it('validates AWS account ID correctly', async () => {
    mockInquirer.prompt.mockResolvedValue({
      awsAccountId: '123456789012',
      awsRegion: 'us-west-2'
    });

    await getAWSConfiguration();

    // get the validation function from the prompt call
    const promptArgs = mockInquirer.prompt.mock.calls[0][0];
    const accountIdPrompt = Array.isArray(promptArgs) ? promptArgs[0] : promptArgs;
    const validateFn = accountIdPrompt.validate;

    // test valid account ID
    expect(validateFn('123456789012')).toBe(true);
    expect(validateFn('  123456789012  ')).toBe(true); // with whitespace

    // test invalid account IDs
    expect(validateFn('')).toBe('AWS Account ID is required');
    expect(validateFn('   ')).toBe('AWS Account ID is required');
    expect(validateFn('12345')).toBe('AWS Account ID must be exactly 12 digits');
    expect(validateFn('1234567890123')).toBe('AWS Account ID must be exactly 12 digits');
    expect(validateFn('abcd12345678')).toBe('AWS Account ID must be exactly 12 digits');
    expect(validateFn('123-456-789-012')).toBe('AWS Account ID must be exactly 12 digits');
  });

  it('includes all major AWS regions', async () => {
    mockInquirer.prompt.mockResolvedValue({
      awsAccountId: '123456789012',
      awsRegion: 'eu-central-1'
    });

    await getAWSConfiguration();

    const promptArgs = mockInquirer.prompt.mock.calls[0][0];
    const regionPrompt = Array.isArray(promptArgs) ? promptArgs[1] : promptArgs;
    const choices = regionPrompt.choices;

    const regionValues = choices.map((choice: any) => choice.value);
    expect(regionValues).toContain('us-east-1');
    expect(regionValues).toContain('us-west-2');
    expect(regionValues).toContain('eu-west-1');
    expect(regionValues).toContain('eu-central-1');
    expect(regionValues).toContain('ap-northeast-1');
    expect(regionValues).toContain('ap-southeast-1');
  });

  it('sets us-east-1 as default region', async () => {
    mockInquirer.prompt.mockResolvedValue({
      awsAccountId: '123456789012',
      awsRegion: 'us-east-1'
    });

    await getAWSConfiguration();

    const promptArgs = mockInquirer.prompt.mock.calls[0][0];
    const regionPrompt = Array.isArray(promptArgs) ? promptArgs[1] : promptArgs;
    
    expect(regionPrompt.default).toBe('us-east-1');
  });

  it('handles different region selections', async () => {
    mockInquirer.prompt.mockResolvedValue({
      awsAccountId: '987654321098',
      awsRegion: 'eu-west-1'
    });

    const result = await getAWSConfiguration();

    expect(result.awsRegion).toBe('eu-west-1');
    expect(result.awsAccountId).toBe('987654321098');
  });
});
