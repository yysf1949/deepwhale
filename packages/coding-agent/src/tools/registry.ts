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
import { ReadFileTool } from './read-file.js';
import { WriteFileTool } from './write-file.js';
import { EditFileTool } from './edit-file.js';
import { BashTool } from './bash.js';
import { FindTool } from './find.js';
import { GrepTool } from './grep.js';

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

/** 默认 6 工具的 registry 工厂 */
export function createDefaultRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register(new ReadFileTool());
  reg.register(new WriteFileTool());
  reg.register(new EditFileTool());
  reg.register(new BashTool());
  reg.register(new FindTool());
  reg.register(new GrepTool());
  return reg;
}
