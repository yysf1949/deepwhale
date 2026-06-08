import { describe, expect, it } from 'vitest';
import { FindReferencesTool } from '../../src/tools/find-references.js';
import { CallGraphTool } from '../../src/tools/call-graph.js';
import { SmartSearchTool } from '../../src/tools/smart-search.js';
import { RenameSymbolTool } from '../../src/tools/rename-symbol.js';

describe('code-intel tool descriptions', () => {
  it('label non-IDE-grade code-intel behavior as heuristic', () => {
    for (const tool of [
      new FindReferencesTool(),
      new CallGraphTool(),
      new SmartSearchTool(),
      new RenameSymbolTool(),
    ]) {
      expect(tool.description).toMatch(/heuristic/i);
      expect(tool.description).toMatch(/not IDE-grade|no type analysis|not IDE-grade\/type-aware/i);
    }
  });
});
