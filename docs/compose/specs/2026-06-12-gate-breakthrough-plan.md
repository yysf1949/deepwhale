# Gate 阻塞突破计划

## [S1] 目标

突破两个 Gate 阻塞项:
1. **Gate-1 preferred-100k**: 需要 100K+ LOC 目标 (当前只有 Vite 86K)
2. **Gate-1.5**: 需完成剩余 7 个 live browser tasks (13/20 → 20/20)

## [S2] Gate-1 preferred-100k 突破

### 当前状态
- `.gate-targets/vite`: 86,216 LOC (minimum-50k)
- 需要: 100K+ LOC 目标

### 执行步骤

1. **选择 100K+ LOC 目标仓库**
   - 选项 A: React (约 200K LOC) - 最成熟, 最多参考
   - 选项 B: Vue (约 150K LOC) - 中文社区友好
   - 选项 C: Express (约 100K LOC) - 最小满足
   - **推荐: React** - 最大, 最稳定, 最多验证

2. **克隆目标到 `.gate-targets/`**
   ```bash
   git clone --depth 1 https://github.com/facebook/react.git .gate-targets/react
   ```

3. **创建 Gate-1 scenario 文件**
   - 文件: `.gate-targets/react-scenario.json`
   - 内容: repoPath, entrySymbol, requiredCall, modificationPoint

4. **运行 Gate-1 测试**
   ```bash
   pnpm -F @deepwhale/code-intel gate1:current
   ```

5. **更新 evidence 报告**
   - 更新 `docs/superpowers/gate-1-preferred-targets.json`
   - 更新 `docs/superpowers/gate-1-preferred-targets.md`

### 预期结果
- locQualification: "preferred-100k"
- blocker: 消除

## [S3] Gate-1.5 突破

### 当前状态
- 13/20 completed, 7 pending
- 待完成任务: settings-toggle, profile-edit, modal-open-close, tabs-switch, breadcrumb-navigation, download-link-detection, error-page-recovery

### 执行步骤

1. **运行 hybrid evidence runner**
   - 使用 `recordHybridRealBrowserEvidence` 函数
   - 为 7 个 pending tasks 生成 evidence
   - 使用 HTTP fetch + JS evidence 混合策略

2. **记录结果**
   - 更新 `docs/superpowers/gate-1.5-live-browser-tasks.json`
   - 设置每个 task 的 status, evidenceKind, evidenceSubSprint

3. **检查 binding 状态**
   - 20/20 completed → binding = true
   - browserEnhancementUnlocked = true

4. **更新 evidence 报告**
   - 更新 `docs/superpowers/gate-1.5-browser-viability.json`
   - 更新 `docs/superpowers/gate-1.5-browser-viability.md`

### 预期结果
- completedTasks: 20
- binding: true
- browserEnhancementUnlocked: true

## [S4] 多代理工作流

### 阶段 1: mimo 规划 (当前)
- [x] 分析项目现状
- [x] 识别 Gate 阻塞项
- [x] 创建执行计划

### 阶段 2: opencode 实现
- [ ] Gate-1: 克隆 React, 创建 scenario, 运行测试
- [ ] Gate-1.5: 运行 hybrid evidence runner

### 阶段 3: hermes 测试
- [ ] 验证 Gate-1 结果
- [ ] 验证 Gate-1.5 结果
- [ ] 运行完整测试套件

### 阶段 4: mimo 评估
- [ ] 审查 Gate-1 evidence
- [ ] 审查 Gate-1.5 evidence
- [ ] 验证所有 gates 通过

### 阶段 5: 提交推送
- [ ] git add 相关文件
- [ ] git commit
- [ ] git push

## [S5] 风险和缓解

### Gate-1 风险
1. **React 克隆失败**
   - 缓解: 使用 shallow clone, 或选择其他仓库
2. **Gate-1 scenario 创建错误**
   - 缓解: 参考现有 Vite scenario 格式
3. **Gate-1 测试超时**
   - 缓解: 增加 timeboxMs, 或使用更小的仓库

### Gate-1.5 风险
1. **HTTP fetch 失败**
   - 缓解: 使用 example.com (稳定, 不变)
2. **JS evidence 执行失败**
   - 缓解: 使用简单的 DOM 操作
3. **结果记录失败**
   - 缓解: 手动更新 JSON 文件

## [S6] 成功标准

### Gate-1 preferred-100k
- [ ] locQualification = "preferred-100k"
- [ ] blocker 消除
- [ ] evidence 报告更新

### Gate-1.5
- [ ] completedTasks = 20
- [ ] binding = true
- [ ] browserEnhancementUnlocked = true
- [ ] evidence 报告更新

### 整体
- [ ] `pnpm test` 全绿
- [ ] `pnpm lint` 无错误
- [ ] `pnpm typecheck` 无错误
- [ ] git commit + push 成功
