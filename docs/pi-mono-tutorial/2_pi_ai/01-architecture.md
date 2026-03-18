# 3. pi-ai 架构设计：如何统一 20+ LLM 提供商？

问下大家，如果你要同时支持 OpenAI、Anthropic、Google 等多个 LLM 提供商，你会怎么设计代码？

OpenClaw 刚开始想的是写一堆 if-else：

```typescript
if (provider === "openai") {
  // 调用 OpenAI API
} else if (provider === "anthropic") {
  // 调用 Anthropic API
} else if (provider === "google") {
  // 调用 Google API
}
// ... 还有 17 个 else if
```

这种代码维护起来简直是灾难！pi-ai 是怎么优雅地解决这个问题的？今天我们就来深入剖析。

## 问题分析

不同 LLM 提供商的 API 差异主要体现在：

1. **端点不同** - `/v1/chat/completions` vs `/v1/messages` vs `/v1beta/models/...`
2. **请求格式不同** - OpenAI 用 `messages`，Anthropic 用 `messages` 但结构不同
3. **响应格式不同** - 流式响应的数据格式千差万别
4. **认证方式不同** - API Key、AWS Signature、OAuth 等
5. **功能支持不同** - 工具调用、图像输入、思考/推理等

## pi-ai 的解决方案

pi-ai 采用**适配器模式（Adapter Pattern）** + **注册表模式（Registry Pattern）**来解决这个问题：

```mermaid
flowchart TB
    subgraph "统一接口层"
        S[stream\(\)]
        SS[streamSimple\(\)]
    end
    
    subgraph "类型系统层"
        M[Message]
        C[Content]
        E[Event]
    end
    
    subgraph "Provider 层"
        OP[OpenAI Provider]
        AP[Anthropic Provider]
        GP[Google Provider]
        MP[... 其他 17+]
    end
    
    subgraph "原始 API 层"
        OA[OpenAI API]
        AA[Anthropic API]
        GA[Google API]
        MA[... 其他 API]
    end
    
    S --> M
    SS --> M
    M --> C
    C --> E
    E --> OP
    E --> AP
    E --> GP
    E --> MP
    OP --> OA
    AP --> AA
    GP --> GA
    MP --> MA
```

## 核心架构组件

### 1. 统一入口 - stream() 函数

```typescript
// packages/ai/src/stream.ts
export async function* stream(
  api: Api,                    // API 标识，如 "openai/gpt-4o"
  options: StreamOptions        // 统一选项
): AsyncGenerator<AgentMessageEvent> {
  // 1. 解析 API 标识
  const [providerName, modelId] = api.split("/");
  
  // 2. 获取 Provider
  const provider = getApiProvider(providerName);
  
  // 3. 调用 Provider 的 stream 方法
  const stream = await provider.stream(modelId, options);
  
  // 4. 标准化事件流
  for await (const event of stream) {
    yield normalizeEvent(event);
  }
}
```

**关键设计：**
- `Api` 类型使用 `provider/model` 格式，如 `"openai/gpt-4o"`
- 统一的 `StreamOptions` 接口，屏蔽底层差异
- 返回统一的 `AgentMessageEvent` 事件流

### 2. 类型系统 - 统一协议

pi-ai 定义了一套统一的类型系统，所有 Provider 都要遵循：

```typescript
// packages/ai/src/types.ts

// 消息类型
export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface UserMessage {
  role: "user";
  content: Content[];
}

export interface AssistantMessage {
  role: "assistant";
  content: Content[];
}

// 内容类型
export type Content = TextContent | ImageContent | ToolCall | ToolResult;

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source: "base64" | "url";
  data: string;
}

export interface ToolCall {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

**设计要点：**
- 使用 TypeScript 联合类型（Union Types）表达多态
- 每个类型都有 `type` 字段用于类型收窄
- 统一的命名规范（camelCase）

### 3. Provider 接口

每个 Provider 都要实现统一的接口：

```typescript
// packages/ai/src/api-registry.ts
export interface ApiProvider {
  name: string;
  stream: (
    model: string,
    options: StreamOptions
  ) => Promise<AsyncGenerator<AgentMessageEvent>>;
  getModels: () => Promise<Model[]>;
}

// Provider 注册
const providers = new Map<string, ApiProvider>();

export function registerApiProvider(provider: ApiProvider): void {
  providers.set(provider.name, provider);
}

export function getApiProvider(name: string): ApiProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return provider;
}
```

### 4. Provider 实现示例

以 OpenAI Provider 为例：

```typescript
// packages/ai/src/providers/openai.ts
export const openaiProvider: ApiProvider = {
  name: "openai",
  
  async stream(model: string, options: StreamOptions) {
    // 1. 转换消息格式
    const openaiMessages = options.messages.map(convertToOpenAIFormat);
    
    // 2. 调用 OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        stream: true,
        tools: options.tools?.map(convertToolToOpenAIFormat),
      }),
    });
    
    // 3. 解析流式响应并转换为统一事件
    return parseOpenAIStream(response);
  },
  
  async getModels() {
    // 获取可用模型列表
    return [...];
  }
};

// 注册 Provider
registerApiProvider(openaiProvider);
```

## 消息格式转换

不同 Provider 的消息格式差异很大，pi-ai 通过转换函数解决：

### OpenAI 格式转换

```typescript
// OpenAI -> 统一格式
function convertFromOpenAI(message: OpenAI.Message): Message {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content.map(c => {
      if (c.type === "text") {
        return { type: "text", text: c.text };
      }
      if (c.type === "image_url") {
        return { type: "image", source: "url", data: c.image_url.url };
      }
      // ...
    }),
  };
}

// 统一格式 -> OpenAI
function convertToOpenAI(message: Message): OpenAI.Message {
  return {
    role: message.role,
    content: message.content.map(c => {
      if (c.type === "text") {
        return { type: "text", text: c.text };
      }
      // ...
    }),
  };
}
```

### Anthropic 格式转换

```typescript
// Anthropic 的消息格式完全不同
function convertToAnthropic(messages: Message[]): Anthropic.Message[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content.map(c => {
      if (c.type === "text") {
        return { type: "text", text: c.text };
      }
      if (c.type === "image") {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: c.data,
          },
        };
      }
      // ...
    }),
  }));
}
```

## 事件流标准化

流式响应的事件格式也各不相同，pi-ai 统一为 `AgentMessageEvent`：

```typescript
// 统一事件类型
export type AgentMessageEvent =
  | { type: "start" }
  | { type: "text_start" }
  | { type: "text_delta"; data: string }
  | { type: "text_end" }
  | { type: "thinking_start" }
  | { type: "thinking_delta"; data: string }
  | { type: "thinking_end" }
  | { type: "toolcall_start"; id: string; name: string }
  | { type: "toolcall_delta"; id: string; arguments: string }
  | { type: "toolcall_end"; id: string }
  | { type: "done"; usage?: Usage }
  | { type: "error"; error: Error };
```

**OpenAI 流解析：**

```typescript
async function* parseOpenAIStream(response: Response) {
  const reader = response.body?.getReader();
  
  yield { type: "start" };
  yield { type: "text_start" };
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    // OpenAI 的流格式：data: {...}\n\ndata: {...}
    const lines = new TextDecoder().decode(value).split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        const delta = data.choices[0]?.delta;
        
        if (delta.content) {
          yield { type: "text_delta", data: delta.content };
        }
        
        if (delta.tool_calls) {
          // 处理工具调用
          yield { type: "toolcall_start", ... };
        }
      }
    }
  }
  
  yield { type: "text_end" };
  yield { type: "done" };
}
```

## 支持的 Provider 列表

pi-ai 目前支持 20+ Provider：

| Provider | API 前缀 | 特点 |
|---------|---------|------|
| OpenAI | `openai/` | 工具调用、图像、流式 |
| Anthropic | `anthropic/` | 思考/推理、工具调用 |
| Google | `google/` | Gemini 系列 |
| Mistral | `mistral/` | 开源模型 |
| Groq | `groq/` | 高速推理 |
| xAI | `xai/` | Grok 模型 |
| Azure | `azure/` | OpenAI 企业版 |
| AWS Bedrock | `bedrock/` | 企业级部署 |
| OpenRouter | `openrouter/` | 统一接入多提供商 |
| ... | ... | 还有更多 |

## 使用示例

```typescript
import { stream } from "@mariozechner/pi-ai";

// 使用 OpenAI
const openaiStream = stream("openai/gpt-4o", {
  messages: [{ role: "user", content: [{ type: "text", text: "Hello!" }] }],
  apiKey: process.env.OPENAI_API_KEY,
});

// 使用 Anthropic，代码完全一样！
const anthropicStream = stream("anthropic/claude-3-5-sonnet-20241022", {
  messages: [{ role: "user", content: [{ type: "text", text: "Hello!" }] }],
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 遍历事件流
for await (const event of openaiStream) {
  switch (event.type) {
    case "text_delta":
      process.stdout.write(event.data);
      break;
    case "toolcall_start":
      console.log(`Tool call: ${event.name}`);
      break;
    case "done":
      console.log("\nDone!");
      break;
  }
}
```

## 架构优势

1. **统一接口** - 无论底层是哪个 Provider，调用方式都一样
2. **易于扩展** - 添加新 Provider 只需实现 ApiProvider 接口
3. **类型安全** - TypeScript 类型系统保证代码正确性
4. **事件驱动** - 统一的 AgentMessageEvent 协议便于处理流式响应
5. **跨 Provider 切换** - 可以在对话中无缝切换不同 Provider

## 总结

pi-ai 通过**适配器模式** + **注册表模式**，优雅地解决了多 Provider 统一接入的问题：

1. **统一类型系统** - Message、Content、Event 协议
2. **Provider 接口** - 每个 Provider 实现统一的 ApiProvider
3. **消息转换** - 在统一格式和 Provider 格式之间转换
4. **事件标准化** - 将所有 Provider 的流式响应转为统一事件

这种设计让开发者无需关心底层差异，一套代码支持 20+ LLM 提供商。

---

**下篇预告：**《类型系统深度解析：Message、Content、Event 协议》 - 深入理解 pi-ai 的核心类型设计。
