# Session 文件格式

Session（会话）以 JSONL（JSON Lines）文件格式存储。每行是一个包含 `type` 字段的 JSON 对象。Session 条目通过 `id`/`parentId` 字段形成树结构，无需创建新文件即可实现原地分支。

## 文件位置

```
~/.pi/agent/sessions/--<path>--/<timestamp>_<uuid>.jsonl
```

其中 `<path>` 是工作目录，`/` 替换为 `-`。

## 删除 Session

可以通过删除 `~/.pi/agent/sessions/` 下的 `.jsonl` 文件来移除 Session。

Pi 还支持通过 `/resume` 交互式删除 Session（选择一个 Session 后按 `Ctrl+D`，然后确认）。当 `trash` CLI 可用时，Pi 会使用它来避免永久删除。

## Session 版本

Session 在头部包含版本字段：

- **Version 1**：线性条目序列（旧版，加载时自动迁移）
- **Version 2**：通过 `id`/`parentId` 链接的树结构
- **Version 3**：将 `hookMessage` 角色重命名为 `custom`（扩展统一）

现有 Session 在加载时会自动迁移到当前版本（v3）。

## 源文件

GitHub 源码（[pi-mono](https://github.com/badlogic/pi-mono)）：

- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - Session 条目类型和 SessionManager
- [`packages/coding-agent/src/core/messages.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/messages.ts) - 扩展消息类型（BashExecutionMessage、CustomMessage 等）
- [`packages/ai/src/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/types.ts) - 基础消息类型（UserMessage、AssistantMessage、ToolResultMessage）
- [`packages/agent/src/types.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/agent/src/types.ts) - AgentMessage 联合类型

如需在项目中查看 TypeScript 定义，请检查 `node_modules/@mariozechner/pi-coding-agent/dist/` 和 `node_modules/@mariozechner/pi-ai/dist/`。

## 消息类型

Session 条目包含 `AgentMessage` 对象。理解这些类型对于解析 Session 和编写扩展至关重要。

### 内容块（Content Blocks）

消息包含类型化内容块的数组：

```typescript
interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string;      // base64 编码
  mimeType: string;  // 例如 "image/jpeg", "image/png"
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
}
```

### 基础消息类型（来自 pi-ai）

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;  // Unix 毫秒
}

interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: any;      // 工具特定元数据
  isError: boolean;
  timestamp: number;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

### 扩展消息类型（来自 pi-coding-agent）

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;  // !! 前缀命令为 true
  timestamp: number;
}

interface CustomMessage {
  role: "custom";
  customType: string;            // 扩展标识符
  content: string | (TextContent | ImageContent)[];
  display: boolean;              // 在 TUI 中显示
  details?: any;                 // 扩展特定元数据
  timestamp: number;
}

interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;                // 分支来源的条目
  timestamp: number;
}

interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}
```

### AgentMessage 联合类型

```typescript
type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | CustomMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage;
```

## 条目基类（Entry Base）

所有条目（除 `SessionHeader` 外）都继承 `SessionEntryBase`：

```typescript
interface SessionEntryBase {
  type: string;
  id: string;           // 8 字符十六进制 ID
  parentId: string | null;  // 父条目 ID（首条目为 null）
  timestamp: string;    // ISO 时间戳
}
```

## 条目类型

### SessionHeader

文件的首行。仅包含元数据，不属于树结构（没有 `id`/`parentId`）。

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project"}
```

对于有父 Session 的 Session（通过 `/fork` 或 `newSession({ parentSession })` 创建）：

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project","parentSession":"/path/to/original/session.jsonl"}
```

### SessionMessageEntry

对话中的消息。`message` 字段包含一个 `AgentMessage`。

```json
{"type":"message","id":"a1b2c3d4","parentId":"prev1234","timestamp":"2024-12-03T14:00:01.000Z","message":{"role":"user","content":"Hello"}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"provider":"anthropic","model":"claude-sonnet-4-5","usage":{...},"stopReason":"stop"}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2024-12-03T14:00:03.000Z","message":{"role":"toolResult","toolCallId":"call_123","toolName":"bash","content":[{"type":"text","text":"output"}],"isError":false}}
```

### ModelChangeEntry

用户在 Session 中切换模型时生成。

```json
{"type":"model_change","id":"d4e5f6g7","parentId":"c3d4e5f6","timestamp":"2024-12-03T14:05:00.000Z","provider":"openai","modelId":"gpt-4o"}
```

### ThinkingLevelChangeEntry

用户更改思考/推理级别时生成。

```json
{"type":"thinking_level_change","id":"e5f6g7h8","parentId":"d4e5f6g7","timestamp":"2024-12-03T14:06:00.000Z","thinkingLevel":"high"}
```

### CompactionEntry

上下文压缩时创建。存储早期消息的摘要。

```json
{"type":"compaction","id":"f6g7h8i9","parentId":"e5f6g7h8","timestamp":"2024-12-03T14:10:00.000Z","summary":"User discussed X, Y, Z...","firstKeptEntryId":"c3d4e5f6","tokensBefore":50000}
```

可选字段：

- `details`：实现特定数据（例如默认值为 `{ readFiles: string[], modifiedFiles: string[] }`，或扩展的自定义数据）
- `fromHook`：如果由扩展生成则为 `true`，由 pi 生成则为 `false`/`undefined`（旧字段名）

### BranchSummaryEntry

通过 `/tree` 切换分支时创建，包含 LLM 生成的左分支到共同祖先的摘要。捕获被放弃路径的上下文。

```json
{"type":"branch_summary","id":"g7h8i9j0","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:15:00.000Z","fromId":"f6g7h8i9","summary":"Branch explored approach A..."}
```

可选字段：

- `details`：文件追踪数据（`{ readFiles: string[], modifiedFiles: string[] }`）用于默认值，或扩展的自定义数据
- `fromHook`：如果由扩展生成则为 `true`，由 pi 生成则为 `false`/`undefined`（旧字段名）

### CustomEntry

扩展状态持久化。**不**参与 LLM 上下文。

```json
{"type":"custom","id":"h8i9j0k1","parentId":"g7h8i9j0","timestamp":"2024-12-03T14:20:00.000Z","customType":"my-extension","data":{"count":42}}
```

重新加载时使用 `customType` 识别扩展的条目。

### CustomMessageEntry

扩展注入的消息，**会**参与 LLM 上下文。

```json
{"type":"custom_message","id":"i9j0k1l2","parentId":"h8i9j0k1","timestamp":"2024-12-03T14:25:00.000Z","customType":"my-extension","content":"Injected context...","display":true}
```

字段：

- `content`：字符串或 `(TextContent | ImageContent)[]`（与 UserMessage 相同）
- `display`：`true` = 在 TUI 中以独特样式显示，`false` = 隐藏
- `details`：可选的扩展特定元数据（不发送给 LLM）

### LabelEntry

条目上的用户定义书签/标记。

```json
{"type":"label","id":"j0k1l2m3","parentId":"i9j0k1l2","timestamp":"2024-12-03T14:30:00.000Z","targetId":"a1b2c3d4","label":"checkpoint-1"}
```

将 `label` 设为 `undefined` 可清除标签。

### SessionInfoEntry

Session 元数据（例如用户定义的显示名称）。通过 `/name` 命令或扩展中的 `pi.setSessionName()` 设置。

```json
{"type":"session_info","id":"k1l2m3n4","parentId":"j0k1l2m3","timestamp":"2024-12-03T14:35:00.000Z","name":"Refactor auth module"}
```

设置后，Session 选择器（`/resume`）会显示 Session 名称而非首条消息。

## 树结构

条目形成树形结构：

- 首条条目的 `parentId: null`
- 每个后续条目通过 `parentId` 指向其父条目
- 分支从较早条目创建新的子节点
- "叶子"是树中的当前位置

```
[user msg] ─── [assistant] ─── [user msg] ─── [assistant] ─┬─ [user msg] ← 当前叶子
                                                            │
                                                            └─ [branch_summary] ─── [user msg] ← 备选分支
```

## 上下文构建

`buildSessionContext()` 从当前叶子遍历到根节点，生成 LLM 的消息列表：

1. 收集路径上的所有条目
2. 提取当前模型和思考级别设置
3. 如果路径上有 `CompactionEntry`：
   - 先发送摘要
   - 然后发送从 `firstKeptEntryId` 到压缩点的消息
   - 然后发送压缩点之后的消息
4. 将 `BranchSummaryEntry` 和 `CustomMessageEntry` 转换为适当的消息格式

## 解析示例

```typescript
import { readFileSync } from "fs";

const lines = readFileSync("session.jsonl", "utf8").trim().split("\n");

for (const line of lines) {
  const entry = JSON.parse(line);

  switch (entry.type) {
    case "session":
      console.log(`Session v${entry.version ?? 1}: ${entry.id}`);
      break;
    case "message":
      console.log(`[${entry.id}] ${entry.message.role}: ${JSON.stringify(entry.message.content)}`);
      break;
    case "compaction":
      console.log(`[${entry.id}] Compaction: ${entry.tokensBefore} tokens summarized`);
      break;
    case "branch_summary":
      console.log(`[${entry.id}] Branch from ${entry.fromId}`);
      break;
    case "custom":
      console.log(`[${entry.id}] Custom (${entry.customType}): ${JSON.stringify(entry.data)}`);
      break;
    case "custom_message":
      console.log(`[${entry.id}] Extension message (${entry.customType}): ${entry.content}`);
      break;
    case "label":
      console.log(`[${entry.id}] Label "${entry.label}" on ${entry.targetId}`);
      break;
    case "model_change":
      console.log(`[${entry.id}] Model: ${entry.provider}/${entry.modelId}`);
      break;
    case "thinking_level_change":
      console.log(`[${entry.id}] Thinking: ${entry.thinkingLevel}`);
      break;
  }
}
```

## SessionManager API

以编程方式操作 Session 的关键方法。

### 静态创建方法

- `SessionManager.create(cwd, sessionDir?)` - 创建新 Session
- `SessionManager.open(path, sessionDir?)` - 打开现有 Session 文件
- `SessionManager.continueRecent(cwd, sessionDir?)` - 继续最近的 Session 或创建新 Session
- `SessionManager.inMemory(cwd?)` - 不持久化到文件
- `SessionManager.forkFrom(sourcePath, targetCwd, sessionDir?)` - 从其他项目分叉 Session

### 静态列表方法

- `SessionManager.list(cwd, sessionDir?, onProgress?)` - 列出目录的 Session
- `SessionManager.listAll(onProgress?)` - 列出所有项目的所有 Session

### 实例方法 - Session 管理

- `newSession(options?)` - 开始新 Session（选项：`{ parentSession?: string }`）
- `setSessionFile(path)` - 切换到不同的 Session 文件
- `createBranchedSession(leafId)` - 将分支提取到新 Session 文件

### 实例方法 - 追加（均返回条目 ID）

- `appendMessage(message)` - 添加消息
- `appendThinkingLevelChange(level)` - 记录思考级别变更
- `appendModelChange(provider, modelId)` - 记录模型变更
- `appendCompaction(summary, firstKeptEntryId, tokensBefore, details?, fromHook?)` - 添加压缩
- `appendCustomEntry(customType, data?)` - 扩展状态（不在上下文中）
- `appendSessionInfo(name)` - 设置 Session 显示名称
- `appendCustomMessageEntry(customType, content, display, details?)` - 扩展消息（在上下文中）
- `appendLabelChange(targetId, label)` - 设置/清除标签

### 实例方法 - 树导航

- `getLeafId()` - 当前位置
- `getLeafEntry()` - 获取当前叶子条目
- `getEntry(id)` - 通过 ID 获取条目
- `getBranch(fromId?)` - 从条目遍历到根节点
- `getTree()` - 获取完整树结构
- `getChildren(parentId)` - 获取直接子节点
- `getLabel(id)` - 获取条目标签
- `branch(entryId)` - 将叶子移动到较早条目
- `resetLeaf()` - 将叶子重置为 null（任何条目之前）
- `branchWithSummary(entryId, summary, details?, fromHook?)` - 带上下文摘要的分支

### 实例方法 - 上下文和信息

- `buildSessionContext()` - 获取 LLM 的消息、thinkingLevel 和 model
- `getEntries()` - 所有条目（不含头部）
- `getHeader()` - Session 头部元数据
- `getSessionName()` - 从最新的 session_info 条目获取显示名称
- `getCwd()` - 工作目录
- `getSessionDir()` - Session 存储目录
- `getSessionId()` - Session UUID
- `getSessionFile()` - Session 文件路径（内存模式为 undefined）
- `isPersisted()` - Session 是否保存到磁盘