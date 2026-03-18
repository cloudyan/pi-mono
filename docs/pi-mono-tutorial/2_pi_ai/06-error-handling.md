# 错误处理与终止机制

> **难度：进阶** | **预计阅读时间：15 分钟**

在 LLM 调用过程中，可能会遇到各种错误：网络超时、API 限流、Token 超限、用户取消请求... pi-ai 是如何优雅地处理这些错误的？

今天我们就来深入剖析 pi-ai 的错误处理与终止机制。

## 错误类型全景

```
错误分类
├── 网络错误
│   ├── 连接超时 (ETIMEDOUT)
│   ├── DNS 解析失败 (ENOTFOUND)
│   └── 网络中断 (ECONNRESET)
│
├── API 错误
│   ├── 认证失败 (401 Unauthorized)
│   ├── 限流 (429 Rate Limit)
│   ├── Token 超限 (413 Payload Too Large)
│   └── 模型不可用 (503 Service Unavailable)
│
├── 用户操作
│   ├── 取消请求 (AbortSignal)
│   └── 超时中断
│
└── 内部错误
    ├── Provider 加载失败
    ├── 消息转换错误
    └── 流解析错误
```

## pi-ai 的错误处理哲学

### 核心原则

1. **错误即事件**：错误通过 `error` 事件传递，而不是抛出异常
2. **部分结果保留**：即使出错，也保留已生成的部分内容
3. **可恢复性**：中止的请求可以继续对话
4. **类型安全**：错误事件有完整的类型定义

### 错误事件 vs 抛出异常

**传统方式（抛出异常）：**
```typescript
try {
  const response = await complete(model, context);
  console.log(response);
} catch (error) {
  // 错误处理
  console.error(error);
  // 问题：已生成的内容丢失了！
}
```

**pi-ai 方式（错误事件）：**
```typescript
const stream = streamSimple(model, context);

for await (const event of stream) {
  if (event.type === "error") {
    // 可以访问部分结果
    console.error("错误:", event.error.errorMessage);
    console.log("已生成内容:", event.error.content);
    console.log("Token 使用:", event.error.usage);
  }
}

// 仍然可以获取部分结果
const message = await stream.result();
```

## 错误事件类型

```typescript
// packages/ai/src/types.ts

export type AssistantMessageEvent =
  // ... 其他事件
  | {
      type: "error";
      reason: "error" | "aborted";
      error: AssistantMessage;  // 包含部分内容的助手消息
    };
```

### 错误消息结构

```typescript
interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];      // 已生成的内容（可能不完整）
  api: Api;
  provider: Provider;
  model: string;
  usage: Usage;                 // 部分 Token 使用统计
  stopReason: "error" | "aborted";
  errorMessage?: string;        // 错误描述
  timestamp: number;
}
```

## 取消请求机制

### AbortController 标准

pi-ai 使用 Web 标准的 `AbortController`：

```typescript
import { getModel, streamSimple } from "@mariozechner/pi-ai";

const model = getModel("openai", "gpt-4o-mini");
const controller = new AbortController();

// 启动请求
const stream = streamSimple(model, {
  messages: [{ role: "user", content: "写一篇长文章" }],
}, {
  signal: controller.signal,  // 传入 AbortSignal
});

// 5 秒后取消
setTimeout(() => controller.abort(), 5000);

// 处理响应
for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "error") {
    if (event.reason === "aborted") {
      console.log("\n[用户取消]");
    } else {
      console.error("\n[错误]", event.error.errorMessage);
    }
  }
}

// 获取部分结果
const partialMessage = await stream.result();
console.log("\n部分回复:", partialMessage.content);
console.log("Token 使用:", partialMessage.usage);
```

### Provider 实现中的取消

```typescript
// packages/ai/src/providers/openai-completions.ts

export function streamOpenAICompletions(
  model: Model<"openai-completions">,
  context: Context,
  options?: OpenAICompletionsOptions,
): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  const signal = options?.signal;

  (async () => {
    try {
      const openai = new OpenAI({
        apiKey: options?.apiKey ?? getEnvApiKey("openai"),
        baseURL: model.baseUrl,
      });

      const response = await openai.chat.completions.create({
        model: model.id,
        messages: transformMessages(context, "openai-completions", model),
        stream: true,
        // OpenAI SDK 自动处理 AbortSignal
      }, {
        signal,  // 传递 AbortSignal
      });

      for await (const chunk of response) {
        // 检查是否已取消
        if (signal?.aborted) {
          stream.push({
            type: "error",
            reason: "aborted",
            error: createAbortedMessage(model, "用户取消"),
          });
          stream.end();
          return;
        }

        // 处理正常响应...
      }
    } catch (error) {
      // 处理错误...
    }
  })();

  return stream;
}
```

## 错误恢复与继续

### 中止后继续对话

```typescript
const context = {
  messages: [
    { role: "user", content: "详细解释量子计算" }
  ]
};

// 第一个请求在 2 秒后中止
const controller1 = new AbortController();
setTimeout(() => controller1.abort(), 2000);

const partial = await complete(model, context, { signal: controller1.signal });

// 将部分响应添加到上下文
context.messages.push(partial);
context.messages.push({ role: "user", content: "请继续" });

// 继续对话
const continuation = await complete(model, context);
```

### 自动重试机制

```typescript
async function completeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 判断是否应该重试
      if (isRetryableError(error)) {
        console.log(`重试 ${i + 1}/${maxRetries}...`);
        await sleep(delayMs * Math.pow(2, i)); // 指数退避
        continue;
      }

      // 不可重试的错误，直接抛出
      throw error;
    }
  }

  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // 网络错误通常可以重试
    if (error.message.includes("ETIMEDOUT")) return true;
    if (error.message.includes("ECONNRESET")) return true;
    if (error.message.includes("429")) return true; // 限流
    if (error.message.includes("503")) return true; // 服务不可用
  }
  return false;
}

// 使用
const response = await completeWithRetry(
  () => complete(model, context),
  3,
  1000
);
```

## Provider 加载错误

### 延迟加载错误处理

```typescript
// packages/ai/src/providers/register-builtins.ts

function createLazyStream<TApi extends Api, TOptions extends StreamOptions>(
  loadModule: () => Promise<LazyProviderModule<TApi, TOptions, SimpleStreamOptions>>,
): StreamFunction<TApi, TOptions> {
  return (model, context, options) => {
    const outer = new AssistantMessageEventStream();

    loadModule()
      .then((module) => {
        const inner = module.stream(model, context, options);
        forwardStream(outer, inner);
      })
      .catch((error) => {
        // Provider 加载失败时的错误处理
        const message = createLazyLoadErrorMessage(model, error);
        outer.push({ type: "error", reason: "error", error: message });
        outer.end(message);
      });

    return outer;
  };
}

function createLazyLoadErrorMessage(
  model: { id: string; api: Api; provider: Provider },
  error: unknown,
): AssistantMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "text",
        text: `Failed to load provider module for ${model.api}: ${error}`,
      },
    ],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      total: 0,
      cost: { input: 0, output: 0, total: 0 },
    },
    stopReason: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  };
}
```

## 流解析错误

### SSE 解析错误

```typescript
async function* parseOpenAIStream(
  response: Response,
): AsyncGenerator<AssistantMessageEvent> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is null");
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data);
          yield convertChunkToEvent(chunk);
        } catch (parseError) {
          // JSON 解析错误
          console.error("Failed to parse SSE chunk:", data);
          // 继续处理下一个 chunk，不中断流
        }
      }
    }
  } catch (error) {
    // 流读取错误
    throw new Error(`Stream read error: ${error}`);
  } finally {
    reader.releaseLock();
  }
}
```

## 工具调用错误

### 工具参数验证错误

```typescript
import { validateToolCall, Tool } from "@mariozechner/pi-ai";

const tools: Tool[] = [weatherTool, calculatorTool];

for await (const event of stream) {
  if (event.type === "toolcall_end") {
    const toolCall = event.toolCall;

    try {
      // 验证工具参数
      const validatedArgs = validateToolCall(tools, toolCall);
      const result = await executeTool(toolCall.name, validatedArgs);

      // 添加工具结果
      context.messages.push({
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: false,
        timestamp: Date.now(),
      });
    } catch (error) {
      // 验证失败或执行错误
      context.messages.push({
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: "text", text: error.message }],
        isError: true,  // 标记为错误
        timestamp: Date.now(),
      });

      // 模型会自动重试
    }
  }
}
```

## 最佳实践

### 1. 始终处理 error 事件

```typescript
const stream = streamSimple(model, context);

for await (const event of stream) {
  switch (event.type) {
    case "text_delta":
      process.stdout.write(event.delta);
      break;
    case "done":
      console.log("\n完成");
      break;
    case "error":
      // 必须处理错误事件
      console.error("错误:", event.error.errorMessage);
      console.log("部分内容:", event.error.content);
      break;
  }
}
```

### 2. 使用 AbortController 实现超时

```typescript
function completeWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fn(controller.signal).finally(() => {
    clearTimeout(timeoutId);
  });
}

// 使用
const response = await completeWithTimeout(
  (signal) => complete(model, context, { signal }),
  30000  // 30 秒超时
);
```

### 3. 实现指数退避重试

```typescript
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = Math.min(1000 * Math.pow(2, i), 10000); // 最大 10 秒
      console.log(`重试 ${i + 1}/${maxRetries}，等待 ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw new Error("Max retries exceeded");
}
```

### 4. 优雅降级

```typescript
async function completeWithFallback(
  primaryModel: Model<Api>,
  fallbackModel: Model<Api>,
  context: Context,
): Promise<AssistantMessage> {
  try {
    return await complete(primaryModel, context);
  } catch (error) {
    console.warn("主模型失败，切换到备用模型:", error);
    return await complete(fallbackModel, context);
  }
}

// 使用
const response = await completeWithFallback(
  getModel("openai", "gpt-4o"),
  getModel("anthropic", "claude-sonnet-4"),
  context
);
```

## 调试技巧

### 使用 onPayload 调试

```typescript
const response = await complete(model, context, {
  onPayload: (payload) => {
    console.log("Request payload:", JSON.stringify(payload, null, 2));
  },
});
```

### 捕获详细错误信息

```typescript
const stream = streamSimple(model, context);

for await (const event of stream) {
  if (event.type === "error") {
    console.error("=== 错误详情 ===");
    console.error("原因:", event.reason);
    console.error("消息:", event.error.errorMessage);
    console.error("Provider:", event.error.provider);
    console.error("模型:", event.error.model);
    console.error("部分内容:", JSON.stringify(event.error.content, null, 2));
    console.error("Token 使用:", event.error.usage);
  }
}
```

## 总结

pi-ai 的错误处理机制设计精妙：

1. **错误即事件**：通过 `error` 事件传递，保留部分结果
2. **标准取消**：使用 `AbortController` 实现取消和超时
3. **可恢复性**：中止的请求可以继续对话
4. **类型安全**：完整的类型定义，编译时检查
5. **优雅降级**：支持重试、备用模型等策略

这种设计让错误处理变得简单直观，开发者可以灵活应对各种异常情况。

---

**下篇预告：**《跨 Provider 切换实现》 - 深入理解 pi-ai 的 Provider 切换机制。
