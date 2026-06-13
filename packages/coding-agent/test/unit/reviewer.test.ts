import { describe, expect, it } from 'vitest';
import { createReviewer } from '../../src/reviewer/reviewer.js';

describe('reviewer role', () => {
  it('approves passing verification and requests changes on failures', async () => {
    const reviewer = createReviewer({
      runCommand: async (command) => ({ command, exitCode: command.includes('fail') ? 1 : 0, stdout: '', stderr: '' }),
    });

    await expect(reviewer.review({ commands: ['pnpm test'] })).resolves.toMatchObject({ status: 'approve' });
    await expect(reviewer.review({ commands: ['pnpm fail'] })).resolves.toMatchObject({ status: 'request_changes' });
  });

  it('cannot modify production files', async () => {
    const reviewer = createReviewer({ runCommand: async () => ({ command: 'noop', exitCode: 0, stdout: '', stderr: '' }) });
    await expect(reviewer.writeFile('src/app.ts', 'change')).rejects.toThrow(/reviewer cannot modify files/);
  });

  it('runs every command and reports the full details list', async () => {
    const seen: string[] = [];
    const reviewer = createReviewer({
      runCommand: async (command) => {
        seen.push(command);
        return { command, exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const result = await reviewer.review({ commands: ['a', 'b', 'c'] });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result.details).toHaveLength(3);
  });
});
