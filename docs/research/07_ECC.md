# ECC (affaan-m) → deepwhale 借鉴清单

> 研究日期: 2026-06-03
> 完整研究见: `~/ObsidianVault/AI研究/技术文档/ECC/README.md`（6 文件 38.6KB）
> 完整 Obsidian 子文档: `01-项目概览` / `02-系统架构` / `03-SKILL-md格式` / `04-4维质量模型` / `05-Verification-Loop`

---

## 1. 关键事实速览

| 维度 | ECC | oh-my-pi | deepwhale 当前 | 差距 |
|---|---|---|---|---|
| Star | **204,234** (4.5 月) | 10,034 (5 月) | 0 (Sprint 0) | 体量差 |
| 形态 | agent 之上的 operator 插件 | agent 本体 | agent 本体 | **借鉴关系反向** |
| Skills | 249 个 SKILL.md | 0 | 0 | **P0 差距** |
| 9 平台兼容 | ✅ | ❌ | ❌ | 长期 |
| 4 维质量模型 | ✅ | ❌ | ❌ | **P0 差距** |
| Verification Loop 6 阶段 | ✅ | benchmark（不同用途）| 0 | **P0 差距** |
| Agents | 63 | 0 | 0 | 长期 |
| 商业化 | Pro + GitHub App | 0 | 0 | 不学 |

**结论**：ECC 是 deepwhale 的**产品层对标**（vs oh-my-pi 是算法层对标）。**4.5 月 204k star 关键 = 9 平台兼容 + SKILL.md 标准化 + 4 维模型 + 6 阶段 Verification**。

---

## 2. 颠覆性发现（影响 deepwhale 设计）

### 发现 1：**ECC 不写 agent 本体** —— 它是"任何 agent 之上的插件"

ECC 的 README 描述：
> "The agent harness performance optimization system. Skills, instincts, memory, security, and research-first development for Claude Code, Codex, Opencode, Cursor and beyond."

**含义**：
- 用户**用 Claude Code + ECC**，不是"用 ECC 替代 Claude Code"
- 9 平台兼容 = **横跨所有 agent**，不写自家 agent

**对 deepwhale 的影响**：
- ❌ **不学 9 平台兼容**（deepwhale 是 agent 本体，**不是 plugin**）
- ✅ **学"和所有 agent 共存"哲学**：v3 Tauri 桌面阶段，**确保 deepwhale 能被 Claude Code / Codex 调用**（而不是"替代"它们）

### 发现 2：SKILL.md 格式 = "一个能用的标准化"

ECC 的 249 个 skill **全部用同一格式**：
```yaml
---
name: <kebab-case>
description: <one-line>
origin: ECC
---
# <body markdown>
```

**为什么是革命性**：
- 249 个 skill 互不污染（每个独立 SKILL.md）
- agent 自动按 description 决定是否加载
- 跨平台兼容（YAML 任何 agent 都能解析）
- 可版本控制（纯文本）

**对 deepwhale 的影响**：
- ✅ **v1.0 必采用 SKILL.md 格式**
- ✅ **Sprint 0 末建 `skills/<name>/SKILL.md` 目录**
- ✅ **oh-my-pi 的 hashline prompt.md 应升级为 SKILL.md 格式**（frontmatter 加 name/description）

### 发现 3：**4 维质量模型 = v1.0 验收表**

```yaml
Action Space Quality    # 工具设计
Observation Quality     # 工具返回
Recovery Quality        # 错误恢复
Context Budget Quality  # token 分配
```

**对 deepwhale 的影响**：
- ✅ **v1.0 验收标准用 4 维打分**（不只"能跑通"）
- ✅ **Sprint 1 tool 设计强制 Observation 4 字段 + Recovery 3 字段**

### 发现 4：**6 阶段 Verification = "/verify" slash command 模板**

```
Build / Types / Lint / Tests / Security / Diff
→ 统一 VERIFICATION REPORT
→ READY / NOT READY
```

**对 deepwhale 的影响**：
- ✅ **v1.0 末加 `/verify` slash command**
- ✅ **统一报告格式**（让 agent 知道能否继续）

### 发现 5：continuous-learning-v2 = "100% 触发"学习系统

v1 (Stop hook) → v2 (PreToolUse/PostToolUse + 原子 instinct + confidence 0.3-0.9)

**为什么 v1 失败**：Stop hook 50-80% 触发概率（hook 实际跑不跑依赖 LLM 决策）

**v2 改进**：hooks 100% 触发 + 原子化（一个 instinct 只学一个模式）+ confidence 加权

**对 deepwhale 的影响**：
- ✅ v2.0 Tier-1 Memory Ranking 阶段**直接学 v2 模式**
- ❌ **v1.0 不学**（成本太高）

### 发现 6：**ECC 是商业化的"OSS stays free" 路径**

- OSS：永远 MIT 免费
- Pro：$19/seat/mo（private repos）
- GitHub App：免费 tier 限速
- Sponsors：From $5/mo

**对 deepwhale 的影响**：
- ❌ **不学**（单人项目用不上）
- ✅ **学"OSS 永远免费"**价值观（如果 deepwhale 火了）

---

## 3. 借鉴冲突仲裁（与已有 5 份调研 + oh-my-pi 对照）

| 能力 | ECC | oh-my-pi | Reasonix | pi | **deepwhale 决策** |
|---|---|---|---|---|---|
| Patch 格式 | str_replace（用 Claude Code） | **hashline** | str_replace | str_replace | **跟 oh-my-pi（hashline）** |
| Skills 格式 | **SKILL.md YAML+MD** | 0 | .md | SKILL.md | **跟 ECC 标准化** |
| 4 维质量模型 | **4 维** | 0 | 0 | 0 | **v1.0 验收表** |
| Verification | **6 阶段** | benchmark | 0 | 0 | **v1.0 末 /verify** |
| 平台兼容 | 9 平台 | 4 入口 | - | - | **不做** |
| Agents | 63 个 | 0 | 0 | 0 | **延后到 v2.5+** |
| 商业化 | Pro + Sponsors | 0 | 0 | 0 | **不学** |
| continuous-learning | v2 | 0 | 0 | 0 | **v2.0 Tier-1** |
| 6 hooks 类型 | 6 type | 0 | 0 | 0 | **Sprint 1 部分** |

---

## 4. 借鉴清单（按 P0/P1/P2）

### P0 — 必须做（Sprint 0-v1.0）

| 借鉴点 | 实施位置 | 状态 |
|---|---|---|
| **SKILL.md YAML frontmatter 格式** | `skills/<name>/SKILL.md` | TODO（Sprint 0 末） |
| **agent-harness-construction 4 维模型** | `ROADMAP_DECISIONS.md §16` | TODO（本次） |
| **Observation 4 字段 schema** | `tool-result.ts` | TODO（Sprint 1） |
| **Recovery 3 字段 schema** | `tool-error.ts` | TODO（Sprint 1） |
| **Verification Loop 6 阶段** | `bench/verify/verify.ts` + `/verify` slash | TODO（v1.0 末） |
| **统一 VERIFICATION REPORT 格式** | 同上 | TODO（v1.0 末） |
| **Security scan（grep sk-）** | `scripts/security-scan.sh` | TODO（v1.0） |

### P1 — 应该做（v1.0-v2.0）

| 借鉴点 | 实施位置 | 状态 |
|---|---|---|
| **agent.yaml catalog 机制** | `agent.yaml` 类似 ECC 245 行 | TODO（v1.0 末） |
| **4 种典型 SKILL.md 模式**（Reference/Workflow/Pattern/Knowledge） | `skills/` 目录示例 | TODO（Sprint 1） |
| **Anti-patterns 自查** | CI lint | TODO（v1.5） |
| **Context Budget 4 条规则** | skill 加载机制 | TODO（v1.5 末） |
| **continuous-learning-v2 模式** | `memory/instinct/` | TODO（v2.0 Tier-1） |
| **rules-distill 思想** | `rules/<lang>/` 自动提炼 | TODO（v2.0 Tier-1） |
| **Diff review 自动化** | pre-commit hook | TODO（v1.5） |

### P2 — 可选（v2.0+）

| 借鉴点 | 实施位置 | 状态 |
|---|---|---|
| **9 平台兼容层**（让 deepwhale 也能被 Claude Code 调） | v3 Tauri 阶段 | 留占位 |
| **Granularity 3 档规则** | tool 设计文档 | 留占位 |
| **Continuous mode**（每 15 min 自动 verify） | v2.0 末 | 留占位 |
| **ECC Pro 商业化模型** | 永远不做 | 留占位 |

### ❌ 明确不学

- ❌ **249 skills 全部内容**（deepwhale 是 agent 本体，不是 plugin）
- ❌ **63 agents 全部角色**（只学"agent 描述符"格式）
- ❌ **9 平台兼容的 9 套配置**（偏离主线）
- ❌ **ECC Pro / Sponsors 商业化**（单人项目用不上）

---

## 5. 修订 deepwhale ROADMAP（基于本次研究）

| Sprint | 原计划 | 优化后（v3 = ECC 借鉴） | 理由 |
|---|---|---|---|
| 0 | 4 包 + hashline MVP | **+ SKILL.md 格式建立**（YAML frontmatter） | 与 hashline 配套，标准化 |
| 1 | 6 工具 + Prefix-cache 4 机制 | **+ Observation 4 字段 + Recovery 3 字段**（tool schema） | 4 维模型 P0 部分 |
| 2 | Cache + napi 调研 | 不变 | - |
| v1.0 末 | - | **+ `/verify` slash command + VERIFICATION REPORT 格式** | Verification Loop P0 |

**v1.0 末的变化**：从"能跑通"变成"**跑通 + 6 阶段自动验证**"。

**v2.0 的变化**：Memory Ranking 阶段**直接学 continuous-learning-v2 模式**（instinct + confidence）。

---

## 6. 风险与未决项

| 风险 | 等级 | 决策 |
|---|---|---|
| SKILL.md 格式过重（v1.0 工具少）| 低 | **v1.0 至少用 frontmatter，body 简化** |
| 4 维模型执行成本 | 中 | **只用作 v1.0 验收表**，不强制每条规则都有对应代码 |
| Verification Loop 增加 CI 时间 | 中 | **跑并行**（build + types + lint + test + security + diff） |
| Security scan 误报 | 低 | **加白名单**（`*.test.ts`、`docs/`） |
| ECC 249 skills 是噪音 | 低 | **不抄内容**，只抄格式 |
| ECC 9 平台兼容分散精力 | **高** | **明确不学**（深挖主线） |

---

## 7. 一句话总结

> **ECC 用 4.5 个月时间证明了一件事：不做 agent 本体，做"任何 agent 都能用的标准化插件层"（SKILL.md 格式 + 4 维质量模型 + 6 阶段 Verification），可以拿到 204k star。**
> **deepwhale 的最大借鉴不是"抄它的 249 skills"，而是抄它的"标准化思路 + 4 维质量模型 + 6 阶段 Verification 流程" —— SKILL.md 格式取代 prompt.md，4 维模型取代"能跑通就行"，Verification Loop 取代"手动 review"。**
> **不学它的 9 平台兼容 / 商业化 / 63 agents 完整角色（偏离主线），但学"产品化"哲学（OSS 永远免费 + 标准化格式 + 跨平台兼容思想）。**
