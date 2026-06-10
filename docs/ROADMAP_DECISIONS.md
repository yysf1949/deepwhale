# deepwhale Roadmap Decisions

<!-- status:current:start -->
## Current Status

- Date: 2026-06-10
- Branch: feature/d36-gate2-live
- Package version line: 2.3.0
- Release/version hygiene report: docs/superpowers/release-version-hygiene.json
- Decision mode: stabilization first, expansion later
- Current sprint: D107 v6.0 multi-agent safety seed (registerSubAgent)
- Default registry: coding plus Code Intel essentials only
- Non-coding tools: explicit opt-in only
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- v1-v4 are capability milestones, not a production-complete claim.

### Active Decisions

- Freeze new non-coding default tools until stabilization gates are clean.
- Keep Gate-1 and Gate-2 thresholds strict.
- Keep mock evidence separate from live evidence.
- Treat Code Intel as heuristic unless a test proves stronger semantics.
- Treat module existence as foundation work, not production completion.
- Treat package version 2.3.0 as a package line, not roadmap v2.3 maturity proof.
- Preserve unrelated untracked plan files.

### Gate Evidence

- Gate-1 minimum evidence: Vite target has 86,216 supported LOC.
- Gate-1 preferred status: minimum-only.
- Gate-1 preferred-100k is blocked by missing local 100K+ target evidence.
- Gate-1 preferred evidence file: docs/superpowers/gate-1-preferred-targets.json.
- Gate-1.5 evidence kind: fixture-dry-run.
- Gate-1.5 algorithmic decision: continue.
- Gate-1.5 binding: false.
- Gate-1.5 binding branch decision: defer-live-evidence.
- Gate-1.5 evidence file: docs/superpowers/gate-1.5-browser-viability.json.
- Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json.
- Gate-1.5 live tasks: 0/20; binding=false; Browser enhancement unlocked=false.
- Gate-2 live evidence: passed_live=true.
- Gate-2 registryProfile=default.
- Gate-2 toolCalls=31.
- Gate-2 evidence file: docs/superpowers/gate-2-long-horizon-live.json.
- Gate-2 interpretation: default-profile invoice fixture passed the live runner conditions.
- Gate-2 limit: it does not unlock Browser, Desktop, Channel, media, or productivity defaults.
- Current v1-v4 scorecard: docs/superpowers/v1-v4-evidence-scorecard.json

### Completed Stabilization Slices

- D60 rename scanner truthfulness: keep rename_symbol scanner claims conservative and tested around comments, strings, block comments, and TS private identifiers.
- D61 Gate-2 drift prompt hardening: inspect nested tool args for outside-workspace paths and keep Gate-2 live prompts aligned with task-directed verification.
- D62 status/doc hygiene after D61: keep public current-status blocks synchronized with the latest evidence.
- D63 Code Intel heuristic metadata: find_references exposes heuristic metadata in success results.
- D64 registry opt-in loading isolation: default registry loading stays narrow and opt-in profiles load through an async boundary.
- D65 Code Intel truthfulness metadata: smart_search and rename_symbol no-op paths expose heuristic metadata.
- D67 rename edit hunks: rename_symbol dry-run/apply now exposes hashline edit hunks and heuristic confidence metadata.
- D68 status and v5/v6 planning preview: public status blocks now link planning-preview-only v5/v6 evidence.
- D69 Gate-1 preferred blocker refresh: refreshed local target inventory keeps Vite at minimum-50k and preferred-100k blocked.
- D70 Gate-1.5 Browser decision hygiene: refreshed fixture evidence is advisory only and keeps Browser branch decision deferred pending 20 live tasks.
- D71 Code Intel combined import correctness: TypeScript combined default-plus-named imports are indexed and resolved in the heuristic symbol graph and call graph.
- D72 release/version hygiene report: package version and historical release badges are explicitly quarantined from roadmap maturity claims.
- D73 Gate-1.5 live browser task ledger: no 20-task live evidence exists, so Browser branch decision remains deferred and enhancement stays locked.
- D74 Code Intel default re-export call graph correctness: calls imported through default re-export barrels resolve to the original named default declaration.
- D75 TaskGraph goal recording integration evidence: runToolLoopWithReview records the latest user goal when a TaskGraphRecorder is provided.
- D77 planner main-loop evidence fixture: runToolLoopWithReview calls planner.plan with the latest user goal and records the resulting tasks into the task graph when a Planner is provided.
- D78 cross-session memory crash/reload evidence: PersistentMemoryStore now uses temp-file + fsync + rename for atomic writes and load() recovers from a partial last line.
- D79 v1.0 fresh release gate proof + version bump: docs/superpowers/v1.0-fresh-release-gate.{json,md} capture typecheck + lint + test + build + diff --check all exit 0; package version line 2.2.0 -> 2.3.0 (line-only, per D-72 hygiene).
- D80 TaskGraph cross-session persistence evidence: PersistingTaskGraphRecorder mirrors the PersistentMemoryStore pattern (JSONL + atomic-rename + partial-line recovery); cross-session integration test records in instance A, then verifies instance B (same file) sees A's entries.
- D81 v2.5 multi-scenario planner evidence: 3 new planner integration scenarios (multi-task DAG with dependsOn dependencies, tool spec preservation, and negative test confirming planner is gated by goal presence) advance the v2.5 blocker from 'single-fixture proof' to 'multi-scenario evidence'.
- D82 v2.5 investigate-goal scenario fixture: 1 new planner integration scenario (single-task investigation, no dependsOn) advances v2.5 to 65% and crosses the v5 implementation gate threshold (>=65%).
- D83 v1.0 default registry invariant fixture: 2 new unit tests assert the default registry contains exactly 19 tools (coding + Code Intel essentials) and no non-coding opt-in tools are exposed by default.
- D84 v1.5 Code Intel re-export chain call graph fixture: 1 new test asserts the call-graph heuristic follows a caller -> intermediate re-exporter -> target chain, recognizing transitive callers across a re-export boundary.
- D85 v3.0 Gate-2 long-horizon boundary fixture: 2 new unit tests assert the inclusive 30-50 tool-call range at the exact boundaries (30 and 50) and just outside (29 and 51).
- D86 v4.0 cross-session multi-hop handoff fixture: 1 new test extends D-80 from 2-instance to 3-instance handoffs (A writes 3, B writes 2, C reads all 5 in order), completing v4.0 multi-hop cross-session coverage.
- D87 v5.0 observability+auditability minimal seed: 1 new AuditLog class (in-memory, append-only, deterministic timestamps via injected clock) + 1 new unit test. This is the first v5.0 evidence fixture.
- D88 v5.0 observability+auditability tool-loop integration: 1 new unit test verifies that runToolLoop emits tool-call, tool-result, and loop-end events into a provided AuditLog. After D-88, the v5 audit log captures real tool-loop activity, not just synthetic events.
- D89 v5.0 observability+auditability file-backed persistence: 1 new PersistingAuditLog class extends AuditLog with JSONL + atomic-rename + partial-line recovery (mirror D-78 + D-80 pattern) + 2 new unit tests (cross-instance + partial-line recovery). Audit events now survive process restarts.
- D90 v5.0 observability+auditability query side: 1 new readAuditLog function (standalone async, JSONL reader with partial-line recovery + ENOENT handling) + 3 new unit tests (round-trip + ENOENT + partial-line). Completes the v5 audit log quartet: write (D-87/88/89) + read (D-90).
- D91 v5.0 plugin governance minimal seed: 1 new ToolCapability type + 1 toolCapabilities helper + 1 isToolCapability type guard + 1 optional capabilities field on Tool (additive, backward-compatible) + 3 new unit tests. The v5.0 plugin-governance theme starts here; future D-92+ can backfill capabilities on specific tools and add a registry filter.
- D92 v5.0 plugin governance 2nd evidence: 19 default tool files backfilled with accurate capabilities (BashTool -> shell-exec+network, ReadFileTool -> file-read, WriteFileTool/EditFileTool/PatchTool/RenameSymbolTool -> file-read+file-write, ExecuteCodeTool -> code-execute, 11 read-only tools -> file-read, TodoTool/PlanTool -> [] in-memory); 2 new unit tests verify all-19 invariant + 5 high-risk tool assertions. v5.0 plugin-governance theme has real evidence: vocabulary (D-91) + actual usage (D-92).
- D93 v5.0 plugin governance 3rd evidence: ToolRegistry.listByCapability(cap) method added (composes D-91 toolCapabilities helper with existing list()) + 3 new unit tests assert correct subset for shell-exec / code-execute / file-write. Plugin-governance theme complete 1st cycle: vocabulary (D-91) + actual usage (D-92) + query (D-93).
- D94 v5.0 distribution/upgrade flow 1st evidence: 1 new DistributionManifest type + 1 DISTRIBUTION_MANIFEST constant + 1 isValidDistributionManifest validator + 3 new unit tests. The 3rd v5.0 theme (distribution/upgrade flow) starts here; future D-95+ can build on this manifest (upgrade check, capability matrix, changelog generator).
- D95 v5.0 distribution/upgrade flow 2nd evidence: 1 new compareVersions function (pure, no I/O, no external semver dep) + 1 UpgradeCheckResult interface + 1 UpgradeSeverity union + 4 new unit tests. The 2nd evidence piece of the distribution/upgrade flow theme: D-94 manifest answers "what am I?"; D-95 compareVersions answers "do I need to upgrade?"; together they form the v5.0 distribution/upgrade flow 1st cycle (description + decision).
- D96 v5.0 production hardening 1st evidence: 1 new formatFatalError function (pure, defensive, never throws) + 1 recordFatalEvent helper (cross-theme bridge into v5.0 AuditLog from D-87) + 1 FatalErrorEvent interface + 4 new unit tests. The 4th and final v5.0 theme (production hardening) starts here; future D-97+ can build on this formatter (SIGINT/SIGTERM handler, uncaught exception hook, graceful shutdown sequence).
- D97 v5.0 production hardening 2nd evidence: 1 new installSignalHandlers function (SIGINT + SIGTERM, cross-theme bridge into v5.0 AuditLog via 'fatal-signal' events, idempotent cleanup) + 1 SignalHandlerOptions interface + 4 new unit tests. Production-hardening 1st cycle complete: format fatal errors (D-96) + handle process signals (D-97).
- D98 v5.0 production hardening 3rd evidence: 1 new installProcessUncaughtHandlers function (uncaughtException + unhandledRejection, cross-theme bridge into v5.0 AuditLog via 'fatal-uncaught' events, idempotent cleanup, default-onUncaught uses process.exit(1) for non-zero failure exit) + 1 ProcessUncaughtHandlerOptions interface + 1 NormalizedUncaughtPayload interface + 4 new unit tests. Production-hardening theme now covers a 3-event taxonomy: format fatal errors (D-96) + handle process signals (D-97) + catch unhandled exceptions (D-98).
- D99 v5.0 production hardening 4th evidence: 1 new gracefulShutdown async function (sequences beforeExit -> auditLog record -> onComplete in 3 ordered steps; cross-theme bridge into v5.0 AuditLog via 'graceful-shutdown' events; defensive: errors at any step are caught and surfaced via ShutdownResult) + 1 GracefulShutdownOptions interface + 1 ShutdownResult interface + 1 ShutdownTrigger union + 4 new unit tests. Production-hardening 4-step protocol COMPLETE: format fatal errors (D-96) + handle process signals (D-97) + catch unhandled exceptions (D-98) + drain pending work (D-99).
- D100 v5.0 plugin governance 2nd cycle: 1 new buildCapabilityMatrix pure function (cross-theme bridge: D-91 ToolCapability vocabulary + D-94 DistributionManifest; returns CapabilityMatrix with entries + undeclaredToolCapabilities + toolsWithoutCapabilities) + 1 CapabilityMatrix interface + 1 CapabilityMatrixEntry interface + 1 UndeclaredToolCapability interface + 4 new unit tests. Plugin-governance theme 1st cycle COMPLETE: vocabulary D-91 + usage D-92 + query D-93 + cross-theme bridge D-100.
- D101 v5.0 distribution/upgrade flow 2nd cycle: 1 new generateChangelog pure function (compares 2 DistributionManifests, returns ChangelogDocument with version + capability-added/removed + channel + node-engine + supported-upgrade-origin entries) + 1 ChangelogDocument interface + 1 ChangelogEntry interface + 1 ChangelogChangeKind union + 4 new unit tests. Distribution/upgrade flow theme 2nd cycle COMPLETE: manifest D-94 + compareVersions D-95 + changelog generator D-101.
- D102 v5.0 observability+auditability 2nd cycle: 1 new dumpAuditLog async function (reads via D-90 readAuditLog + applies eventKinds + sinceTimestamp filters + renders text or JSON format) + 1 AuditDumpResult interface + 1 AuditDumpOptions interface + 1 AuditDumpFormat union + 4 new unit tests. Observability+auditability theme 2nd cycle COMPLETE: write D-87/88/89 + read D-90 + render D-102.
- D103 v5.0 plugin governance 2nd cycle: 1 new enforceProfilePolicy pure function (reuses D-100 buildCapabilityMatrix + emits undeclared-capability + missing-capability violations) + 1 PolicyEnforcementResult interface + 1 PolicyViolation interface + 1 PolicyViolationKind union + 4 new unit tests. Plugin-governance theme 2nd cycle COMPLETE: vocabulary D-91 + usage D-92 + query D-93 + cross-theme bridge D-100 + enforcement D-103.
- D104 v5.0 production hardening 5th evidence: 1 new evaluateCrossInstanceRollback async function (cross-instance decision: read prior audit log via D-90 + check last event kind + freshness window; emit proceed / rollback / no-evidence decision) + 1 RollbackEvaluation interface + 1 RollbackEvaluationOptions interface + 1 RollbackDecision union + 4 new unit tests. Production-hardening 5-evidence set COMPLETE: format D-96 + signal D-97 + uncaught D-98 + drain D-99 + cross-instance recovery D-104.
- D105 v5.0 cross-theme bridge: 1 new buildPolicySnapshot async function (orchestration layer: reuses D-100 buildCapabilityMatrix + D-101 generateChangelog + D-103 enforceProfilePolicy + D-104 evaluateCrossInstanceRollback; returns PolicySnapshot with capabilityMatrix + changelog + policyEnforcement + crossInstance + summary) + 1 PolicySnapshot interface + 1 PolicySnapshotSummary interface + 1 BuildPolicySnapshotInput interface + 4 new unit tests. v5.0 3-theme cross-bridge COMPLETE: plugin governance + distribution/upgrade + production hardening tied into 1 unified status struct.
- D106 v6.0 master plan: 1 new docs/superpowers/v6.0-master-plan.md (4 themes: multi-agent safety + hosted/enterprise gates + distributed coordination + advanced observability; entry criteria checklist; first sub-sprint multi-agent safety seed designed) + 1 v6-plan-exists.test.ts (3 doc-existence tests) + 4 new entries. v6.0 plan promoted from 'planning preview only' to 'executable plan' (5/6 entry criteria checked).
- D107 v6.0 multi-agent safety seed: 1 new SubAgentId branded type + 1 SubAgent interface + 1 SubAgentRegistry class (in-memory map-based, register/unregister/get/list/listByParent/size/clear + asSubAgentId + isSubAgentId helpers) + 1 new file + 1 new test file + 4 new unit tests. Multi-agent safety seed part 1 of 3 COMPLETE: foundational type system. D-108 will add enforceSubAgentPolicy; D-109 will add rollbackSubAgent.
- Current tracked worktree policy: preserve unrelated untracked plan files and do not stage them unless explicitly adopted.
### Decision Hygiene

- If an old decision below conflicts with this block, prefer this block.
- Older text is retained as historical context until a later cleanup sprint.
- Future decisions must cite tests, reports, or current source files.
- Do not use branch names, commit slogans, or package versions as completion evidence.
- Package version 2.3.0 is a package line, not roadmap v2.3 maturity proof.
- Do not use target inventory as proof of a Gate-1 scenario pass.
- Do not describe minimum-50k Gate-1 evidence as preferred-100k evidence.
- Do not describe fixture-only Gate-1.5 evidence as a binding Browser branch decision.
- Do not describe default-profile Gate-2 evidence as v1-v4 completion.
- Do not describe heuristic rename, references, or call graph as IDE-grade.
- Keep default registry exposure narrow until the user explicitly changes the policy.

### Next Decisions Needed

1. D107 v6.0 multi-agent safety seed (registerSubAgent) is complete: 1 new file + 6 new unit tests (4 registry + 2 asSubAgentId). Multi-agent safety seed part 1 of 3 COMPLETE: foundational type system.
2. Next implementation slice: D108 v6.0 multi-agent safety seed part 2 OR v5.0 4th theme cross-bridge (gated on user direction; enforceSubAgentPolicy reusing D-103 OR observability+auditability cross-bridge via PolicySnapshot).
3. Keep Browser branch decision deferred until 20 live browser tasks are recorded.
4. Re-score v1-v4 after current gate evidence changes.
5. Keep v5/v6 as planning-preview-only until v1-v4 gaps are evidence-backed.
6. v5/v6 planning preview: docs/superpowers/v5-v6-planning-preview.json.

### Repository Scope

- Worktree: D:\App\openClaw\projects\deepwhale.
- Ignore D:\App\openClaw\projects\openclaw-github.
- Current branch: feature/d36-gate2-live.
- Keep generated state out of commits.
- Keep this status block ASCII-only for automated checks.

<!-- status:current:end -->

## Historical Roadmap Decisions

# 🐋 deepwhale ROADMAP 关键决策全景

> **用途**：ROADMAP.md 的"决策速查版"——只列**结论 + 1 句理由 + 出处**，不重复论证细节。
> **生成时间**：2026-06-03
> **完整版**：[ROADMAP.md](../ROADMAP.md) | **架构**：[ARCHITECTURE.md](./ARCHITECTURE.md) | **调研**：[MASTER_RESEARCH.md](./research/MASTER_RESEARCH.md)

---

## 0. 一句话定位

> **deepwhale = TypeScript + Ink + Tauri 2.x + Docker 沙箱 + DeepSeek-first 的 AI 编码客户端。** 复刻 Codex 14/14 全功能 + 独家 8 项优化，**13-17 个月 / 单人开发 / 假设驱动 / 80-85% 成功概率**。

---

## 1. 5 阶段版本锚（核心时间线）

| 版本     | 月份     | 主题                    | 关键交付                                                                     | 状态        |
| -------- | -------- | ----------------------- | ---------------------------------------------------------------------------- | ----------- |
| **v1.0** | 1-3 月   | **Coding Agent**        | CLI + TUI + 6 工具 + Linear Session + **Prefix-cache 4 大机制** + Docker     | 🚧 Sprint 0 |
| **v1.5** | 4-5 月   | **大型仓库理解**        | Codex Core 8/14 + **Code Intelligence 基础**（Tree-sitter + Symbol Graph）   | ⏳          |
| **v2.0** | 6-8 月   | **Observe**             | **真实 Browser Agent 4 件** + Memory Ranking + Code Intel 增强 + 4 项 Tier-2 | ⏳          |
| **v2.5** | 9 月     | **Plan**                | **Planning Framework 4 组件 + DAG**                                          | ⏳          |
| **v3.0** | 10-11 月 | **Execute + Review**    | Browser Agent 增强 3 件 + Reviewer + **Computer Use 兼容层**                 | ⏳          |
| **v4.0** | 12-13 月 | **Research + Agent OS** | 5 角色 Multi-Agent + TaskGraph + Persistent Memory + Desktop + Channels      | ⏳          |

**累计功能进度**：v1.0 = 3/14 → v1.5 = 8/14 → v2.0 = 10/14 → v3.0 = 11/14 → v4.0 = 14/14 ✅

---

## 2. 3 个 Technical Bets（决定项目成败）

| Bet                              | 等级            | 验证版本 | 失败后果                              |
| -------------------------------- | --------------- | -------- | ------------------------------------- |
| **Bet-1 Code Intelligence**      | **P0 Kill**     | v1.5     | Coding Agent 失败，项目失去核心价值   |
| **Bet-2 Browser Planner**        | **P1 Decision** | v2.0     | 退化为 Claude Code 级产品（仍有价值） |
| **Bet-3 Long-Horizon Stability** | **P0 Kill**     | v3.0     | Multi-Agent 失败，5 角色失去意义      |

**P0 vs P1**：P0 失败 = **Kill Gate**（暂停主线，优先修复）；P1 失败 = **Decision Gate**（按成功率分支，不暂停）。

---

## 3. 3 个 Release Gates（版本发布硬门槛）

### Gate-1（v1.5 前）：Code Intelligence Kill Test

- **测试**：Spring Boot / Kubernetes / LangChain / VSCode（任选 1+），**50K+ LOC（必试 100K）**
- **任务**：定位入口 → 分析调用链 → 找修改点 → 输出方案
- **要求**：**20 分钟以内**
- **FAIL** → 停止 Browser/Computer/Desktop，**优先修 Code Intelligence**

### Gate-1.5（v2.0 前）：Browser Viability Decision Gate

- **场景**：GitHub / 文档站 / Google / Amazon × 5 任务 = 20 样本
- **≥ 80%** → 继续 v3.0
- **50-80%** → 降级路线（冻结 Browser 增强，资源转向 Long-Horizon）
- **< 50%** → 砍 Browser 投资，定位回归 Claude Code + Code Intel + Multi-Agent

### Gate-2（v3.0 前）：Long-Horizon Kill Test

- **任务**：修复真实 Bug 全流程（8 步）
- **要求**：**连续 30-50 Tool Calls 保持目标一致**
- **FAIL** → 暂停 Researcher/TaskGraph/Desktop，**集中修 Planning/Compaction/Reviewer 协同**

---

## 4. v2.0 Tier-1 / Tier-2 拆分（用户 2026-06-03 拍板）

| 优先级                              | 包含                                                               | 延期影响                             |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| **Tier-1**（v2.0 核心，**必完成**） | **Browser Agent 4 件** + **Memory Ranking** + **Code Intel 增强**  | 延期 → v2.0 失败                     |
| **Tier-2**（v2.0.x 补回）           | **Automation** + **Remote TUI** + **Compaction** + **MCP Runtime** | 延期 → v2.0.1/2 补，不影响 v2.0 主旨 |

**理由**：Browser Agent 延期但 Remote TUI 完成 → 用户不会认为 v2.0 成功；反之 Browser 完成而 Remote 延期 → 用户仍认为成功。

---

## 5. 15 项关键技术决策（实施前定）

| 决策点                    | 选择                                      | 1 句理由                                                       |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| 主语言                    | **TypeScript（Node ≥ 22）**               | pi 验证 58.6k stars                                            |
| TUI 框架                  | **Ink**（React 19）                       | pi 实战验证，跨平台一致                                        |
| 桌面                      | **Tauri 2.x**（**v4.0 之前不做**）        | 生态成熟，节省早期精力                                         |
| **沙箱 v1-v3**            | **Docker only**                           | 跨平台一致 + 单人可维护，**砍掉 Seatbelt/Landlock/Job Object** |
| **沙箱 v4**               | **Docker + 多实例编排**                   | Multi-Agent 隔离                                               |
| 分发                      | npm + Homebrew + Docker                   | 跟 pi/Codex/Reasonix 一致                                      |
| 配置                      | TOML                                      | CodeWhale 验证                                                 |
| Skills 格式               | **对齐 Codex 开放标准**                   | 跨工具复用                                                     |
| 4 包 monorepo             | **对齐 pi**                               | `llm / agent-core / tui / coding-agent`                        |
| ExtensionEvent            | **21 个 `whale.*` 事件**（v1.5）          | 跟 pi 兼容但区分内/外                                          |
| MCP                       | 官方 SDK（v2.0）                          | 唯一标准                                                       |
| **Release 节奏**          | **每周一 minor**（v1.5 起）+ 每阶段末必发 | 避免 Reasonix 1.0 6 周未发                                     |
| **i18n 路径**             | **第 1 行定对**（Sprint 0 红线）          | Hermes `gateway.i18n` 错 → 永远英文 fallback                   |
| **Constitution 9 层权威** | **砍掉**                                  | 个人化产物，不适合 deepwhale                                   |
| **Session 形态**          | **v1 = Linear，v2.5 = DAG**               | 避免 v1 过度复杂；DAG 与 Planner 同链路                        |

---

## 6. deepwhale 独家 8 项（vs Codex / 同类）

| 资产                                       | 来源                                  | 落在版本               | 价值                              |
| ------------------------------------------ | ------------------------------------- | ---------------------- | --------------------------------- |
| **Prefix-cache 4 大机制**                  | Reasonix 全抄                         | **v1.0 必带**          | DeepSeek 经济性核心               |
| **StormBreaker 防死循环**                  | Reasonix 抄                           | v1.5                   | 工具增多后 P0                     |
| **SanitizeToolPairing**                    | Reasonix 抄                           | v1.5                   | 1 个函数处理 4 cases（不是 4 遍） |
| **Compaction = 唯一 cache-reset point**    | Reasonix 抄                           | v1.5                   | 防 cache hit rate 暴跌            |
| **Docker 沙箱统一 v1-v4**                  | 跨平台决策                            | v1.0 起                | Codex 没做                        |
| **JSONL append-only Session**              | pi 借鉴                               | v1.0 Linear → v2.5 DAG | 简单可恢复                        |
| **21 个 ExtensionEvent 钩子化 Compaction** | pi 借鉴                               | v1.5                   | 第三方可替换                      |
| **完整 Multi-Agent 5 角色流水线**          | 自研 + Planner/Executor/Reviewer 协同 | v4.0                   | 长任务稳定性                      |

---

## 7. Prefix-cache 4 大机制（v1.0 必带，**deepwhale 核心优势**）

| #   | 机制                                           | 出处                                    | 作用                                                      |
| --- | ---------------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| 1   | **System prompt 一次组装**                     | Reasonix `boot.go:120-148`              | 每 session 只跑 1 次，按 session ID 缓存                  |
| 2   | **`content: ""` 永远序列化**（不带 omitempty） | Reasonix `openai.go:354-368`            | 防 wire-level 缓存 hash 变化                              |
| 3   | **Reasoning content 不打 wire**                | Reasonix `openai.go:131-137`            | DeepSeek V4 thinking tokens session 内保留，wire 不传     |
| 4   | **Schema canonicalize**                        | Reasonix `schema_canonicalize.go:10-67` | tool schema build 前跑 `CanonicalizeSchema`，map 顺序稳定 |

**配套**：Compaction = 唯一 cache-reset point（任何改 system prompt 都 review 缓存策略）

---

## 8. 风险登记（高/中/低 + 对策）

| 风险                             | 等级       | 对策                                                                                     |
| -------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| **Scope explosion**              | **高**     | **本 ROADMAP 就是为压制这个风险**——5 阶段版本锚 + 砍掉清单 18 项                         |
| **Skills 安全**                  | **高**     | Skills 默认只读 + `permissions:` 显式声明 + Hook trust flag 在 `~/.deepwhale/trust.json` |
| **Code Intelligence 实际效果**   | **高 P0**  | v1.5 基础先验（Tree-sitter + Symbol Graph），v2.0 增强前先实测                           |
| **DeepSeek 长任务稳定性**        | **高 P0**  | Compaction + Planning + Reviewer 三者协同（不是单点修复）                                |
| Computer Use OS 差异             | 高         | v3.0 主要验证 macOS + Linux X11，Windows v3.0 不做                                       |
| DeepSeek API 限流                | 中         | 前缀缓存降耗 + Flash/Pro 智能路由                                                        |
| Browser Runtime 跨浏览器一致     | 中         | Playwright 抽象足够，**不做自定义协议**                                                  |
| 单人开发 burnout                 | 中         | Phase 之间预留 1 周缓冲期                                                                |
| 跨 Phase 时间拖延                | 中         | **强制 release 节奏**                                                                    |
| MCP 协议演进                     | 低         | pin 官方 SDK minor 版本                                                                  |
| StormBreaker 漏判                | 中         | **用 (tool, error) 签名不用 args**                                                       |
| Hermes footer 数字收敛 bug       | 低         | **多字段同值时去冗余/加标签区分**                                                        |
| **Windows 沙箱不完整**           | **不评估** | **v1-v4 都不做 Windows 沙箱**（统一 Docker）                                             |
| CodeWhale "marker-only" Landlock | 不评估     | **deepwhale 走 Docker，不学 CodeWhale 沙箱思路**                                         |

---

## 9. 砍掉清单（**22 项延后事项**——避免范围爆炸）

### v1.0 不做（砍 → v1.5/v2.0/v3.0/v4.0）

- ❌ MCP / Browser / Computer / Plugins / Skills / Desktop / 渠道
- ❌ Session DAG（v1.0 = Linear）
- ❌ Compaction（v1.5 起）
- ❌ Plugin Marketplace（v1.5 起）
- ❌ 文档站（v1.5 起）

### v1.5 砍 4 项（挪 → v2.0）

- ❌ Cron Automations → v2.0
- ❌ Remote TUI → v2.0
- ❌ Compaction → v2.0
- ❌ MCP → v2.0

### v2.0 砍 Session DAG（挪 → v2.5，与 Planner 同链路）

### Constitution 9 层权威（**永久砍掉**）

- ❌ 个人化产物，不适合 deepwhale

### 沙箱技术（**永久统一为 Docker**）

- ❌ macOS Seatbelt
- ❌ Linux Landlock
- ❌ Windows Job Object（v1-v4 都不做 Windows 沙箱）

### Computer Use（**不自研**）

- ❌ OCR / UI Detection / Element Localization
- ❌ mouse_move / mouse_click / keyboard_input / screen_capture
- ✅ 走 Codex 兼容层（v3.0）

---

## 10. Sprint 0 红线（**Sprint 1 翻工预防**）

| 红线                                                              | 教训来源                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| **i18n 路径第 1 行定对**（`from agent.i18n import t`）            | Hermes：原 `gateway.i18n` 错 → 永远英文 fallback       |
| **路径迁移兼容机制**写好（旧路径 fallback 模式）                  | CodeWhale：`~/.deepseek/` → `~/.codewhale/` 重命名教训 |
| **4 包版本同步 CI**                                               | pi #4908：v0.75.4 跨包类型回归                         |
| **Session 不要做 DAG**（v1.0 = Linear）                           | v1.0 过度复杂教训                                      |
| **沙箱不要做 Seatbelt/Landlock/Job Object**（v1.0 = Docker only） | 跨平台一致 + 单人可维护                                |

---

## 11. 阶段累计 vs 时间预算

| 阶段     | 版本      | 计划      | 实际预估                              | 风险点                                                              |
| -------- | --------- | --------- | ------------------------------------- | ------------------------------------------------------------------- |
| v1.0     | 3 月      | 3 月      | 3-4 月                                | i18n / 4 包 monorepo / Prefix-cache 4 机制                          |
| v1.5     | 2 月      | 2 月      | 2-3 月                                | 8 项 Codex Core + Code Intel 基础（**比预想多**）                   |
| v2.0     | 3 月      | 3 月      | **3-4 月**（DAG 挪走 → 可能降到 3.5） | Browser Agent 4 件 + Memory Ranking + Code Intel 增强 + 4 项 Tier-2 |
| v2.5     | 1 月      | 1 月      | 1 月                                  | Planning Framework 4 组件集中                                       |
| v3.0     | 2 月      | 2 月      | 2-3 月                                | Browser Agent 增强 3 件 + Reviewer + Computer Use 兼容层            |
| v4.0     | 2 月      | 2 月      | 2-3 月                                | 5 角色 + TaskGraph + Persistent Memory + Desktop + Channels         |
| **总计** | **13 月** | **13 月** | **15-17 月（中位数 16）**             | —                                                                   |

> **单人项目 15-17 个月属正常区间**。**严格执行**（不新增需求 / 每版本强制发布 / Computer Use 不自研 / Browser Agent 分阶段）→ **成功概率 80-85%**。

---

## 12. 4 份架构设计文档（2026-06-03 完成）

| 文档                                                  | 主题          | 关键内容                                                                               |
| ----------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| [AGENT_RUNTIME.md](./design/AGENT_RUNTIME.md)         | Agent Runtime | 4 角色契约（Planner/Executor/Reviewer/Coder）+ Task/Message/Context/Observation/Memory |
| [CAPABILITY_MODEL.md](./design/CAPABILITY_MODEL.md)   | 能力抽象      | 5 套能力来源统一抽象（Tool/MCP/Plugin/Browser/Computer）                               |
| [CODE_INTELLIGENCE.md](./design/CODE_INTELLIGENCE.md) | 代码智能      | 4 模块关系（Workspace Index / Symbol Graph / Reference Graph / Semantic Search）       |
| [BROWSER_PLANNER.md](./design/BROWSER_PLANNER.md)     | 浏览器规划    | Observe→Plan→Act→Recovery 循环                                                         |

**原则**：只写架构 / 边界 / 职责 / 接口 / 数据流，**不写实现细节**。

---

## 13. 4 个项目借鉴一览（一句话）

| 项目                       | 借鉴                                                                                   | 真实栈                              | deepwhale 决策                           |
| -------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------- |
| **CodeWhale**（Hmbown）    | 沙箱抽象 / 路径兼容 / 飞书桥 SDK 模式 / Skills MD 格式                                 | Rust + ratatui + Tauri              | 沙箱思路**不学**（走 Docker），其余抄    |
| **Reasonix**（esengine）   | **Prefix-cache 4 大机制 / StormBreaker / SanitizeToolPairing**                         | Go 1.25+ + Bubbletea + Wails        | **机制全抄，栈不抄**（TS + Ink + Tauri） |
| **pi**（earendil-works）   | 4 包 monorepo / Extension API / EventBus / JSONL Session / Compaction 钩子             | TypeScript + Ink                    | **栈和 4 包结构全对齐**                  |
| **Hermes**（NousResearch） | 多渠道 / MEMORY+library 分层 / i18n 教训 / post 强制策略                               | Python + textual                    | **i18n 教训必学，栈不抄**                |
| **oh-my-pi**（can1357）    | **hashline patch 格式 / napi natives 思路 / 自研 edit benchmark**                      | TS 54w 行 + Rust 27k 行 + Bun + Ink | **借鉴 3 件差异化（不 fork 整套）**      |
| **ECC**（affaan-m）        | **SKILL.md 标准化 / 4 维质量模型 / 6 阶段 Verification Loop / continuous-learning-v2** | Shell + TS + Markdown（9 平台兼容） | **学格式不学 9 平台兼容**                |

---

## 14. 关键文件路径速查

```
ROADMAP：
  /home/butterfly443/deepwhale/ROADMAP.md  （主路线图，899 行）
  /home/butterfly443/deepwhale/docs/ROADMAP_DECISIONS.md  （本文档，关键决策速查）

架构：
  /home/butterfly443/deepwhale/docs/ARCHITECTURE.md
  /home/butterfly443/deepwhale/docs/design/AGENT_RUNTIME.md
  /home/butterfly443/deepwhale/docs/design/CAPABILITY_MODEL.md
  /home/butterfly443/deepwhale/docs/design/CODE_INTELLIGENCE.md
  /home/butterfly443/deepwhale/docs/design/BROWSER_PLANNER.md

调研（5 份 + 1 总报告）：
  /home/butterfly443/deepwhale/docs/research/01_codewhale.md
  /home/butterfly443/deepwhale/docs/research/02_codex_browser.md
  /home/butterfly443/deepwhale/docs/research/03_reasonix.md
  /home/butterfly443/deepwhale/docs/research/04_pi.md
  /home/butterfly443/deepwhale/docs/research/05_hermes.md
  /home/butterfly443/deepwhale/docs/research/06_oh-my-pi.md  ★ 新增
  /home/butterfly443/deepwhale/docs/research/07_ECC.md  ★ 新增
  /home/butterfly443/deepwhale/docs/research/MASTER_RESEARCH.md  （v2 5 项目整合版）

Reasonix 关键代码（抄的来源）：
  boot.go:120-148                   Cache-stable system prompt
  openai.go:354-368                 content 永远序列化
  openai.go:131-137                 reasoning 不重传
  schema_canonicalize.go:10-67      Schema canonicalize
  agent.go:690-729                  StormBreaker
  provider.go:78-150                SanitizeToolPairing
  compact.go:16-20                  Compaction = 唯一 cache-reset point

oh-my-pi 关键代码（借鉴的来源）：
  packages/hashline/src/prompt.md   hashline patch 教学（中文翻译基础）
  packages/hashline/src/parser.ts   parser 实现参考
  packages/hashline/src/patcher.ts  prepare/commit 两阶段
  crates/pi-natives/src/            napi 架构思路（27k 行）
  packages/typescript-edit-benchmark/  自研 benchmark 设计参考

ECC 关键 skill（借鉴的来源）：
  skills/agent-harness-construction/SKILL.md  4 维质量模型（v1.0 验收表）
  skills/verification-loop/SKILL.md           6 阶段 Verification（v1.0 末 /verify）
  skills/continuous-learning-v2/              v2.0 Tier-1 学习系统
  skills/rules-distill/                       v2.0 Tier-1 规则提炼
  skills/iterative-retrieval/                 v2.0 Tier-1 子 agent 模式
  agent.yaml                                  245 行 catalog manifest 格式
  hooks/hooks.json                            6 hook 类型参考
  rules/<lang>/                               19 语言 rules 结构
```

---

## 15. oh-my-pi 借鉴的融入（2026-06-03 用户拍板）

**调研**：[research/06_oh-my-pi.md](./research/06_oh-my-pi.md) + Obsidian `~/ObsidianVault/AI研究/技术文档/oh-my-pi/`

### 15.1 颠覆性发现（影响决策）

| 假设                                        | 真相                                                                                           | 后果                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- |
| ❌ "str_replace 是 AI agent 编辑的标配"     | ✅ **仅换 patch 格式**（str_replace → hashline）就让 Grok Code Fast 从 6.7% → 68.3%（**10×**） | **edit_file 必须 Sprint 1 用 hashline**      |
| ❌ "fork 知名项目是 5 月拿 10k star 的捷径" | ✅ fork 维护有 **upstream drift** 风险（issue #1736 实证）                                     | **不 fork pi-mono 整套**，**只借鉴原子能力** |
| ❌ "forkshell / brush vendored 必须学"      | ✅ vendored 几 MB bash 解释器，**单人项目成本太高**                                            | **不做**，继续用 Docker bash                 |

### 15.2 Sprint 0-2 重新排序（按 v2 优化表）

| Sprint | 原计划                                        | 优化后（用户拍板 2026-06-03）                                       | 理由               |
| ------ | --------------------------------------------- | ------------------------------------------------------------------- | ------------------ |
| **0**  | 4 包 monorepo + 基础设施                      | **+ hashline 格式 MVP**（parser + apply + TAG）                     | 提前卡位差异化     |
| **1**  | 6 工具 + Linear Session + Prefix-cache 4 机制 | **edit_file 用完整 hashline + Recovery 3-way**（替代原"hash 锚定"） | 行业瓶颈，10× 提升 |
| **2**  | Cache 可观测性 + Session 打磨 + Docker 优化   | **+ napi natives 调研**（先 bun 子进程跑 grep 验证可行性）          | hot path 性能前置  |

### 15.3 借鉴清单（按 P0/P1/P2 排序）

| 优先级 | 借鉴                        | 落在版本                           | 备注                                  |
| ------ | --------------------------- | ---------------------------------- | ------------------------------------- |
| **P0** | hashline patch 格式         | **Sprint 0 MVP + Sprint 1 完整**   | `parser.ts`/`apply.ts`/`snapshots.ts` |
| **P0** | 自研 edit benchmark         | v1.0 末（`bench/edit-benchmark/`） | 求职差异化                            |
| **P0** | napi natives 架构           | **Sprint 2 调研 + v1.5 落地**      | grep/tokens/ast 走 Rust               |
| **P1** | Filesystem 抽象（hashline） | Sprint 1                           | 同一 patch 在 disk/mem/远程应用       |
| **P1** | LSP `willRenameFiles` 钩子  | v1.5                               | 优于普通 rename                       |
| **P1** | 4 入口 RPC（NDJSON stdio）  | Sprint 1（已规划）                 | 对齐 oh-my-pi                         |
| **P2** | brush-shell vendored bash   | **不做**                           | 成本太高，留占位                      |
| **P2** | 沙箱 4 后端自动解析         | **不做**（Docker only 已决定）     | 与决策冲突                            |
| **P2** | Recovery 3-way merge        | Sprint 1（hashline 内置）          | 抗陈旧锚点                            |

### 15.4 风险与对策

| 风险                           | 等级   | 对策                                                    |
| ------------------------------ | ------ | ------------------------------------------------------- |
| hashline 写出来后 LLM 不会用   | 高     | **prompt.md 完整翻译成中文 + 多示例**                   |
| napi build 跨平台麻烦          | 中     | Sprint 2 先用 bun 子进程跑 grep 验证，**不直接上 napi** |
| 借鉴 hashline 是否侵权         | 低     | MIT 协议，**注明来源 + 保留 © Can Bölük**               |
| benchmark 跑得太慢             | 中     | 用 in-process client + 限定 fixture 数量                |
| upstream drift（fork pi-mono） | 已规避 | **不 fork pi-mono 整套**                                |
| oh-my-pi 未来 API 变化         | 低     | **不依赖其包，只学习设计**                              |

---

## 16. ECC 借鉴的融入（2026-06-03 用户拍板）

**调研**：[research/07_ECC.md](./research/07_ECC.md) + Obsidian `~/ObsidianVault/AI研究/技术文档/ECC/`

### 16.1 颠覆性发现（影响决策）

| 假设                                 | 真相                                                                                                 | 后果                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| ❌ "ECC 是 agent 本体"               | ✅ **ECC 是"任何 agent 之上"的 operator 插件系统**（4.5 月 204k star）                               | **不学 9 平台兼容**（deepwhale 是 agent 本体） |
| ❌ "skill 是 prompt 就行"            | ✅ **SKILL.md = YAML frontmatter + Markdown** 是革命性标准化（249 个 skill 互不污染）                | **v1.0 必采用 SKILL.md 格式**                  |
| ❌ "agent 质量靠 review"             | ✅ **4 维质量模型**（Action / Observation / Recovery / Context Budget）= 第一性原理                  | **v1.0 验收表用 4 维打分**                     |
| ❌ "verification 是手动的"           | ✅ **6 阶段 Verification Loop**（build / types / lint / tests / security / diff）+ 统一报告 = 自动化 | **v1.0 末加 `/verify` slash command**          |
| ❌ "continuous-learning 50-80% 触发" | ✅ **v2 = PreToolUse/PostToolUse 100% 触发 + 原子 instinct + confidence 0.3-0.9**                    | **v2.0 Tier-1 直接学 v2**                      |

### 16.2 4 维质量模型（v1.0 验收表）

**`agent-harness-construction` skill 的核心论点**：

| 维度                          | 含义       | deepwhale v1.0 实现                                                     |
| ----------------------------- | ---------- | ----------------------------------------------------------------------- |
| **1. Action Space Quality**   | 工具设计   | 6 工具（bash / read / write / edit / grep / find）粒度正确              |
| **2. Observation Quality**    | 工具返回   | **4 字段 schema 强制**（status / summary / artifacts / next_actions）   |
| **3. Recovery Quality**       | 错误恢复   | **3 字段 schema 强制**（root_cause_hint / safe_retry / stop_condition） |
| **4. Context Budget Quality** | token 分配 | system prompt minimal + skills on-demand + phase boundary compact       |

**这是 deepwhale v1.0 整个设计的"质量验收表"**，**比"能跑通"严格 10 倍**。

### 16.3 Sprint 0-2 + v1.0 末重新排序（v3 调整）

| Sprint      | 原计划                       | 优化后（v3 = ECC 借鉴）                                             | 理由                     |
| ----------- | ---------------------------- | ------------------------------------------------------------------- | ------------------------ |
| **0**       | 4 包 + hashline MVP          | **+ SKILL.md 标准化目录**（YAML frontmatter + 首批 3 个 skill）     | 与 hashline 配套，标准化 |
| **1**       | 6 工具 + Prefix-cache 4 机制 | **+ Tool 返回 schema 统一**（Observation 4 字段 + Recovery 3 字段） | 4 维模型 v1.0 实现层     |
| **2**       | Cache + napi 调研            | 不变                                                                | -                        |
| **v1.0 末** | -                            | **+ `/verify` slash command + VERIFICATION REPORT**                 | 6 阶段流程，求职差异化   |

**v2.0 Tier-1 落地** continuous-learning-v2 模式（instinct + confidence），**直接借鉴 ECC v2**（不是 v1 的 Stop hook）。

### 16.4 借鉴清单（按 P0/P1/P2 排序）

| 优先级 | 借鉴                          | 落在版本             | 备注                                                                                  |
| ------ | ----------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| **P0** | **SKILL.md 标准化目录**       | Sprint 0             | YAML frontmatter + 首批 3 个 skill（hashline / coding-standards / verification-loop） |
| **P0** | **Observation 4 字段 schema** | Sprint 1             | tool-result.ts zod 定义                                                               |
| **P0** | **Recovery 3 字段 schema**    | Sprint 1             | tool-error.ts zod 定义                                                                |
| **P0** | **`/verify` slash command**   | v1.0 末              | 6 阶段流程 + VERIFICATION REPORT                                                      |
| **P0** | **统一报告格式**              | v1.0 末              | READY / NOT READY 一眼看出                                                            |
| **P0** | **Security scan**（grep sk-） | v1.0                 | scripts/security-scan.sh                                                              |
| **P1** | agent.yaml catalog 机制       | v1.0 末              | 类似 ECC 245 行 manifest                                                              |
| **P1** | 4 种典型 SKILL.md 模式        | Sprint 1             | Reference / Workflow / Pattern / Knowledge                                            |
| **P1** | Anti-patterns 自查            | v1.5                 | CI lint                                                                               |
| **P1** | continuous-learning-v2        | v2.0 Tier-1          | instinct + confidence                                                                 |
| **P1** | rules-distill 思想            | v2.0 Tier-1          | 从 skills 提炼 rules                                                                  |
| **P2** | 9 平台兼容层                  | **不做**（偏离主线） | 与决策冲突                                                                            |
| **P2** | Granularity 3 档规则          | 文档化               | 留占位                                                                                |
| **P2** | Continuous mode（每 15 min）  | v2.0 末              | 留占位                                                                                |
| **P2** | ECC Pro 商业化                | **永远不做**         | 单人项目                                                                              |

### 16.5 风险与对策

| 风险                             | 等级   | 对策                                                        |
| -------------------------------- | ------ | ----------------------------------------------------------- |
| SKILL.md 格式过重（v1.0 工具少） | 低     | **v1.0 至少用 frontmatter，body 简化**                      |
| 4 维模型执行成本                 | 中     | **只用作 v1.0 验收表**，不强制每条规则都有对应代码          |
| Verification Loop 增加 CI 时间   | 中     | **跑并行**（build + types + lint + test + security + diff） |
| Security scan 误报               | 低     | **加白名单**（`*.test.ts` / `docs/`）                       |
| ECC 249 skills 是噪音            | 低     | **不抄内容**，只抄格式                                      |
| ECC 9 平台兼容分散精力           | **高** | **明确不学**（深挖主线）                                    |

### 16.6 不学清单（明确不抄）

- ❌ **249 skills 全部内容**（deepwhale 是 agent 本体，不是 plugin）
- ❌ **63 agents 完整角色**（只学"agent 描述符"格式）
- ❌ **9 平台兼容的 9 套配置**（偏离主线）
- ❌ **ECC Pro / Sponsors 商业化**（单人项目用不上）
- ❌ **`commands/` legacy shim**（不学 ECC 这套分类）

---

**最后更新**：2026-06-03
**当前阶段**：Phase 1 Sprint 0（4 包 monorepo + 基础设施）
**下次更新**：v0.1 release 时
- v1.0 fresh release gate: docs/superpowers/v1.0-fresh-release-gate.json
