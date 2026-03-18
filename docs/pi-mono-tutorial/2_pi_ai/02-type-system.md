# pi-ai 类型系统深度解析：从入门到精通

> **难度：进阶** | **预计阅读时间：20 分钟**

TypeScript 的类型系统是一把双刃剑——用得好可以让代码如丝般顺滑，用得不好则会让类型体操变成噩梦。

pi-ai 的类型系统是如何设计的？它如何在保持类型安全的同时，支持 20+ Provider 的差异化 API？今天我们就来深入剖析。

## 类型系统概览

pi-ai 的类型系统分为五个层次：

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. 标识类型层                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    Api      │  │   Provider  │  │      ThinkingLevel      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    2. 模型类型层                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   Model<TApi> - 泛型模型，类型安全的 Provider 选择       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    3. 消息类型层                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Message   │  │   Content   │  │         Tool            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    4. 事件类型层                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │        AssistantMessageEvent - 统一事件协议              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                    5. 配置类型层                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  StreamOptions  │  │ SimpleStreamOpt │  │    Context      │ │
│  │                 │  │     ions        │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 第 1 层：标识类型层

### Api 类型 - 编译时安全

```typescript
// packages/ai/src/types.ts

// 已知的 API 类型（10 种）
export type KnownApi =
  | "openai-completions"
  | "mistral-conversations"
  | "openai-responses"
  | "azure-openai-responses"
  | "openai-codex-responses"
  | "anthropic-messages"
  | "bedrock-converse-stream"
  | "google-generative-ai"
  | "google-gemini-cli"
  | "google-vertex";

// Api 类型允许扩展（用于自定义 Provider）
export type Api = KnownApi | (string & {});
```

**设计要点：**

1. **联合类型枚举**：使用 `KnownApi` 列出所有内置 API
2. **可扩展性**：`Api = KnownApi | (string & {})` 允许用户传入自定义 API 字符串
3. **IDE 支持**：编辑器会提示所有已知 API，同时不阻止自定义值

### Provider 类型

```typescript
export type KnownProvider =
  | "amazon-bedrock"
  | "anthropic"
  | "google"
  | "google-gemini-cli"
  | "google-antigravity"
  | "google-vertex"
  | "openai"
  | "azure-openai-responses"
  | "openai-codex"
  | "github-copilot"
  | "xai"
  | "groq"
  | "cerebras"
  | "openrouter"
  | "vercel-ai-gateway"
  | "zai"
  | "mistral"
  | "minimax"
  | "minimax-cn"
  | "huggingface"
  | "opencode"
  | "opencode-go"
  | "kimi-coding";

export type Provider = KnownProvider | string;
```

### ThinkingLevel - 统一推理级别

```typescript
export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ThinkingBudgets {
  minimal?: number;
  low?: number;
  medium?: number;
  high?: number;
}
```

**为什么需要统一级别？**

不同 Provider 对"推理强度"的命名不同：
- OpenAI: `reasoning_effort: "low" | "medium" | "high"`
- Anthropic: `thinking_budget_tokens: number`
- Google: `thinking: { budgetTokens: number }`

pi-ai 使用 `ThinkingLevel` 统一映射到各 Provider 的具体实现。

## 第 2 层：模型类型层

### Model<TApi> - 类型安全的模型选择

这是 pi-ai 最核心的类型设计之一：

```typescript
export interface Model<TApi extends Api> {
  id: string;                    // 模型 ID，如 "gpt-4o-mini"
  name: string;                  // 显示名称
  api: TApi;                     // API 类型（泛型！）
  provider: Provider;            // Provider 名称
  baseUrl: string;               // API 端点
  reasoning: boolean;            // 是否支持推理
  input: ("text" | "image")[];   // 支持的输入类型
  cost: {
    input: number;               // $/million tokens
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;         // 上下文窗口大小
  maxTokens: number;             // 最大输出 token
  headers?: Record<string, string>;  // 自定义请求头
  compat?: TApi extends "openai-completions"
    ? OpenAICompletionsCompat
    : TApi extends "openai-responses"
      ? OpenAIResponsesCompat
      : never;  // 兼容性设置（条件类型！）
}
```

**泛型的威力：**

```typescript
import { getModel } from "@mariozechner/pi-ai";

// TypeScript 自动推断 api 类型
const openaiModel = getModel("openai", "gpt-4o-mini");
// 类型: Model<"openai-responses">

const anthropicModel = getModel("anthropic", "claude-sonnet-4-20250514");
// 类型: Model<"anthropic-messages">

// 编译时检查：不能混用不兼容的选项
stream(openaiModel, context, {
  reasoningEffort: "high",  // OK: OpenAI 支持
});

stream(anthropicModel, context, {
  thinkingEnabled: true,    // OK: Anthropic 支持
  thinkingBudgetTokens: 8192,
});
```

**条件类型的应用：**

`compat` 字段根据 `TApi` 的类型自动变化：

```typescript
// 当 TApi = "openai-completions"
interface Model<"openai-completions"> {
  compat?: OpenAICompletionsCompat;  // 有兼容性设置
}

// 当 TApi = "anthropic-messages"
interface Model<"anthropic-messages"> {
  compat?: never;  // 没有兼容性设置
}
```

## 第 3 层：消息类型层

### Content 联合类型

```typescript
export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;  // OpenAI responses 的元数据
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;  // OpenAI responses 的 reasoning item ID
  redacted?: boolean;  // 是否被安全过滤器屏蔽
}

export interface ImageContent {
  type: "image";
  data: string;        // base64 编码
  mimeType: string;    // "image/jpeg", "image/png"
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
  thoughtSignature?: string;  // Google-specific
}
```

### Message 联合类型

```typescript
export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;  // Unix timestamp in milliseconds
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: Provider;
  model: string;
  responseId?: string;  // Provider-specific identifier
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}

export interface ToolResultMessage<TDetails = any> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];  // 支持文本和图片
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

**设计要点：**

1. **可辨识联合**：每个类型都有 `type` 或 `role` 字段
2. **精确的时间戳**：使用 `number` 存储 Unix 毫秒时间戳
3. **丰富的元数据**：`AssistantMessage` 包含完整的调用信息

### 类型收窄实战

```typescript
function processMessage(message: Message) {
  // 根据 role 自动收窄类型
  switch (message.role) {
    case "user":
      // message 被收窄为 UserMessage
      if (typeof message.content === "string") {
        console.log("简单文本:", message.content);
      } else {
        // content 是 (TextContent | ImageContent)[]
        for (const block of message.content) {
          if (block.type === "text") {
            console.log("文本块:", block.text);
          } else {
            console.log("图片块:", block.mimeType);
          }
        }
      }
      break;

    case "assistant":
      // message 被收窄为 AssistantMessage
      console.log("模型:", message.model);
      console.log("Token 使用:", message.usage);

      for (const block of message.content) {
        switch (block.type) {
          case "text":
            console.log("回复:", block.text);
            break;
          case "thinking":
            console.log("思考过程:", block.thinking);
            break;
          case "toolCall":
            console.log("工具调用:", block.name, block.arguments);
            break;
        }
      }
      break;

    case "toolResult":
      // message 被收窄为 ToolResultMessage
      console.log("工具结果:", message.toolName);
      if (message.isError) {
        console.error("执行失败!");
      }
      break;
  }
}
```

## 第 4 层：事件类型层

### AssistantMessageEvent - 统一事件协议

这是流式响应的核心协议：

```typescript
export type AssistantMessageEvent =
  // 生命周期事件
  | { type: "start"; partial: AssistantMessage }
  | { type: "done"; reason: "stop" | "length" | "toolUse"; message: AssistantMessage }
  | { type: "error"; reason: "aborted" | "error"; error: AssistantMessage }

  // 文本事件
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }

  // 思考事件
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }

  // 工具调用事件
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage };
```

**为什么每个事件都有 `partial`？**

```typescript
const s = stream(model, context);

for await (const event of s) {
  // event.partial 是当前的 AssistantMessage 快照
  // 可以用来实时更新 UI
  console.log("当前消息状态:", event.partial);

  if (event.type === "text_delta") {
    // 获取当前文本块的索引
    const textBlock = event.partial.content[event.contentIndex];
    if (textBlock?.type === "text") {
      console.log("当前文本:", textBlock.text);
    }
  }
}
```

### 事件流的生命周期

```
start
  ├── text_start
  │     └── text_delta (多次)
  │     └── text_end
  ├── thinking_start (可选)
  │     └── thinking_delta (多次)
  │     └── thinking_end
  ├── toolcall_start (可选)
  │     └── toolcall_delta (多次，JSON 片段)
  │     └── toolcall_end
  └── done / error
```

## 第 5 层：配置类型层

### StreamOptions - 基础配置

```typescript
export interface StreamOptions {
  // 模型参数
  temperature?: number;      // 0-2，默认 1
  maxTokens?: number;        // 最大输出 token

  // 控制
  signal?: AbortSignal;      // 用于取消请求
  apiKey?: string;           // API 密钥

  // 传输配置
  transport?: "sse" | "websocket" | "auto";
  cacheRetention?: "none" | "short" | "long";
  sessionId?: string;        // 会话 ID（用于缓存）

  // 调试
  onPayload?: (payload: unknown, model: Model<Api>) => unknown | undefined | Promise<unknown | undefined>;
  headers?: Record<string, string>;
  maxRetryDelayMs?: number;  // 最大重试延迟
  metadata?: Record<string, unknown>;  // 元数据（如 user_id）
}

// Provider 特定选项（扩展基础选项）
export type ProviderStreamOptions = StreamOptions & Record<string, unknown>;
```

### SimpleStreamOptions - 统一接口

```typescript
export interface SimpleStreamOptions extends StreamOptions {
  reasoning?: ThinkingLevel;           // "minimal" | "low" | "medium" | "high" | "xhigh"
  thinkingBudgets?: ThinkingBudgets;   // 自定义 token 预算
}
```

**统一接口的价值：**

```typescript
// 使用 streamSimple：统一选项
const s = streamSimple(model, context, {
  reasoning: "high",  // 自动映射到各 Provider
});

// 使用 stream：Provider 特定选项
const s = stream(model, context, {
  // OpenAI 特定
  reasoningEffort: "high",
  store: true,
  // Anthropic 特定
  thinkingEnabled: true,
  thinkingBudgetTokens: 8192,
});
```

### Context - 对话上下文

```typescript
export interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}
```

**可序列化设计：**

```typescript
// Context 可以完整序列化
const context: Context = {
  systemPrompt: "你是一个 helpful assistant",
  messages: [
    { role: "user", content: "Hello!", timestamp: Date.now() }
  ],
  tools: [/* ... */]
};

// 保存到本地存储
localStorage.setItem("chat", JSON.stringify(context));

// 恢复并继续
const restored: Context = JSON.parse(localStorage.getItem("chat")!);
const response = await complete(model, restored);
```

## 高级类型技巧

### StreamFunction 泛型约束

```typescript
export type StreamFunction<
  TApi extends Api = Api,
  TOptions extends StreamOptions = StreamOptions
> = (
  model: Model<TApi>,
  context: Context,
  options?: TOptions,
) => AssistantMessageEventStream;
```

**使用示例：**

```typescript
// Anthropic Provider 的类型定义
type AnthropicApi = "anthropic-messages";
interface AnthropicOptions extends StreamOptions {
  thinkingEnabled?: boolean;
  thinkingBudgetTokens?: number;
}

// 类型安全的 Provider 实现
const streamAnthropic: StreamFunction<AnthropicApi, AnthropicOptions> =
  (model, context, options) => {
    // TypeScript 确保 model.api === "anthropic-messages"
    // TypeScript 确保 options 包含 AnthropicOptions
    return new AssistantMessageEventStream();
  };
```

### 兼容性设置的条件类型

```typescript
export interface OpenAICompletionsCompat {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  thinkingFormat?: "openai" | "zai" | "qwen" | "qwen-chat-template";
  openRouterRouting?: OpenRouterRouting;
  vercelGatewayRouting?: VercelGatewayRouting;
  supportsStrictMode?: boolean;
}

// Model 中的条件类型应用
compat?: TApi extends "openai-completions"
  ? OpenAICompletionsCompat
  : TApi extends "openai-responses"
    ? OpenAIResponsesCompat
    : never;
```

## 类型系统的价值

1. **编译时安全**：在代码运行前发现类型错误
2. **IDE 智能提示**：自动补全、类型提示、重构支持
3. **自文档化**：类型定义就是最好的 API 文档
4. **重构安全**：修改类型后，编译器会提示所有受影响的地方
5. **跨 Provider 安全**：防止混用不兼容的选项

## 实战：完整类型安全示例

```typescript
import {
  getModel,
  stream,
  complete,
  Context,
  Tool,
  Type,
} from "@mariozechner/pi-ai";

// 1. 定义工具（类型安全）
const weatherTool: Tool = {
  name: "get_weather",
  description: "获取天气",
  parameters: Type.Object({
    location: Type.String({ description: "城市名称" }),
    units: Type.String({ enum: ["celsius", "fahrenheit"] }),
  }),
};

// 2. 创建上下文
const context: Context = {
  systemPrompt: "你是一个天气助手",
  messages: [
    { role: "user", content: "北京今天天气怎么样？", timestamp: Date.now() }
  ],
  tools: [weatherTool],
};

// 3. 获取模型（类型推断）
const model = getModel("anthropic", "claude-sonnet-4-20250514");
// 类型: Model<"anthropic-messages">

// 4. 流式调用（类型安全）
const s = stream(model, context, {
  thinkingEnabled: true,        // OK: Anthropic 支持
  thinkingBudgetTokens: 4096,   // OK: Anthropic 支持
  // reasoningEffort: "high",   // Error: Anthropic 不支持
});

// 5. 处理事件（类型收窄）
for await (const event of s) {
  switch (event.type) {
    case "text_delta":
      process.stdout.write(event.delta);
      break;
    case "toolcall_end":
      console.log("\n工具调用:", event.toolCall.name);
      break;
    case "done":
      console.log("\n完成原因:", event.reason);
      console.log("Token 使用:", event.message.usage);
      break;
    case "error":
      console.error("错误:", event.error.errorMessage);
      break;
  }
}

// 6. 获取结果
const message = await s.result();
```

## 总结

pi-ai 的类型系统设计非常精妙：

1. **泛型驱动**：`Model<TApi>` 实现类型安全的 Provider 选择
2. **可辨识联合**：`type` 字段实现运行时类型收窄
3. **条件类型**：`compat` 根据 API 类型自动变化
4. **严格约束**：每个字段都有明确的类型，减少运行时错误
5. **可序列化**：`Context` 支持完整 JSON 序列化

这种设计让代码既安全又易用，是 TypeScript 类型系统应用的典范。

---

**下篇预告：**《Provider 注册机制与延迟加载实现》 - 深入理解 pi-ai 的 Provider 管理系统。
