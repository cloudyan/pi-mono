# 上下文管理（Context Management）

## 1. 概述

### 1.1 什么是上下文管理

上下文管理是在 Token 限制下保持对话连贯性的核心技术。LLM（大型语言模型）有固定的上下文长度限制（如 128K、200K），当对话历史超过这个限制时，就需要通过上下文管理来确保关键信息不丢失。

### 1.2 为什么需要上下文管理

- **Token 限制**：LLM 无法处理无限长的输入
- **成本考量**：Token 使用越多，API 调用成本越高
- **性能优化**：过长的上下文会导致响应变慢
- **对话连贯**：在长对话中保持关键信息的连贯性

### 1.3 pi 的策略

pi coding agent 采用三层策略：

1. **会话树（Session Tree）**：非线性消息存储，支持分支导航
2. **自动压缩（Auto Compaction）**：基于 Token 阈值的智能压缩
3. **Token 预算（Token Budget）**：合理分配不同类型的 Token 占比

对应源码：`packages/coding-agent/src/core/session-manager.ts`、`packages/coding-agent/src/core/compaction/`

---

## 2. 会话树结构

### 2.1 SessionManager 类

pi 使用 **SessionManager** 管理会话，不是简单的消息列表，而是树形结构：

```typescript
// [简化示意]
class SessionManager {
  private fileEntries: FileEntry[] = [];      // 所有条目（包括 header）
  private byId: Map<string, SessionEntry> = new Map();  // ID 索引
  private leafId: string | null = null;       // 当前叶子节点
  private sessionFile: string | undefined;    // 持久化文件路径
}
```

**核心特点**：
- 每个 Entry 有唯一 ID（8位十六进制）和父节点 ID
- 支持分支：通过 `branch()` 方法在任意节点创建新分支
- 持久化：自动保存到 `.pi/agent/sessions/<cwd>/<timestamp>_<id>.jsonl`

对应源码：`packages/coding-agent/src/core/session-manager.ts`（第 662-688 行）

### 2.2 Entry 类型

SessionManager 支持多种 Entry 类型，每种类型在会话树中承担不同角色：

| Entry 类型 | 说明 | 特殊字段 | 使用场景 |
|-----------|------|---------|---------|
| `UserEntry` | 用户输入 | content | 用户发送的消息 |
| `AssistantEntry` | AI 回复 | content, thinking, redacted_thinking | AI 的正常回复和思考过程 |
| `ToolCallEntry` | 工具调用请求 | toolName, arguments | AI 请求调用工具 |
| `ToolResultEntry` | 工具执行结果 | content, isError | 工具执行完成后的结果 |
| `SessionMessageEntry` | 普通消息（user/assistant/toolResult） | role, content | 通用的消息条目 |
| `ThinkingLevelChangeEntry` | 思考级别变更 | fromLevel, toLevel | 切换思考级别时记录 |
| `ModelChangeEntry` | 模型切换 | fromModel, toModel | 更换 AI 模型时记录 |
| `CompactionEntry` | 压缩摘要 | summary, firstKeptEntryId, tokensBefore | 上下文压缩后生成 |
| `BranchSummaryEntry` | 分支摘要 | summary, details | 切换分支时生成的摘要 |
| `CheckpointEntry` | 快照点 | checkpointId, metadata | 手动保存的检查点 |
| `CustomEntry` | 扩展自定义数据 | data | 不参与 LLM 上下文的自定义数据 |
| `CustomMessageEntry` | 扩展自定义消息 | role, content | 参与 LLM 上下文的自定义消息 |
| `LabelEntry` | 用户标签/书签 | label, targetEntryId | 标记重要条目 |
| `SessionInfoEntry` | 会话元数据 | displayName, description | 会话显示名称等信息 |

对应源码：`packages/coding-agent/src/core/session-manager.ts`（第 43-146 行）

### 2.3 树结构图解

```
Session Header (Root)
│
├── Entry 1 [type: message, role: user]
│   └── Entry 2 [type: message, role: assistant]
│       ├── Entry 3 [type: message, role: user]  ← 分支 A 起点
│       │   └── Entry 4 [type: message, role: assistant]
│       │
│       └── Entry 5 [type: message, role: user]  ← 分支 B 起点
│           └── Entry 6 [type: message, role: assistant]
│
└── Compaction Entry [type: compaction]
    └── Entry N [保留的历史...]
```

**关键设计**：
- `parentId` 指向父 Entry，形成树形结构
- `leafId` 表示当前激活路径的终点
- 分支不会删除历史，只是改变 `leafId` 的位置

### 2.4 当前路径（Current Path）

当前激活的分支路径称为 "Current Path"：

```typescript
// [简化示意]
// 获取当前路径上的所有 Entry
const path: SessionEntry[] = [];
let current: SessionEntry | undefined = leafEntry;
while (current) {
  path.unshift(current);  // 从根到叶
  current = current.parentId ? byId.get(current.parentId) : undefined;
}
```

**重要方法**：
- `getBranch(fromId?)`: 获取从指定节点到根的路径
- `buildSessionContext()`: 构建 LLM 上下文（处理压缩摘要）
- `branch(branchFromId)`: 在指定节点创建新分支

对应源码：`packages/coding-agent/src/core/session-manager.ts`（第 1021-1038 行）

---

## 3. Token 预算管理

### 3.1 Token 计数

pi 通过多种方式获取 Token 计数：

```typescript
// [简化示意]
// 1. 从 AssistantMessage 的 usage 字段获取
const contextTokens = usage.totalTokens || 
  usage.input + usage.output + usage.cacheRead + usage.cacheWrite;

// 2. 估算 Token（当 usage 不可用时）
function estimateTokens(message: AgentMessage): number {
  let chars = 0;
  // 根据消息类型计算字符数
  // 图片估算为 4800 字符（约 1200 tokens）
  return Math.ceil(chars / 4);
}
```

**估算规则**（字符数 / 4）：
- 文本消息：内容长度
- 工具调用：name + JSON 参数长度
- 图片：固定 4800 字符（约 1200 tokens）
- Bash 执行：命令 + 输出长度

对应源码：`packages/coding-agent/src/core/compaction/compaction.ts`（第 128-283 行）

### 3.2 预算分配策略

| 预算项 | 配置项 | 默认值 | 说明 |
|--------|--------|--------|------|
| 保留余量 | `reserveTokens` | 16384 | 给 AI 回复的缓冲 |
| 保留近期 | `keepRecentTokens` | 20000 | 保留的最近消息 Token 数 |
| 压缩触发 | `contextWindow - reserveTokens` | - | 超过则触发压缩 |

```typescript
// [简化示意]
interface CompactionSettings {
  enabled: boolean;        // 是否启用自动压缩
  reserveTokens: number;   // 保留余量（默认 16384）
  keepRecentTokens: number; // 保留近期消息 Token 数（默认 20000）
}

// 检查是否需要压缩
function shouldCompact(contextTokens: number, contextWindow: number, settings: CompactionSettings): boolean {
  return contextTokens > contextWindow - settings.reserveTokens;
}
```

对应源码：`packages/coding-agent/src/core/compaction/compaction.ts`（第 108-215 行）

### 3.3 Token 预警

pi 在 `AgentSession.getContextUsage()` 中计算 Token 使用情况：

```typescript
// [简化示意]
getContextUsage(): ContextUsage | undefined {
  const model = this.model;
  if (!model) return undefined;
  
  const contextWindow = model.contextWindow ?? 0;
  const estimate = estimateContextTokens(this.messages);
  const percent = (estimate.tokens / contextWindow) * 100;
  
  return {
    tokens: estimate.tokens,
    contextWindow,
    percent,
  };
}
```

对应源码：`packages/coding-agent/src/core/agent-session.ts`（第 3000-3044 行）

---

## 4. 上下文压缩策略

### 4.1 自动压缩触发条件

压缩在以下情况下触发：

1. **阈值触发**：Token 使用超过 `contextWindow - reserveTokens`
2. **溢出恢复**：LLM 返回上下文溢出错误（自动压缩 + 重试）
3. **手动触发**：用户执行 `/compact` 命令

```typescript
// [简化示意]
private async _checkCompaction(assistantMessage: AssistantMessage): Promise<void> {
  const settings = this.settingsManager.getCompactionSettings();
  if (!settings.enabled) return;
  
  // Case 1: Overflow - 上下文溢出
  if (isContextOverflow(assistantMessage, contextWindow)) {
    await this._runAutoCompaction("overflow", true);  // willRetry = true
    return;
  }
  
  // Case 2: Threshold - 超过阈值
  const contextTokens = calculateContextTokens(assistantMessage.usage);
  if (shouldCompact(contextTokens, contextWindow, settings)) {
    await this._runAutoCompaction("threshold", false);  // willRetry = false
  }
}
```

对应源码：`packages/coding-agent/src/core/agent-session.ts`（第 1743-1820 行）

### 4.2 压缩算法

#### 切割点检测（Cut Point Detection）

```typescript
// [简化示意]
function findCutPoint(
  entries: SessionEntry[],
  startIndex: number,
  endIndex: number,
  keepRecentTokens: number
): CutPointResult {
  // 从后向前遍历，累积 Token
  let accumulatedTokens = 0;
  
  for (let i = endIndex - 1; i >= startIndex; i--) {
    const entry = entries[i];
    if (entry.type !== "message") continue;
    
    const messageTokens = estimateTokens(entry.message);
    accumulatedTokens += messageTokens;
    
    // 超过预算时找到切割点
    if (accumulatedTokens >= keepRecentTokens) {
      // 找到最近的合法切割点（user/assistant/bash/custom 消息）
      // 不能在 toolResult 处切割
      return { firstKeptEntryIndex, turnStartIndex, isSplitTurn };
    }
  }
}
```

**切割规则**：
- 可以切割在 user、assistant、custom、bashExecution 消息处
- **不能**切割在 toolResult 处（必须跟随其 tool_call）
- 可能切割在回合中间（isSplitTurn），需要特殊处理

对应源码：`packages/coding-agent/src/core/compaction/compaction.ts`（第 285-441 行）

#### 摘要生成

```typescript
// [简化示意]
const SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. 
Create a structured context checkpoint summary...

Use this EXACT format:

## Goal
[What is the user trying to accomplish?]

## Constraints & Preferences
- [Any constraints mentioned by user]

## Progress
### Done
- [x] [Completed tasks]
### In Progress
- [ ] [Current work]
### Blocked
- [Issues preventing progress]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data needed to continue]
`;

async function generateSummary(
  messages: AgentMessage[],
  model: Model,
  apiKey: string,
  previousSummary?: string  // 支持增量更新
): Promise<string> {
  // 使用 reasoning: "high" 生成高质量摘要
  // 如果有 previousSummary，使用 UPDATE_SUMMARIZATION_PROMPT
}
```

**摘要特点**：
- 结构化格式（Goal/Progress/Key Decisions/Next Steps）
- 支持增量更新（基于之前的摘要）
- 保留文件操作记录（read/modified files）

对应源码：`packages/coding-agent/src/core/compaction/compaction.ts`（第 447-580 行）

#### 压缩算法伪代码

```typescript
// [概念性示例] 智能压缩算法实现
function smartCompact(
  entries: Entry[], 
  config: CompactConfig
): Entry[] {
  const { preserveRecent = 6, maxTokens } = config;
  
  // 1. 计算当前 Token 数
  const currentTokens = estimateTokens(entries);
  
  // 2. 如果未超限，无需压缩
  if (currentTokens <= maxTokens * 0.8) {
    return entries;
  }
  
  // 3. 保留最近 N 条完整消息
  const recentEntries = entries.slice(-preserveRecent);
  const oldEntries = entries.slice(0, -preserveRecent);
  
  // 4. 对旧消息分块摘要
  const chunks = chunkEntries(oldEntries, 4); // 每 4 条一组
  const summaries = chunks.map(chunk => ({
    type: "compacted",
    summary: generateSummary(chunk),
    originalCount: chunk.length,
    timestamp: chunk[chunk.length - 1].timestamp
  }));
  
  // 5. 组装压缩后的历史
  return [...summaries, ...recentEntries];
}

// 生成摘要
function generateSummary(entries: Entry[]): string {
  const userMsgs = entries.filter(e => e.type === "user");
  const toolCalls = entries.filter(e => e.type === "tool_call");
  
  return `[摘要] ${userMsgs.length} 条用户消息, ` +
         `${toolCalls.length} 次工具调用, ` +
         `主要涉及: ${extractTopics(entries)}`;
}
```

**算法要点**：
- 保留近期消息：确保上下文连续性
- 分块摘要：将旧消息分组生成摘要
- 增量压缩：支持基于已有摘要的增量更新
- 结构化输出：摘要遵循固定格式，便于 LLM 理解

### 4.3 压缩过程

```typescript
// [概念性示例]
async function compact(preparation: CompactionPreparation): Promise<CompactionResult> {
  // 1. 准备阶段
  const { firstKeptEntryId, messagesToSummarize, turnPrefixMessages, isSplitTurn } = preparation;
  
  // 2. 生成摘要
  let summary: string;
  if (isSplitTurn) {
    // 需要生成两个摘要：历史 + 回合前缀
    const [historyResult, turnPrefixResult] = await Promise.all([
      generateSummary(messagesToSummarize, ...),
      generateTurnPrefixSummary(turnPrefixMessages, ...),
    ]);
    summary = `${historyResult}\n\n---\n\n**Turn Context (split turn):**\n\n${turnPrefixResult}`;
  } else {
    summary = await generateSummary(messagesToSummarize, ...);
  }
  
  // 3. 追加文件操作记录
  const { readFiles, modifiedFiles } = computeFileLists(fileOps);
  summary += formatFileOperations(readFiles, modifiedFiles);
  
  // 4. 返回结果（由 SessionManager 持久化）
  return { summary, firstKeptEntryId, tokensBefore, details: { readFiles, modifiedFiles } };
}
```

对应源码：`packages/coding-agent/src/core/compaction/compaction.ts`（第 712-778 行）

### 4.4 手动压缩

```typescript
// 触发手动压缩
await session.compact(customInstructions);

// 检查是否正在压缩
if (session.isCompacting) {
  console.log("正在压缩上下文...");
}

// 取消压缩
session.abortCompaction();
```

对应源码：`packages/coding-agent/src/core/agent-session.ts`（第 1607-1723 行）

---

## 5. 分支与导航

### 5.1 创建分支（Fork）

在任意 Entry 处创建新分支，原会话保持不变：

```typescript
// [简化示意]
async fork(entryId: string): Promise<{ selectedText: string; cancelled: boolean }> {
  // 1. 获取源 Entry
  const selectedEntry = this.sessionManager.getEntry(entryId);
  
  // 2. 创建新的 Session（从 parentId 分支）
  if (!selectedEntry.parentId) {
    this.sessionManager.newSession({ parentSession: previousSessionFile });
  } else {
    this.sessionManager.createBranchedSession(selectedEntry.parentId);
  }
  
  // 3. 加载分支后的消息到新 Agent
  const sessionContext = this.sessionManager.buildSessionContext();
  this.agent.replaceMessages(sessionContext.messages);
  
  return { selectedText, cancelled: false };
}
```

**使用场景**：
- 探索不同方案（A/B 测试）
- 从某个决策点重新尝试
- 提取特定对话路径保存为新会话

对应源码：`packages/coding-agent/src/core/agent-session.ts`（第 2670-2723 行）

### 5.2 导航会话树

```typescript
// [简化示意]
async navigateTree(targetId: string, options: {
  summarize?: boolean;      // 是否生成摘要
  customInstructions?: string;  // 自定义摘要指令
  label?: string;           // 附加标签
}): Promise<{ editorText?: string; cancelled: boolean; summaryEntry?: BranchSummaryEntry }> {
  // 1. 收集需要摘要的条目（从旧 leaf 到共同祖先）
  const { entries: entriesToSummarize, commonAncestorId } = collectEntriesForBranchSummary(
    this.sessionManager, oldLeafId, targetId
  );
  
  // 2. 可选：生成分支摘要
  if (options.summarize && entriesToSummarize.length > 0) {
    const result = await generateBranchSummary(entriesToSummarize, { model, apiKey, ... });
    summaryText = result.summary;
  }
  
  // 3. 切换 leaf
  this.sessionManager.branchWithSummary(newLeafId, summaryText, details);
  
  // 4. 更新 Agent 消息
  const sessionContext = this.sessionManager.buildSessionContext();
  this.agent.replaceMessages(sessionContext.messages);
}
```

对应源码：`packages/coding-agent/src/core/agent-session.ts`（第 2740-2920 行）

### 5.3 分支摘要（Branch Summary）

当导航到新分支时，可以选择生成摘要：

```
分支 A (原路径)
├── Entry 1
├── Entry 2
└── Entry 3  ← Leaf A

分支 B (新路径，从 Entry 2 分支)
├── Entry 1
├── Entry 2
│   └── BranchSummaryEntry: "摘要: 完成了..."
├── Entry 4  ← Leaf B
└── Entry 5
```

对应源码：`packages/coding-agent/src/core/compaction/branch-summarization.ts`

---

## 6. 持久化与恢复

### 6.1 自动保存

会话自动保存到 JSONL 文件（每行一个 JSON Entry）：

```
~/.pi/agent/sessions/--Users--cloudyan--project--/
├── 2025-01-08T10-30-00.000Z_abc12345.jsonl
└── 2025-01-08T11-15-30.000Z_def67890.jsonl
```

**文件格式**：
```json
{"type":"session","version":3,"id":"abc12345","timestamp":"2025-01-08T10:30:00.000Z","cwd":"/Users/cloudyan/project"}
{"type":"message","id":"a1b2c3d4","parentId":null,"timestamp":"2025-01-08T10:30:01.000Z","message":{"role":"user",...}}
{"type":"message","id":"e5f6g7h8","parentId":"a1b2c3d4","timestamp":"2025-01-08T10:30:05.000Z","message":{"role":"assistant",...}}
{"type":"compaction","id":"i9j0k1l2","parentId":"e5f6g7h8","timestamp":"2025-01-08T10:35:00.000Z","summary":"...","firstKeptEntryId":"m3n4o5p6","tokensBefore":50000}
```

对应源码：`packages/coding-agent/src/core/session-manager.ts`（第 721-768 行）

#### 持久化格式详细说明

pi 使用 **JSON Lines (JSONL)** 格式保存会话，每行一个 Entry：

```jsonl
// [概念性示例] .pi/sessions/<session-id>.jsonl
{"id":1,"type":"user","parentId":null,"content":"帮我分析这个项目的结构","timestamp":"2024-01-15T10:30:00Z","tokenCount":12}
{"id":2,"type":"assistant","parentId":1,"content":"我来帮你分析项目结构...","timestamp":"2024-01-15T10:30:05Z","tokenCount":156,"thinking":"1. 首先查看目录结构..."}
{"id":3,"type":"tool_call","parentId":2,"toolName":"ls","arguments":{"path":"."},"timestamp":"2024-01-15T10:30:06Z"}
{"id":4,"type":"tool_result","parentId":3,"content":"README.md\npackage.json\nsrc/","timestamp":"2024-01-15T10:30:06Z","tokenCount":8}
```

**格式优点**：
- **增量追加**：新 Entry 直接追加到文件末尾，无需重写
- **树结构重建**：通过 `parentId` 链可以重建完整树结构
- **分支支持**：不同分支通过不同的 parent 链区分
- **人类可读**：纯文本格式，便于调试和版本控制

**完整目录结构**：
```
sessions/
├── <session-id>.jsonl       # 会话数据（JSONL 格式）
├── <session-id>.meta.json   # 元数据（名称、创建时间、分支信息）
└── checkpoints/             # 检查点（手动保存的快照）
    ├── checkpoint-001.jsonl
    └── checkpoint-002.jsonl
```

### 6.2 会话恢复

```typescript
// [简化示意]
// 1. 列出所有会话
const sessions = await SessionManager.list(cwd);

// 2. 加载指定会话
const sessionManager = SessionManager.open(sessionFilePath);

// 3. 构建上下文
const context = sessionManager.buildSessionContext();
// - 处理 CompactionEntry（插入摘要消息）
// - 处理 BranchSummaryEntry（插入分支摘要）
// - 保留从 firstKeptEntryId 到 leaf 的消息
```

对应源码：`packages/coding-agent/src/core/session-manager.ts`（第 308-415 行）

### 6.3 会话导出

```typescript
// 导出为 HTML
const htmlPath = await session.exportToHtml(outputPath);

// 构建会话树结构
const tree = sessionManager.getTree();
// Returns: SessionTreeNode[] with children
```

对应源码：`packages/coding-agent/src/core/export-html/index.ts`

---

## 7. 配置与调优

### 7.1 压缩配置

```typescript
interface CompactionSettings {
  enabled: boolean;           // 是否启用自动压缩（默认 true）
  reserveTokens: number;      // 保留余量（默认 16384）
  keepRecentTokens: number;   // 保留近期消息 Token 数（默认 20000）
}

// 获取/设置配置
const settings = session.settingsManager.getCompactionSettings();
session.settingsManager.setCompactionEnabled(false);  // 禁用自动压缩
```

### 7.2 分支摘要配置

```typescript
interface BranchSummarySettings {
  enabled: boolean;        // 是否启用（默认 true）
  reserveTokens: number;   // 摘要生成保留 Token 数（默认 8000）
}
```

### 7.3 推荐配置

| 场景 | reserveTokens | keepRecentTokens | 说明 |
|------|---------------|------------------|------|
| 默认 | 16384 | 20000 | 平衡配置 |
| 小上下文模型 | 8192 | 10000 | 为 32K 上下文模型优化 |
| 大上下文模型 | 32768 | 40000 | 为 200K 上下文模型优化 |
| 代码审查 | 8192 | 30000 | 保留更多历史 |
| 快速问答 | 8192 | 5000 | 简短对话，频繁压缩 |

---

## 8. 最佳实践

### 8.1 监控 Token 使用

```typescript
// 订阅 Token 预警事件
session.subscribe((event) => {
  if (event.type === "auto_compaction_start") {
    console.log(`Token 超过阈值，开始压缩...原因: ${event.reason}`);
  }
  if (event.type === "auto_compaction_end") {
    console.log(`压缩完成，Token 节省: ${event.result?.tokensBefore} → ${event.result?.tokensAfter}`);
  }
});

// 获取当前使用情况
const usage = session.getContextUsage();
if (usage) {
  console.log(`Token: ${usage.tokens}/${usage.contextWindow} (${usage.percent.toFixed(1)}%)`);
}
```

### 8.2 合理使用分支

- **在关键决策点创建分支**：使用 `/fork` 在重要节点分叉
- **给分支起有意义的名称**：使用 `session.setSessionName("方案 A")`
- **定期清理废弃分支**：通过文件系统删除旧会话文件

### 8.3 避免过度压缩

- **症状**：AI "忘记" 之前的讨论内容
- **解决**：
  - 增加 `keepRecentTokens` 配置
  - 禁用自动压缩（手动控制）
  - 关键信息保存到文件，而非依赖长期上下文

### 8.4 持久化策略

- **重要会话手动保存**：`sessionManager.setSessionFile(path)`
- **使用有意义的会话名称**：便于后续识别
- **定期导出 HTML 备份**：`session.exportToHtml()`

---

## 9. 对应源码

| 文件 | 说明 |
|------|------|
| `packages/coding-agent/src/core/session-manager.ts` | SessionManager 类，Entry 类型定义，树操作 |
| `packages/coding-agent/src/core/compaction/index.ts` | 压缩模块导出 |
| `packages/coding-agent/src/core/compaction/compaction.ts` | 压缩算法、摘要生成、Token 计算 |
| `packages/coding-agent/src/core/compaction/branch-summarization.ts` | 分支摘要生成 |
| `packages/coding-agent/src/core/compaction/utils.ts` | 压缩工具函数 |
| `packages/coding-agent/src/core/agent-session.ts` | AgentSession 的 compact、fork、navigateTree 方法 |

---

## 10. 与其他章节的关联

- **[01-core-concepts.md](./01-core-concepts.md)**：会话、消息、状态的基础概念
- **[02-architecture.md](./02-architecture.md)**：SessionManager、AgentSession 架构
- **[04-skill-system.md](./04-skill-system.md)**：Skill 的渐进式披露也是上下文管理策略
- **[05-extension-system.md](./05-extension-system.md)**：Extension 可以自定义压缩策略（session_before_compact 钩子）
