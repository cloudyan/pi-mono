# AgentLoop 设计与事件循环机制

> **难度：进阶** | **预计阅读时间：25 分钟**

上一章我们了解了 Agent 的核心概念。本章将深入 Agent 的"心脏"——AgentLoop，理解它是如何驱动整个对话流程的。

## 为什么需要 AgentLoop？

想象一个场景：用户让 AI 助手"创建一个 React 项目"。这个任务需要：

1. AI 分析需求 → 调用 `create_directory` 工具
2. 等待工具完成 → AI 继续 → 调用 `write_file` 写入 package.json
3. 等待工具完成 → AI 继续 → 调用 `write_file` 写入 App.tsx
4. ...可能还有更多工具调用

这是一个**多轮对话**过程，每轮可能包含：
- 用户消息（或工具结果）
- AI 响应（可能包含工具调用）
- 工具执行

AgentLoop 就是管理这个循环的核心机制。

## AgentLoop 架构

传统 AgentLoop 使用单层循环，只处理工具调用（不支持连续对话和打断对话），伪代码如下

```typescript
// 简化版本：单层循环
while (true) {
  const response = await model(messages, tools);
  if (response.stopReason !== "tool_use") break;
  const results = await executeTools(response.toolCalls);
  messages.push(...results);
}
```

架构图如下：

```mermaid
flowchart TB
    Start([开始]) --> Init[初始化消息队列]
    Init --> Loop{循环条件}

    subgraph SingleLoop["单循环：基础对话循环"]
        direction TB
        Loop -->|继续| CallLLM["调用 LLM"]
        CallLLM --> CheckError{"响应正常?"}
        CheckError -->|错误| ErrorEnd([错误结束])
        CheckError -->|正常| CheckTool{"有工具调用?"}
        CheckTool -->|是| ExecTool["执行工具"]
        ExecTool --> UpdateMsg["更新消息队列"]
        UpdateMsg --> Loop
        CheckTool -->|否| SuccessEnd([正常结束])
    end

    style SingleLoop fill:#e1f5fe
```

特点：
- 单层 while 循环
- 只处理：LLM 调用 → 工具执行 → 循环
- 无 Steering/Follow-up 机制
- 适用于简单对话场景

## 双层循环设计

pi-agent AgentLoop 采用**双层循环**设计

### 双层循环对比

为了更清晰地理解双层循环的设计，我们用一张表对比两者的区别：

| | 内层循环 | 外层循环 |
|------|------|------|
| **循环条件** | `hasMoreToolCalls \|\| pendingMessages.length > 0` | `true` + break |
| **职责** | 完成单个 Turn（LLM 响应 → 工具执行） | 处理 Follow-up 消息队列 |
| **优先级** | 处理 Steering（高优先级） | 处理 Follow-up（低优先级） |
| **退出时机** | 无工具调用且无 pending 消息 | 无 Follow-up 消息 |

你可以与单层循环对照查看，实际的双层循环设计在单循环基础上扩展：

```typescript
// 实际代码：双层循环
while (true) {                    // ← 外层循环：处理 Follow-up
  while (hasMoreToolCalls) {      // ← 内层循环：你的简化版本
    await model();
    await executeTools();
  }
  if (followUpMessages.length > 0) continue; // ← 外层循环的价值
  break;
}
```

### 设计价值

| 场景 | 单层循环 | 双层循环 |
|------|------|------|
| 简单问答 | ✓ | ✓ |
| 工具调用 | ✓ | ✓ |
| 实时纠正（Steering） | ✗ | ✓ |
| 连续对话（Follow-up） | ✗ | ✓ |

**核心要点**：
1. **内层循环** = 处理工具调用，完成单个 Turn
2. **外层循环** = 支持更复杂的对话场景（实时干预 + 连续对话）
3. **如果不需要 Steering/Follow-up** → 单层循环足够
4. **需要构建响应式 UI 或实时交互** → 双层循环是必要的

架构图如下

```mermaid
flowchart TD
    Start([开始]) --> Init["初始化<br/>pendingMessages = steeringQueue"]

    subgraph OuterLoop["外层循环：Follow-up 消息队列"]
        direction TB
        Init --> InnerLoop
        InnerLoop --> CheckFollowUp["检查 followUpQueue"]
        CheckFollowUp -->|有消息| SetPending["pendingMessages = followUp"]
        SetPending --> InnerLoop
        CheckFollowUp -->|无消息| End([结束])
    end

    subgraph InnerLoop["内层循环：Turn + Steering + 工具调用"]
        direction TB
        CheckSteering{"pendingMessages<br/>有消息?"} -->|是| ProcessSteering["处理 steering 消息<br/>高优先级注入"]
        CheckSteering -->|否| CallLLM["调用 LLM<br/>streamAssistantResponse"]
        ProcessSteering --> CallLLM

        CallLLM --> CheckError{"stopReason<br/>正常?"}
        CheckError -->|error/aborted| EmitError["emit turn_end<br/>emit agent_end"] --> ErrorEnd([返回])
        CheckError -->|正常| CheckTool{"有工具调用?"}

        CheckTool -->|是| ExecTools["执行工具调用<br/>executeToolCalls"]
        ExecTools --> UpdateContext["更新消息上下文"]
        UpdateContext --> GetSteering["获取 steering 消息<br/>getSteeringMessages"]
        GetSteering --> CheckSteering

        CheckTool -->|否| EmitTurnEnd["emit turn_end"]
        EmitTurnEnd --> CheckFollowUp
    end

    style OuterLoop fill:#fff3e0
    style InnerLoop fill:#e8f5e9
```

双循环详细时序图

```mermaid
sequenceDiagram
    participant U as User/外部
    participant OL as 外层循环
    participant IL as 内层循环
    participant LLM as LLM
    participant T as Tool

    Note over OL,IL: 初始化 pendingMessages = steeringQueue

    loop 外层循环：处理 Follow-up
        loop 内层循环：处理 Turn + Steering
            alt pendingMessages 有消息
                IL->>IL: 处理 steering 消息（高优先级）
            end

            IL->>LLM: streamAssistantResponse()
            LLM-->>IL: 流式响应

            alt 响应错误
                IL->>U: emit agent_end
                IL->>OL: 返回
            else 响应正常
                alt 有工具调用
                    IL->>T: executeToolCalls()
                    T-->>IL: toolResults
                    IL->>IL: 更新上下文
                    IL->>IL: getSteeringMessages()
                    IL->>IL: 继续内层循环
                else 无工具调用
                    IL->>IL: emit turn_end
                    IL->>OL: 内层循环结束
                end
            end
        end

        OL->>OL: getFollowUpMessages()
        alt 有 follow-up 消息
            OL->>OL: pendingMessages = followUp
            OL->>OL: continue（继续外层循环）
        else 无消息
            OL->>U: emit agent_end
            OL->>OL: break（结束）
        end
    end
```

### 代码实现

```typescript
// packages/agent/src/agent-loop.ts

async function runLoop(
  currentContext: AgentContext,
  newMessages: AgentMessage[],
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  streamFn?: StreamFn,
): Promise<void> {
  let firstTurn = true;
  // 初始化：检查 steering 消息
  let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || [];

  // ═══════════════════════════════════════════════════════════
  // 外层循环：处理 Follow-up 消息队列
  // ═══════════════════════════════════════════════════════════
  while (true) {
    let hasMoreToolCalls = true;

    // ═════════════════════════════════════════════════════════
    // 内层循环：处理单轮对话 Turn + 工具调用 + steering 消息
    // ═════════════════════════════════════════════════════════
    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (!firstTurn) {
        await emit({ type: "turn_start" });
      } else {
        firstTurn = false;
      }

      // 1. 处理 steering 消息（高优先级，在 LLM 调用前注入）
      if (pendingMessages.length > 0) {
        for (const message of pendingMessages) {
          await emit({ type: "message_start", message });
          await emit({ type: "message_end", message });
          currentContext.messages.push(message);
          newMessages.push(message);
        }
        pendingMessages = [];
      }

      // 2. 调用 LLM，流式获取助手响应
      const message = await streamAssistantResponse(
        currentContext, config, signal, emit, streamFn
      );
      newMessages.push(message);

      // 3. 错误处理
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        await emit({ type: "turn_end", message, toolResults: [] });
        await emit({ type: "agent_end", messages: newMessages });
        return;
      }

      // 4. 检查并执行工具调用
      const toolCalls = message.content.filter((c) => c.type === "toolCall");
      hasMoreToolCalls = toolCalls.length > 0;

      const toolResults: ToolResultMessage[] = [];
      if (hasMoreToolCalls) {
        toolResults.push(...await executeToolCalls(
          currentContext, message, config, signal, emit
        ));

        for (const result of toolResults) {
          currentContext.messages.push(result);
          newMessages.push(result);
        }
      }

      await emit({ type: "turn_end", message, toolResults });

      // 5. 获取下一批 steering 消息（用于下一轮内层循环）
      pendingMessages = (await config.getSteeringMessages?.()) || [];
    }

    // ═════════════════════════════════════════════════════════
    // 内层循环结束，检查 Follow-up 消息（低优先级）
    // ═════════════════════════════════════════════════════════
    const followUpMessages = (await config.getFollowUpMessages?.()) || [];
    if (followUpMessages.length > 0) {
      pendingMessages = followUpMessages;
      continue;  // 回到外层循环，继续处理
    }

    break;  // 无更多消息，结束
  }

  await emit({ type: "agent_end", messages: newMessages });
}
```

## Steering 与 Follow-up 机制

这是 AgentLoop 最强大的特性之一：**允许在对话进行中实时干预**。

### Steering（引导）

**场景**：AI 正在生成代码，用户突然说"等等，用 TypeScript 而不是 JavaScript"

```typescript
// 用户输入 steering 消息
agent.steer({
  role: "user",
  content: [{ type: "text", text: "请改用 TypeScript" }],
  timestamp: Date.now(),
});

// Agent 会在当前 Turn 结束后处理这个消息
```

**特点**：
- 高优先级，在当前 Turn 结束后立即处理
- 会触发新的 LLM 调用
- 适合**实时纠正** AI 的行为

### Follow-up（跟进）

**场景**：AI 完成了任务，用户想继续对话"再帮我添加测试"

```typescript
// 用户输入 follow-up 消息
agent.followUp({
  role: "user",
  content: [{ type: "text", text: "请为刚才的代码添加单元测试" }],
  timestamp: Date.now(),
});

// Agent 会在所有 Turn 结束后处理这个消息
```

**特点**：
- 低优先级，在所有 Turn 结束后处理
- 适合**任务完成后**的连续对话
- 不会打断当前正在进行的工具调用

### 两种模式对比

```typescript
// 模式配置
export interface AgentOptions {
  steeringMode?: "all" | "one-at-a-time";  // 默认: "one-at-a-time"
  followUpMode?: "all" | "one-at-a-time";  // 默认: "one-at-a-time"
}
```

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| `"one-at-a-time"` | 每次只处理一条消息 | 需要逐步确认、交互式对话 |
| `"all"` | 一次性处理所有消息 | 批量指令、自动化流程 |

```typescript
// 配置示例
const agent = new Agent({
  steeringMode: "one-at-a-time",  // 用户说一条，AI 处理一条
  followUpMode: "all",            // 批量处理后续指令
});
```

## 流式响应处理

AgentLoop 通过 `streamAssistantResponse` 处理 LLM 的流式响应：

```typescript
async function streamAssistantResponse(
  context: AgentContext,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  streamFn?: StreamFn,
): Promise<AssistantMessage> {
  // 1. 可选：转换上下文（如修剪历史）
  let messages = context.messages;
  if (config.transformContext) {
    messages = await config.transformContext(messages, signal);
  }

  // 2. 转换为 LLM 兼容的消息格式
  const llmMessages = await config.convertToLlm(messages);

  // 3. 构建 LLM 上下文
  const llmContext: Context = {
    systemPrompt: context.systemPrompt,
    messages: llmMessages,
    tools: context.tools,
  };

  // 4. 调用流式 API
  const response = await streamFunction(config.model, llmContext, {
    ...config,
    signal,
  });

  // 5. 处理流式事件
  let partialMessage: AssistantMessage | null = null;
  let addedPartial = false;

  for await (const event of response) {
    switch (event.type) {
      case "start":
        partialMessage = event.partial;
        context.messages.push(partialMessage);
        addedPartial = true;
        await emit({ type: "message_start", message: { ...partialMessage } });
        break;

      case "text_start":
      case "text_delta":
      case "text_end":
      case "thinking_start":
      case "thinking_delta":
      case "thinking_end":
      case "toolcall_start":
      case "toolcall_delta":
      case "toolcall_end":
        if (partialMessage) {
          partialMessage = event.partial;
          context.messages[context.messages.length - 1] = partialMessage;
          await emit({
            type: "message_update",
            assistantMessageEvent: event,
            message: { ...partialMessage },
          });
        }
        break;

      case "done":
      case "error": {
        const finalMessage = await response.result();
        // ... 更新消息并发射 message_end
        return finalMessage;
      }
    }
  }
  // ...
}
```

### 关键设计：Partial Message

为什么需要 `partialMessage`？

```mermaid
sequenceDiagram
    participant LLM as LLM 流式响应
    participant Partial as Partial Message
    participant UI as UI 层

    LLM ->> Partial: message_start (partial)
    LLM ->> Partial: text_delta: "Hello"
    Partial ->> UI: 更新显示 "Hello"
    LLM ->> Partial: text_delta: "Hello, how"
    Partial ->> UI: 更新显示 "Hello, how"
    LLM ->> Partial: text_delta: "Hello, how can"
    Partial ->> UI: 更新显示 "Hello, how can"
    LLM ->> Partial: text_delta: "Hello, how can I"
    Partial ->> UI: 更新显示 "Hello, how can I"
    LLM ->> Partial: message_end (final)
    Partial ->> UI: 最终确认
```

`partialMessage` 在流式过程中被**原地更新**，这样：
1. UI 可以实时显示最新内容
2. 如果中途出错，已有内容不会丢失
3. 工具调用可以在流式过程中被解析

## 完整的生命周期示例

让我们追踪一次完整的对话：

```typescript
// 场景：用户让 AI 计算 123 * 456

const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个计算器助手。",
    model: getModel("openai", "gpt-4o-mini"),
    tools: [calculatorTool],
  },
});

// 订阅事件
agent.subscribe((event) => {
  console.log(`[${event.type}]`, JSON.stringify(event).slice(0, 100));
});

// 发送消息
await agent.prompt("计算 123 * 456");
```

### 事件流输出

```
[agent_start] {}
[turn_start] {}
[message_start] {"message":{"role":"user","content":[{"type":"text","text":"计算 123 * 456"}]...
[message_end] {"message":{"role":"user","content":[{"type":"text","text":"计算 123 * 456"}]...
[message_start] {"message":{"role":"assistant","content":[],"api":"openai-responses"...
[message_update] {"message":{"role":"assistant","content":[{"type":"text","text":"我来"...
[message_update] {"message":{"role":"assistant","content":[{"type":"text","text":"我来帮"...
[message_update] {"message":{"role":"assistant","content":[{"type":"text","text":"我来帮你"...
... (更多 text_delta)
[message_update] {"assistantMessageEvent":{"type":"toolcall_start"...
[message_update] {"assistantMessageEvent":{"type":"toolcall_delta"...
[message_update] {"assistantMessageEvent":{"type":"toolcall_end"...
[message_end] {"message":{"role":"assistant","content":[{"type":"text","text":"我来帮你计算："...
[tool_execution_start] {"toolCallId":"call_abc123","toolName":"calculate","args":{"expression":"123 * 456"}}
[tool_execution_end] {"toolCallId":"call_abc123","toolName":"calculate","result":{"content":[{"type":"text","text":"56088"}]...
[message_start] {"message":{"role":"toolResult","toolCallId":"call_abc123"...
[message_end] {"message":{"role":"toolResult","toolCallId":"call_abc123"...
[turn_end] {"message":{...},"toolResults":[{"role":"toolResult","toolCallId":"call_abc123"...
[message_start] {"message":{"role":"assistant","content":[]...
[message_update] ... (AI 生成最终回复)
[message_end] ...
[turn_end] ...
[agent_end] {"messages":[...]}
```

### 状态变化

> **图表说明**：以下时序图展示了一个完整的 Agent 执行流程，包含用户消息、助手回复、工具调用和最终回复。
> - **参与者**：`User`（用户）、`Agent`（Agent 运行时）、`LLM`（大语言模型）、`Tool`（工具执行）
> - **状态标注**：每条消息右侧标注了关键状态变化

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant A as Agent
    participant L as LLM
    participant T as Tool

    Note over A: isStreaming=false<br/>messages=[]<br/>pendingToolCalls={}<br/>streamMessage=null

    U->>A: prompt("计算 123*456")
    Note over A: messages=[userMsg]

    A->>L: streamSimple()
    Note over A: isStreaming=true

    L-->>A: message_start
    Note over A: streamMessage=partialAsst<br/>messages=[userMsg,partial]

    loop 流式输出
        L-->>A: message_update (text_delta)
        Note over A: streamMessage 更新
    end

    L-->>A: message_end
    Note over A: isStreaming=false<br/>streamMessage=null<br/>messages=[userMsg,asstMsg]

    Note over A: pendingToolCalls={call_abc123}

    A->>T: tool_execution_start
    T-->>A: tool_execution_end
    Note over A: pendingToolCalls={}

    A->>A: message_start (toolResult)
    Note over A: messages=[userMsg,asstMsg,toolResult]
    A->>A: message_end (toolResult)

    A->>L: streamSimple() (第二轮)
    Note over A: isStreaming=true

    L-->>A: message_start
    Note over A: streamMessage=partialAsst2

    loop 流式输出
        L-->>A: message_update
    end

    L-->>A: message_end
    Note over A: isStreaming=false<br/>streamMessage=null<br/>messages=[userMsg,asstMsg,toolResult,finalAsst]

    A->>U: agent_end
```

**关键状态说明**：
- **isStreaming**：`true` 表示正在流式接收 LLM 响应（message_start 到 message_end 之间）
- **messages**：完整的对话历史数组，包含 user、assistant、toolResult 消息
- **pendingToolCalls**：Set 集合，包含正在执行的工具调用 ID
- **streamMessage**：当前流式消息的部分内容（仅在流式期间非空）

## 错误处理

AgentLoop 有完善的错误处理机制：

```typescript
// 1. 流式过程中的错误
if (message.stopReason === "error" || message.stopReason === "aborted") {
  await emit({ type: "turn_end", message, toolResults: [] });
  await emit({ type: "agent_end", messages: newMessages });
  return;
}

// 2. 工具执行错误（在 executePreparedToolCall 中捕获）
try {
  const result = await prepared.tool.execute(...);
  return { result, isError: false };
} catch (error) {
  return {
    result: createErrorToolResult(error.message),
    isError: true,
  };
}

// 3. 顶层错误处理（在 _runLoop 中）
try {
  await runAgentLoop(...);
} catch (err: any) {
  // 构造错误消息并追加到历史
  const errorMsg: AgentMessage = {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    stopReason: signal?.aborted ? "aborted" : "error",
    errorMessage: err?.message || String(err),
    // ...
  };
  this.appendMessage(errorMsg);
  this.emit({ type: "agent_end", messages: [errorMsg] });
}
```

## 高级用法：自定义 StreamFn

你可以注入自定义的流函数，用于代理后端、日志记录等：

```typescript
const agent = new Agent({
  streamFn: async (model, context, options) => {
    // 1. 记录请求日志
    console.log("[LLM Request]", { model, messageCount: context.messages.length });

    // 2. 调用实际的流函数
    const stream = streamSimple(model, context, options);

    // 3. 包装流以添加日志
    return {
      async *[Symbol.asyncIterator]() {
        for await (const event of stream) {
          console.log("[LLM Event]", event.type);
          yield event;
        }
      },
      async result() {
        const result = await stream.result();
        console.log("[LLM Result]", result.stopReason);
        return result;
      },
    };
  },
});
```

## 总结

AgentLoop 的核心设计：

1. **双层循环**：外层处理 Follow-up，内层处理 Turn + Tool Calls
2. **消息队列**：steeringQueue（高优先级）+ followUpQueue（低优先级）
3. **流式处理**：实时更新 partialMessage，支持中断恢复
4. **事件驱动**：完整的事件生命周期，便于构建响应式 UI
5. **错误隔离**：工具错误不中断对话，顶层错误有兜底处理

---

**下篇预告**: [03-tool-execution.md](03-tool-execution.md) —— 深入工具调用执行机制，包括并行/串行模式、before/after 钩子、流式工具更新等。
