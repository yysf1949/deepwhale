# Capability Model 架构

> **本文件范围**：Tool / MCP / Plugin / Browser / Computer Use 的统一抽象。**只定义能力分类、注册、调用契约，不写具体实现 / 不写最终 JSON 格式 / 不选 sqlite/embedding**。

## 1. 核心问题

DeepWhale v1.0-v4.0 会引入 5 种不同的"能力来源"：

- **Tool**：内置工具（bash, read_file, write_file, edit_file, grep, find, symbol_lookup, ...）
- **MCP**：外部 MCP server（stdio / http / sse）
- **Plugin**：用户安装的 .dwp 插件
- **Browser**：Browser Runtime（navigate, click, type, screenshot, ...）
- **Computer Use**：Computer Runtime（mouse, keyboard, screen_capture, ...）

如果不统一抽象，会出现：

- 5 套不同的注册 API
- 5 套不同的权限控制
- 5 套不同的 sandbox 配置
- Agent 调工具时 if-else 链

**Capability Model** = 5 套能力来源的**统一抽象层**。

## 2. Capability 抽象

### 2.1 核心结构

```
Capability {
  id:                string           // 全局唯一标识
  name:              string           // 人类可读名
  description:       string           // 注入 system prompt
  source:            CapabilitySource // tool | mcp | plugin | browser | computer
  input_schema:      Schema           // 参数 schema
  output_schema:     Schema?          // 返回值 schema（可选）
  risk_level:        RiskLevel        // low | medium | high | critical
  requires_approval: bool             // 是否需要用户确认
  sandbox:           SandboxProfile   // 沙箱配置
  timeout_ms:        int              // 默认 30000
  idempotent:        bool             // 是否幂等
  side_effects:      SideEffect[]     // 文件修改 / 网络请求 / GUI 操作
  version:           string           // 语义化版本
}
```

### 2.2 RiskLevel 等级

| 等级         | 含义                           | 默认处理            |
| ------------ | ------------------------------ | ------------------- |
| **low**      | 只读 / 无副作用                | 自动通过            |
| **medium**   | 修改本地文件                   | 提示用户            |
| **high**     | 网络请求 / 进程创建            | 必须确认            |
| **critical** | 删文件 / 远程 shell / GUI 操作 | 必须确认 + 二次确认 |

## 3. Capability Registry

### 3.1 注册时机

| 来源         | 注册时机          | 注册方式                          |
| ------------ | ----------------- | --------------------------------- |
| **Tool**     | 启动时            | 静态注册（import 时声明）         |
| **MCP**      | 启动时 + 动态添加 | stdio 启动 / http 拉 manifest     |
| **Plugin**   | 启动时 + 热加载   | 扫描 `~/.deepwhale/plugins/*.dwp` |
| **Browser**  | 启动时            | Browser Runtime 启动时注册        |
| **Computer** | 启动时            | Computer Runtime 启动时注册       |

### 3.2 唯一性保证

- **id 唯一性**：同 id 注册时启动时报错（参考 pi Extension #5316 教训）
- **冲突解决**：priority 字段决定覆盖顺序（plugin > mcp > tool 默认）
- **未启用 Capability**：保留在 registry 但不暴露给 Agent

### 3.3 动态启用/禁用

- 用户可在 `~/.deepwhale/config.toml` 中禁用某些 capability
- Plugin 可注册到 system prompt 但默认不启用
- `--no-browser` / `--no-computer` 等启动参数

## 4. 调用契约

### 4.1 调用流程

```
Agent 请求调用 capability X
   ↓
[Capability Registry] 查找 X
   ↓
[Risk Check] 检查 risk_level
   ↓
[Approval Gate] 按 requires_approval 决定是否需要用户确认
   ↓
[Sandbox Setup] 按 sandbox profile 准备环境
   ↓
[Execute] 调用底层实现
   ↓
[Output Schema Check] 验证返回值（如果定义了 output_schema）
   ↓
[Observation] 包装为 Observation 返回给 Agent
```

### 4.2 错误处理

| 错误类型               | 行为                    | escalate 到                      |
| ---------------------- | ----------------------- | -------------------------------- |
| **capability 不存在**  | 启动时报错              | 启动失败                         |
| **参数 schema 不匹配** | 立即拒绝                | Planner 重新规划                 |
| **沙箱启动失败**       | 重试 1 次 → 失败        | Planner 重新规划                 |
| **执行超时**           | 立即返回 partial result | Executor 重试或 Planner 重新规划 |
| **执行异常**           | 捕获 + 上报             | Reviewer 反馈 → Planner          |

## 5. Skill 声明格式

Skill 由 Capabilities 组合而成。Skill 声明格式：

```
Skill {
  name:              string
  version:           string
  description:       string
  triggers:          string[]           // 何时自动加载

  capabilities:      CapabilityRef[]   // 声明需要哪些 capability
  tools:             ToolImpl[]         // 自带工具实现
  extensions:        ExtensionHandler[] // 监听 21 个 whale.* 事件
}
```

**Skill 加载时**：

1. 扫描 `skill.yaml` / `SKILL.md` frontmatter
2. 检查 `capabilities:` 声明的每个 capability 是否在 Registry 中
3. 缺失的 capability → Skill 加载失败（明确报错）
4. 全部存在 → Skill 启用

**Skill 卸载时**：

1. 注销自带 tools
2. 注销 extensions
3. **不**注销 capabilities（其他 Skill 可能在用）

## 6. 权限控制

### 6.1 能力声明 vs 能力使用

```
Skill "commit" 声明 capability: ["shell_exec"]
   ↓
但 "shell_exec" 本身的 risk_level = high
   ↓
所以 "commit" 调用时仍需要用户确认
```

**关键原则**：**Skill 不能"提升" capability 的权限**。如果 Skill 调高危能力，必须经用户确认。

### 6.2 用户授权层级

| 层级        | 行为           | 持久化                         |
| ----------- | -------------- | ------------------------------ |
| **Once**    | 单次确认       | 不保存                         |
| **Session** | session 内自动 | 写到 session state             |
| **Project** | 项目级         | 写到 `.deepwhale/trust.json`   |
| **User**    | 全局           | 写到 `~/.deepwhale/trust.json` |

**信任 flag 不在项目目录**（避免恶意仓库诱导用户授权），全部在 `~/.deepwhale/trust.json`（Reasonix 抄 + Hermes 教训）。

## 7. 沙箱配置

```
SandboxProfile {
  mode:              SandboxMode       // docker | process | none
  image?:            string            // Docker image（mode=docker）
  network:           bool              // 是否允许网络
  readonly_rootfs:   bool              // rootfs 只读
  mounts:            MountSpec[]       // 文件挂载
  env:               map               // 环境变量
  timeout_ms:        int
}
```

**v1.0 默认**：mode=docker, network=false, readonly_rootfs=true
**v2.0 Browser**：mode=docker, network=true（Browser 要联网）, readonly_rootfs=true
**v3.0 Computer Use**：mode=docker, network=true, readonly_rootfs=false（GUI 需要写）

## 8. 与现有工具的映射

| 现有工具                        | 映射为                                                            |
| ------------------------------- | ----------------------------------------------------------------- |
| `bash`                          | Capability{ name: "shell_exec", risk: high }                      |
| `read_file`                     | Capability{ name: "read_file", risk: low }                        |
| `write_file`                    | Capability{ name: "write_file", risk: medium }                    |
| `edit_file`                     | Capability{ name: "edit_file", risk: medium }                     |
| `grep`                          | Capability{ name: "grep", risk: low }                             |
| `find`                          | Capability{ name: "find", risk: low }                             |
| `symbol_lookup` (v1.5)          | Capability{ name: "code_intel.symbol_lookup", risk: low }         |
| `semantic_search` (v2.0)        | Capability{ name: "code_intel.semantic_search", risk: low }       |
| Browser `navigate` (v2.0)       | Capability{ name: "browser.navigate", risk: medium }              |
| Browser `click` (v2.0)          | Capability{ name: "browser.click", risk: medium }                 |
| Computer `mouse_click` (v3.0)   | Capability{ name: "computer.mouse_click", risk: critical }        |
| Computer `keyboard_type` (v3.0) | Capability{ name: "computer.keyboard_type", risk: critical }      |
| MCP tool（动态）                | Capability{ name: "mcp.<server>.<tool>", risk: 来自 manifest }    |
| Plugin tool                     | Capability{ name: "plugin.<plugin>.<tool>", risk: 来自 manifest } |

## 9. 版本演进

| 版本     | 引入                                                         |
| -------- | ------------------------------------------------------------ |
| **v1.0** | Tool Runtime（6 个核心工具映射为 Capability）                |
| **v1.5** | Extension API 也能注册 Capability（21 个 whale.\* 事件不变） |
| **v2.0** | MCP server 动态注册为 Capability                             |
| **v2.0** | Browser 7 个 API 映射为 Capability                           |
| **v2.5** | Skill 加载流程正式走 Capability 检查                         |
| **v3.0** | Computer Use 兼容层映射为 Capability                         |
| **v4.0** | Plugin Marketplace 上架的 plugin 全部以 Capability 暴露      |

## 10. 不做的事

- ❌ 不定义具体 JSON 字段名（id 是 string，name 是 string——具体格式由实现层决定）
- ❌ 不选存储后端（Registry 是 in-memory / sqlite / file — 实现层决定）
- ❌ 不定义网络协议（capability 调用是 IPC / RPC — 实现层决定）
- ❌ 不做 capability 自动发现（MCP server discovery 是 MCP 协议自己的事）

## 11. 跨文档引用

- **AGENT_RUNTIME.md §2.1**：Task.subtasks.capability 字段引用本文件
- **ARCHITECTURE.md §2.3**：Runtime Layer 5 个 Runtime 都挂到 Capability Registry
- **ARCHITECTURE.md §4 砍掉清单**：避免 5 套独立抽象（4 套现在合并成 1 套 Capability）
