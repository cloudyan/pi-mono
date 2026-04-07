# Partial 状态管理架构

> **难度：进阶** | **预计阅读时间：30 分钟**

在阅读本章之前，建议先完成 [04-streaming-events.md](04-streaming-events.md) 的学习，了解流式事件的基本机制。

## 为什么需要理解 Partial？

想象你正在使用 ChatGPT，当你提问后，AI 的回复是**逐字显示**的，而不是等全部生成完才一次性显示。这种"打字机效果"背后，就是 **Partial（部分状态）** 机制在支撑。

但 Partial 不仅仅是"逐字显示"这么简单。它是连接**底层 LLM 流式传输**与**上层应用状态**的关键架构层。理解 Partial，是理解 pi-mono 流式架构的核心。

## 什么是 Partial？

在 pi-mono 中，**Partial** 指的是**流式响应过程中的不完整消息状态**。它是消息在生成过程中的"快照"，随着新内容的到达而持续更新。

### 直观理解

```
用户提问: "你好"

LLM 流式生成:
┌─────────────────────────────────────────────────┐
│  Event 1: "H"                                    │
│  → partial.content = [{type: "text", text: "H"}] │
├─────────────────────────────────────────────────┤
│  Event 2: "He"                                   │
│  → partial.content = [{type: "text", text: "He"}]│
├─────────────────────────────────────────────────┤
│  Event 3: "Hell"                                 │
│  → partial.content = [{type: "text", text: "Hell"}]│
├─────────────────────────────────────────────────┤
│  Event 4: "Hello"                                │
│  → partial.content = [{type: "text", text: "Hello"}]│
├─────────────────────────────────────────────────┤
│  Event 5: "Hello!"                               │
│  → partial.content = [{type: "text", text: "Hello!"}]│
└─────────────────────────────────────────────────┘
```

### 代码定义

```typescript
// packages/ai/src/types.ts

export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "done"; reason: StopReason; message: AssistantMessage }
  | { type: "error"; reason: StopReason; error: AssistantMessage };
```

**关键观察**：每个流式事件都携带 `partial: AssistantMessage`，表示**当前时刻的完整消息快照**。

## Partial vs 维护的数据：本质区别

理解 Partial 的关键，是区分它与"维护的数据"（即最终持久化的状态）之间的差异。

| 维度 | Partial（部分状态） | 维护的数据（完整状态） |
|------|-------------------|---------------------|
| **生命周期** | 临时存在，流式过程中持续更新 | 持久存储，对话历史的一部分 |
| **完整性** | 不完整，可能缺少字段或内容截断 | 完整，经过验证的最终数据 |
| **用途** | 实时 UI 渲染、进度显示 | LLM 上下文、持久化存储、业务逻辑 |
| **更新频率** | 高频率（每个 token 都可能更新） | 低频率（只在关键节点更新） |
| **数据一致性** | 最终一致性，中间状态可能不一致 | 强一致性，确认后才写入 |
| **存储位置** | 内存中临时对象 | 数据库/文件/状态管理 |

### 代码层面的对比

```typescript
// packages/agent/src/agent-loop.ts

async function streamAssistantResponse(...) {
  // partialMessage: 临时状态，流式过程中持续更新
  let partialMessage: AssistantMessage | null = null;
  let addedPartial = false;

  for await (const event of response) {
    switch (event.type) {
      case "start":
        // 初始化 partial
        partialMessage = event.partial;
        // 同时加入 context.messages（维护的数据）
        context.messages.push(partialMessage);
        addedPartial = true;
        await emit({ type: "message_start", message: { ...partialMessage } });
        break;

      case "text_delta":
        if (partialMessage) {
          // 更新 partial（原地更新）
          partialMessage = event.partial;
          // 同步更新维护的数据
          context.messages[context.messages.length - 1] = partialMessage;
          await emit({
            type: "message_update",
            message: { ...partialMessage }
          });
        }
        break;

      case "done":
        // 获取最终完整消息
        const finalMessage = await response.result();
        // 替换为完整数据
        context.messages[context.messages.length - 1] = finalMessage;
        await emit({ type: "message_end", message: finalMessage });
        return finalMessage;
    }
  }
}
```

**关键设计**：
1. `partialMessage` 是**临时对象**，在流式过程中被**原地更新**
2. `context.messages` 是**维护的数据**，在流式过程中也被同步更新
3. 流式结束后，`finalMessage` 替换 `partialMessage`，确保数据完整性

## 为什么需要 Partial 层？

### 1. 流式 UI 渲染的需求

```
用户提问 → LLM 生成 → 逐字显示
              ↓
         [流式传输]
              ↓
    "H" → "He" → "Hel" → "Hell" → "Hello"
              ↓
         [UI 实时更新]
```

如果没有 partial：
- 必须等完整响应才能显示 → 用户体验差（等待 5-10 秒）
- 无法实现"打字机效果"

### 2. 工具调用的实时解析

```typescript
for await (const event of stream) {
  switch (event.type) {
    case "toolcall_delta":
      // 工具调用参数也是流式传输的
      const toolCall = event.partial.content[event.contentIndex];
      if (toolCall.type === "toolCall" && toolCall.arguments) {
        // 可以实时显示正在构建的参数
        console.log(`Writing to: ${toolCall.arguments.path}`);
        // 即使 content 还没完整，path 可能已经可用
      }
      break;
  }
}
```

**价值**：在工具调用完成前，UI 可以显示"正在写入文件：xxx"

### 3. 错误恢复与中断处理

```typescript
case "error":
  const finalMessage = await response.result();
  // partial.content 包含中断前已生成的内容
  // 不会丢失已经生成的部分
```

**价值**：即使请求中断，已生成的内容不会丢失

## 架构分层与数据流程

### 架构图

```
┌─────────────────────────────────────────┐
│           UI 层 (React/Vue/CLI)         │
│    订阅事件 → 渲染 partial → 更新界面    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Agent 层 (pi-agent)             │
│    AgentLoop → 管理 partial 状态        │
│    事件流：message_update (携带 partial) │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          AI 层 (pi-ai)                  │
│    Provider → 解析 SSE → 构建 partial   │
│    事件流：text_delta (携带 partial)     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         HTTP 层 (SSE Stream)            │
│    OpenAI/Anthropic 流式响应            │
└─────────────────────────────────────────┘
```

### 各层职责

| 层级 | 职责 | Partial 相关操作 |
|------|------|-----------------|
| **HTTP 层** | 建立 SSE 连接，接收字节流 | 原始字节数据 |
| **AI 层** | 解析 SSE，构建 Partial 对象 | `event.partial` |
| **Agent 层** | 管理 Partial 状态，同步到维护的数据 | `partialMessage` |
| **UI 层** | 订阅事件，渲染 Partial 内容 | 显示给用户 |

### Partial 生成流程（核心机制）

`partial` 的生成发生在 **AI 层（pi-ai）的 Provider 实现**中。以下是完整的数据流程：

#### 1. 初始化 output 对象

```typescript
// packages/ai/src/providers/anthropic.ts（第 207-223 行）
// packages/ai/src/providers/openai-responses.ts（第 70-86 行）

const output: AssistantMessage = {
  role: "assistant",
  content: [],
  api: model.api as Api,
  provider: model.provider,
  model: model.id,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
  stopReason: "stop",
  timestamp: Date.now(),
};
```

#### 2. 流式处理与 partial 更新

```typescript
// packages/ai/src/providers/anthropic.ts（第 260-331 行）

// 发送 start 事件，传递初始 partial
stream.push({ type: "start", partial: output });

for await (const event of anthropicStream) {
  if (event.type === "content_block_delta") {
    if (event.delta.type === "text_delta") {

      // blocks 数组跟踪多个内容块（文本、工具调用、思考等）
      // 由于 LLM 流式响应是交错传输的，需根据 event.index 定位到对应块
      const index = blocks.findIndex((b) => b.index === event.index);
      const block = blocks[index];

      // 关键：原地修改 output 对象
      block.text += event.delta.text;

      // push 事件：delta 是增量，partial 是修改后的完整 output
      stream.push({
        type: "text_delta",
        contentIndex: index,
        delta: event.delta.text,  // ← 本次增量："H"
        partial: output,           // ← 全量快照：{ content: [{ text: "Hello" }] }
      });
    }
  }
}
```

#### 3. 关键机制说明

| 步骤 | 操作 | 说明 |
|------|------|------|
| **初始化** | 创建 `output` 对象 | 空的 `AssistantMessage`，作为 partial 的载体 |
| **流式接收** | 接收 LLM 的 SSE 流 | 逐字节接收增量数据 |
| **原地修改** | 修改 `output` 对象 | `block.text += event.delta.text` |
| **推送事件** | `stream.push({ ..., partial: output })` | 传递当前完整状态作为 partial |
| **传递引用** | `partial: output` | 传递的是对象引用，不是拷贝 |

**核心洞察**：`output` 对象在流式过程中被**原地修改**，每次 `push` 时传递的是**当前状态的引用**，这就是 `partial` 成为"全量快照"的原因。

#### 4. 跨层传递流程

```
┌─────────────────────────────────────────────────────────────┐
│  AI 层（Provider）                                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 1. 创建 output 对象                                    │ │
│  │    output = { role: "assistant", content: [] }        │ │
│  │                                                       │ │
│  │ 2. 流式循环                                            │ │
│  │    for await (event of llmStream) {                   │ │
│  │      block.text += event.delta  ← 原地修改 output      │ │
│  │                                                       │ │
│  │      stream.push({                                    │ │
│  │        type: "text_delta",                            │ │
│  │        delta: event.delta,      ← 增量                │ │
│  │        partial: output          ← 全量快照            │ │
│  │      });                                              │ │
│  │    }                                                  │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent 层（AgentLoop）                                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  partialMessage = event.partial  ← 接收全量快照        │ │
│  │                                                       │ │
│  │  emit({                                               │ │
│  │    type: "message_update",                            │ │
│  │    message: { ...partialMessage }  ← 传给 UI 层       │ │
│  │  });                                                  │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  UI 层                                                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  event.message.content[0].text  ← 直接使用全量数据     │ │
│  │  无需自己拼接增量                                       │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 5. 代码位置汇总

| Provider | 文件路径 | 关键代码行 |
|----------|----------|-----------|
| Anthropic | `packages/ai/src/providers/anthropic.ts` | 260, 280-286, 324-331 |
| OpenAI Responses | `packages/ai/src/providers/openai-responses.ts` | 101, 297, 302, 313 |
| Amazon Bedrock | `packages/ai/src/providers/amazon-bedrock.ts` | 170, 282, 304, 308 |
| Google Gemini | `packages/ai/src/providers/google-gemini-cli.ts` | 479, 596, 665 |
| Mistral | `packages/ai/src/providers/mistral.ts` | 78, 318, 341 |

所有 Provider 遵循相同的模式：
1. 创建 `output` 对象
2. 流式过程中**原地修改** `output`
3. 每次 push 事件时传递 `partial: output`

## 与 LangChain 的对比

### LangChain 的设计

LangChain 的流式处理相对简单：

```python
# LangChain 风格（简化）
for chunk in llm.stream("Hello"):
    print(chunk.content, end="")  # 只处理文本增量
```

**特点**：
- 只暴露 `text_delta`，没有完整的 `partial` 对象
- 不维护中间状态的完整消息结构
- 工具调用通常是非流式的（等完整 JSON）

### pi-mono 的设计

```typescript
// pi-mono 风格
for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      // 有 partial 对象，包含完整的消息结构
      console.log(event.partial.content[0].text);  // 当前完整文本
      break;
    case "toolcall_delta":
      // 工具调用参数也是流式的
      console.log(event.partial.content[0].arguments);  // 已解析的部分参数
      break;
  }
}
```

**特点**：
- 每个事件都携带完整的 `partial` 快照
- 维护完整的中间状态
- 支持工具调用参数的流式解析

### 优劣对比

| 特性 | LangChain 风格 | pi-mono Partial 风格 |
|------|---------------|---------------------|
| 实现复杂度 | 简单 | 较复杂 |
| 内存占用 | 低（只存增量） | 较高（存完整快照） |
| UI 实时性 | 仅文本 | 文本 + 工具 + 思考过程 |
| 错误恢复 | 弱（可能丢失上下文） | 强（有完整快照） |
| 工具调用预览 | 不支持 | 支持 |
| 状态管理 | 需自行实现 | 内置 |
| 适用场景 | 简单聊天 | 复杂 Agent、实时协作 |

## 核心实现：EventStream

```typescript
// packages/ai/src/utils/event-stream.ts

export class EventStream<T, R = T> implements AsyncIterable<T> {
  private queue: T[] = [];                                    // 事件队列
  private waiting: ((value: IteratorResult<T>) => void)[] = []; // 等待的消费者
  private done = false;
  private finalResultPromise: Promise<R>;

  constructor(
    private isComplete: (event: T) => boolean,    // 判断是否完成
    private extractResult: (event: T) => R,       // 提取结果
  ) {
    this.finalResultPromise = new Promise((resolve) => {
      this.resolveFinalResult = resolve;
    });
  }

  // 生产者：推送事件（携带 partial）
  push(event: T): void {
    if (this.done) return;

    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }

    // 直接传递给等待的消费者，或加入队列
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  // 消费者：异步迭代
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        return;
      } else {
        const result = await new Promise<IteratorResult<T>>(
          (resolve) => this.waiting.push(resolve)
        );
        if (result.done) return;
        yield result.value;
      }
    }
  }

  // 消费者：获取最终结果
  result(): Promise<R> {
    return this.finalResultPromise;
  }
}
```

**关键设计**：
1. **双向控制**：生产者可以 `push()`，消费者可以 `for await...of` 或 `.result()`
2. **零拷贝传递**：消费者等待时事件直接传递，不经过队列
3. **背压处理**：队列自然处理生产者和消费者速度不匹配

## 使用模式

### 模式 1：实时显示（打字机效果）

```typescript
import { getModel, streamSimple } from "@mariozechner/pi-ai";

const model = getModel("openai", "gpt-4o-mini");
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "讲个故事" }],
});

for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      // 使用 event.partial 获取当前完整文本
      process.stdout.write(event.delta);
      break;
    case "toolcall_delta":
      // 实时显示工具参数
      const partial = event.partial.content[event.contentIndex];
      if (partial.type === "toolCall") {
        console.log(`参数预览: ${JSON.stringify(partial.arguments)}`);
      }
      break;
    case "done":
      console.log("\n[完成]");
      break;
  }
}
```

### 模式 2：获取最终结果

```typescript
const stream = streamSimple(model, context);

// 不处理中间事件，直接获取最终结果
const message = await stream.result();

console.log("回复:", message.content);
console.log("Token 使用:", message.usage);
console.log("停止原因:", message.stopReason);

// 添加到上下文继续对话
context.messages.push(message);
```

### 模式 3：混合使用（推荐）

```typescript
const stream = streamSimple(model, context);

// 同时实时显示和收集结果
const displayTask = (async () => {
  for await (const event of stream) {
    if (event.type === "text_delta") {
      process.stdout.write(event.delta);
    }
  }
})();

// 等待显示完成
await displayTask;

// 获取完整结果
const message = await stream.result();
context.messages.push(message);
```

## 与 Optimistic UI 的关系

Partial 不是 Optimistic UI，但可以结合使用：

```typescript
// Optimistic UI：先显示预期结果，再确认
const optimisticMessage = { role: "assistant", content: "Processing..." };
ui.showMessage(optimisticMessage);

// Partial：显示真实进度
for await (const event of stream) {
  if (event.type === "text_delta") {
    ui.updateMessage(event.partial);  // 替换为真实内容
  }
}
```

**区别**：
- **Optimistic UI**：预测用户操作的结果，提前显示
- **Partial**：显示真实发生的中间状态，非预测

## 最佳实践

### 1. 防御性编程

Partial 状态可能不完整，使用时需要检查：

```typescript
case "toolcall_delta":
  const toolCall = event.partial.content[event.contentIndex];
  if (toolCall.type === "toolCall") {
    // ✅ 检查字段是否存在
    if (toolCall.arguments?.path) {
      console.log(`Writing to: ${toolCall.arguments.path}`);
    }
    // content 可能还不存在
    if (toolCall.arguments?.content) {
      console.log(`Content: ${toolCall.arguments.content}`);
    }
  }
```

### 2. 错误处理

即使请求中断，也能获取 partial content：

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const stream = streamSimple(model, context, {
  signal: controller.signal,
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

// 即使中断，也能获取已生成的内容
const partialMessage = await stream.result();
console.log("\n部分回复:", partialMessage.content);
```

### 3. 性能优化

如果消费速度跟不上生产速度，使用背压控制：

```typescript
async function* withBackPressure<T>(
  stream: AsyncGenerator<T>,
  maxBuffer: number,
): AsyncGenerator<T> {
  const buffer: T[] = [];

  for await (const item of stream) {
    buffer.push(item);

    // 缓冲区满了，暂停读取
    while (buffer.length > maxBuffer) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    yield buffer.shift()!;
  }
}

// 使用
const stream = streamSimple(model, context);
for await (const event of withBackPressure(stream, 100)) {
  await slowOperation(event);
}
```

## 为什么不直接使用维护的数据？

你可能会问：**为什么不直接修改 `context.messages`，而要引入 `partial` 这个临时状态？**

这是一个很好的架构问题。让我们对比两种设计：

### ❌ 设计一：直接修改维护的数据（不推荐）

```typescript
// 假想设计：没有 partial，直接操作 context.messages
for await (const event of stream) {
  if (event.type === "text_delta") {
    // 直接修改持久化数据
    const lastMessage = context.messages[context.messages.length - 1];
    lastMessage.content[0].text += event.delta; // 自己拼接
    ui.renderText(lastMessage.content[0].text);
  }
}
```

**问题**：
1. **数据污染**：流式过程中 `context.messages` 始终处于"半成品"状态
2. **错误风险**：如果请求中断，`context.messages` 中保存的是不完整消息
3. **并发问题**：多个流同时修改 `context.messages` 会导致混乱
4. **职责不清**：UI 层需要关心数据持久化逻辑

### ✅ 设计二：使用 partial（pi-mono 设计）

```typescript
// 实际设计：使用 partial 隔离临时状态
let partialMessage: AssistantMessage | null = null;

for await (const event of stream) {
  if (event.type === "text_delta") {
    // 只更新临时状态
    partialMessage = event.partial;
    ui.renderText(partialMessage.content[0].text);
  }
}

// 流式结束后，原子替换到持久化数据
const finalMessage = await stream.result();
context.messages[context.messages.length - 1] = finalMessage;
```

**优势**：
1. **数据隔离**：流式过程中 `context.messages` 不会被污染
2. **错误安全**：中断时不会保存半成品到持久化存储
3. **并发安全**：每个流有自己的 `partial`，互不干扰
4. **职责清晰**：分层明确，UI 只负责渲染

### 关键差异对比

| 维度 | 不使用 partial（直接修改） | 使用 partial（临时状态） |
|------|-------------------------|------------------------|
| **数据一致性** | ❌ 流式过程中数据处于半成品状态 | ✅ 数据隔离，结束后原子替换 |
| **错误恢复** | ❌ 中断时可能保存不完整数据 | ✅ 错误时不会污染持久化数据 |
| **并发安全** | ❌ 需要锁机制防止并发修改 | ✅ 每个流有自己的 partial |
| **可测试性** | ❌ 测试需要操作全局状态 | ✅ 可以单独测试 partial 逻辑 |
| **架构清晰度** | ❌ UI 层需要关心持久化 | ✅ 分层清晰，职责单一 |

### 核心洞察

> `partial` 是一种**"写时复制"（Copy-on-Write）**思想的变体。流式过程中操作临时对象，确认完整后才写入持久化存储。这保证了数据的**原子性**和**一致性**。

就像数据库的事务一样——修改先在临时空间进行，提交后才真正写入，回滚时数据保持原样。

## 总结

| 问题 | 答案 |
|------|------|
| **Partial 是什么** | 流式响应过程中的不完整消息快照 |
| **与维护的数据的区别** | Partial 是临时状态，维护的数据是持久状态 |
| **为什么需要** | 实时 UI 渲染、工具调用预览、错误恢复、数据隔离 |
| **为什么不直接修改持久化数据** | 避免数据污染、保证错误安全、支持并发、职责清晰 |
| **LangChain 为什么没有** | 简化设计，牺牲实时性和状态管理 |
| **架构价值** | 分层解耦、响应式编程、状态一致性、数据隔离 |

**核心洞察**：

> Partial 层是**流式架构的关键抽象**，它在**底层字节流**和**上层应用状态**之间建立了桥梁。通过引入临时状态隔离流式过程中的不确定性，既保证了实时性，又确保了数据的完整性和一致性。

这种设计特别适合需要**实时反馈**的 AI 应用，如：
- 编码助手（实时显示代码生成）
- 数据分析（实时显示图表渲染）
- 多轮对话（实时显示思考过程）

---

**下篇预告**: [06-error-handling.md](06-error-handling.md) —— 错误处理与终止机制，包括流式过程中的错误恢复、中断处理等。
