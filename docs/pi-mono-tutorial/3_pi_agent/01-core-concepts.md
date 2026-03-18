# Agent 核心概念：状态、消息、事件流

> **难度：入门** | **预计阅读时间：20 分钟**

想象一下，你正在构建一个 AI 编码助手。用户输入代码问题，AI 需要：
1. 理解上下文（之前的对话）
2. 可能调用工具（读取文件、执行命令）
3. 流式返回结果
4. 处理用户的实时干预（"停！换个思路"）

这个过程中，状态如何管理？消息如何流转？工具如何执行？

pi-agent 就是为解决这些问题而生的。

## 什么是 Agent？

Agent 是一个**有状态的对话管理器**，它在用户和 LLM 之间架起桥梁：

```
┌─────────────┐     ┌─────────────────────────────────────┐     ┌─────────┐
│    用户      │────→│              Agent                   │────→│   LLM   │
│  (输入问题)  │     │  ┌─────────┐  ┌─────────┐  ┌───────┐ │     │         │
└─────────────┘     │  │ 状态管理 │  │ 消息转换 │  │ 工具执行│ │     └─────────┘
       ↑            │  └─────────┘  └─────────┘  └───────┘ │          │
       │            │  ┌─────────┐  ┌─────────┐            │          │
       └────────────│──│ 事件流   │  │ 干预机制 │            │←─────────┘
        (接收回复)   │  └─────────┘  └─────────┘            │   (流式响应)
                    └─────────────────────────────────────┘
```

与直接使用 pi-ai 的 `streamSimple` 不同，Agent 提供了：

| 特性 | pi-ai (底层) | pi-agent (高层) |
|------|-------------|----------------|
| **状态管理** | 无状态，每次调用独立 | 维护完整对话状态 |
| **工具执行** | 返回 tool_call，自行处理 | 自动执行，支持并行/串行 |
| **消息转换** | 手动处理 | 自动转换 + 支持自定义消息类型 |
| **实时干预** | 不支持 | Steering/Follow-up 机制 |
| **事件粒度** | 消息级别 | 细粒度（message_start/update/end） |

## 核心概念一：AgentMessage

Agent 使用 `AgentMessage` 作为消息抽象，它比底层的 `Message` 更灵活：

```typescript
// packages/agent/src/types.ts

// AgentMessage = 标准 LLM 消息 + 自定义消息类型
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

// 标准 LLM 消息（来自 pi-ai）
type Message = UserMessage | AssistantMessage | ToolResultMessage;

// 自定义消息类型（通过声明合并扩展）
export interface CustomAgentMessages {
  // 默认空，应用可以扩展
}
```

### 为什么需要 AgentMessage？

假设你在构建一个 IDE 插件，需要显示：
- 用户输入
- AI 回复
- **代码片段预览**（仅 UI 显示，不发送给 LLM）
- **系统通知**（仅 UI 显示）

```typescript
// 扩展自定义消息类型
declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    // 代码预览消息（仅 UI 使用）
    codePreview: {
      role: "codePreview";
      language: string;
      code: string;
      timestamp: number;
    };
    
    // 系统通知（仅 UI 使用）
    notification: {
      role: "notification";
      text: string;
      level: "info" | "warning" | "error";
      timestamp: number;
    };
  }
}

// 现在可以安全使用
const previewMsg: AgentMessage = {
  role: "codePreview",
  language: "typescript",
  code: "const x = 1;",
  timestamp: Date.now(),
};
```

### 消息转换流程

自定义消息不会直接发送给 LLM，需要经过 `convertToLlm` 转换：

```
AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
                    (可选：修剪上下文)              (必需：过滤+转换)
```

```typescript
const agent = new Agent({
  convertToLlm: (messages) => messages.flatMap(m => {
    // 过滤掉 UI 专用消息
    if (m.role === "codePreview" || m.role === "notification") {
      return [];
    }
    // 转换自定义消息为标准消息
    if (m.role === "custom") {
      return [{ role: "user", content: m.content, timestamp: m.timestamp }];
    }
    // 标准消息直接透传
    return [m];
  }),
});
```

## 核心概念二：AgentState

Agent 维护完整的状态，你可以随时访问：

```typescript
// packages/agent/src/types.ts

export interface AgentState {
  systemPrompt: string;           // 系统提示词
  model: Model<any>;              // 当前使用的模型
  thinkingLevel: ThinkingLevel;   // 思考级别 (off/minimal/low/medium/high/xhigh)
  tools: AgentTool<any>[];        // 可用工具列表
  messages: AgentMessage[];       // 完整对话历史
  isStreaming: boolean;           // 是否正在流式输出
  streamMessage: AgentMessage | null;  // 当前流式消息（部分）
  pendingToolCalls: Set<string>;  // 正在执行的工具调用
  error?: string;                 // 错误信息
}
```

### 状态访问与修改

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful coding assistant.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools: [readFileTool, writeFileTool],
  },
});

// 读取状态
console.log(agent.state.isStreaming);  // false
console.log(agent.state.messages.length);  // 0

// 修改状态
agent.setSystemPrompt("New system prompt");
agent.setModel(getModel("openai", "gpt-4o"));
agent.setThinkingLevel("high");
agent.setTools([newTool1, newTool2]);

// 会话管理
agent.sessionId = "session-123";  // 用于 Provider 缓存
agent.replaceMessages(newMessages);  // 替换消息历史
agent.appendMessage(message);  // 追加消息
agent.clearMessages();  // 清空消息
agent.reset();  // 重置所有状态
```

## 核心概念三：事件流

Agent 通过事件流与外部通信，这是构建响应式 UI 的关键。

### 事件类型全景

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent 生命周期                            │
├─────────────────────────────────────────────────────────────────┤
│  agent_start                                                    │
│    │                                                            │
│    ▼                                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      Turn 生命周期                       │   │
│  │  turn_start                                             │   │
│  │    │                                                    │   │
│  │    ▼                                                    │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              Message 生命周期 (用户)              │   │   │
│  │  │  message_start ──→ message_end                   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │    │                                                    │   │
│  │    ▼                                                    │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │            Message 生命周期 (助手)               │   │   │
│  │  │  message_start                                   │   │   │
│  │  │    │                                             │   │   │
│  │  │    ▼                                             │   │   │
│  │  │  message_update (多次，流式输出)                  │   │   │
│  │  │    │                                             │   │   │
│  │  │    ▼                                             │   │   │
│  │  │  message_end                                     │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │    │                                                    │   │
│  │    ▼                                                    │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              Tool 生命周期 (可选)                │   │   │
│  │  │  tool_execution_start                           │   │   │
│  │  │    │                                             │   │   │
│  │  │    ▼                                             │   │   │
│  │  │  tool_execution_update (可选，流式工具)          │   │   │
│  │  │    │                                             │   │   │
│  │  │    ▼                                             │   │   │
│  │  │  tool_execution_end                             │   │   │
│  │  │    │                                             │   │   │
│  │  │    ▼                                             │   │   │
│  │  │  message_start ──→ message_end (toolResult)     │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │    │                                                    │   │
│  │    ▼                                                    │   │
│  │  turn_end                                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│    │                                                            │
│    ▼                                                            │
│  agent_end                                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 订阅事件

```typescript
const unsubscribe = agent.subscribe((event) => {
  switch (event.type) {
    case "agent_start":
      console.log("Agent 开始处理");
      break;
      
    case "message_start":
      console.log(`消息开始: ${event.message.role}`);
      break;
      
    case "message_update":
      // 只有助手消息会触发 update
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      break;
      
    case "message_end":
      console.log(`消息完成: ${event.message.role}`);
      break;
      
    case "tool_execution_start":
      console.log(`工具开始: ${event.toolName}`);
      break;
      
    case "tool_execution_end":
      console.log(`工具完成: ${event.toolName}, 是否错误: ${event.isError}`);
      break;
      
    case "turn_end":
      console.log(`Turn 完成，工具结果数: ${event.toolResults.length}`);
      break;
      
    case "agent_end":
      console.log(`Agent 完成，新增消息数: ${event.messages.length}`);
      break;
  }
});

// 取消订阅
unsubscribe();
```

## 核心概念四：工具定义

Agent 的工具比 pi-ai 的 Tool 更强大，增加了执行函数：

```typescript
// packages/agent/src/types.ts

export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> 
  extends Tool<TParameters> {
  label: string;  // UI 显示用的标签
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
}

export interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];  // 返回给 LLM 的内容
  details: T;  // 额外详情（用于 UI 显示、日志等）
}
```

### 定义工具示例

```typescript
import { Type } from "@sinclair/typebox";

const readFileTool: AgentTool = {
  name: "read_file",
  label: "读取文件",  // 中文标签，用于 UI
  description: "读取文件内容",
  parameters: Type.Object({
    path: Type.String({ description: "文件路径" }),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 可选：流式更新进度
    onUpdate?.({
      content: [{ type: "text", text: "正在读取..." }],
      details: { progress: 0 },
    });
    
    const content = await fs.readFile(params.path, "utf-8");
    
    return {
      content: [{ type: "text", text: content }],
      details: { 
        path: params.path, 
        size: content.length,
        lines: content.split("\n").length,
      },
    };
  },
};
```

### 工具错误处理

**重要**：工具失败时**抛出错误**，不要返回错误内容：

```typescript
execute: async (toolCallId, params, signal) => {
  // ✅ 正确：抛出错误
  if (!fs.existsSync(params.path)) {
    throw new Error(`文件不存在: ${params.path}`);
  }
  
  // ❌ 错误：返回错误作为内容
  if (!fs.existsSync(params.path)) {
    return {
      content: [{ type: "text", text: "Error: file not found" }],
      details: {},
    };
  }
  
  return { content: [...], details: {...} };
}
```

## 快速开始

### 基础示例

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

// 创建 Agent
const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有用的助手。",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

// 订阅事件（用于 UI 更新）
agent.subscribe((event) => {
  if (event.type === "message_update" && 
      event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// 发送消息
await agent.prompt("你好，请介绍一下自己");
```

### 带工具的示例

```typescript
import { Type } from "@sinclair/typebox";

// 定义计算器工具
const calculatorTool: AgentTool = {
  name: "calculate",
  label: "计算器",
  description: "执行数学计算",
  parameters: Type.Object({
    expression: Type.String({ description: "数学表达式，如 1 + 2" }),
  }),
  execute: async (toolCallId, params) => {
    try {
      // 注意：实际生产代码应使用安全的计算库
      const result = eval(params.expression);  // ⚠️ 仅示例，不要生产使用
      return {
        content: [{ type: "text", text: String(result) }],
        details: { expression: params.expression, result },
      };
    } catch (e) {
      throw new Error(`计算错误: ${e.message}`);
    }
  },
};

const agent = new Agent({
  initialState: {
    systemPrompt: "你可以使用计算器工具帮助用户计算。",
    model: getModel("openai", "gpt-4o-mini"),
    tools: [calculatorTool],
  },
});

// 订阅事件以观察工具调用
agent.subscribe((event) => {
  if (event.type === "tool_execution_start") {
    console.log(`\n[工具开始] ${event.toolName}`);
  }
  if (event.type === "tool_execution_end") {
    console.log(`[工具完成] 结果: ${event.result.content[0].text}`);
  }
});

await agent.prompt("计算 123 * 456");
```

## 与 pi-ai 的关系

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (你的代码)                      │
│              使用 Agent 构建聊天界面、IDE 插件等           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              pi-agent (@mariozechner/pi-agent-core)      │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│    │ Agent   │  │AgentLoop│  │AgentTool│  │ 事件系统 │  │
│    │ 类     │  │ 函数    │  │ 接口    │  │        │  │
│    └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │
└─────────┼────────────┼────────────┼────────────┼────────┘
          │            │            │            │
          └────────────┴────────────┴────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                 pi-ai (@mariozechner/pi-ai)              │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│    │ stream  │  │complete │  │ Message │  │  Event  │  │
│    │ 函数    │  │ 函数    │  │ 类型    │  │ 类型    │  │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 总结

pi-agent 的核心概念：

1. **AgentMessage**: 灵活的消息抽象，支持自定义消息类型
2. **AgentState**: 完整的状态管理，随时可访问和修改
3. **事件流**: 细粒度的事件系统，支持构建响应式 UI
4. **AgentTool**: 带执行函数的工具定义，支持流式更新

这些概念共同构成了一个**生产级的 Agent 运行时**，让你可以：
- 维护复杂的对话状态
- 自动执行工具调用
- 实时响应用户干预
- 构建流畅的流式 UI

---

**下篇预告**: [02-agent-loop.md](02-agent-loop.md) —— 深入理解 AgentLoop 的事件循环机制，包括 Steering/Follow-up 干预系统、工具执行的并行/串行模式等。
