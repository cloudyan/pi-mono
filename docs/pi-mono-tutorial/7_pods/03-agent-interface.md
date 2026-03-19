# 03 - Agent 交互模式

> 难度：进阶
> 预计阅读时间：25 分钟

在上一章，我们学习了如何部署和管理 vLLM 模型。本章将深入探讨 `pi agent` 命令的交互模式，理解其内部架构，并掌握如何有效使用 Agent 进行代码分析和模型测试。

## 问题引入：为什么需要交互式 Agent？

当你部署了一个模型后，如何验证它的能力？

**传统方式的局限：**

```bash
# 发送单个请求 - 只能看到最终结果
curl http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen", "messages": [{"role": "user", "content": "Read README.md"}]}'
```

这种方式有几个问题：
- 无法测试 Tool Calling（模型调用工具的能力）
- 看不到模型的思考过程
- 无法持续对话、保持上下文
- 难以调试模型行为

**Agent 交互模式的价值：**

```bash
# 启动交互式会话
pi agent qwen -i

# 可以持续对话
> Read the README.md file
> What is the main purpose of this project?
> Can you find all TypeScript files?
```

Agent 提供了：
1. **Tool Calling** - 模型可以读取文件、执行命令
2. **Session 持久化** - 对话历史自动保存
3. **交互式 TUI** - 支持多轮对话、中断恢复
4. **事件流** - 实时显示模型的思考过程和工具调用

## 核心概念

### 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         pi agent 命令                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户输入 ──┬──> AgentSession ──> Agent ──> LLM API            │
│            │         │            │           │                 │
│            │         │            │           ▼                 │
│            │         │            │    AssistantMessage         │
│            │         │            │    (text/thinking/toolCall) │
│            │         │            │           │                 │
│            │         │            ▼           │                 │
│            │         │      Tool Execution ◄──┘                 │
│            │         │            │                              │
│            │         ▼            ▼                              │
│            │    SessionManager  Tool Result                      │
│            │         │            │                              │
│            │         ▼            │                              │
│            │    ~/.pi/sessions/ ◄─┘                              │
│            │         │                                           │
│            ▼         ▼                                           │
│       TUI 渲染 ◄── AgentEvent                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### AgentEvent：事件驱动架构

整个 Agent 系统建立在事件流之上。每个动作都会产生事件，UI 订阅这些事件来更新显示：

```typescript
// 核心事件类型
type AgentEvent =
  // Agent 生命周期
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  
  // Turn 生命周期（一个 Turn = 一次 LLM 调用 + 工具执行）
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  
  // Message 生命周期
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  
  // Tool 执行生命周期
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```

**事件流示例：**

```
用户发送: "Read package.json"

agent_start
  └─ turn_start
       └─ message_start { role: "user", content: "Read package.json" }
       └─ message_end
       └─ message_start { role: "assistant" }
       └─ message_update { type: "toolcall_start", toolName: "read" }
       └─ message_update { type: "toolcall_delta", delta: '{"path": "package.json"}' }
       └─ message_update { type: "toolcall_end" }
       └─ message_end
       └─ tool_execution_start { toolName: "read", args: { path: "package.json" } }
       └─ tool_execution_end { result: "..." }
       └─ message_start { role: "toolResult", content: "..." }
       └─ message_end
       └─ turn_end
  └─ turn_start  # 第二个 turn，模型处理工具结果
       └─ message_start { role: "assistant" }
       └─ message_update { type: "text_delta", delta: "这个项目的..." }
       └─ message_end
       └─ turn_end
  └─ agent_end
```

### Tool Calling：模型的"手"

Agent 提供了一组内置工具，让模型能够与文件系统交互：

```typescript
// 内置工具定义
const tools = [
  {
    name: "read",
    label: "Read File",
    description: "读取文件内容，支持行号范围",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "文件路径" },
        offset: { type: "number", description: "起始行号" },
        limit: { type: "number", description: "读取行数" }
      },
      required: ["file_path"]
    }
  },
  {
    name: "bash",
    label: "Execute Command",
    description: "执行 shell 命令",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的命令" },
        workdir: { type: "string", description: "工作目录" }
      },
      required: ["command"]
    }
  },
  {
    name: "glob",
    label: "Find Files",
    description: "使用 glob 模式查找文件",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob 模式，如 **/*.ts" },
        path: { type: "string", description: "搜索路径" }
      },
      required: ["pattern"]
    }
  },
  {
    name: "rg",
    label: "Search Content",
    description: "使用 ripgrep 搜索文件内容",
    parameters: {
      type: "object",
      properties: {
        args: { type: "string", description: "ripgrep 参数" }
      },
      required: ["args"]
    }
  }
];
```

**Tool 执行流程：**

```
1. LLM 决定调用工具
   └─ 返回 toolCall: { name: "read", arguments: { file_path: "package.json" } }

2. Agent 解析并验证参数
   └─ 根据 JSON Schema 验证

3. 执行工具
   └─ 调用 execute(toolCallId, params, signal, onUpdate)

4. 返回结果
   └─ 创建 toolResultMessage: { role: "toolResult", content: [...] }

5. 发送给 LLM 继续对话
   └─ LLM 根据工具结果生成回复
```

### Session 持久化：对话的"记忆"

每次对话都会自动保存到 `~/.pi/sessions/` 目录：

```
~/.pi/sessions/
└── --Users-cloudyan-projects-myapp--/
    ├── 2025-01-15T10-30-00-abc123.jsonl
    ├── 2025-01-15T14-22-00-def456.jsonl
    └── 2025-01-16T09-15-00-ghi789.jsonl
```

**Session 文件格式（JSONL）：**

```jsonl
{"type":"session","version":3,"id":"abc123","timestamp":"2025-01-15T10:30:00Z","cwd":"/Users/cloudyan/projects/myapp"}
{"type":"message","id":"m1","parentId":null,"timestamp":"2025-01-15T10:30:01Z","message":{"role":"user","content":"Read package.json"}}
{"type":"message","id":"m2","parentId":"m1","timestamp":"2025-01-15T10:30:02Z","message":{"role":"assistant","content":[{"type":"text","text":"让我读取这个文件..."},{"type":"toolCall","id":"tc1","name":"read","arguments":{"file_path":"package.json"}}]}}
{"type":"message","id":"m3","parentId":"m2","timestamp":"2025-01-15T10:30:03Z","message":{"role":"toolResult","toolCallId":"tc1","toolName":"read","content":[{"type":"text","text":"...file content..."}]}}
{"type":"message","id":"m4","parentId":"m3","timestamp":"2025-01-15T10:30:04Z","message":{"role":"assistant","content":[{"type":"text","text":"这是一个 Node.js 项目..."}]}}
```

**树形结构：**

每个 entry 都有 `id` 和 `parentId`，形成树形结构，支持分支导航：

```
m1 (user: "Read package.json")
└── m2 (assistant: 工具调用)
    └── m3 (toolResult)
        └── m4 (assistant: 回复)
            ├── m5 (user: "List tests")    # 分支 1
            │   └── ...
            └── m6 (user: "Show config")   # 分支 2（导航后创建）
                └── ...
```

## 实现详解

### Agent Prompt 构建

当执行 `pi agent qwen "Read README.md"` 时，系统会构建完整的 prompt：

```typescript
// src/commands/prompt.ts
async function promptModel(modelName: string, userArgs: string[], opts: PromptOptions) {
  // 1. 获取 Pod 和模型配置
  const activePod = getActivePod();
  const modelConfig = pod.models[modelName];
  
  // 2. 提取 host
  const host = pod.ssh.split(" ").find(p => p.includes("@"))?.split("@")[1];
  
  // 3. 构建系统提示词
  const systemPrompt = `You help the user understand and navigate the codebase in the current working directory.

You can read files, list directories, and execute shell commands via the respective tools.

Do not output file contents you read via the read_file tool directly, unless asked to.

Do not output markdown tables as part of your responses.

Keep your responses concise and relevant to the user's request.

File paths you output must include line numbers where possible, e.g. "src/index.ts:10-20".

Current working directory: ${process.cwd()}`;
  
  // 4. 构建参数
  const args = [
    "--base-url", `http://${host}:${modelConfig.port}/v1`,
    "--model", modelConfig.model,
    "--api-key", process.env.PI_API_KEY || "dummy",
    "--api", modelConfig.model.includes("gpt-oss") ? "responses" : "completions",
    "--system-prompt", systemPrompt,
    ...userArgs  // 用户消息、-i、-c 等
  ];
  
  // 5. 调用 agent main
  // ... (调用 pi-coding-agent 的 Agent)
}
```

### Tool 定义传递给模型

Tool 以 YAML 格式传递给 vLLM，适配其 tool call parser：

```yaml
tools:
  - name: read
    description: 读取文件内容，支持行号范围
    parameters:
      type: object
      properties:
        file_path:
          type: string
          description: 文件路径
        offset:
          type: number
          description: 起始行号（从1开始）
        limit:
          type: number
          description: 读取行数
      required: [file_path]
```

### 事件处理与 UI 更新

AgentSession 订阅 Agent 事件，更新 UI 和保存会话：

```typescript
// 核心事件处理逻辑
private _handleAgentEvent = (event: AgentEvent): void => {
  // 1. 通知所有订阅者（UI 更新）
  this._emit(event);
  
  // 2. 持久化到 session
  if (event.type === "message_end") {
    if (event.message.role === "user" || 
        event.message.role === "assistant" || 
        event.message.role === "toolResult") {
      this.sessionManager.appendMessage(event.message);
    }
  }
  
  // 3. 检查自动压缩（context overflow）
  if (event.type === "agent_end") {
    this._checkCompaction(lastAssistantMessage);
  }
};
```

## 使用模式

### 模式一：单次消息（Single-shot）

快速发送单个请求，获取回复后退出：

```bash
# 基本用法
pi agent qwen "What is the project structure?"

# 带图片输入
pi agent qwen "Describe this image" --image screenshot.png

# 使用文件引用
pi agent qwen @README.md "Summarize this file"

# 多个文件
pi agent qwen @package.json @tsconfig.json "Compare these configs"
```

**适用场景：**
- 快速测试模型
- 单次查询
- CI/CD 集成

### 模式二：交互式（Interactive）

持续对话，支持多轮交互：

```bash
# 启动交互模式
pi agent qwen -i

# 继续上次会话
pi agent qwen -i -c

# 指定 session 文件
pi agent qwen -i --session ~/.pi/sessions/my-session.jsonl
```

**交互式功能：**

```
┌─────────────────────────────────────────────────────────────┐
│ pi agent - qwen on dc1                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ User: Read the main entry file                              │
│                                                             │
│ Assistant: 让我读取主入口文件...                             │
│                                                             │
│ Tool: read(file_path: "src/index.ts")                       │
│ ───────────────────────────────────────                     │
│ 1: import { Agent } from "@mariozechner/pi-agent-core";    │
│ 2: import { getModel } from "@mariozechner/pi-ai";         │
│ ...                                                         │
│                                                             │
│ Assistant: 这是项目的主入口文件...                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ /model qwen3 • 8,234 tokens • $0.02 • ~/projects/myapp     │
├─────────────────────────────────────────────────────────────┤
│ > _                                                         │
└─────────────────────────────────────────────────────────────┘
```

**快捷键：**

| 按键 | 功能 |
|------|------|
| Ctrl+C | 清空输入框 |
| Ctrl+C (两次) | 退出 |
| Escape | 取消当前操作 |
| Ctrl+L | 切换模型 |
| Ctrl+O | 折叠/展开工具输出 |
| Shift+Enter | 多行输入 |

### 模式三：JSON 输出（Programmatic）

输出 JSONL 格式，便于程序解析：

```bash
pi agent qwen --json "What is 2+2?"
```

输出示例：

```jsonl
{"type":"message_start","message":{"role":"user","content":"What is 2+2?","timestamp":1705312345678}}
{"type":"message_start","message":{"role":"assistant","content":[],"timestamp":1705312345700}}
{"type":"message_update","message":{"role":"assistant","content":[{"type":"text","text":"2 + 2 = 4"}]},"assistantMessageEvent":{"type":"text_delta","delta":"2 + 2 = 4"}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"2 + 2 = 4"}],"stopReason":"stop"}}
{"type":"token_usage","inputTokens":10,"outputTokens":5,"totalTokens":15}
```

**适用场景：**
- 脚本自动化
- 性能测试
- 批量处理

### 模式四：Session 管理

```bash
# 查看所有 session
pi session list

# 继续特定 session
pi agent qwen -i --session abc123

# 从 session 分支
pi agent qwen -i --fork ~/.pi/sessions/old-session.jsonl
```

## 最佳实践

### Do's：推荐做法

**1. 使用明确的工作目录**

```bash
# 好的做法 - 在项目目录下启动
cd ~/projects/myapp
pi agent qwen -i

# 避免 - 在不相关目录启动
cd ~
pi agent qwen -i  # Agent 不知道项目上下文
```

**2. 利用 session 持久化**

```bash
# 第一次会话 - 探索项目
pi agent qwen -i
> Read package.json
> List all source files
> What's the architecture?

# 后续会话 - 继续深入
pi agent qwen -i -c  # 恢复上下文
> Now implement feature X
```

**3. 提供具体路径**

```bash
# 好的做法
> Read src/utils/parser.ts:50-80

# 避免
> Read that file with the parsing logic
```

**4. 使用 glob 和 rg 工具**

```bash
# 查找文件
> Find all test files using glob pattern "**/*.test.ts"

# 搜索代码
> Use rg to find all TODO comments in the codebase
```

**5. 分步完成复杂任务**

```bash
# 好的做法 - 分步进行
> List all files in src/components
> Read src/components/Button.tsx
> What props does Button accept?

# 避免 - 一次性大请求
> Analyze the entire codebase and tell me everything
```

### Don'ts：避免的做法

**1. 不要在 session 中存储敏感信息**

Session 文件是明文存储的：

```bash
# 避免
> Read .env and show me the API keys

# 如果不小心读取了
pi session delete <session-id>  # 删除敏感 session
```

**2. 不要过度依赖自动压缩**

长对话可能导致信息丢失：

```bash
# 长对话后，检查上下文
> /session  # 查看当前 token 使用情况

# 如果接近限制，考虑开启新 session
> /new
```

**3. 不要忽略工具输出**

```bash
# 检查工具是否成功执行
Tool: bash(command: "npm test")
Error: Command failed with exit code 1

# 不要忽略，询问错误原因
> Why did the tests fail?
```

**4. 不要同时运行多个 agent 操作**

```bash
# 避免 - 多个 agent 进程修改同一项目
# Terminal 1
pi agent qwen -i
> Edit src/index.ts to add logging

# Terminal 2 (同时)
pi agent qwen -i
> Remove all console.log statements
```

### 调试技巧

**1. 查看原始事件流**

```bash
# 使用 JSON 模式查看详细事件
pi agent qwen --json "Test" | jq .
```

**2. 检查 session 文件**

```bash
# 查看最新 session
cat ~/.pi/sessions/--path-to-project--/*.jsonl | tail -20

# 查看完整对话
jq '.message' ~/.pi/sessions/*/latest.jsonl
```

**3. 日志级别**

```bash
# 启用详细日志
DEBUG=pi:* pi agent qwen -i
```

## 实战案例

### 案例 1：代码审查

```bash
pi agent qwen -i
> Read src/api/handlers/user.ts
> Review this code for security issues
> Suggest improvements
```

### 案例 2：架构分析

```bash
pi agent qwen -i
> Find all files importing 'express'
> Show me the routing structure
> Draw a diagram of the API endpoints
```

### 案例 3：测试驱动

```bash
pi agent qwen -i
> Read src/utils/validator.ts
> Write tests for all functions
> Run the tests and fix any failures
```

### 案例 4：文档生成

```bash
pi agent qwen -i
> List all exported functions in src/
> Generate API documentation
> Save to docs/api.md
```

## 总结

Agent 交互模式是测试和探索模型的强大工具：

| 特性 | 单次消息 | 交互式 | JSON 输出 |
|------|----------|--------|-----------|
| Tool Calling | ✅ | ✅ | ✅ |
| Session 持久化 | ❌ | ✅ | ❌ |
| 多轮对话 | ❌ | ✅ | ❌ |
| 程序集成 | ✅ | ❌ | ✅ |
| 适用场景 | 快速测试 | 深度探索 | 自动化 |

**关键要点：**

1. **事件驱动** - 所有交互通过 AgentEvent 流式传递
2. **Tool Calling** - 模型通过工具与文件系统交互
3. **Session 持久化** - 对话历史自动保存，支持恢复和分支
4. **多种模式** - 单次、交互、JSON 输出满足不同需求

下一章，我们将深入探讨 Tool Calling 的实现细节，了解如何自定义工具和扩展 Agent 能力。

---

## 扩展阅读

- [Session 文件格式详解](./session-format.md)
- [Tool Calling 协议](./tool-calling.md)
- [事件流架构](./event-stream.md)
- [pi-coding-agent 文档](../../coding-agent/README.md)