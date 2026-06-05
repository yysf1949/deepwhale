# Prefix-cache 4 大机制 — 总集

**Sprint**: 1c-revive-4 (2026-06-05) D-20.2 P0-E (v1.0 capability completion)
**状态**: v1.0 capability matrix 必填项
**目的**: 固化 deepwhale 的 prefix-cache 4 大机制命名, 让未来 sprint 找代码有总集, 不再散在 5 个文件里.

## 为什么需要 4 机制

LLM (尤其是 DeepSeek V4 / Anthropic Sonnet 4.5) 的 prompt cache 命中是**省钱 + 省延迟**的
关键. 但 prefix-cache 是个**易破的优化**: 任何一个机制没做对, cache 命中归零, 钱照付延迟照吃.

deepwhale 的 prefix-cache 不只是"算命中率", 还要保"不会因内部行为让 cache 失效". 4 大机制各管一头:

1. **机制 1 - `cache_hit_rate` 字段**: **观测** — LLM 返的 cache 命中率必须能拿到
2. **机制 2 - `canonicalizeSchema`**: **稳定** — 工具 schema key 顺序不能让 cache hash 漂
3. **机制 3 - `cost_turn` 算式**: **定价** — cache 命中按折扣价算, 算式 3 档可验
4. **机制 4 - Compaction 保 prefix**: **长会话** — 截断历史时 prefix 不能动, 否则全 miss

## 4 大机制 (代码入口 + 可观测输出 + 测试入口)

### 机制 1: `cache_hit_rate` 字段 (观测)

**目的**: LLM 服务端返 SSE 时带 `cached_tokens` / `prompt_tokens`, deepwhale 算出 `cache_hit_rate` 暴露给调用方.

**代码入口**:
- 类型: `packages/llm/src/types.ts:74-78` (`cache_hit_rate?: number` / `cached_tokens?: number` / `tokens_uncached?: number`)
- 算式: `cached_tokens / prompt_tokens` — 拍板在 `packages/llm/src/parse.ts:88-95` (`parseOaiSseUsageField`) / `anthropic-client.ts:464-475`
- 边界: `cached_tokens === undefined` → `cache_hit_rate` 字段 absent (类型不变量)

**可观测输出**:
- RPC mode: `resultObj['cache_hit_rate']` 顶层暴露 (跟 `cost_turn` 并列, caller 1 层访问) — `src/modes/rpc.ts:357-368`
- REPL mode: 状态栏 `cache: 90% | ¥0.05/turn | prompt 1.2k (1.1k cached)` 4 字段 (有 cached_tokens 时) / `usage: 1.2k prompt / 200 completion` 简版 (无 cached_tokens 时) — `src/repl.ts:755-790`
- 测覆盖:
  - `packages/llm/test/pricing-config.test.ts:103` computeCost 测 `cached=prompt → cache_hit_rate=1`
  - `packages/llm/test/pricing-config.test.ts` 13 个 it
  - `packages/coding-agent/test/repl.test.ts:217` 无 cached_tokens → 简版
  - `packages/coding-agent/test/repl.test.ts:233` 有 cache_hit_rate → 4 字段

### 机制 2: `canonicalizeSchema` (稳定)

**目的**: tools schema 的 key 顺序稳定, 让 LLM 服务端的 prefix-cache 不会被"key 重新排序"打乱.

**代码入口**:
- 函数: `packages/llm/src/canonicalize-schema.ts` (Sprint 1b 加, 在 `pricing-config` 附近)
- 调用点: `packages/coding-agent/src/agent/tool-loop.ts:226-232` (每次 `buildRequestBody` 前调)
- 拍板: "JSON property 顺序稳定保 prefix-cache hash" — 跟 Reasonix `schema_canonicalize.go:10-67` 对齐

**可观测输出**:
- 不可直接观测 (内部 stable 行为). 验证靠 LLM 服务端返回的 `cached_tokens` 在 schema 字段顺序变了之后**仍能命中** (实测 D-20.2 留 1 个 focused test).
- 测覆盖:
  - `packages/llm/test/canonicalize-schema.test.ts` (Sprint 1b 加, 13 个 it)
  - `packages/coding-agent/test/integration/schema-validation-2d3.test.ts` (2d3 集群)

### 机制 3: `cost_turn` 算式 (定价)

**目的**: 3 档定价 — `uncached * cache_miss + cached * cache_hit + completion * output`, cache 命中按折扣价算.

**代码入口**:
- 算式: `packages/llm/src/pricing-config.ts:178` — `cost_turn = tokens_uncached * cache_miss_per_m/1e6 + cached * cache_hit_per_m/1e6 + completion * output_per_m/1e6`
- 纯函数: `computeCost(pricing, model, prompt, completion, cached) => CostBreakdown` (无 console / 无 logger / 无 IO)
- 3 种返回: (a) cached=undefined 整体 undefined / (b) cached 有但 model 找不到 → base 2 字段, cost 字段 absent / (c) 命中 model → 完整 4 字段含 `cost_currency`

**可观测输出**:
- REPL mode 状态栏 4 字段里 `¥0.05/turn` (有 cost_turn 时) / 简版时 absent
- RPC mode 顶层 `cost_turn` 暴露
- 测覆盖:
  - `packages/llm/test/pricing-config.test.ts:103` 13 个 it (含 11: 1M cache miss + 1M completion V4-Flash CNY = 0.5 + 1.0 = 1.5)

### 机制 4: Compaction 保 prefix (长会话)

**目的**: 长会话触发 compaction 时, `replaced_range` 砍**中段**, system prefix + 末尾保留, 不会因 compaction 让 LLM 端 prefix-cache 全 miss.

**代码入口**:
- 类: `packages/core/src/session/compaction.ts:209 CompactionState`
- 函数: `packages/core/src/session/compaction.ts:281 runCompactionWithLatch` — 拍 'compaction' event, `replaced_range: [0, head.length)`
- 集成: `packages/coding-agent/src/agent/agent-compaction.ts:87` — 剥 caller 拼的连续 system prefix, 保持 replaced_range 跟 JSONL 累积**同空间**
- 不变量 (types:jsonl.ts:84-89): `replaced_range[1] - replaced_range[0] >= 1` (有东西被总结)

**可观测输出**:
- session JSONL 写 'compaction' event, `replaced_range: [start, end)`
- reload 时 session-adapter.ts:166 跳过 corrupted event (`start > out.length: skip`)
- 测覆盖:
  - `packages/core/test/session-compaction.test.ts` 16 it (含 161: replaced_range 索引对齐)
  - `packages/coding-agent/test/integration/runToolLoop-2turn.test.ts:173` (2 turn compaction + cache 字段)

## 联动契约 (4 机制端到端)

4 机制不是独立, 是**一条链路**:

```
[1] LLM 返 SSE → parseSseUsage → cache_hit_rate/cached_tokens (机制 1)
[2] 下次 LLM 调 → canonicalizeSchema (机制 2) → tools schema 顺序稳定
[3] 拿到 cache_hit_rate + cached → computeCost (机制 3) → cost_turn 三档
[4] 长会话超阈值 → runCompactionWithLatch (机制 4) → replaced_range 不砍 prefix
```

**联动契约**: 
- 4 机制**不**互相依赖 (机制 1-3 各管一段, 机制 4 只跟 session 格式有关)
- 4 机制**都**是 Sprint 1b / 1b.5 / 1c 时代拍板的, **没有** v1.0 新增
- 4 机制**都**有 focused test, **唯一缺**的是"4 联动"端到端 — D-20.2 补

## 4 机制联动端到端测 (D-20.2 拍板)

`packages/coding-agent/test/integration/prefix-cache-4-mechanisms.test.ts` (新建, 4 个 it):

- **it 1 - 全命中链路**: mock LLM 返 `cached_tokens=900, prompt_tokens=1000, completion=50` → 验 `cache_hit_rate=0.9` / `cost_turn` 走 V4-Flash cache_hit 折扣价 / REPL 4 字段含 `cache: 90% | ¥X/turn | prompt 1k (900 cached)`
- **it 2 - 全 miss 链路**: mock LLM 返 `cached_tokens=0, prompt_tokens=1000, completion=50` → 验 `cache_hit_rate=0` / `cost_turn` 走 cache_miss 全价 / REPL 4 字段含 `cache: 0% | ¥X/turn` 不出现 `(N cached)` 提示
- **it 3 - canonicalizeSchema 稳定**: 同样 tools 列表调 2 次, 第二次 SSE 带 `cached_tokens=900` (跟第一次 1000 prompt 共享 900, 只 100 增量) → 验 canonicalizeSchema 后 LLM 真命中 900 (不是 0)
- **it 4 - Compaction 保 prefix**: 跑 tool loop 4 turn, 第 3 turn 触发 compaction → 验 session JSONL 写 'compaction' event + `replaced_range` 砍中段, 系统 prefix + 最近 2 turn 保留 → 验 LLM 端第 4 turn 仍能命中 cache (因为 prefix 没动)

## 4 机制的可观测性分级

| 机制 | 可观测性 | 观测点 | 失败模式 |
| --- | --- | --- | --- |
| 1 - cache_hit_rate | **强** | RPC `result.cache_hit_rate` / REPL `cache: N%` | 字段 absent → 看不出命中率 |
| 2 - canonicalizeSchema | **弱** (内部) | 实测 LLM 真命中 (端到端) | schema 顺序漂 → cache 全 miss 但 UI 不知道 |
| 3 - cost_turn | **强** | RPC `result.cost_turn` / REPL `¥X/turn` | cost 字段 absent → 钱算不出来 |
| 4 - Compaction 保 prefix | **强** | session JSONL `replaced_range` 索引 | replaced_range 砍 prefix → cache 全 miss 但 session 看似正常 |

机制 2 是**唯一弱可观测**的, 靠"实测 LLM 命中"验证. 拍板保留.

## NOT v1.0 范围 (defer)

- 增量 compaction (D-5-3 之后) — 跟机制 4 协同但当前已 OK
- 跨 LLM provider 的 cache_write / cache_creation 完整拆解 (Anthropic SDK 已有字段, deepseek 没有) — 留 sprint 2
- 用户 ~/.deepwhale/pricing.toml 自定义定价 — 已有 hook, v1.0 走 ship-in `pricing.default.toml`
- cache 自动调优 (改 prompt 让 cache 命中率提升) — 长期优化项, v1.0 接受现状

## 相关文件索引 (一站式)

### 类型 / 算式
- `packages/llm/src/types.ts:74-78` Usage 字段定义
- `packages/llm/src/parse.ts:88-95` parseOaiSseUsageField
- `packages/llm/src/pricing-config.ts:178` cost 算式 (3 档)

### 客户端实装
- `packages/llm/src/deepseek-client.ts:295` stream 路径填 cache_hit_rate
- `packages/llm/src/anthropic-client.ts:464-475` Anthropic stream 路径填 cache_hit_rate
- `packages/llm/src/canonicalize-schema.ts` (Sprint 1b)

### 工具循环
- `packages/coding-agent/src/agent/tool-loop.ts:226-232` canonicalizeSchema 调用
- `packages/coding-agent/src/repl.ts:755-790` formatUsageStatus 4 字段 / 简版
- `packages/coding-agent/src/modes/rpc.ts:357-368` 顶层暴露

### Compaction
- `packages/core/src/session/compaction.ts:209` CompactionState
- `packages/core/src/session/compaction.ts:281` runCompactionWithLatch
- `packages/coding-agent/src/agent/agent-compaction.ts:87` 剥 system prefix 保 replaced_range 同空间
- `packages/coding-agent/src/agent/session-adapter.ts:166` corrupted event skip

### 测试
- `packages/llm/test/pricing-config.test.ts` 13 it (机制 1+3)
- `packages/llm/test/canonicalize-schema.test.ts` (机制 2)
- `packages/coding-agent/test/repl.test.ts:207-330` (机制 1+3 显示)
- `packages/core/test/session-compaction.test.ts` 16 it (机制 4)
- `packages/coding-agent/test/integration/prefix-cache-4-mechanisms.test.ts` (D-20.2 新建, 4 联动)
