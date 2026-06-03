# Code Intelligence Layer 架构

> **本文件范围**：Agent 理解代码库的 4 个核心模块的关系与职责。**只定义架构、边界、接口、数据流——不写实现细节**（不选 sqlite/postgres/tantivy/lancedb，不写具体 tree-sitter query，不写具体 embedding 格式）。

## 1. 核心问题

DeepWhale v1.0 的工具只有 `read_file` / `grep` / `find`：

- 5K 行项目：能凑合
- 50K 行项目：grep 噪声爆炸
- 100K+ 行项目：**Agent 彻底失明**

**Code Intelligence Layer = 让 Agent 像 IDE 一样理解代码**——symbol 是什么、谁调用它、定义在哪、跨文件引用、语义搜索。

## 2. 4 个核心模块

### 2.1 Workspace Index

**职责**：项目级元信息

```
WorkspaceIndex {
  root:                  string          // 项目根目录
  project_hash:          string          // 唯一标识
  language_distribution: map             // { "typescript": 50000, "python": 12000, ... }
  file_count:            int
  total_loc:             int
  dependencies:          Dependency[]    // package.json / requirements.txt / go.mod
  last_indexed_at:       timestamp
}
```

**输入**：项目根目录
**输出**：项目元信息 + 触发下游模块构建

**构建时机**：

- v1.5 启动时增量构建
- git hook 触发（commit 后）
- 用户手动 `deepwhale index`

### 2.2 Symbol Graph

**职责**：基于 AST 提取 symbol（function / class / variable / type）

```
Symbol {
  id:                    string
  name:                  string
  kind:                  SymbolKind       // function | class | variable | type | interface
  file:                  string
  range:                 Range            // { start: {line, col}, end: {line, col} }
  signature?:            string           // 函数签名
  doc?:                  string           // 注释文档
  visibility:            Visibility       // public | private | protected
}

SymbolGraph {
  project_hash:          string
  symbols:               Symbol[]
  index_by_name:         map              // name -> SymbolId[]（模糊匹配）
  index_by_file:         map              // file -> SymbolId[]
}
```

**输入**：项目文件 + AST 解析器输出
**输出**：可查询的 Symbol 集合

**查询接口**：

- 按 name 模糊匹配（"UserService" → ["UserService", "UserServiceFactory", ...]）
- 按 file 列所有 symbol
- 按 kind 过滤

### 2.3 Reference Graph（v2.0 增强）

**职责**：跨文件 symbol 引用图

```
Reference {
  from_symbol:           SymbolId         // 调用方
  to_symbol:             SymbolId         // 被调用方
  kind:                  ReferenceKind    // call | import | type_ref | extends | implements
  location:              Range            // 在 from_symbol 内的位置
}

ReferenceGraph {
  project_hash:          string
  references:            Reference[]
  reverse_index:         map              // to_symbol -> Reference[]（找所有调用方）
  forward_index:         map              // from_symbol -> Reference[]（找所有被调用方）
}
```

**输入**：Symbol Graph + 增量 AST 扫描
**输出**：可查询的引用关系

**查询接口**：

- 找 symbol 的所有 callers（"谁调用了 UserService.authenticate"）
- 找 symbol 的所有 callees（"UserService.authenticate 调用了谁"）
- 找 importers（"哪些文件 import 了 UserService"）

### 2.4 Semantic Search（v2.0 增强）

**职责**：基于 embeddings 的语义搜索

```
SemanticIndex {
  project_hash:          string
  chunks:                Chunk[]          // 代码片段
  embedding_model:       string           // "deepseek-v4-embedding"（v1.5 起多 provider）
  embedding_dim:         int
  last_built_at:         timestamp
}

Chunk {
  id:                    string
  symbol_id:             SymbolId?        // 关联到 Symbol
  content:               string           // 代码片段 + 上下文
  embedding:             EmbeddingRef     // 引用底层向量存储
}
```

**输入**：Symbol Graph + 上下文
**输出**：向量索引

**查询接口**：

- 自然语言 query → top-K 相关 chunks
- 关联到 Symbol（chunk 知道自己是哪个 symbol）

## 3. 模块关系

```
Workspace Index
   │  触发
   ↓
Symbol Graph
   │  关联
   ↓
Reference Graph  ←──→  Semantic Search
                        (共享 chunks)
```

- **Workspace Index 是入口**——任何模块启动前需要 Workspace Index 提供项目元信息
- **Symbol Graph 是基础**——Reference Graph 和 Semantic Search 都依赖 Symbol
- **Reference Graph 和 Semantic Search 互补**——前者精确（按关系），后者模糊（按语义）

## 4. 数据流

### 4.1 索引构建流

```
git commit / 启动 / 手动触发
   ↓
Workspace Index 构建
   ↓
遍历文件 → AST 解析
   ↓
Symbol Graph 增量更新
   ↓
Reference Graph 增量更新
   ↓
Semantic Search 增量更新（异步）
```

### 4.2 查询流

```
Agent 调 capability: "symbol_lookup" { query: "UserService" }
   ↓
Capability Registry 路由到 Code Intelligence.symbol_lookup
   ↓
Symbol Graph 模糊匹配 → 返回 Symbol[] → Agent
```

```
Agent 调 capability: "semantic_search" { query: "JWT 认证中间件" }
   ↓
Capability Registry 路由到 Code Intelligence.semantic_search
   ↓
Semantic Search 检索 → 返回 Chunk[] → Agent
```

## 5. 能力暴露（Agent tool 入口）

| Capability                     | 出现版本              | 输入                             | 输出             |
| ------------------------------ | --------------------- | -------------------------------- | ---------------- |
| `code_intel.symbol_lookup`     | v1.5                  | `{ query, kind?, max_results? }` | `Symbol[]`       |
| `code_intel.reference_lookup`  | v1.5 基础 / v2.0 完整 | `{ symbol, kind }`               | `Reference[]`    |
| `code_intel.semantic_search`   | v2.0                  | `{ query, max_results? }`        | `Chunk[]`        |
| `code_intel.workspace_summary` | v1.5                  | `{}`                             | `WorkspaceIndex` |

（详细字段定义见 `CAPABILITY_MODEL.md` §8）

## 6. 与 Agent Layer 的关系

| Code Intelligence 提供 | 被谁用                               |
| ---------------------- | ------------------------------------ |
| `symbol_lookup`        | Executor（查找函数定义）             |
| `reference_lookup`     | Executor（改代码前查 callers）       |
| `semantic_search`      | Researcher（v4.0 信息收集）          |
| `workspace_summary`    | Planner（v2.5 拆解任务时先了解项目） |

**关键设计**：Code Intelligence **不直接调 LLM**——它是被动的查询服务，Agent Layer 调它。

## 7. 增量与全量

| 触发            | 范围                             |
| --------------- | -------------------------------- |
| 启动            | 增量（只扫变更文件）             |
| git commit hook | 增量（变更文件 + 引用方）        |
| 用户手动        | 全量（`deepwhale index --full`） |
| 文件数 > 阈值   | 自动触发全量（防增量漂移）       |

## 8. 跨语言支持

| 语言       | Symbol Graph | Reference Graph | Semantic Search |
| ---------- | ------------ | --------------- | --------------- |
| TypeScript | ✅ v1.5      | ✅ v2.0         | ✅ v2.0         |
| JavaScript | ✅ v1.5      | ✅ v2.0         | ✅ v2.0         |
| Python     | ✅ v1.5      | ✅ v2.0         | ✅ v2.0         |
| Go         | ✅ v1.5      | ✅ v2.0         | ✅ v2.0         |
| Rust       | ✅ v1.5      | ✅ v2.0         | ✅ v2.0         |

**不在 v1.5 范围**：Java / Ruby / C++ / C#（按需扩展）

## 9. 与 v1.0 工具的关系

| v1.0 工具   | 是否被替代                                   |
| ----------- | -------------------------------------------- |
| `read_file` | **不替代**——Code Intelligence 是补充不是替代 |
| `grep`      | **不替代**——精确字符串搜索仍有价值           |
| `find`      | **不替代**——文件路径搜索无依赖 Symbol        |

**关键**：v1.0 的 3 个核心工具**全部保留**，Code Intelligence 在它们之上**叠加语义层**。

## 10. 失败模式与降级

| 失败                         | 降级策略                             |
| ---------------------------- | ------------------------------------ |
| AST 解析失败（语法错误文件） | 跳过该文件，记 warning               |
| Embedding API 不可用         | Semantic Search 降级为 grep 模糊匹配 |
| 索引文件损坏                 | 触发全量重建                         |
| 大项目索引超时               | 启动时后台异步构建（不阻塞）         |
| 跨文件引用循环               | 不处理（不爆炸）                     |

## 11. 版本演进

| 版本     | 引入模块                                                                |
| -------- | ----------------------------------------------------------------------- |
| **v1.5** | Workspace Index + Symbol Graph + 基础 reference_lookup（只 definition） |
| **v2.0** | Reference Graph 完整版（callers/callees/importers）+ Semantic Search    |

## 12. 不做的事

- ❌ 不选存储后端（JSONL / sqlite / postgres — 实现层决定）
- ❌ 不选 embedding 模型（DeepSeek V4 默认，但实现可换）
- ❌ 不选 AST 解析器（tree-sitter 是推荐，但实现可换）
- ❌ 不写具体 tree-sitter query（不同语言 query 不一样）
- ❌ 不写 watch 机制（chokidar / fs.watch — 实现层决定）
- ❌ 不做 LSP 集成（v1.5 砍掉，留 v1.x 再评估）

## 13. 跨文档引用

- **AGENT_RUNTIME.md §2.5**：Memory Schema 与 Chunk 关联
- **CAPABILITY_MODEL.md §8**：Code Intelligence capability 字段定义
- **ARCHITECTURE.md §2.3.1**：5 层架构中 Code Intelligence Layer 位置
