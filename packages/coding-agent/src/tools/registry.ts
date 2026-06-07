/**
 * Tool Registry — 6 工具的注册中心
 *
 * Sprint 0.2 范围：
 * - register / get / list 基础 API
 * - 默认注册全部 6 工具
 * - name 重名启动时检测（pi #5316 教训）
 *
 * Sprint 1+ 扩展：
 * - MCP / Plugin / Skill 注册入口（v1.5/v2.0）
 * - 风险评级聚合（StormBreaker 用）
 */

import type { Tool, ToolName } from '../types.js';
import type { SandboxRunner } from '../sandbox/types.js';
import { ReadFileTool } from './read-file.js';
import { WriteFileTool } from './write-file.js';
import { EditFileTool } from './edit-file.js';
import { BashTool } from './bash.js';
import { FindTool } from './find.js';
import { GrepTool } from './grep.js';
import { LocalSandboxRunner } from '../sandbox/local-runner.js';
import { WebSearchTool } from './web-search.js'; // D-30.1γ.4 (2026-06-07): web tool
import { WebExtractTool } from './web-extract.js'; // D-30.1γ.4
import { BrowserNavigateTool } from './browser-navigate.js'; // D-30.1γ.4
import { PatchTool } from './patch.js'; // D-30.2.3 (2026-06-07): find/replace unique string
import { SearchFilesTool } from './search-files.js'; // D-30.2.4: ripgrep 搜索
import { ExecuteCodeTool } from './execute-code.js'; // D-30.2.5: python/node sandbox
import { TodoTool } from './todo.js'; // D-30.2.6: todo store
import { PlanTool } from './plan.js'; // D-30.2.7: plan mode
import { DelegateTaskTool } from './delegate-task.js'; // D-30.3.1: subagent 并行 max 5

export class ToolRegistry {
  private tools = new Map<ToolName, Tool>();

  /** 注册工具，重名抛错（pi #5316 教训） */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool name collision: '${tool.name}' already registered. ` +
          `Extension tool 重名启动时检测（pi #5316 教训）`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  get(name: ToolName | string): Tool | undefined {
    return this.tools.get(name as ToolName);
  }

  /** 严格获取 — 不存在抛错（v1.0 tool 路由用） */
  require(name: ToolName | string): Tool {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: '${name}'`);
    }
    return tool;
  }

  list(): ReadonlyArray<Tool> {
    return Array.from(this.tools.values());
  }

  size(): number {
    return this.tools.size;
  }
}

/** Sprint 1c-revive-3-D-12 review P1 修复: 显式注入 sandboxRunner. */
export interface CreateDefaultRegistryOptions {
  /** 注入 BashTool 的 SandboxRunner. 不传 = LocalSandboxRunner (v1.0 行为). */
  readonly sandboxRunner?: SandboxRunner;
}

/**
 * 默认 6 工具的 registry 工厂
 *
 * Sprint 1c-revive-3-D-12 review P1 修复 (2026-06-05): 加 `sandboxRunner` 显式参数.
 * 之前 `new BashTool()` 走默认 LocalSandboxRunner, `DEEPWHALE_SANDBOX=docker` 解析
 * 出的 DockerSandboxRunner 不会进 tool loop. 修法: mode 调用点从 env 解析 runner 后
 * 显式传入, 工具注册表跟 env 状态对齐.
 */
export function createDefaultRegistry(options: CreateDefaultRegistryOptions = {}): ToolRegistry {
  const reg = new ToolRegistry();
  const runner = options.sandboxRunner ?? new LocalSandboxRunner();
  reg.register(new ReadFileTool());
  reg.register(new WriteFileTool());
  reg.register(new EditFileTool());
  reg.register(new BashTool(runner));
  reg.register(new FindTool());
  reg.register(new GrepTool());
  // D-30.1γ.4 (2026-06-07): 装 3 web tools. 跟 6 工具同形态 (read-only, low risk).
  reg.register(new WebSearchTool());
  reg.register(new WebExtractTool());
  reg.register(new BrowserNavigateTool());
  // D-30.2 (2026-06-07): 装 5 新工具 — patch (medium) + search_files (low) + execute_code
  // (medium) + todo (low) + plan (low). 跟 9 工具 1:1 同形态 (先 register).
  reg.register(new PatchTool());
  reg.register(new SearchFilesTool());
  reg.register(new ExecuteCodeTool());
  reg.register(new TodoTool());
  reg.register(new PlanTool());
  // D-30.3.1 (2026-06-07): 装 delegate_task (medium) — subagent 并行 max 5.
  reg.register(new DelegateTaskTool());
  return reg;
}
