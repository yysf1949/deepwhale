/**
 * Researcher role — v4.0 (D-33.6.1)
 *
 * Read-only exploration: can read files and search code, cannot write files or
 * run production actions. Output is an `Observation` consumed by Planner or
 * Reviewer. Per master plan §Stage 6: "Researcher, TaskGraph, Persistent
 * Memory, Desktop, and Channels remain stopped if Gate-2 fails" — the
 * Researcher is shipped now but wired in only when Gate-2 is green.
 */

export type ObservationSource = 'codebase' | 'web' | 'compaction';

export interface ResearcherObservation {
  readonly source: ObservationSource;
  readonly path?: string;
  readonly query?: string;
  readonly rawData: string;
  readonly timestamp: number;
}

export type ReadFileFn = (path: string) => Promise<string>;
export type SearchFn = (query: string) => Promise<ReadonlyArray<{ path: string; snippet: string }>>;

export interface Researcher {
  inspectFile(path: string): Promise<ResearcherObservation>;
  search(query: string): Promise<ResearcherObservation>;
  writeFile(path: string, content: string): Promise<void>;
  runCommand(command: string): Promise<void>;
}

export interface CreateResearcherOptions {
  readonly readFile: ReadFileFn;
  readonly search?: SearchFn;
}

export function createResearcher(opts: CreateResearcherOptions): Researcher {
  return {
    async inspectFile(path) {
      const rawData = await opts.readFile(path);
      return { source: 'codebase', path, rawData, timestamp: Date.now() };
    },
    async search(query) {
      if (!opts.search) {
        return { source: 'codebase', query, rawData: '', timestamp: Date.now() };
      }
      const hits = await opts.search(query);
      return {
        source: 'codebase',
        query,
        rawData: hits.map((h) => `${h.path}: ${h.snippet}`).join('\n'),
        timestamp: Date.now(),
      };
    },
    async writeFile(_path, _content) {
      throw new Error('researcher cannot modify files');
    },
    async runCommand(_command) {
      throw new Error('researcher cannot execute commands');
    },
  };
}
