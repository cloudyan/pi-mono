# Provider 注册机制与延迟加载实现

> **难度：进阶** | **预计阅读时间：25 分钟**

pi-ai 支持 20+ LLM Provider，但它是如何管理这些 Provider 的？为什么启动时不会一次性加载所有 Provider？

今天我们就来深入剖析 pi-ai 的 Provider 注册机制和延迟加载实现。

## 为什么需要延迟加载？

想象一个场景：你的应用只需要调用 OpenAI，但 pi-ai 却加载了所有 Provider 的依赖...

```
问题：
├── 包体积爆炸
│   ├── AWS SDK (Bedrock): ~5MB
│   ├── Google SDK: ~3MB
│   ├── Anthropic SDK: ~1MB
│   └── ... 其他 17 个 Provider
│
├── 启动时间变慢
│   └── 初始化 20+ 个 Provider
│
├── 浏览器兼容性问题
│   └── Bedrock 需要 Node.js 环境
│
└── 错误传播
    └── 某个 Provider 加载失败导致整个应用崩溃
```

**pi-ai 的解决方案：延迟加载（Lazy Loading）**

```
解决方案：
├── 按需加载：只加载实际使用的 Provider
├── 动态导入：使用 ES Module 动态导入
├── 错误隔离：单个 Provider 失败不影响其他
└── 类型安全：编译时检查，运行时加载
```

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   stream()  │  │ streamSimple│  │  Provider-specific      │ │
│  │             │  │    ()       │  │  stream functions       │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────────┘ │
└─────────┼────────────────┼────────────────────┼─────────────────┘
          │                │                    │
          └────────────────┴────────────────────┘
                           │
                           ▼
          ┌──────────────────────────────────────────────────────────┐
          │              API Registry (注册表)                      │
          │  ┌────────────────────────────────────────────────────┐ │
          │  │  Map<api, { provider, sourceId }>                  │ │
          │  │                                                    │ │
          │  │  - openai-completions → OpenAI Provider           │ │
          │  │  - anthropic-messages → Anthropic Provider        │ │
          │  │  - google-generative-ai → Google Provider         │ │
          │  │  - ...                                             │ │
          │  └────────────────────────────────────────────────────┘ │
          │                                                        │
          │  registerApiProvider()                                 │
          │  getApiProvider()                                      │
          │  clearApiProviders()                                   │
          └──────────────────────────────────────────────────────────┘
                           │
                           ▼
          ┌──────────────────────────────────────────────────────────┐
          │              Provider 层 (延迟加载)                       │
          │  ┌────────────────────────────────────────────────────┐ │
          │  │                                                    │ │
          │  │  延迟加载包装器 (createLazyStream)                  │ │
          │  │  ┌──────────────────────────────────────────────┐ │ │
          │  │  │ 1. 立即返回 EventStream                       │ │ │
          │  │  │ 2. 异步加载 Provider 模块                     │ │ │
          │  │  │ 3. 转发内部流到外部流                         │ │ │
          │  │  │ 4. 错误处理 (不抛出异常)                      │ │ │
          │  │  └──────────────────────────────────────────────┘ │ │
          │  │                                                    │ │
          │  │  实际 Provider 实现 (动态导入)                      │ │
          │  │  ┌──────────────────────────────────────────────┐ │ │
          │  │  │ import("./openai-completions.js")            │ │ │
          │  │  │ import("./anthropic.js")                     │ │ │
          │  │  │ import("./google.js")                        │ │ │
          │  │  │ ...                                          │ │ │
          │  │  └──────────────────────────────────────────────┘ │ │
          │  │                                                    │ │
          │  └────────────────────────────────────────────────────┘ │
          └──────────────────────────────────────────────────────────┘
```

## 核心实现：延迟加载包装器

### createLazyStream - 延迟加载的核心

```typescript
// packages/ai/src/providers/register-builtins.ts

function createLazyStream<TApi extends Api, TOptions extends StreamOptions>(
  loadModule: () => Promise<LazyProviderModule<TApi, TOptions, SimpleStreamOptions>>,
): StreamFunction<TApi, TOptions> {
  return (model, context, options) => {
    // 1. 立即返回一个 EventStream
    // 调用者可以立即开始监听事件
    const outer = new AssistantMessageEventStream();

    // 2. 异步加载 Provider 模块
    loadModule()
      .then((module) => {
        // 3. 调用实际的 Provider 实现
        const inner = module.stream(model, context, options);
        // 4. 将内部流转发到外部流
        forwardStream(outer, inner);
      })
      .catch((error) => {
        // 5. 错误处理：发送 error 事件，而不是抛出异常
        const message = createLazyLoadErrorMessage(model, error);
        outer.push({ type: "error", reason: "error", error: message });
        outer.end(message);
      });

    // 立即返回，不等待加载完成
    return outer;
  };
}
```

**关键设计决策：**

1. **立即返回**：调用者可以立即获得 EventStream，开始监听事件
2. **异步加载**：Provider 模块在后台加载，不阻塞主线程
3. **流转发**：内部 Provider 的事件流被转发到外部流
4. **错误隔离**：加载失败时发送 error 事件，而不是抛出异常

### 模块加载与缓存

```typescript
// packages/ai/src/providers/register-builtins.ts

// 模块加载 Promise 缓存
let openAICompletionsProviderModulePromise:
  | Promise<OpenAICompletionsProviderModule>
  | undefined;

function loadOpenAICompletionsProviderModule() {
  // 使用 ||= 确保只加载一次（单例模式）
  openAICompletionsProviderModulePromise ||= import("./openai-completions.js").then((module) => {
    const provider = module as OpenAICompletionsProviderModule;
    return {
      stream: provider.streamOpenAICompletions,
      streamSimple: provider.streamSimpleOpenAICompletions,
    };
  });
  return openAICompletionsProviderModulePromise;
}

// 导出延迟加载的 Provider 函数
export const streamOpenAICompletions = createLazyStream(
  loadOpenAICompletionsProviderModule
);
```

**为什么使用 Promise 缓存？**

```typescript
// 第一次调用：加载模块
const s1 = streamOpenAICompletions(model, context);
// → 触发 import("./openai-completions.js")

// 第二次调用：复用已加载的模块
const s2 = streamOpenAICompletions(model, context);
// → 复用 openAICompletionsProviderModulePromise
// → 不重复加载
```

### 流转发机制

```typescript
// packages/ai/src/providers/register-builtins.ts

async function forwardStream(
  outer: AssistantMessageEventStream,
  inner: AssistantMessageEventStream,
): Promise<void> {
  try {
    // 遍历内部流的所有事件
    for await (const event of inner) {
      // 转发到外部流
      outer.push(event);

      // 如果是结束事件，设置最终结果
      if (event.type === "done" || event.type === "error") {
        if (event.type === "done") {
          outer.end(event.message);
        } else {
          outer.end(event.error);
        }
        return;
      }
    }
  } catch (error) {
    // 内部流异常时发送 error 事件
    const message = createLazyLoadErrorMessage(
      { id: "unknown", api: "unknown" as Api, provider: "unknown" },
      error,
    );
    outer.push({ type: "error", reason: "error", error: message });
    outer.end(message);
  }
}
```

## Provider 注册流程

### 1. 创建延迟加载的 Provider 函数

```typescript
// packages/ai/src/providers/register-builtins.ts

// OpenAI Completions
const streamOpenAICompletions = createLazyStream(
  loadOpenAICompletionsProviderModule
);
const streamSimpleOpenAICompletions = createLazySimpleStream(
  loadOpenAICompletionsProviderModule
);

// Anthropic Messages
const streamAnthropic = createLazyStream(loadAnthropicProviderModule);
const streamSimpleAnthropic = createLazySimpleStream(loadAnthropicProviderModule);

// ... 其他 Provider
```

### 2. 注册到 API Registry

```typescript
// packages/ai/src/providers/register-builtins.ts

export function registerBuiltins(): void {
  // OpenAI Completions
  registerApiProvider({
    api: "openai-completions",
    stream: streamOpenAICompletions,
    streamSimple: streamSimpleOpenAICompletions,
  });

  // Anthropic Messages
  registerApiProvider({
    api: "anthropic-messages",
    stream: streamAnthropic,
    streamSimple: streamSimpleAnthropic,
  });

  // ... 其他 Provider
}
```

### 3. 运行时类型检查

```typescript
// packages/ai/src/api-registry.ts

function wrapStream<TApi extends Api, TOptions extends StreamOptions>(
  api: TApi,
  stream: StreamFunction<TApi, TOptions>,
): ApiStreamFunction {
  return (model, context, options) => {
    // 运行时检查：确保 model.api 与 provider.api 匹配
    if (model.api !== api) {
      throw new Error(
        `Mismatched api: model has api "${model.api}" but expected "${api}". ` +
        `Did you use a model with a different API?`
      );
    }
    return stream(model as Model<TApi>, context, options as TOptions);
  };
}
```

**双重保护：**

1. **编译时保护**：TypeScript 泛型确保类型匹配
2. **运行时保护**：`wrapStream` 进行运行时检查

## 完整的 Provider 实现示例

以 OpenAI Completions 为例：

```typescript
// packages/ai/src/providers/openai-completions.ts

import OpenAI from "openai";
import type { Stream } from "openai/streaming";

// 1. 导出 Provider 特定的流函数
export function streamOpenAICompletions(
  model: Model<"openai-completions">,
  context: Context,
  options?: OpenAICompletionsOptions,
): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();

  // 异步执行实际的 API 调用
  (async () => {
    try {
      const openai = new OpenAI({
        apiKey: options?.apiKey ?? getEnvApiKey("openai"),
        baseURL: model.baseUrl,
      });

      // 转换消息格式
      const messages = convertContextToOpenAIFormat(context, model);

      // 调用 OpenAI API
      const response = await openai.chat.completions.create({
        model: model.id,
        messages,
        stream: true,
        tools: options?.tools?.map(convertToolToOpenAIFormat),
        ...options,
      });

      // 解析流式响应
      for await (const chunk of response) {
        const event = convertOpenAIChunkToEvent(chunk);
        stream.push(event);
      }

      stream.end();
    } catch (error) {
      stream.push({ type: "error", reason: "error", error });
      stream.end();
    }
  })();

  return stream;
}

// 2. 导出简化接口
export function streamSimpleOpenAICompletions(
  model: Model<"openai-completions">,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  // 将 SimpleStreamOptions 映射到 OpenAICompletionsOptions
  const providerOptions: OpenAICompletionsOptions = {
    ...options,
    reasoningEffort: mapThinkingLevelToOpenAI(options?.reasoning),
  };
  return streamOpenAICompletions(model, context, providerOptions);
}
```

## 错误处理机制

### 延迟加载错误

```typescript
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
    usage: { input: 0, output: 0, total: 0, cost: { input: 0, output: 0, total: 0 } },
    stopReason: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  };
}
```

**为什么用事件而不是抛出异常？**

```typescript
// 方式 1：抛出异常（不好）
try {
  const s = stream(model, context);
  // 如果 Provider 加载失败，这里会抛出异常
} catch (error) {
  // 需要 try-catch
}

// 方式 2：error 事件（pi-ai 的方式）
const s = stream(model, context);
for await (const event of s) {
  if (event.type === "error") {
    // 统一处理错误
    console.error("Error:", event.error.errorMessage);
  }
}
```

## 高级：自定义 Provider

### 1. 创建 Provider 模块

```typescript
// my-provider.ts
import {
  ApiProvider,
  AssistantMessageEventStream,
  Model,
  Context,
  StreamOptions,
} from "@mariozechner/pi-ai";

export function streamMyProvider(
  model: Model<"my-api">,
  context: Context,
  options?: StreamOptions,
): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();

  (async () => {
    // 实现你的 Provider 逻辑
    const response = await fetch(model.baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${options?.apiKey}` },
      body: JSON.stringify({
        model: model.id,
        messages: context.messages,
      }),
    });

    // 解析响应并发送事件
    const data = await response.json();
    stream.push({
      type: "text_delta",
      contentIndex: 0,
      delta: data.text,
      partial: createPartialMessage(model, data.text),
    });

    stream.end();
  })();

  return stream;
}
```

### 2. 注册自定义 Provider

```typescript
import { registerApiProvider } from "@mariozechner/pi-ai";
import { streamMyProvider } from "./my-provider";

registerApiProvider({
  api: "my-api",
  stream: streamMyProvider,
  streamSimple: streamMyProvider, // 如果没有简化接口
});

// 使用自定义 Provider
const customModel: Model<"my-api"> = {
  id: "my-model",
  name: "My Custom Model",
  api: "my-api",
  provider: "my-provider",
  baseUrl: "https://api.my-provider.com/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 4096,
};

const response = await stream(customModel, context);
```

## 性能优化

### 1. 按需加载统计

```typescript
// 场景：只使用 OpenAI
import { streamSimple } from "@mariozechner/pi-ai";

// 只加载 openai-responses.js
// 其他 Provider 的代码不会被加载
const response = await streamSimple(model, context);
```

### 2. 包体积对比

| 加载方式 | 包体积 | 启动时间 |
|---------|--------|---------|
| 全部静态导入 | ~15MB | 慢 |
| 延迟加载（使用 1 个 Provider） | ~2MB | 快 |
| 延迟加载（使用 3 个 Provider） | ~6MB | 中等 |

### 3. 浏览器 vs Node.js

```typescript
// Node.js 环境：支持所有 Provider
// Bedrock 可用

// 浏览器环境：部分 Provider 不可用
// Bedrock 需要 Node.js 特定的 AWS SDK
// OAuth 登录流程不支持
```

## 总结

pi-ai 的 Provider 注册机制设计非常精妙：

1. **延迟加载**：按需加载 Provider，减小包体积
2. **Promise 缓存**：确保每个 Provider 只加载一次
3. **流转发**：内部 Provider 事件流转发到外部流
4. **错误隔离**：加载失败发送 error 事件，不抛出异常
5. **双重检查**：编译时类型检查 + 运行时 API 匹配检查
6. **可扩展**：支持自定义 Provider 注册

这种设计让 pi-ai 在支持 20+ Provider 的同时，保持了良好的性能和用户体验。

---

**下篇预告：**《流式事件处理与 EventStream 实现》 - 深入理解 pi-ai 的事件流机制。
