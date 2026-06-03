# Agent Runtime 架构

> **本文件范围**：4 角色（Planner / Executor / Reviewer / Researcher）之间的运行时契约。**只定义边界 / 职责 / 接口 / 数据流，不写实现细节**（不写具体类、文件路径、import）。

## 1. 角色与责任

| 角色 | 出现版本 | 核心职责 | 不做的事 |
|---|---|---|---|
| **Executor** | v1.0 | 调用工具执行具体动作（读文件、跑命令、调用 Browser/Computer Use） | 不拆任务、不验证、不规划 |
| **Planner** | v2.5 | 接收用户任务 → 输出 Task DAG | 不执行任何工具（**Execution Boundary**） |
| **Reviewer** | v3.0 | 接收 Executor/Planner 输出 → 验证 / 反馈 / 拒绝 | 不执行生产性动作（只跑 test/lint/compare） |
| **Researcher** | v4.0 | 信息收集、Codebase 探索、上下文检索 | 不修改文件、不调用生产工具 |

**核心约束**：
- **Execution Boundary**：Planner 不执行 / Executor 不规划
- **单向数据流**：Planner → Executor → Reviewer（Reviewer 反馈 Planner，Planner 决定下一步）
- **单 process 内 4 函数**：v4.0 不 spawn 4 个 Agent，是 1 process 内的 4 个 role 切换

## 2. 核心数据结构

> **本节只定义 shape，不写具体类型语言**

### 2.1 Task（任务）

```
Task {
  id:                string         // 唯一标识
  goal:              string         // 任务目标（自然语言）
  subtasks:          Subtask[]      // 子任务列表（v2.5 Planner 填）
  depends_on:        TaskId[]       // 依赖的其他 Task
  status:            TaskStatus     // pending | ready | running | done | failed | blocked
  result:            TaskResult?    // 执行结果
  created_at:        timestamp
  started_at:        timestamp?
  finished_at:       timestamp?
  retry_count:       int            // 失败重试次数
  max_retries:       int            // 默认 3
}

Subtask {
  id:                string
  description:       string
  capability:        CapabilityId  // 调用哪个 Capability
  args:              map
  depends_on:        SubtaskId[]    // 子任务间依赖
}

TaskStatus = pending | ready | running | done | failed | blocked
```

### 2.2 Message（消息）

```
Message {
  id:                string
  role:              Role           // user | assistant | tool | system
  content:           ContentBlock[] // 多模态内容
  task_ref:          TaskId?        // 关联到哪个 Task
  created_at:        timestamp
}

ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock | ObservationBlock
```

### 2.3 Context（上下文）

```
Context {
  session_id:        SessionId
  messages:          Message[]      // 消息历史
  short_memory:      Memory[]       // 当前 session 活跃 memory
  tool_registry:     CapabilityRef[]
  budget:            TokenBudget    // 当前剩余 token
  cache_state:       CacheState     // prefix-cache 命中状态
}
```

### 2.4 Observation（观察）

```
Observation {
  source:            ObservationSource  // browser | computer | tool | environment
  url?:              string             // browser 才有
  title?:            string             // browser 才有
  dom_summary?:      string             // browser DOM 概要
  visible_elements?: Element[]         // browser 视觉元素列表
  screenshots?:      ImageRef[]         // 截图引用
  action_history?:   Action[]           // 已执行的动作历史
  raw_data?:         any                // 原始数据（tool result / env state）
  captured_at:       timestamp
}

Action {
  id:                string
  type:              ActionType         // click | type | navigate | screenshot | ...
  target?:           string             // selector / coords
  args?:             map
  result:            ActionResult       // success | failed | partial
  error?:            string
  executed_at:       timestamp
}
```

### 2.5 Memory（记忆）

```
Memory {
  id:                string
  content:           string
  source:            MemorySource       // user_preference | project_fact | workspace | user_explicit | auto_extracted
  scope:             MemoryScope        // user | project | session
  importance:        float              // 0.0 ~ 1.0
  decay_score:       float              // 动态计算
  last_accessed:     timestamp
  created_at:        timestamp
  embedding?:        EmbeddingRef       // 语义检索用（v2.0 起）
  ttl?:              timestamp?         // 过期时间（可选）
}
```

## 3. 数据流（v4.0 完整流水线）

```
User Input
   ↓
[Planner] (v2.5)
   │  输入: Context
   │  输出: Task DAG
   ↓
[Executor] (v1.0)
   │  输入: Task
   │  输出: TaskResult + Observation
   │  工具: read_file, write_file, shell, browser.*, computer.*
   ↓
[Reviewer] (v3.0)
   │  输入: TaskResult
   │  输出: approve | request_changes
   │  工具: lint, test, type_check, compare
   ↓
[Researcher] (v4.0, optional)
   │  输入: Task / Context
   │  输出: Observation / Memory
   │  工具: codebase_search, semantic_search, doc_fetch
   ↓
TaskResult → User
```

## 4. Planner ↔ Executor Boundary（v2.5 关键约束）

| Planner 做 | Executor 做 |
|---|---|
| 拆解 Task | 读 Task |
| 输出 Task DAG | 执行 Task 内的 capability |
| 决定下一步执行哪个 ready Task | 返回 TaskResult + Observation |
| 接收 Reviewer 反馈并重规划 | **不重新规划**——反馈时返回 Planner |
| 维护 Plan Cache | **不写 Plan Cache**——Planner 独占 |

**反模式**：
- ❌ Planner 调用 read_file / write_file
- ❌ Executor 拆解新 Task
- ❌ Reviewer 修改生产文件

## 5. Reviewer ↔ Executor Boundary（v3.0 关键约束）

| Reviewer 做 | Executor 做 |
|---|---|
| 跑 test / lint / type_check | 跑生产命令 |
| 对比 before/after 语义 | 写文件 |
| 输出 approve / request_changes | 收到反馈后**可重新执行**（同 Task 重新跑） |
| 失败时反馈 Planner | **不重新规划**——失败时 escalate 到 Planner |

## 6. Researcher 注入点（v4.0）

Researcher 是**辅助角色**，不是必经流水线。注入点：

- **Planner 拆解前**：Researcher 先收集信息（Codebase 探索 / 文档检索）
- **Executor 卡住时**：Researcher 帮找参考资料
- **Reviewer 失败时**：Researcher 帮找最佳实践 / 已知 issue

**不进入主流水线**——避免 Anthropic/OpenAI 那种"每个动作都 spawn 一个 Researcher"的昂贵模式。

## 7. Session 生命周期

```
SessionStart
   ↓
Load Linear/DAG Session (v1.0/v2.0+)
   ↓
Load Short Memory
   ↓
[Loop: User Input → Planner? → Executor → Reviewer? → User Output]
   ↓
SessionEnd: Save Messages + Update Memory
   ↓
（重启后）SessionStart: 恢复上一 Session
```

## 8. Cache Reset Points

| 触发点 | 是否 reset prefix-cache | 理由 |
|---|---|---|
| Session 启动 | 是（新 session） | 全新 system prompt |
| Compaction | **是（唯一 reset point）** | Reasonix 借鉴 |
| Task 完成 | 否 | 同一 session 内连续 task |
| Reviewer 反馈 | 否 | 仅追加 message |
| Planner 重新规划 | 否 | 仅追加 task graph 节点 |

## 9. 错误处理协议

| 错误类型 | 处理方式 | escalate 到 |
|---|---|---|
| Tool call 失败 | Executor 重试（max_retries） | Planner 重新拆 |
| Task 依赖未满足 | 状态 = blocked，等待依赖完成 | — |
| Reviewer 拒绝 | Executor 重新执行（同 Task retry） | Planner 重新拆（多次拒绝） |
| Token budget 超 | Compaction 触发 | — |
| Memory 冲突 | hand-edit 优先于自动写入 | — |
| Browser/Computer 失败 | Error Recovery 循环（看 BROWSER_PLANNER.md） | Planner 重新拆 |

## 10. 版本演进时间线

| 版本 | 角色 | 数据结构 |
|---|---|---|
| v1.0 | Executor（单角色）| Message + Linear Session |
| v2.0 | + Memory Ranking | + Memory（带 decay/scope/source） |
| v2.5 | **+ Planner** | + Task + Subtask + Task DAG（**Execution Boundary 强制**） |
| v3.0 | **+ Reviewer** | + ActionResult + Reviewer.feedback |
| v4.0 | **+ Researcher** | + Observation + Researcher 可选注入 |

## 11. 跨设计文档引用

- **CAPABILITY_MODEL.md**：Task.subtasks.capability 字段引用 Capability
- **CODE_INTELLIGENCE.md**：Researcher 内部用 Code Intelligence 做信息收集
- **BROWSER_PLANNER.md**：Executor 调用 browser.* 时由 BROWSER_PLANNER 接管
- **ARCHITECTURE.md §2.2**：Agent Layer 5 角色定义

## 12. 未来扩展点（v4.0+）

- **Multi-Session DAG**：跨 session 的 Task 引用（v4.0 Persistent Memory 配套）
- **Plan Cache 升级**：跨 session 复用规划结果
- **Reviewer 进化**：从规则化（lint/test）到 LLM-as-judge
- **Researcher 升级**：从只读到主动建索引
