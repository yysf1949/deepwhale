# 🦮 Hermes（NousResearch/hermes-agent）深度研究

> **研究目标**：复用 Hermes 多渠道 + Plugins + MEMORY/library 分层
> **研究时间**：2026-06-02
> **覆盖版本**：本地 Hermes v2026.5.7-476（开发版）

## 1. 项目概览

| 字段     | 值                                                      |
| -------- | ------------------------------------------------------- |
| 仓库     | https://github.com/NousResearch/hermes-agent            |
| 当前版本 | v2026.5.7-476（本地开发版）                             |
| 主语言   | **Python**                                              |
| 部署     | Ubuntu 24.04 VM + s6 容器                               |
| License  | MIT                                                     |
| 关键功能 | 多渠道 / Plugins / Cron / Session 持久化 / Context 压缩 |

## 2. 核心架构

```
┌──────────────────────────────────────────────────────┐
│  Channels（多渠道）                                    │
│  飞书 │ Telegram │ 邮件 │ 微信 │ Web                  │
└─────────────────────────┬────────────────────────────┘
                          ↓ 统一 Gateway
┌──────────────────────────────────────────────────────┐
│  GatewayRunner                                        │
│  ├─ i18n（from agent.i18n import t）                  │
│  ├─ Plugins（猴子补丁拦截 _run_agent）                │
│  ├─ Session 持久化（~/.hermes/sessions/）              │
│  └─ Context 压缩（session-archiver）                   │
└─────────────────────────┬────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│  Agent Core（LLM 调度 + Tools）                        │
└──────────────────────────────────────────────────────┘
```

## 3. 关键资产

### 3.1 多渠道 Channel 模式

来源：`gateway/platforms/{feishu,telegram,email,weixin}.py`

- 每个渠道独立适配器
- 统一 RPC 投递到 GatewayRunner
- 流式响应回写

### 3.2 Plugins 机制

来源：`hermes-agent/plugins/`

- 每个 plugin 一个目录
- 通过猴子补丁拦截 `GatewayRunner._run_agent`
- 支持 hot-reload（mtime 检测）

### 3.3 MEMORY + library 分层

来源：`~/.hermes/`

```
~/.hermes/
├── MEMORY.md              # 短期记忆（注入 system prompt）
├── memories/library/      # 长期知识（按需加载）
├── sessions/              # JSONL session 持久化
├── plugins/               # 本地 plugin
└── skills/                # 本地 skill
```

## 4. 关键踩坑（5+ 次实战教训）

| #   | 坑                                       | 教训                                                                                      | deepwhale 怎么避                                                          |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | **response-footer 插件 hot-reload 失灵** | mtime 检测在 `register()` 内，重载后失效                                                  | **mtime 检测必须在 wrapper 内部**                                         |
| 2   | **i18n 永远英文 fallback**               | 原写 `from gateway.i18n import t`，路径错                                                 | **Sprint 0 第 1 行定对 `from agent.i18n import t`**                       |
| 3   | **飞书表格 markdown 不渲染**             | 默认 text 消息类型，表格压成行                                                            | **强制走 post payload**（message_id=om_x100b6ee7c17cfca0c2d94a6a3087ac5） |
| 4   | **footer 数字收敛 bug**                  | api_calls==1 时 `session_input_tokens` 和 `last_prompt_tokens` 相等，用户报"上下文不对了" | **多字段同值时去冗余/加标签区分**（用户视角 = bug，不辩护语义）           |
| 5   | **Hermes update npm ci 25min 无 stdout** | lifecycle 阶段，CPU 8%，看似卡死                                                          | **别在 25min 内 kill**                                                    |

## 5. Hermes 飞书 Post 强制策略

来源：`gateway/platforms/feishu.py:4308-4317`

```python
# _build_outbound_payload
if _MARKDOWN_HINT_RE.search(content) or _MARKDOWN_TABLE_RE.search(content):
    return "post", _build_markdown_post_payload(content)
```

**保留 LRU 缓存**（行 243/1452-1456/3963/3985）。

**对 deepwhale 价值**：deepwhale Sprint 4 飞书桥直接抄这段。

## 6. 借鉴清单

### P0 — 必须抄

| 借鉴点                | 真实出处                                   | deepwhale 落地                   |
| --------------------- | ------------------------------------------ | -------------------------------- |
| 多渠道 channel 模式   | `gateway/platforms/*.py`                   | 飞书/Telegram/邮件/微信 4 个渠道 |
| MEMORY + library 分层 | `~/.hermes/{MEMORY.md, memories/library/}` | 抄                               |
| Session JSONL 持久化  | `~/.hermes/sessions/`                      | 跟 pi JSONL DAG 互补             |
| i18n 路径第一行定对   | `from agent.i18n import t`                 | **Sprint 0 红线**                |

### P1 — 强烈建议

| 借鉴点                   | 真实出处                                | deepwhale 落地                                                               |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------- |
| Plugins 猴子补丁         | 拦截 `GatewayRunner._run_agent`         | 类似 deepwhale Extension，但 Hermes 用 monkey patch（不推荐 deepwhale 照搬） |
| Cron no_agent watchdog   | cronjob no_agent=True                   | Sprint 5 用                                                                  |
| 飞书 post 强制           | `gateway/platforms/feishu.py:4308-4317` | Sprint 4 飞书桥抄                                                            |
| 多渠道 footer 字段去冗余 | 教训 #4                                 | Sprint 4 footer 设计红线                                                     |

### P2 — 看情况

| 借鉴点                | 真实出处               | 评估                                       |
| --------------------- | ---------------------- | ------------------------------------------ |
| s6 容器化             | Hermes 用 s6 跑 daemon | deepwhale 桌面用 Tauri，CLI 用 npm，不需要 |
| TUI textual（Python） | Hermes 用 textual      | deepwhale TS 栈用 Ink                      |

### 不要抄

| 反面教训                       | 教训                              |
| ------------------------------ | --------------------------------- |
| mtime 检测在 register() 内     | **wrapper 内部**                  |
| i18n 路径错                    | **第 1 行定对**                   |
| 飞书走 text 消息类型           | **强制 post**                     |
| 辩护 footer 数字收敛"语义正确" | **用户视角 = bug**                |
| 25min 内 kill npm ci           | **lifecycle 阶段，CPU 8% = 正常** |

## 7. 关键文件路径速查

```
飞书:                      gateway/platforms/feishu.py:4308-4317
Telegram:                  gateway/platforms/telegram.py
邮件:                      gateway/platforms/email.py
微信:                      gateway/platforms/weixin.py
Plugins:                   hermes-agent/plugins/
MEMORY:                    ~/.hermes/MEMORY.md
library:                   ~/.hermes/memories/library/
Session:                   ~/.hermes/sessions/
i18n:                      agent/i18n.py（不是 gateway.i18n）
session-archiver 插件:     hermes-agent/plugins/session-archiver/
```

## 8. 一句话总结

> **Hermes 是 Python 多渠道 + Plugins + Cron 的实战派，多个踩坑教训极有价值**。deepwhale **抄架构不抄语言**——TypeScript 栈复用 Hermes 多渠道模式 + MEMORY/library 分层 + 飞书 post 强制，**避开 i18n 路径错 / mtime 错位 / footer 数字收敛** 5 大坑。
