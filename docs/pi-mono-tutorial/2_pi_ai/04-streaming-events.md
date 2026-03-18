# 流式事件处理与 EventStream 实现

> **难度：进阶** | **预计阅读时间：25 分钟**

当你使用 ChatGPT 时，有没有注意到回复是**一个字一个字**蹦出来的？这就是**流式响应**。如果等整个回复生成完再显示，用户可能要等好几秒，体验很差。

pi-ai 的流式响应是怎么实现的？为什么它能同时支持 `for await...of` 迭代和 `.result()` 获取最终结果？今天我们就来深入剖析。

## 流式响应的原理

### 传统方式 vs 流式方式

**传统方式（阻塞式）：**
```
用户提问 -> 等待 AI 生成完整回复 -> 显示完整回复
              ↑
         用户等待 5-10 秒
```

**流式方式（增量式）：**
```
用户提问 -> 收到第一个字 -> 显示第一个字
         -> 收到第二个字 -> 显示第二个字
         -> ...
         -> 收到最后一个字 -> 显示完成
```

### HTTP 流式传输

流式响应基于 HTTP 的 **Server-Sent Events (SSE)**：

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Transfer-Encoding: chunked

data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" world"}}]}

data: {"choices":[{"delta":{"content":"!"}}]}

data: [DONE]
```

## pi-ai 的流式架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  消费方式 1: for await...of 实时处理                      │   │
│  │  for await (const event of stream) { ... }              │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  消费方式 2: .result() 获取最终结果                       │   │
│  │  const message = await stream.result();                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
          ┌──────────────────────────────────────────────────────────┐
          │              EventStream (双向流控制)                     │
          │  ┌────────────────────────────────────────────────────┐   │
          │  │  生产者接口                                         │   │
          │  │  - push(event: T): void                            │   │
          │  │  - end(result?: R): void                           │   │
          │  └────────────────────────────────────────────────────┘   │
          │  ┌────────────────────────────────────────────────────┐   │
          │  │  消费者接口                                         │   │
          │  │  - [Symbol.asyncIterator](): AsyncIterator<T>      │   │
          │  │  - result(): Promise<R>                            │   │
          │  └────────────────────────────────────────────────────┘   │
          │  ┌────────────────────────────────────────────────────┐   │
          │  │  内部机制                                           │   │
          │  │  - queue: T[] (事件队列)                           │   │
          │  │  - waiting: 等待事件的消费者回调                   │   │
          │  │  - done: 流是否结束                                │   │
          │  │  - finalResultPromise: 最终结果 Promise            │   │
          │  └────────────────────────────────────────────────────┘   │
          └──────────────────────────────────────────────────────────┘
                           │
                           ▼
          ┌──────────────────────────────────────────────────────────┐
          │              Provider 层                                  │
          │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
          │  │   OpenAI     │  │  Anthropic   │  │    Google    │    │
          │  │  Completions │  │   Messages   │  │ GenerativeAI │    │
          │  └──────────────┘  └──────────────┘  └──────────────┘    │
          └──────────────────────────────────────────────────────────┘
                           │
                           ▼
          ┌──────────────────────────────────────────────────────────┐
          │              HTTP 流式响应                                │
          │         fetch() + ReadableStream + SSE Parser            │
          └──────────────────────────────────────────────────────────┘
```

## 核心实现：EventStream 类

### 基础 EventStream

```typescript
// packages/ai/src/utils/event-stream.ts

export class EventStream<T, R = T> implements AsyncIterable<T> {
  // 内部状态
  private queue: T[] = [];                                    // 事件队列
  private waiting: ((value: IteratorResult<T>) => void)[] = []; // 等待的消费者
  private done = false;                                       // 流是否结束
  private finalResultPromise: Promise<R>;                     // 最终结果 Promise
  private resolveFinalResult!: (result: R) => void;           // 解析最终结果的函数

  constructor(
    private isComplete: (event: T) => boolean,    // 判断事件是否表示完成
    private extractResult: (event: T) => R,       // 从完成事件提取结果
  ) {
    // 创建最终结果 Promise
    this.finalResultPromise = new Promise((resolve) => {
      this.resolveFinalResult = resolve;
    });
  }

  // 生产者：推送事件
  push(event: T): void {
    if (this.done) return;

    // 如果是完成事件，标记为 done 并解析最终结果
    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }

    // 如果有等待的消费者，直接传递事件
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      // 否则加入队列
      this.queue.push(event);
    }
  }

  // 生产者：结束流
  end(result?: R): void {
    this.done = true;
    if (result !== undefined) {
      this.resolveFinalResult(result);
    }
    // 通知所有等待的消费者流已结束
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ value: undefined as any, done: true });
    }
  }

  // 消费者：异步迭代
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        // 队列中有事件，直接 yield
        yield this.queue.shift()!;
      } else if (this.done) {
        // 流已结束，退出迭代
        return;
      } else {
        // 等待新事件
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

### AssistantMessageEventStream

```typescript
// packages/ai/src/utils/event-stream.ts

export class AssistantMessageEventStream extends EventStream<
  AssistantMessageEvent,    // 事件类型
  AssistantMessage          // 结果类型
> {
  constructor() {
    super(
      // isComplete: 判断事件是否表示流结束
      (event) => event.type === "done" || event.type === "error",
      // extractResult: 从完成事件提取 AssistantMessage
      (event) => {
        if (event.type === "done") {
          return event.message;
        } else if (event.type === "error") {
          return event.error;
        }
        throw new Error("Unexpected event type for final result");
      },
    );
  }
}

// 工厂函数（用于扩展）
export function createAssistantMessageEventStream(): AssistantMessageEventStream {
  return new AssistantMessageEventStream();
}
```

## 双向流控制详解

### 为什么需要双向控制？

传统异步生成器只有**单向**控制：

```typescript
// 传统 AsyncGenerator：只能消费，不能控制
async function* generate() {
  yield 1;
  yield 2;
  yield 3;
}

// 消费者只能被动接收
for await (const item of generate()) {
  console.log(item); // 1, 2, 3
}
```

EventStream 提供**双向**控制：

```typescript
// EventStream：生产者和消费者都可以控制
const stream = new AssistantMessageEventStream();

// 生产者：主动推送事件
stream.push({ type: "text_delta", delta: "Hello", ... });
stream.push({ type: "text_delta", delta: " world", ... });
stream.end();

// 消费者 1：实时迭代
for await (const event of stream) {
  console.log(event);
}

// 消费者 2：获取最终结果
const message = await stream.result();
console.log(message);
```

### 生产者-消费者协作模型

```
生产者 (Provider)                    消费者 (应用代码)
     │                                    │
     │  push({ type: "start" })           │
     │───────────────────────────────────>│
     │                                    │
     │  push({ type: "text_delta" })      │
     │───────────────────────────────────>│  for await (const event of stream)
     │                                    │    if (event.type === "text_delta")
     │  push({ type: "text_delta" })      │      process.stdout.write(event.delta)
     │───────────────────────────────────>│
     │                                    │
     │  ...                               │
     │                                    │
     │  end(message)                      │
     │───────────────────────────────────>│  const message = await stream.result()
     │                                    │
```

### 内部机制：队列 + 等待列表

```typescript
class EventStream<T, R> {
  private queue: T[] = [];                                    // 事件队列
  private waiting: ((value: IteratorResult<T>) => void)[] = []; // 等待回调

  push(event: T): void {
    // 策略：优先直接传递，其次入队
    const waiter = this.waiting.shift();
    if (waiter) {
      // 有消费者在等待，直接传递
      waiter({ value: event, done: false });
    } else {
      // 没有消费者等待，加入队列
      this.queue.push(event);
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        // 队列中有事件，直接消费
        yield this.queue.shift()!;
      } else if (this.done) {
        // 流已结束
        return;
      } else {
        // 队列为空，等待新事件
        const result = await new Promise<IteratorResult<T>>(
          (resolve) => this.waiting.push(resolve)
        );
        if (result.done) return;
        yield result.value;
      }
    }
  }
}
```

**关键设计：**

1. **零拷贝传递**：如果消费者正在等待，事件直接传递，不经过队列
2. **背压自然处理**：如果生产者过快，事件会堆积在队列中
3. **内存安全**：队列不会无限增长，因为消费者会不断消费

## 使用模式

### 模式 1：实时显示（打字机效果）

```typescript
import { getModel, streamSimple } from "@mariozechner/pi-ai";

const model = getModel("openai", "gpt-4o-mini");
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "讲个故事" }],
});

// 实时处理每个事件
for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      // 逐字显示
      process.stdout.write(event.delta);
      break;
    case "thinking_delta":
      // 显示思考过程（可选）
      process.stderr.write(event.delta);
      break;
    case "toolcall_start":
      console.log(`\n[调用工具: ${event.partial.content[event.contentIndex].name}]`);
      break;
    case "done":
      console.log("\n[完成]");
      break;
    case "error":
      console.error("\n[错误]", event.error.errorMessage);
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

### 模式 4：处理工具调用

```typescript
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "计算 25 * 18" }],
  tools: [calculatorTool],
});

const toolCalls = new Map<string, { name: string; args: string }>();

for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      process.stdout.write(event.delta);
      break;

    case "toolcall_start":
      const toolCall = event.partial.content[event.contentIndex];
      if (toolCall.type === "toolCall") {
        toolCalls.set(toolCall.id, { name: toolCall.name, args: "" });
        console.log(`\n[开始调用: ${toolCall.name}]`);
      }
      break;

    case "toolcall_delta":
      // 累积工具参数（JSON 片段）
      const current = toolCalls.get(
        event.partial.content[event.contentIndex].id
      );
      if (current) {
        current.args += event.delta;
      }
      break;

    case "toolcall_end":
      const completed = event.toolCall;
      console.log(`\n[工具调用完成: ${completed.name}]`);
      console.log("参数:", completed.arguments);

      // 执行工具
      const result = await executeTool(completed.name, completed.arguments);

      // 添加工具结果到上下文
      context.messages.push({
        role: "toolResult",
        toolCallId: completed.id,
        toolName: completed.name,
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: false,
        timestamp: Date.now(),
      });
      break;

    case "done":
      console.log("\n[完成]");
      break;
  }
}
```

### 模式 5：处理思考/推理

```typescript
const stream = streamSimple(model, context, {
  reasoning: "high",  // 启用推理
});

let isThinking = false;

for await (const event of stream) {
  switch (event.type) {
    case "thinking_start":
      isThinking = true;
      console.log("[思考中...]");
      break;

    case "thinking_delta":
      // 可以显示思考过程，或隐藏
      // process.stderr.write(event.delta);
      break;

    case "thinking_end":
      isThinking = false;
      console.log("[思考完成]");
      break;

    case "text_delta":
      if (!isThinking) {
        process.stdout.write(event.delta);
      }
      break;
  }
}
```

## Provider 流式实现示例

### OpenAI Completions 流解析

```typescript
// packages/ai/src/providers/openai-completions.ts

export function streamOpenAICompletions(
  model: Model<"openai-completions">,
  context: Context,
  options?: OpenAICompletionsOptions,
): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();

  (async () => {
    try {
      const openai = new OpenAI({
        apiKey: options?.apiKey ?? getEnvApiKey("openai"),
        baseURL: model.baseUrl,
      });

      // 转换消息格式
      const messages = convertContextToOpenAIFormat(context, model);

      // 调用 OpenAI API（流式）
      const response = await openai.chat.completions.create({
        model: model.id,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...options,
      });

      // 发送开始事件
      stream.push({
        type: "start",
        partial: createPartialMessage(model, []),
      });

      let contentIndex = 0;

      // 解析 SSE 流
      for await (const chunk of response) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // 文本增量
        if (delta.content) {
          stream.push({
            type: "text_delta",
            contentIndex,
            delta: delta.content,
            partial: createPartialMessage(model, [
              { type: "text", text: delta.content },
            ]),
          });
        }

        // 工具调用
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.id) {
              stream.push({
                type: "toolcall_start",
                contentIndex,
                partial: createPartialMessage(model, [
                  {
                    type: "toolCall",
                    id: toolCall.id,
                    name: toolCall.function?.name || "",
                    arguments: {},
                  },
                ]),
              });
            }
            if (toolCall.function?.arguments) {
              stream.push({
                type: "toolcall_delta",
                contentIndex,
                delta: toolCall.function.arguments,
                partial: createPartialMessage(model, []),
              });
            }
          }
        }

        // 使用统计
        if (chunk.usage) {
          // 更新 usage
        }
      }

      // 发送完成事件
      stream.push({
        type: "done",
        reason: "stop",
        message: createFinalMessage(model, content),
      });

      stream.end();
    } catch (error) {
      // 发送错误事件
      stream.push({
        type: "error",
        reason: "error",
        error: createErrorMessage(model, error),
      });
      stream.end();
    }
  })();

  return stream;
}
```

## 取消流式请求

```typescript
import { getModel, streamSimple } from "@mariozechner/pi-ai";

const model = getModel("openai", "gpt-4o-mini");
const controller = new AbortController();

// 启动流式请求
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "写一篇长文章" }],
}, {
  signal: controller.signal,  // 传入 AbortSignal
});

// 5 秒后取消
setTimeout(() => controller.abort(), 5000);

try {
  for await (const event of stream) {
    if (event.type === "text_delta") {
      process.stdout.write(event.delta);
    } else if (event.type === "error") {
      if (event.reason === "aborted") {
        console.log("\n[请求已取消]");
      } else {
        console.error("\n[错误]", event.error.errorMessage);
      }
    }
  }
} catch (error) {
  if (error.name === "AbortError") {
    console.log("\n[请求已取消]");
  }
}

// 获取部分结果
const partialMessage = await stream.result();
console.log("\n部分回复:", partialMessage.content);
```

## 错误处理

```typescript
const stream = streamSimple(model, context);

for await (const event of stream) {
  switch (event.type) {
    case "error":
      console.error("流错误:", event.error.errorMessage);
      console.error("部分回复:", event.error.content);
      console.error("Token 使用:", event.error.usage);

      // 可以选择继续或中断
      if (event.reason === "aborted") {
        console.log("请求被用户取消");
      } else {
        console.error("请求失败:", event.error.errorMessage);
      }
      break;

    case "done":
      if (event.reason === "length") {
        console.log("回复被截断（达到 token 限制）");
      } else if (event.reason === "toolUse") {
        console.log("模型等待工具结果");
      }
      break;
  }
}
```

## 性能优化

### 1. 背压控制

如果消费速度跟不上生产速度：

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

  // 清空缓冲区
  while (buffer.length > 0) {
    yield buffer.shift()!;
  }
}

// 使用
const stream = streamSimple(model, context);
for await (const event of withBackPressure(stream, 100)) {
  // 处理事件
  await slowOperation(event);
}
```

### 2. 批处理

对于高频事件，可以批量处理：

```typescript
async function* batchEvents<T>(
  stream: AsyncGenerator<T>,
  maxSize: number,
  maxWait: number,
): AsyncGenerator<T[]> {
  let batch: T[] = [];
  let timeout: NodeJS.Timeout | null = null;

  for await (const event of stream) {
    batch.push(event);

    if (batch.length >= maxSize) {
      yield batch;
      batch = [];
      if (timeout) clearTimeout(timeout);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        if (batch.length > 0) {
          yield batch;
          batch = [];
        }
        timeout = null;
      }, maxWait);
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}

// 使用：每 100ms 或 10 个事件批量处理
const stream = streamSimple(model, context);
for await (const events of batchEvents(stream, 10, 100)) {
  // 批量更新 UI
  updateUI(events);
}
```

## 总结

pi-ai 的 EventStream 设计非常精妙：

1. **双向控制**：生产者可以 `push()` 事件，消费者可以 `for await...of` 迭代或 `.result()` 获取结果
2. **零拷贝传递**：消费者等待时事件直接传递，不经过队列
3. **类型安全**：`EventStream<T, R>` 泛型确保事件类型和结果类型正确
4. **错误隔离**：Provider 错误通过 `error` 事件传递，不抛出异常
5. **可取消**：支持 `AbortSignal` 取消请求
6. **背压处理**：队列自然处理生产者和消费者速度不匹配

这种设计让流式响应变得简单直观，开发者可以灵活选择实时处理或获取最终结果。

---

**下篇预告：**《消息格式转换：统一协议与 Provider 适配》 - 深入理解 pi-ai 的消息转换机制。
