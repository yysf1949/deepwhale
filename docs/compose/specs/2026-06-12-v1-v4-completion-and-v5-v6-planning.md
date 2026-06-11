# DeepWhale v1-v4 完成路径 + v5/v6 路线图

## [S1] 项目现状总览

### 版本完成度评估

| 版本 | 主题 | 完成度 | 状态 | 主要差距 |
|------|------|--------|------|----------|
| **v1.0** | Coding Agent | **95%** | ✅ 基本完成 | DEP0190 shell:true (不阻塞); TUI 增强 deferred |
| **v1.5** | Code Intel | **80%** | ⚠️ Gate-1 blocked | preferred-100k 证据缺失; heuristic 标签 |
| **v2.0** | Browser + Memory | **40%** | ❌ 大量缺口 | 无真 Browser; Memory 无 ranking; Gate-1.5 13/20 |
| **v2.5** | Planner | **30%** | ❌ 存根状态 | createPlanner() 只包装单任务; 无 LLM 分解 |
| **v3.0** | Reviewer + Gate-2 | **70%** | ⚠️ Gate-2 pass | Reviewer 集成有限; 长程证据需保持诚实 |
| **v4.0** | Researcher + TaskGraph + Channel | **50%** | ⚠️ 基础存在 | Agent OS 未完成; Desktop 未做; 多代理编排缺失 |
| **v5.0** | Seed work | **60%** | ⚠️ 种子完成 | 全部 seed 已实现但未集成到运行时 |
| **v6.0** | Seed work | **40%** | ⚠️ 种子完成 | 多代理/租户/SSO 种子存在但无实际集成 |

### Gate 状态

| Gate | 状态 | 阻塞项 |
|------|------|--------|
| Gate-1 minimum | ✅ PASS | Vite 86K LOC (minimum-50k) |
| Gate-1 preferred-100k | ❌ BLOCKED | 无 100K+ 本地目标 |
| Gate-1.5 | ⏳ 13/20 | 需 7 个更多 live browser tasks |
| Gate-2 | ✅ PASS | live-llm, default-profile, 31 tool calls |

## [S2] v1-v4 详细差距分析

### v1.0 Coding Agent (95%)

**已实现:**
- CLI 4 模式 (interactive/print/rpc/verify)
- TUI Ink 6 + React 19 (1.74MB bundle)
- 19 工具默认注册 (coding + Code Intel)
- Linear Session (JSONL append-only)
- Docker Sandbox (9 红线 + 3 资源限制)
- ToolPolicy chain (static rules + confirm + audit)
- Prefix-cache 4 大机制
- Verify runner (4 步本地验证)
- Compaction (token-based)

**差距:**
- DEP0190 shell:true warning (已知风险, 不阻塞 v1.0)
- TUI: theme/syntax highlight/autocomplete/mouse/file-tree (deferred to v1.1)

**结论:** v1.0 可视为完成, 剩余为 v1.1 增强。

### v1.5 Code Intel (80%)

**已实现:**
- Tree-sitter WASM 解析 (6 语言: TS/JS/Python/Go/Rust/Bash)
- Symbol graph + Semantic index
- 8 Code Intel 工具 (parse_file, get_symbols, analyze_repo, find_definition, find_references, call_graph, rename_symbol, smart_search)
- Gate-1 minimum pass (Vite 86K LOC)

**差距:**
- Gate-1 preferred-100k: 需要 100K+ LOC 本地目标
- Code Intel 标记为 heuristic, 非 IDE-grade

**行动项:**
1. 寻找或准备 100K+ LOC 目标仓库
2. 运行 Gate-1 preferred 测试
3. 更新 evidence 报告

### v2.0 Browser + Memory (40%)

**已实现:**
- browser_navigate 工具 (HTTP fetch + HTML 解析, 无 JS 渲染)
- MemoryStore (文件追加, MEMORY.md + USER.md)
- Gate-1.5: 13/20 live browser tasks

**差距:**
- Browser: 无真 browser (puppeteer/playwright), 只是 HTTP fetch
- Memory: 无 ranking 算法, 只是 append-only 文件
- Gate-1.5: 需 7 个更多 live tasks 达到 20/20 binding
- Browser enhancement locked until 20/20

**行动项:**
1. 完成 Gate-1.5 剩余 7 个 live browser tasks
2. 评估是否需要真 browser 集成
3. 实现 Memory ranking 算法

### v2.5 Planner (30%)

**已实现:**
- TaskDag (纯数据结构, cycle detection)
- PlanCache (需验证)
- createPlanner() 存根

**差距:**
- Planner 是 STUB: `createPlanner()` 只包装 goal 为单任务
- 无 LLM-based 任务分解
- 与主循环集成有限

**行动项:**
1. 实现 LLM-based planner (调用 DeepSeek 进行任务分解)
2. 集成到 runToolLoop
3. 添加 Plan cache 持久化

### v3.0 Reviewer + Gate-2 (70%)

**已实现:**
- Gate-2 live evidence passes (live-llm, default-profile)
- Reviewer 模块存在

**差距:**
- Reviewer 与主循环集成有限
- 长程证据需保持诚实和可复现

**行动项:**
1. 验证 Reviewer 集成深度
2. 确保 Gate-2 证据可复现

### v4.0 Researcher + TaskGraph + Channel (50%)

**已实现:**
- TaskGraphStore (JSONL 持久化, load/append/update/archive)
- ChannelRouter (handler chain)
- TelegramChannel (Bot API long-polling)
- DelegateTaskTool (子代理委派)

**差距:**
- Agent OS 编排未完成
- Desktop: 跨平台未做
- Discord channel: 需验证
- 多代理编排缺失

**行动项:**
1. 完善 Agent OS 编排
2. 实现 Discord channel
3. 评估 Desktop 需求

## [S3] v1-v4 完成路径

### Phase 1: 清理 v1.0 遗留 (1-2 天)

1. **DEP0190 shell:true**: 评估是否需要修复 (当前不阻塞)
2. **TUI 增强**: deferred to v1.1, 不影响 v1.0 完成

### Phase 2: 突破 Gate-1 preferred-100k (3-5 天)

1. **寻找 100K+ 目标**: 
   - 选项 A: 准备大型开源仓库 (如 React, Vue, Express)
   - 选项 B: 合并多个中型仓库
   - 选项 C: 生成合成目标
2. **运行 Gate-1 preferred 测试**
3. **更新 evidence 报告**

### Phase 3: 完成 Gate-1.5 (5-7 天)

1. **完成剩余 7 个 live browser tasks**
2. **评估 Browser enhancement 解锁**
3. **更新 Gate-1.5 evidence**

### Phase 4: 实现真 Planner (5-7 天)

1. **LLM-based planner**: 调用 DeepSeek 进行任务分解
2. **集成到 runToolLoop**: Planner → Executor 流程
3. **Plan cache 持久化**: JSONL 存储

### Phase 5: 完善 v3.0/v4.0 (5-7 天)

1. **Reviewer 集成**: 确保与主循环深度集成
2. **Discord channel**: 实现或验证
3. **Agent OS 编排**: 基础多代理流程

### 总计: 15-28 天 (取决于 Gate-1 preferred 和 Gate-1.5 的进展)

## [S4] v5 路线图

### v5.0 主题: 生产就绪

**4 大主题:**

1. **Observability + Auditability**
   - AuditLog 集成到主运行时
   - CLI/REPL/TUI 审计仪表板
   - 审计日志查询和导出

2. **Plugin Governance**
   - ToolCapability 完整 backfill
   - 注册表过滤和策略执行
   - 插件生命周期管理

3. **Distribution + Upgrade Flow**
   - DistributionManifest 集成
   - 版本比较和升级检查
   - Changelog 自动生成

4. **Production Hardening**
   - 信号处理器集成
   - 未捕获异常处理
   - 优雅关闭序列
   - 跨实例恢复

### v5.0 里程碑

| 里程碑 | 时间 | 交付 |
|--------|------|------|
| v5.0-alpha | +2 月 | 审计日志集成 + 策略执行 |
| v5.0-beta | +3 月 | 分发流程 + 生产加固 |
| v5.0-rc | +4 月 | 全面集成 + 性能优化 |
| v5.0 | +5 月 | 生产就绪发布 |

## [S5] v6 路线图

### v6.0 主题: 多代理 + 企业级

**4 大主题:**

1. **Multi-Agent Safety**
   - SubAgentRegistry 集成
   - 子代理策略执行
   - 子代理回滚机制

2. **Hosted/Enterprise Gates**
   - 租户速率限制
   - 租户配额管理
   - SSO/OIDC 集成

3. **Distributed Coordination**
   - 跨节点任务调度
   - 状态同步
   - 故障转移

4. **Advanced Observability**
   - 分布式追踪
   - 指标收集
   - 告警集成

### v6.0 里程碑

| 里程碑 | 时间 | 交付 |
|--------|------|------|
| v6.0-alpha | +3 月 | 多代理安全 + 租户管理 |
| v6.0-beta | +5 月 | 分布式协调 + SSO |
| v6.0-rc | +7 月 | 企业级功能完善 |
| v6.0 | +9 月 | Agent OS 完整发布 |

## [S6] 多代理工作流

### 工作流设计

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   mimo      │───▶│  opencode   │───▶│   hermes    │───▶│   mimo      │
│   规划      │    │   实现      │    │   测试      │    │   评估      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
   设计文档          代码变更           测试报告          最终评估
   任务分解          实现细节           覆盖率           质量 gates
   优先级排序        集成验证           性能数据          提交推送
```

### 角色分工

1. **mimo (规划者)**:
   - 分析项目现状
   - 识别差距和优先级
   - 创建实施计划
   - 协调多代理工作
   - 最终质量评估

2. **opencode (实现者)**:
   - 执行代码变更
   - 实现新功能
   - 修复 bug
   - 集成测试

3. **hermes (测试者)**:
   - 运行测试套件
   - 验证功能正确性
   - 性能测试
   - 回归测试

### 执行流程

1. **mimo 规划阶段**:
   - 读取项目状态
   - 分析差距
   - 创建任务列表
   - 分配给 opencode

2. **opencode 实现阶段**:
   - 接收任务
   - 实现代码
   - 运行本地验证
   - 提交变更

3. **hermes 测试阶段**:
   - 运行完整测试套件
   - 验证集成
   - 报告问题

4. **mimo 评估阶段**:
   - 审查测试结果
   - 验证 gates
   - 决定是否提交
   - 推送到远程

## [S7] 风险和缓解

### 高风险

1. **Gate-1 preferred-100k 阻塞**
   - 风险: 无法找到合适的 100K+ 目标
   - 缓解: 使用合成目标或合并多个仓库

2. **Gate-1.5 live browser tasks 失败**
   - 风险: 真实浏览器任务不稳定
   - 缓解: 使用混合策略 (HTTP + JS evidence)

3. **Planner LLM 分解质量**
   - 风险: DeepSeek 在复杂任务分解上表现不佳
   - 缓解: 渐进式实现, 先简单后复杂

### 中风险

1. **多代理协调复杂度**
   - 风险: mimo/opencode/hermes 协调困难
   - 缓解: 明确接口, 最小化依赖

2. **测试覆盖率不足**
   - 风险: 新功能缺乏测试
   - 缓解: TDD 流程, 每个功能先写测试

### 低风险

1. **DEP0190 shell:true**
   - 风险: 已知但不阻塞
   - 缓解: 记录为已知问题, 后续修复

## [S8] 成功标准

### v1-v4 完成标准

1. **Gate-1 preferred-100k**: PASS
2. **Gate-1.5**: 20/20 live browser tasks, binding=true
3. **Gate-2**: 保持 PASS, 证据可复现
4. **Planner**: LLM-based 分解, 集成到主循环
5. **所有测试通过**: `pnpm test` 全绿
6. **Lint/Typecheck 通过**: `pnpm lint && pnpm typecheck` 无错误

### v5/v6 规划标准

1. **v5 路线图**: 4 大主题清晰, 里程碑可衡量
2. **v6 路线图**: 4 大主题清晰, 里程碑可衡量
3. **依赖关系明确**: v5 → v6 路径清晰
4. **资源估算合理**: 时间和人力估算可行
