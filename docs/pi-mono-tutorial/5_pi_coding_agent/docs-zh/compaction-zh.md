# 上下文压缩与分支摘要

LLM 的上下文窗口有限。当对话过长时，pi 使用压缩机制来总结旧内容，同时保留最近的工作。本文档涵盖自动压缩和分支摘要两种机制。

**源文件** ([pi-mono](https://github.com/badlogic/pi-mono))：
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) - 自动压缩逻辑
- [`packages/coding-agent/src/core/compaction/branch-summarization.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) - 分支摘要
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) - 共享工具（文件跟踪、序列化）
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - 条目类型（`CompactionEntry`、`BranchSummaryEntry`）
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) - 扩展事件类型

如需查看项目中的 TypeScript 定义，请检查 `node_modules/@mariozechner/pi-coding-agent/dist/`。

## 概述

Pi 有两种摘要机制：

| 机制 | 触发条件 | 用途 |
|-----------|---------|---------|
| 压缩 (Compaction) | 上下文超过阈值，或执行 `/compact` | 总结旧消息以释放上下文空间 |
| 分支摘要 (Branch summarization) | `/tree` 导航 | 切换分支时保留上下文 |

两者使用相同的结构化摘要格式，并累积跟踪文件操作。

## 压缩

### 触发条件

自动压缩在以下情况触发：

```
contextTokens > contextWindow - reserveTokens
```

默认情况下，`reserveTokens` 为 16384 个 token（可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置）。这为 LLM 的响应预留了空间。

你也可以使用 `/compact [instructions]` 手动触发压缩，其中可选的指令参数可以让摘要更聚焦。

### 工作原理

1. **找到切割点**：从最新消息开始向后遍历，累积 token 估算值，直到达到 `keepRecentTokens`（默认 20k，可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置）
2. **提取消息**：收集从上次压缩（或开始）到切割点之间的消息
3. **生成摘要**：调用 LLM 以结构化格式生成摘要
4. **追加条目**：保存包含摘要和 `firstKeptEntryId` 的 `CompactionEntry`

```
压缩前：

  entry:  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               待总结的消息            保留的消息
                                   ↑
                          firstKeptEntryId（条目 4）

压缩后（追加了新条目）：

  entry:  0     1     2     3      4     5     6      7      8     9     10
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┴─────┴─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┴─────┘
               └──────────┬──────┘ └──────────────────────┬───────────────────┘
                 不发送给 LLM                    发送给 LLM
                                                         ↑
                                                  从 firstKeptEntryId 开始

LLM 看到的内容：

  ┌────────┬─────────┬─────┬─────┬──────┬──────┬─────┬──────┐
  │ system │ summary │ usr │ ass │ tool │ tool │ ass │ tool │
  └────────┴─────────┴─────┴─────┴──────┴──────┴─────┴──────┘
       ↑         ↑      └─────────────────┬────────────────┘
    提示词   来自压缩条目          从 firstKeptEntryId 开始的消息
```

### 分割回合

一个"回合"从用户消息开始，包括所有助手响应和工具调用，直到下一个用户消息。通常，压缩会在回合边界处切割。

当单个回合超过 `keepRecentTokens` 时，切割点会落在回合中间的助手消息处。这就是"分割回合"：

```
分割回合（一个巨大的回合超出预算）：

  entry:  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages (1-6) ───────┘
                                                      └── 保留的 (7-8)

  isSplitTurn = true
  messagesToSummarize = []  （之前没有完整的回合）
  turnPrefixMessages = [usr, ass, tool, ass, tool, tool]
```

对于分割回合，pi 会生成两个摘要并合并它们：
1. **历史摘要**：之前的上下文（如果有）
2. **回合前缀摘要**：分割回合的早期部分

### 切割点规则

有效的切割点包括：
- 用户消息
- 助手消息
- BashExecution 消息
- 自定义消息（custom_message、branch_summary）

切勿在工具结果处切割（它们必须与工具调用保持在一起）。

### CompactionEntry 结构

定义在 [`session-manager.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) 中：

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  fromHook?: boolean;  // 如果由扩展提供则为 true（遗留字段名）
  details?: T;         // 实现特定的数据
}

// 默认压缩使用以下 details（来自 compaction.ts）：
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

扩展可以在 `details` 中存储任何 JSON 可序列化的数据。默认压缩跟踪文件操作，但自定义扩展实现可以使用自己的结构。

查看 [`prepareCompaction()`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) 和 [`compact()`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) 了解实现细节。

## 分支摘要

### 触发条件

当你使用 `/tree` 导航到不同分支时，pi 会提供总结你正在离开的工作的选项。这会将左侧分支的上下文注入到新分支中。

### 工作原理

1. **找到共同祖先**：旧位置和新位置共享的最深节点
2. **收集条目**：从旧叶子节点回溯到共同祖先
3. **按预算准备**：在 token 预算内包含消息（最新的优先）
4. **生成摘要**：调用 LLM 使用结构化格式
5. **追加条目**：在导航点保存 `BranchSummaryEntry`

```
导航前的树：

         ┌─ B ─ C ─ D（旧叶子节点，将被放弃）
    A ───┤
         └─ E ─ F（目标）

共同祖先：A
待总结的条目：B、C、D

带摘要导航后：

         ┌─ B ─ C ─ D ─ [B、C、D 的摘要]
    A ───┤
         └─ E ─ F（新叶子节点）
```

### 累积文件跟踪

压缩和分支摘要都会累积跟踪文件。生成摘要时，pi 从以下位置提取文件操作：
- 正在总结的消息中的工具调用
- 之前的压缩或分支摘要的 `details`（如果有）

这意味着文件跟踪会在多次压缩或嵌套分支摘要中累积，保留已读和已修改文件的完整历史。

### BranchSummaryEntry 结构

定义在 [`session-manager.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) 中：

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  fromId: string;      // 我们从中导航的条目
  fromHook?: boolean;  // 如果由扩展提供则为 true（遗留字段名）
  details?: T;         // 实现特定的数据
}

// 默认分支摘要使用以下 details（来自 branch-summarization.ts）：
interface BranchSummaryDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

与压缩一样，扩展可以在 `details` 中存储自定义数据。

查看 [`collectEntriesForBranchSummary()`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts)、[`prepareBranchEntries()`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) 和 [`generateBranchSummary()`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) 了解实现细节。

## 摘要格式

压缩和分支摘要都使用相同的结构化格式：

```markdown
## 目标
[用户试图完成什么]

## 约束与偏好
- [用户提到的要求]

## 进展
### 已完成
- [x] [已完成的任务]

### 进行中
- [ ] [当前工作]

### 阻塞
- [问题，如果有]

## 关键决策
- **[决策]**：[理由]

## 下一步
1. [接下来应该做什么]

## 关键上下文
- [继续所需的数据]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### 消息序列化

在摘要之前，消息通过 [`serializeConversation()`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) 序列化为文本：

```
[User]: 他们说了什么
[Assistant thinking]: 内部推理
[Assistant]: 响应文本
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: 工具输出
```

这可以防止模型将其视为要继续的对话。

工具结果在序列化期间被截断为 2000 个字符。超出该限制的内容会被替换为一个标记，指示截断了多少字符。这使摘要请求保持在合理的 token 预算内，因为工具结果（尤其是来自 `read` 和 `bash` 的）通常是上下文大小的最大贡献者。

## 通过扩展自定义摘要

扩展可以拦截和自定义压缩和分支摘要。查看 [`extensions/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) 了解事件类型定义。

### session_before_compact

在自动压缩或 `/compact` 之前触发。可以取消或提供自定义摘要。在类型文件中查看 `SessionBeforeCompactEvent` 和 `CompactionPreparation`。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;

  // preparation.messagesToSummarize - 要总结的消息
  // preparation.turnPrefixMessages - 分割回合前缀（如果是分割回合）
  // preparation.previousSummary - 之前的压缩摘要
  // preparation.fileOps - 提取的文件操作
  // preparation.tokensBefore - 压缩前的上下文 token 数
  // preparation.firstKeptEntryId - 保留消息的起始位置
  // preparation.settings - 压缩设置

  // branchEntries - 当前分支上的所有条目（用于自定义状态）
  // signal - AbortSignal（传递给 LLM 调用）

  // 取消：
  return { cancel: true };

  // 自定义摘要：
  return {
    compaction: {
      summary: "你的摘要...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { /* 自定义数据 */ },
    }
  };
});
```

#### 将消息转换为文本

要使用你自己的模型生成摘要，请使用 `serializeConversation` 将消息转换为文本：

```typescript
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  
  // 将 AgentMessage[] 转换为 Message[]，然后序列化为文本
  const conversationText = serializeConversation(
    convertToLlm(preparation.messagesToSummarize)
  );
  // 返回：
  // [User]: 消息文本
  // [Assistant thinking]: 思考内容
  // [Assistant]: 响应文本
  // [Assistant tool calls]: read(path="..."); bash(command="...")
  // [Tool result]: 输出文本

  // 现在发送到你的模型进行摘要
  const summary = await myModel.summarize(conversationText);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});
```

查看 [custom-compaction.ts](../examples/extensions/custom-compaction.ts) 了解使用不同模型的完整示例。

### session_before_tree

在 `/tree` 导航之前触发。无论用户是否选择总结都会触发。可以取消导航或提供自定义摘要。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;

  // preparation.targetId - 我们要导航到的位置
  // preparation.oldLeafId - 当前位置（将被放弃）
  // preparation.commonAncestorId - 共享的祖先
  // preparation.entriesToSummarize - 将被总结的条目
  // preparation.userWantsSummary - 用户是否选择总结

  // 完全取消导航：
  return { cancel: true };

  // 提供自定义摘要（仅在 userWantsSummary 为 true 时使用）：
  if (preparation.userWantsSummary) {
    return {
      summary: {
        summary: "你的摘要...",
        details: { /* 自定义数据 */ },
      }
    };
  }
});
```

在类型文件中查看 `SessionBeforeTreeEvent` 和 `TreePreparation`。

## 设置

在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置压缩：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| 设置 | 默认值 | 描述 |
|---------|---------|-------------|
| `enabled` | `true` | 启用自动压缩 |
| `reserveTokens` | `16384` | 为 LLM 响应预留的 token 数 |
| `keepRecentTokens` | `20000` | 保留的最近 token 数（不被摘要） |

使用 `"enabled": false` 禁用自动压缩。你仍然可以使用 `/compact` 手动压缩。
