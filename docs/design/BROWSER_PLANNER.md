# Browser Planner 架构

> **本文件范围**：Browser Agent 的 Observe → Plan → Act → Recovery 循环。**只定义模块边界、接口、数据流——不写实现细节**（不选 Playwright/Puppeteer/CDP，不写具体 selector 策略，不写 visual grounding 模型）。

## 1. 核心问题

v1.0-v1.5 的 Agent 只能操作本地代码库。要让 Agent 完成"在淘宝搜索 + 加购"这种任务，必须能：

1. **Observe**：把网页变成 Agent 可理解的结构（DOM 概要 + 视觉元素 + 截图）
2. **Plan**：基于观察 + 用户意图，决定下一步动作
3. **Act**：执行动作（点击、输入、滚动、截图）
4. **Recover**：失败时回退或换策略

**Browser Planner ≠ Playwright Wrapper**。Playwright 只解决"怎么点"，Browser Planner 解决"该点什么"。

## 2. 四阶段循环

```
[Observe] →  Observation
   ↓
[Plan]    →  Action
   ↓
[Act]     →  ActionResult
   ↓
[Recover] →  (回到 Observe 或终止)
```

## 3. Observe（观察）

### 3.1 职责

把当前网页状态转化为结构化的 `Observation`（见 `AGENT_RUNTIME.md §2.4`）。

### 3.2 观察来源

| 来源 | v2.0 必带 | v3.0 增强 |
|---|---|---|
| **DOM 解析** | ✅ AST 解析当前页面 | + Shadow DOM 解析 |
| **元素抽取** | ✅ 抽取可见元素 + 文字内容 | + 元素相对位置 |
| **截图** | ✅ 单张全屏 | + 区域截图（按元素） |
| **URL / Title** | ✅ | + Page State（loading / loaded / error） |
| **Visual Grounding** | ❌ | ✅ v3.0 引入（截图标注元素） |
| **Action History** | ✅ 最近 5 步 | + 完整历史 |

### 3.3 关键能力（v2.0 必须）

| 能力 | 描述 | 出现版本 |
|---|---|---|
| **DOM Understanding** | AST 解析页面 DOM 结构 + 提取语义（按钮 / 表单 / 列表） | v2.0 |
| **Element Ranking** | 按用户意图 + 元素语义 + 视觉位置给元素排序 | v2.0 |
| **Page Summarization** | 长页面压缩为 token 友好的 summary | v2.0 |
| **Action History** | 维护已执行动作列表避免重复 | v2.0 |
| **Visual Grounding** | 截图标注元素位置（v3.0 才需要） | v3.0 |
| **Error Recovery** | 失败回退到上一步 / 改 selector | v3.0 增强 |
| **Adaptive Retry** | 基于失败模式动态调整策略 | v3.0 |

## 4. Plan（规划）

### 4.1 职责

接收 `Observation` + `User Intent` → 输出下一个 `Action`。

### 4.2 输入

```
PlanInput {
  user_intent:          string             // "搜索机械键盘并加购"
  observation:          Observation        // 当前页面观察
  task_history:         Action[]           // 已执行动作
  page_goal:            PageGoal?          // 期望的页面状态（如"已登录" / "购物车含商品"）
}
```

### 4.3 输出

```
Action {
  id:                    string
  type:                  ActionType         // click | type | navigate | screenshot | scroll | wait | extract
  target:                Target             // selector / coords / text
  args?:                 map                // 输入值 / 等待条件 / 提取规则
  expected_outcome?:     string             // 期望结果（用于验证）
  timeout_ms:            int                // 默认 10000
  fallback_action?:      Action             // 失败回退动作
}
```

### 4.4 规划策略

| 策略 | 描述 | 适用场景 |
|---|---|---|
| **LLM-based** | LLM 推理：给我 Observation + Intent → 我决定 Action | 复杂页面（淘宝/京东/Amazon） |
| **Heuristic** | 模板：检测到 X 模式 → 执行 Y 动作 | 简单页面（搜索 / 表单） |
| **Hybrid** | LLM 给候选，Heuristic 验证 | 折中方案 |

**v2.0 默认 Hybrid**——LLM 给候选 + Heuristic 验证 selector 存在。

## 5. Act（执行）

### 5.1 职责

执行 `Action` → 返回 `ActionResult`。

### 5.2 执行流程

```
Action 入参
   ↓
[Validate] 验证 selector / coords 有效
   ↓
[Sandbox Check] 检查 Capability.sandbox 配置
   ↓
[Execute] 调用底层（Playwright / 兼容层）
   ↓
[Wait] 等待结果（页面加载 / 动画 / 网络）
   ↓
[Verify] 验证 expected_outcome 是否达成
   ↓
[ActionResult]
```

### 5.3 失败处理

| 失败类型 | 行为 | escalate |
|---|---|---|
| **Selector 不存在** | 立即返回 failed | Recovery 阶段 |
| **Element not interactable** | 滚动 + 重试 1 次 → 仍失败则 | Recovery |
| **Timeout** | 截图 + 返回 partial | Recovery |
| **Page navigation error** | 截图 + 返回 failed | Recovery |
| **Unexpected page state** | 截图 + 返回 failed | Recovery |

## 6. Recover（恢复）

### 6.1 职责

基于 `ActionResult.failed` → 决定下一步。

### 6.2 v2.0 基础恢复

| 失败模式 | 恢复策略 |
|---|---|
| Selector 不存在 | 改用 text-based selector |
| Element not visible | 滚动到元素位置 |
| Timeout | 增加 timeout_ms 后重试 1 次 |
| Page state error | 截图 + 跳回主页 |

**v2.0 限制**：每步最多重试 2 次，超出后 escalate 到 Planner。

### 6.3 v3.0 增强恢复

| 失败模式 | 恢复策略 |
|---|---|
| Selector 多次失败 | **Visual Grounding 介入**——截图标注元素 |
| 页面结构变化 | **Page Summarization 重新生成理解** |
| 多次重试仍失败 | **Adaptive Retry**——切到不同策略（如改用 keyboard 不用 click）|
| 整个页面崩了 | **Snapshot 整页 + 回到 Planner 重新拆任务** |

**v3.0 关键升级**：从"重试 selector"升级到"重新理解页面 + 切策略"。

## 7. 与 Executor 的关系

```
Agent Layer Executor
   ↓  调用 capability: browser.click
Capability Registry
   ↓  路由到 Browser Runtime
Browser Runtime
   ├── Observe
   ├── Plan
   ├── Act
   └── Recover
   ↓  返回 Observation / ActionResult
Capability Registry
   ↓
Executor 收到 Observation
```

**关键**：Executor **不感知** Browser Planner 内部循环——它只看到 Capability 调用和 Observation 返回。

## 8. v2.0 vs v3.0 拆分

| 能力 | v2.0 | v3.0 |
|---|---|---|
| DOM Understanding | ✅ 基础 | ✅ 增强（Shadow DOM）|
| Element Ranking | ✅ 基础 | ✅ 增强（视觉位置）|
| Page Summarization | ✅ | ✅ 增强 |
| Action History | ✅ | ✅ |
| Visual Grounding | ❌ | ✅ **新增** |
| Error Recovery | ⚠️ 基础重试 | ✅ **策略级** |
| Adaptive Retry | ❌ | ✅ **新增** |
| Computer Use 复用 | ❌ | ✅ **v3.0 复用 Observation Model** |

**vs 初版**：v2.0 只做 4 件基础（DOM/Element/Page Summary/Action History），v3.0 做剩下 3 件增强（Visual/Error/Adaptive）。**不再 v2.0 一次性做满**。

## 9. 与 Computer Use 的复用（v3.0）

Observation Model **跨 Browser / Computer Use 共用**：

| Observation.source | Browser | Computer Use |
|---|---|---|
| `url` | ✅ | ❌（desktop 才有 process name） |
| `title` | ✅ | ✅ 窗口标题 |
| `dom_summary` | ✅ | ❌ |
| `visible_elements` | ✅ DOM 元素 | ✅ 窗口 / 控件 |
| `screenshots` | ✅ | ✅ |
| `action_history` | ✅ | ✅ |
| `raw_data` | ✅ 页面数据 | ✅ 进程列表 / 文件系统 |

**Computer Use v3.0 复用 Browser Planner 的 Observe 阶段**（改用 desktop 元素抽取）。

## 10. 失败模式与降级

| 失败 | 降级策略 |
|---|---|
| 整个 Observe 失败（页面崩了）| 截图 + escalate 到 Planner |
| LLM 推理失败（rate limit）| Heuristic 模式（不靠 LLM）|
| Playwright 启动失败 | 报错（不重试——Capability Registry 启动失败） |
| 视觉模型不可用（v3.0）| Visual Grounding 降级为 Element Ranking |
| 真实场景（淘宝反爬）| 多次重试 + 切 user-agent（不靠代理池） |

## 11. 真实场景验收

v2.0 必须通过的 3 个真实场景：

1. **淘宝**：搜索"机械键盘" + 点击第 1 个商品 + 加入购物车
2. **京东**：搜索 + 筛选（价格区间）+ 进入详情
3. **Amazon**：搜索 + 看评论 + 加入购物车

**失败时不靠人手动修 selector**——Browser Planner 自动 Error Recovery。

v3.0 增强验收：

- 视觉元素识别准确率 ≥ 80%（用 100 个真实元素标注测试）
- Adaptive Retry 让"selector 失败"从 30% 降到 5%

## 12. 与其他设计文档关系

- **AGENT_RUNTIME.md §2.4**：Observation 数据结构定义（本文件引用）
- **AGENT_RUNTIME.md §3**：Browser Runtime 在 Executor → Reviewer 之间
- **CAPABILITY_MODEL.md §8**：Browser capability 字段定义
- **ARCHITECTURE.md §2.3**：Runtime Layer 中 Browser Agent Runtime 位置

## 13. 不做的事

- ❌ 不选底层实现（Playwright vs Puppeteer vs CDP 直接调用 — 实现层决定）
- ❌ 不写具体 selector 策略（CSS / XPath / text — 实现层决定）
- ❌ 不写具体 visual grounding 模型（v3.0 决定）
- ❌ 不写 LLM prompt（实现层按模型调优）
- ❌ 不做代理池 / 反反爬（单人不做）

## 14. 版本演进

| 版本 | 引入 |
|---|---|
| **v2.0** | Observe（DOM/Element/Page Summary/Action History） + Plan + Act + 基础 Recover |
| **v3.0** | Visual Grounding + 策略级 Error Recovery + Adaptive Retry + Computer Use 复用 Observation |
