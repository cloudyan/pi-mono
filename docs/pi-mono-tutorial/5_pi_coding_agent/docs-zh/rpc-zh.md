# RPC 模式

RPC（Remote Procedure Call，远程过程调用）模式支持通过 stdin/stdout 上的 JSON 协议对编码代理进行无头（headless）操作。这对于将代理嵌入其他应用程序、IDE 或自定义 UI 中非常有用。

**Node.js/TypeScript 用户注意**: 如果你正在构建 Node.js 应用程序，建议直接使用 `@mariozechner/pi-coding-agent` 中的 `AgentSession`，而不是启动子进程。API 详见 [`src/core/agent-session.ts`](../src/core/agent-session.ts)。基于子进程的 TypeScript 客户端示例见 [`src/modes/rpc/rpc-client.ts`](../src/modes/rpc/rpc-client.ts)。

## 启动 RPC 模式

```bash
pi --mode rpc [options]
```

常用选项:
- `--provider <name>`: 设置 LLM（Large Language Model，大语言模型）提供商（anthropic、openai、google 等）
- `--model <pattern>`: 模型模式或 ID（支持 `provider/id` 格式，可选 `:<thinking>` 后缀）
- `--no-session`: 禁用会话持久化
- `--session-dir <path>`: 自定义会话存储目录

## 协议概述

- **命令（Commands）**: 发送到 stdin 的 JSON 对象，每行一个
- **响应（Responses）**: 带有 `type: "response"` 的 JSON 对象，表示命令成功或失败
- **事件（Events）**: 代理事件以 JSON 行形式流式输出到 stdout

所有命令都支持可选的 `id` 字段，用于请求/响应关联。如果提供了 `id`，相应的响应将包含相同的 `id`。

### 帧格式

RPC 模式使用严格的 JSONL 语义，仅以 LF（`\n`）作为记录分隔符。

这对客户端很重要:
- 仅在 `\n` 处拆分记录
- 通过去除末尾的 `\r` 来接受可选的 `\r\n` 输入
- 不要使用将 Unicode 分隔符视为换行符的通用行读取器

特别需要注意的是，Node 的 `readline` 不符合 RPC 模式的协议要求，因为它也会在 `U+2028` 和 `U+2029` 处拆分，而这些字符在 JSON 字符串中是有效的。

## 命令

### 提示相关

#### prompt

向代理发送用户提示。立即返回；事件异步流式传输。

```json
{"id": "req-1", "type": "prompt", "message": "Hello, world!"}
```

带图片:
```json
{"type": "prompt", "message": "What's in this image?", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

**流式传输期间**: 如果代理正在流式传输，你必须指定 `streamingBehavior` 来排队消息:

```json
{"type": "prompt", "message": "New instruction", "streamingBehavior": "steer"}
```

- `"steer"`: 在代理运行时排队消息。消息在当前助手轮次完成工具调用执行后、下一次 LLM 调用之前交付。
- `"followUp"`: 等待代理完成。消息仅在代理停止时交付。

如果代理正在流式传输且未指定 `streamingBehavior`，命令将返回错误。

**扩展命令**: 如果消息是扩展命令（例如 `/mycommand`），即使在流式传输期间也会立即执行。扩展命令通过 `pi.sendMessage()` 管理自己的 LLM 交互。

**输入展开**: 技能命令（`/skill:name`）和提示模板（`/template`）在发送/排队前会被展开。

响应:
```json
{"id": "req-1", "type": "response", "command": "prompt", "success": true}
```

`images` 字段是可选的。每张图片使用 `ImageContent` 格式: `{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}`。

#### steer

在代理运行时排队引导消息。消息在当前助手轮次完成工具调用执行后、下一次 LLM 调用之前交付。技能命令和提示模板会被展开。扩展命令不被允许（请改用 `prompt`）。

```json
{"type": "steer", "message": "Stop and do this instead"}
```

带图片:
```json
{"type": "steer", "message": "Look at this instead", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

`images` 字段是可选的。每张图片使用 `ImageContent` 格式（与 `prompt` 相同）。

响应:
```json
{"type": "response", "command": "steer", "success": true}
```

参见 [set_steering_mode](#set_steering_mode) 了解如何控制引导消息的处理方式。

#### follow_up

排队一个后续消息，在代理完成后处理。仅在代理没有更多工具调用或引导消息时交付。技能命令和提示模板会被展开。扩展命令不被允许（请改用 `prompt`）。

```json
{"type": "follow_up", "message": "After you're done, also do this"}
```

带图片:
```json
{"type": "follow_up", "message": "Also check this image", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

`images` 字段是可选的。每张图片使用 `ImageContent` 格式（与 `prompt` 相同）。

响应:
```json
{"type": "response", "command": "follow_up", "success": true}
```

参见 [set_follow_up_mode](#set_follow_up_mode) 了解如何控制后续消息的处理方式。

#### abort

中止当前的代理操作。

```json
{"type": "abort"}
```

响应:
```json
{"type": "response", "command": "abort", "success": true}
```

#### new_session

开始一个新的会话。可以被 `session_before_switch` 扩展事件处理器取消。

```json
{"type": "new_session"}
```

带可选的父会话跟踪:
```json
{"type": "new_session", "parentSession": "/path/to/parent-session.jsonl"}
```

响应:
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": false}}
```

如果扩展取消了:
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": true}}
```

### 状态

#### get_state

获取当前会话状态。

```json
{"type": "get_state"}
```

响应:
```json
{
  "type": "response",
  "command": "get_state",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isStreaming": false,
    "isCompacting": false,
    "steeringMode": "all",
    "followUpMode": "one-at-a-time",
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "sessionName": "my-feature-work",
    "autoCompactionEnabled": true,
    "messageCount": 5,
    "pendingMessageCount": 0
  }
}
```

`model` 字段是完整的 [Model](#model) 对象或 `null`。`sessionName` 字段是通过 `set_session_name` 设置的显示名称，如果未设置则省略。

#### get_messages

获取对话中的所有消息。

```json
{"type": "get_messages"}
```

响应:
```json
{
  "type": "response",
  "command": "get_messages",
  "success": true,
  "data": {"messages": [...]}
}
```

消息是 `AgentMessage` 对象（参见 [消息类型](#消息类型)）。

### 模型

#### set_model

切换到特定模型。

```json
{"type": "set_model", "provider": "anthropic", "modelId": "claude-sonnet-4-20250514"}
```

响应包含完整的 [Model](#model) 对象:
```json
{
  "type": "response",
  "command": "set_model",
  "success": true,
  "data": {...}
}
```

#### cycle_model

循环切换到下一个可用模型。如果只有一个模型可用，返回 `null` 数据。

```json
{"type": "cycle_model"}
```

响应:
```json
{
  "type": "response",
  "command": "cycle_model",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isScoped": false
  }
}
```

`model` 字段是完整的 [Model](#model) 对象。

#### get_available_models

列出所有已配置的模型。

```json
{"type": "get_available_models"}
```

响应包含完整的 [Model](#model) 对象数组:
```json
{
  "type": "response",
  "command": "get_available_models",
  "success": true,
  "data": {
    "models": [...]
  }
}
```

### 思考级别

#### set_thinking_level

为支持思考功能的模型设置推理/思考级别。

```json
{"type": "set_thinking_level", "level": "high"}
```

级别: `"off"`、`"minimal"`、`"low"`、`"medium"`、`"high"`、`"xhigh"`

注意: `"xhigh"` 仅 OpenAI codex-max 模型支持。

响应:
```json
{"type": "response", "command": "set_thinking_level", "success": true}
```

#### cycle_thinking_level

循环切换可用的思考级别。如果模型不支持思考，返回 `null` 数据。

```json
{"type": "cycle_thinking_level"}
```

响应:
```json
{
  "type": "response",
  "command": "cycle_thinking_level",
  "success": true,
  "data": {"level": "high"}
}
```

### 队列模式

#### set_steering_mode

控制引导消息（来自 `steer`）的交付方式。

```json
{"type": "set_steering_mode", "mode": "one-at-a-time"}
```

模式:
- `"all"`: 在当前助手轮次完成工具调用执行后交付所有引导消息
- `"one-at-a-time"`: 每完成一个助手轮次交付一条引导消息（默认）

响应:
```json
{"type": "response", "command": "set_steering_mode", "success": true}
```

#### set_follow_up_mode

控制后续消息（来自 `follow_up`）的交付方式。

```json
{"type": "set_follow_up_mode", "mode": "one-at-a-time"}
```

模式:
- `"all"`: 代理完成时交付所有后续消息
- `"one-at-a-time"`: 每次代理完成交付一条后续消息（默认）

响应:
```json
{"type": "response", "command": "set_follow_up_mode", "success": true}
```

### 压缩

#### compact

手动压缩对话上下文以减少 token 使用量。

```json
{"type": "compact"}
```

带自定义指令:
```json
{"type": "compact", "customInstructions": "Focus on code changes"}
```

响应:
```json
{
  "type": "response",
  "command": "compact",
  "success": true,
  "data": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  }
}
```

#### set_auto_compaction

启用或禁用上下文接近满时的自动压缩。

```json
{"type": "set_auto_compaction", "enabled": true}
```

响应:
```json
{"type": "response", "command": "set_auto_compaction", "success": true}
```

### 重试

#### set_auto_retry

启用或禁用临时错误（过载、速率限制、5xx）时的自动重试。

```json
{"type": "set_auto_retry", "enabled": true}
```

响应:
```json
{"type": "response", "command": "set_auto_retry", "success": true}
```

#### abort_retry

中止正在进行的重试（取消延迟并停止重试）。

```json
{"type": "abort_retry"}
```

响应:
```json
{"type": "response", "command": "abort_retry", "success": true}
```

### Bash

#### bash

执行 shell 命令并将输出添加到对话上下文中。

```json
{"type": "bash", "command": "ls -la"}
```

响应:
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "total 48\ndrwxr-xr-x ...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": false
  }
}
```

如果输出被截断，包含 `fullOutputPath`:
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "truncated output...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": true,
    "fullOutputPath": "/tmp/pi-bash-abc123.log"
  }
}
```

**bash 结果如何传递给 LLM:**

`bash` 命令立即执行并返回 `BashResult`。在内部，会创建一个 `BashExecutionMessage` 并存储在代理的消息状态中。此消息**不会**发出事件。

当下一个 `prompt` 命令发送时，所有消息（包括 `BashExecutionMessage`）在发送给 LLM 之前会被转换。`BashExecutionMessage` 被转换为具有以下格式的 `UserMessage`:

```
Ran `ls -la`
\`\`\`
total 48
drwxr-xr-x ...
\`\`\`
```

这意味着:
1. Bash 输出在**下一次提示**时包含在 LLM 上下文中，而不是立即
2. 可以在提示之前执行多个 bash 命令；所有输出都会被包含
3. `BashExecutionMessage` 本身不会发出事件

#### abort_bash

中止正在运行的 bash 命令。

```json
{"type": "abort_bash"}
```

响应:
```json
{"type": "response", "command": "abort_bash", "success": true}
```

### 会话

#### get_session_stats

获取 token 使用量和成本统计。

```json
{"type": "get_session_stats"}
```

响应:
```json
{
  "type": "response",
  "command": "get_session_stats",
  "success": true,
  "data": {
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "userMessages": 5,
    "assistantMessages": 5,
    "toolCalls": 12,
    "toolResults": 12,
    "totalMessages": 22,
    "tokens": {
      "input": 50000,
      "output": 10000,
      "cacheRead": 40000,
      "cacheWrite": 5000,
      "total": 105000
    },
    "cost": 0.45
  }
}
```

#### export_html

将会话导出为 HTML 文件。

```json
{"type": "export_html"}
```

带自定义路径:
```json
{"type": "export_html", "outputPath": "/tmp/session.html"}
```

响应:
```json
{
  "type": "response",
  "command": "export_html",
  "success": true,
  "data": {"path": "/tmp/session.html"}
}
```

#### switch_session

加载不同的会话文件。可以被 `session_before_switch` 扩展事件处理器取消。

```json
{"type": "switch_session", "sessionPath": "/path/to/session.jsonl"}
```

响应:
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": false}}
```

如果扩展取消了切换:
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": true}}
```

#### fork

从之前的用户消息创建新分支。可以被 `session_before_fork` 扩展事件处理器取消。返回被分叉消息的文本。

```json
{"type": "fork", "entryId": "abc123"}
```

响应:
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"text": "The original prompt text...", "cancelled": false}
}
```

如果扩展取消了分叉:
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"text": "The original prompt text...", "cancelled": true}
}
```

#### get_fork_messages

获取可用于分叉的用户消息。

```json
{"type": "get_fork_messages"}
```

响应:
```json
{
  "type": "response",
  "command": "get_fork_messages",
  "success": true,
  "data": {
    "messages": [
      {"entryId": "abc123", "text": "First prompt..."},
      {"entryId": "def456", "text": "Second prompt..."}
    ]
  }
}
```

#### get_last_assistant_text

获取最后一条助手消息的文本内容。

```json
{"type": "get_last_assistant_text"}
```

响应:
```json
{
  "type": "response",
  "command": "get_last_assistant_text",
  "success": true,
  "data": {"text": "The assistant's response..."}
}
```

如果不存在助手消息，返回 `{"text": null}`。

#### set_session_name

为当前会话设置显示名称。该名称出现在会话列表中，有助于识别会话。

```json
{"type": "set_session_name", "name": "my-feature-work"}
```

响应:
```json
{
  "type": "response",
  "command": "set_session_name",
  "success": true
}
```

当前会话名称可通过 `get_state` 的 `sessionName` 字段获取。

### 命令列表

#### get_commands

获取可用命令（扩展命令、提示模板和技能）。可以通过在 `prompt` 命令前加 `/` 来调用。

```json
{"type": "get_commands"}
```

响应:
```json
{
  "type": "response",
  "command": "get_commands",
  "success": true,
  "data": {
    "commands": [
      {"name": "session-name", "description": "Set or clear session name", "source": "extension", "path": "/home/user/.pi/agent/extensions/session.ts"},
      {"name": "fix-tests", "description": "Fix failing tests", "source": "prompt", "location": "project", "path": "/home/user/myproject/.pi/agent/prompts/fix-tests.md"},
      {"name": "skill:brave-search", "description": "Web search via Brave API", "source": "skill", "location": "user", "path": "/home/user/.pi/agent/skills/brave-search/SKILL.md"}
    ]
  }
}
```

每个命令包含:
- `name`: 命令名称（使用 `/name` 调用）
- `description`: 人类可读的描述（扩展命令可选）
- `source`: 命令类型:
  - `"extension"`: 通过扩展中的 `pi.registerCommand()` 注册
  - `"prompt"`: 从提示模板 `.md` 文件加载
  - `"skill"`: 从技能目录加载（名称前缀为 `skill:`）
- `location`: 加载来源（可选，扩展不包含）:
  - `"user"`: 用户级别（`~/.pi/agent/`）
  - `"project"`: 项目级别（`./.pi/agent/`）
  - `"path"`: 通过 CLI 或设置指定的显式路径
- `path`: 命令源的绝对文件路径（可选）

**注意**: 内置 TUI 命令（`/settings`、`/hotkeys` 等）不包括在内。它们仅在交互模式下处理，如果通过 `prompt` 发送则不会执行。

## 事件

事件在代理操作期间以 JSON 行形式流式输出到 stdout。事件**不**包含 `id` 字段（只有响应包含）。

### 事件类型

| 事件 | 描述 |
|------|------|
| `agent_start` | 代理开始处理 |
| `agent_end` | 代理完成（包含所有生成的消息） |
| `turn_start` | 新轮次开始 |
| `turn_end` | 轮次完成（包含助手消息和工具结果） |
| `message_start` | 消息开始 |
| `message_update` | 流式更新（文本/思考/工具调用增量） |
| `message_end` | 消息完成 |
| `tool_execution_start` | 工具开始执行 |
| `tool_execution_update` | 工具执行进度（流式输出） |
| `tool_execution_end` | 工具完成 |
| `auto_compaction_start` | 自动压缩开始 |
| `auto_compaction_end` | 自动压缩完成 |
| `auto_retry_start` | 自动重试开始（临时错误后） |
| `auto_retry_end` | 自动重试完成（成功或最终失败） |
| `extension_error` | 扩展抛出错误 |

### agent_start

当代理开始处理提示时发出。

```json
{"type": "agent_start"}
```

### agent_end

当代理完成时发出。包含此次运行生成的所有消息。

```json
{
  "type": "agent_end",
  "messages": [...]
}
```

### turn_start / turn_end

一个轮次由一个助手响应加上任何产生的工具调用和结果组成。

```json
{"type": "turn_start"}
```

```json
{
  "type": "turn_end",
  "message": {...},
  "toolResults": [...]
}
```

### message_start / message_end

当消息开始和完成时发出。`message` 字段包含一个 `AgentMessage`。

```json
{"type": "message_start", "message": {...}}
{"type": "message_end", "message": {...}}
```

### message_update（流式传输）

在助手消息流式传输期间发出。包含部分消息和流式增量事件。

```json
{
  "type": "message_update",
  "message": {...},
  "assistantMessageEvent": {
    "type": "text_delta",
    "contentIndex": 0,
    "delta": "Hello ",
    "partial": {...}
  }
}
```

`assistantMessageEvent` 字段包含以下增量类型之一:

| 类型 | 描述 |
|------|------|
| `start` | 消息生成开始 |
| `text_start` | 文本内容块开始 |
| `text_delta` | 文本内容片段 |
| `text_end` | 文本内容块结束 |
| `thinking_start` | 思考块开始 |
| `thinking_delta` | 思考内容片段 |
| `thinking_end` | 思考块结束 |
| `toolcall_start` | 工具调用开始 |
| `toolcall_delta` | 工具调用参数片段 |
| `toolcall_end` | 工具调用结束（包含完整的 `toolCall` 对象） |
| `done` | 消息完成（原因: `"stop"`、`"length"`、`"toolUse"`） |
| `error` | 发生错误（原因: `"aborted"`、`"error"`） |

流式文本响应示例:
```json
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_start","contentIndex":0,"partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":" world","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_end","contentIndex":0,"content":"Hello world","partial":{...}}}
```

### tool_execution_start / tool_execution_update / tool_execution_end

当工具开始、流式传输进度并完成执行时发出。

```json
{
  "type": "tool_execution_start",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"}
}
```

在执行期间，`tool_execution_update` 事件流式传输部分结果（例如，bash 输出即时到达）:

```json
{
  "type": "tool_execution_update",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"},
  "partialResult": {
    "content": [{"type": "text", "text": "partial output so far..."}],
    "details": {"truncation": null, "fullOutputPath": null}
  }
}
```

完成时:

```json
{
  "type": "tool_execution_end",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "result": {
    "content": [{"type": "text", "text": "total 48\n..."}],
    "details": {...}
  },
  "isError": false
}
```

使用 `toolCallId` 关联事件。`tool_execution_update` 中的 `partialResult` 包含迄今为止累积的输出（不仅仅是增量），允许客户端在每次更新时简单地替换其显示。

### auto_compaction_start / auto_compaction_end

当自动压缩运行时发出（上下文接近满时）。

```json
{"type": "auto_compaction_start", "reason": "threshold"}
```

`reason` 字段是 `"threshold"`（上下文变大）或 `"overflow"`（上下文超过限制）。

```json
{
  "type": "auto_compaction_end",
  "result": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  },
  "aborted": false,
  "willRetry": false
}
```

如果 `reason` 是 `"overflow"` 且压缩成功，`willRetry` 为 `true`，代理将自动重试提示。

如果压缩被中止，`result` 为 `null`，`aborted` 为 `true`。

如果压缩失败（例如 API 配额超限），`result` 为 `null`，`aborted` 为 `false`，`errorMessage` 包含错误描述。

### auto_retry_start / auto_retry_end

当临时错误（过载、速率限制、5xx）后触发自动重试时发出。

```json
{
  "type": "auto_retry_start",
  "attempt": 1,
  "maxAttempts": 3,
  "delayMs": 2000,
  "errorMessage": "529 {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}"
}
```

```json
{
  "type": "auto_retry_end",
  "success": true,
  "attempt": 2
}
```

最终失败时（超过最大重试次数）:
```json
{
  "type": "auto_retry_end",
  "success": false,
  "attempt": 3,
  "finalError": "529 overloaded_error: Overloaded"
}
```

### extension_error

当扩展抛出错误时发出。

```json
{
  "type": "extension_error",
  "extensionPath": "/path/to/extension.ts",
  "event": "tool_call",
  "error": "Error message..."
}
```

## 扩展 UI 协议

扩展可以通过 `ctx.ui.select()`、`ctx.ui.confirm()` 等请求用户交互。在 RPC 模式下，这些被转换为基于命令/事件流的请求/响应子协议。

扩展 UI 方法分为两类:

- **对话框方法**（`select`、`confirm`、`input`、`editor`）: 在 stdout 上发出 `extension_ui_request`，并阻塞直到客户端在 stdin 上发回具有匹配 `id` 的 `extension_ui_response`。
- **即发即弃方法**（`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`）: 在 stdout 上发出 `extension_ui_request`，但不期望响应。客户端可以显示信息或忽略它。

如果对话框方法包含 `timeout` 字段，代理端将在超时到期时自动使用默认值解析。客户端不需要跟踪超时。

某些 `ExtensionUIContext` 方法在 RPC 模式下不受支持或降级，因为它们需要直接 TUI 访问:
- `custom()` 返回 `undefined`
- `setWorkingMessage()`、`setFooter()`、`setHeader()`、`setEditorComponent()`、`setToolsExpanded()` 是空操作
- `getEditorText()` 返回 `""`
- `getToolsExpanded()` 返回 `false`
- `pasteToEditor()` 委托给 `setEditorText()`（无粘贴/折叠处理）
- `getAllThemes()` 返回 `[]`
- `getTheme()` 返回 `undefined`
- `setTheme()` 返回 `{ success: false, error: "..." }`

注意: `ctx.hasUI` 在 RPC 模式下为 `true`，因为对话框和即发即弃方法通过扩展 UI 子协议正常工作。

### 扩展 UI 请求（stdout）

所有请求都有 `type: "extension_ui_request"`、唯一的 `id` 和 `method` 字段。

#### select

提示用户从列表中选择。带有 `timeout` 字段的对话框方法包含以毫秒为单位的超时；如果客户端未及时响应，代理自动使用 `undefined` 解析。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-1",
  "method": "select",
  "title": "Allow dangerous command?",
  "options": ["Allow", "Block"],
  "timeout": 10000
}
```

期望响应: 带有 `value`（选中的选项字符串）或 `cancelled: true` 的 `extension_ui_response`。

#### confirm

提示用户进行是/否确认。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-2",
  "method": "confirm",
  "title": "Clear session?",
  "message": "All messages will be lost.",
  "timeout": 5000
}
```

期望响应: 带有 `confirmed: true/false` 或 `cancelled: true` 的 `extension_ui_response`。

#### input

提示用户输入自由格式文本。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-3",
  "method": "input",
  "title": "Enter a value",
  "placeholder": "type something..."
}
```

期望响应: 带有 `value`（输入的文本）或 `cancelled: true` 的 `extension_ui_response`。

#### editor

打开多行文本编辑器，可选预填充内容。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-4",
  "method": "editor",
  "title": "Edit some text",
  "prefill": "Line 1\nLine 2\nLine 3"
}
```

期望响应: 带有 `value`（编辑后的文本）或 `cancelled: true` 的 `extension_ui_response`。

#### notify

显示通知。即发即弃，不期望响应。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-5",
  "method": "notify",
  "message": "Command blocked by user",
  "notifyType": "warning"
}
```

`notifyType` 字段是 `"info"`、`"warning"` 或 `"error"`。如果省略则默认为 `"info"`。

#### setStatus

设置或清除页脚/状态栏中的状态条目。即发即弃。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-6",
  "method": "setStatus",
  "statusKey": "my-ext",
  "statusText": "Turn 3 running..."
}
```

发送 `statusText: undefined`（或省略它）以清除该键的状态条目。

#### setWidget

设置或清除显示在编辑器上方或下方的组件（文本行块）。即发即弃。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-7",
  "method": "setWidget",
  "widgetKey": "my-ext",
  "widgetLines": ["--- My Widget ---", "Line 1", "Line 2"],
  "widgetPlacement": "aboveEditor"
}
```

发送 `widgetLines: undefined`（或省略它）以清除组件。`widgetPlacement` 字段是 `"aboveEditor"`（默认）或 `"belowEditor"`。RPC 模式下仅支持字符串数组；组件工厂被忽略。

#### setTitle

设置终端窗口/标签页标题。即发即弃。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-8",
  "method": "setTitle",
  "title": "pi - my project"
}
```

#### set_editor_text

设置输入编辑器中的文本。即发即弃。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-9",
  "method": "set_editor_text",
  "text": "prefilled text for the user"
}
```

### 扩展 UI 响应（stdin）

仅对话框方法（`select`、`confirm`、`input`、`editor`）需要响应。`id` 必须与请求匹配。

#### 值响应（select、input、editor）

```json
{"type": "extension_ui_response", "id": "uuid-1", "value": "Allow"}
```

#### 确认响应（confirm）

```json
{"type": "extension_ui_response", "id": "uuid-2", "confirmed": true}
```

#### 取消响应（任何对话框）

取消任何对话框方法。扩展接收 `undefined`（对于 select/input/editor）或 `false`（对于 confirm）。

```json
{"type": "extension_ui_response", "id": "uuid-3", "cancelled": true}
```

## 错误处理

失败的命令返回带有 `success: false` 的响应:

```json
{
  "type": "response",
  "command": "set_model",
  "success": false,
  "error": "Model not found: invalid/model"
}
```

解析错误:

```json
{
  "type": "response",
  "command": "parse",
  "success": false,
  "error": "Failed to parse command: Unexpected token..."
}
```

## 类型

源文件:
- [`packages/ai/src/types.ts`](../../ai/src/types.ts) - `Model`、`UserMessage`、`AssistantMessage`、`ToolResultMessage`
- [`packages/agent/src/types.ts`](../../agent/src/types.ts) - `AgentMessage`、`AgentEvent`
- [`src/core/messages.ts`](../src/core/messages.ts) - `BashExecutionMessage`
- [`src/modes/rpc/rpc-types.ts`](../src/modes/rpc/rpc-types.ts) - RPC 命令/响应类型，扩展 UI 请求/响应类型

### Model

```json
{
  "id": "claude-sonnet-4-20250514",
  "name": "Claude Sonnet 4",
  "api": "anthropic-messages",
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "reasoning": true,
  "input": ["text", "image"],
  "contextWindow": 200000,
  "maxTokens": 16384,
  "cost": {
    "input": 3.0,
    "output": 15.0,
    "cacheRead": 0.3,
    "cacheWrite": 3.75
  }
}
```

### UserMessage

```json
{
  "role": "user",
  "content": "Hello!",
  "timestamp": 1733234567890,
  "attachments": []
}
```

`content` 字段可以是字符串或 `TextContent`/`ImageContent` 块数组。

### AssistantMessage

```json
{
  "role": "assistant",
  "content": [
    {"type": "text", "text": "Hello! How can I help?"},
    {"type": "thinking", "thinking": "User is greeting me..."},
    {"type": "toolCall", "id": "call_123", "name": "bash", "arguments": {"command": "ls"}}
  ],
  "api": "anthropic-messages",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input": 100,
    "output": 50,
    "cacheRead": 0,
    "cacheWrite": 0,
    "cost": {"input": 0.0003, "output": 0.00075, "cacheRead": 0, "cacheWrite": 0, "total": 0.00105}
  },
  "stopReason": "stop",
  "timestamp": 1733234567890
}
```

停止原因: `"stop"`、`"length"`、`"toolUse"`、`"error"`、`"aborted"`

### ToolResultMessage

```json
{
  "role": "toolResult",
  "toolCallId": "call_123",
  "toolName": "bash",
  "content": [{"type": "text", "text": "total 48\ndrwxr-xr-x ..."}],
  "isError": false,
  "timestamp": 1733234567890
}
```

### BashExecutionMessage

由 `bash` RPC 命令创建（非 LLM 工具调用）:

```json
{
  "role": "bashExecution",
  "command": "ls -la",
  "output": "total 48\ndrwxr-xr-x ...",
  "exitCode": 0,
  "cancelled": false,
  "truncated": false,
  "fullOutputPath": null,
  "timestamp": 1733234567890
}
```

### Attachment

```json
{
  "id": "img1",
  "type": "image",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 102400,
  "content": "base64-encoded-data...",
  "extractedText": null,
  "preview": null
}
```

## 示例: 基础客户端（Python）

```python
import subprocess
import json

proc = subprocess.Popen(
    ["pi", "--mode", "rpc", "--no-session"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True
)

def send(cmd):
    proc.stdin.write(json.dumps(cmd) + "\n")
    proc.stdin.flush()

def read_events():
    for line in proc.stdout:
        yield json.loads(line)

# 发送提示
send({"type": "prompt", "message": "Hello!"})

# 处理事件
for event in read_events():
    if event.get("type") == "message_update":
        delta = event.get("assistantMessageEvent", {})
        if delta.get("type") == "text_delta":
            print(delta["delta"], end="", flush=True)
    
    if event.get("type") == "agent_end":
        print()
        break
```

## 示例: 交互式客户端（Node.js）

完整的交互式示例见 [`test/rpc-example.ts`](../test/rpc-example.ts)，类型化客户端实现见 [`src/modes/rpc/rpc-client.ts`](../src/modes/rpc/rpc-client.ts)。

关于处理扩展 UI 协议的完整示例，见 [`examples/rpc-extension-ui.ts`](../examples/rpc-extension-ui.ts)，它与 [`examples/extensions/rpc-demo.ts`](../examples/extensions/rpc-demo.ts) 扩展配合使用。

```javascript
const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");

const agent = spawn("pi", ["--mode", "rpc", "--no-session"]);

function attachJsonlReader(stream, onLine) {
    const decoder = new StringDecoder("utf8");
    let buffer = "";

    stream.on("data", (chunk) => {
        buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);

        while (true) {
            const newlineIndex = buffer.indexOf("\n");
            if (newlineIndex === -1) break;

            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            onLine(line);
        }
    });

    stream.on("end", () => {
        buffer += decoder.end();
        if (buffer.length > 0) {
            onLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
        }
    });
}

attachJsonlReader(agent.stdout, (line) => {
    const event = JSON.parse(line);

    if (event.type === "message_update") {
        const { assistantMessageEvent } = event;
        if (assistantMessageEvent.type === "text_delta") {
            process.stdout.write(assistantMessageEvent.delta);
        }
    }
});

// 发送提示
agent.stdin.write(JSON.stringify({ type: "prompt", message: "Hello" }) + "\n");

// Ctrl+C 时中止
process.on("SIGINT", () => {
    agent.stdin.write(JSON.stringify({ type: "abort" }) + "\n");
});
```