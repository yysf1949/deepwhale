/**
 * Reviewer role — v3.0 (D-33.5.1)
 *
 * Verification-only role: runs shell commands, decides approve / request_changes.
 * CANNOT modify files. Caller is responsible for wiring the Reviewer into the
 * tool-loop policy.
 */

export type ReviewStatus = 'approve' | 'request_changes';

export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type RunCommandFn = (command: string) => Promise<CommandResult>;

export interface ReviewInput {
  readonly commands: ReadonlyArray<string>;
}

export interface ReviewResult {
  readonly status: ReviewStatus;
  readonly details: ReadonlyArray<CommandResult>;
}

export interface Reviewer {
  review(input: ReviewInput): Promise<ReviewResult>;
  writeFile(path: string, content: string): Promise<void>;
}

export interface CreateReviewerOptions {
  readonly runCommand: RunCommandFn;
}

export function createReviewer(opts: CreateReviewerOptions): Reviewer {
  return {
    async review({ commands }) {
      const details: CommandResult[] = [];
      let allPassed = true;
      for (const command of commands) {
        const result = await opts.runCommand(command);
        details.push(result);
        if (result.exitCode !== 0) allPassed = false;
      }
      return { status: allPassed ? 'approve' : 'request_changes', details };
    },
    async writeFile(_path, _content) {
      throw new Error('reviewer cannot modify files');
    },
  };
}
