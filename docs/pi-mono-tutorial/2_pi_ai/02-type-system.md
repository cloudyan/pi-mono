# 4. 类型系统深度解析：Message、Content、Event 协议

问下大家，你在写 TypeScript 的时候，有没有遇到过类型定义混乱的问题？

OpenClaw 刚开始接触 pi-ai 源码的时候，就被它的类型系统震撼到了。整个框架的类型定义非常严谨，每个概念都有明确的类型边界，代码读起来特别舒服。

今天我们就来深入剖析 pi-ai 的类型系统设计。

## 类型系统概览

pi-ai 的类型系统分为几个层次：

```
┌─────────────────────────────────────────────────────────────┐
│                    1. 基础类型层                            │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │     Api         │  │    Provider     │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    2. 消息类型层                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │     Message     │  │    Content      │  │    Tool      │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    3. 事件类型层                            │
│              ┌─────────────────────────┐                    │
│              │    AgentMessageEvent    │                    │
│              └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    4. 配置类型层                            │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  StreamOptions  │  │ SimpleStreamOptions               │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## 1. 基础类型层

### Api 类型

```typescript
// packages/ai/src/types.ts

// 支持的 API 类型（11 种）
export type Api =
  | "openai-completions"
  | "openai-responses"
  | "openai-audio"
  | "anthropic-messages"
  | "bedrock-converse-stream"
  | "google-generative-ai"
  | "mistral-chat"
  | "groq-chat"
  | "xai-chat"
  | "azure-openai"
  | "openrouter";

// Provider 名称（20+ 个）
export type KnownProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "groq"
  | "xai"
  | "azure"
  | "bedrock"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | ...;
```

**设计要点：**
- 使用 TypeScript 联合类型（Union Types）枚举所有可能值
- 编译时就能检查 API 名称是否正确
- IDE 提供自动补全

## 2. 消息类型层

### Message 类型

```typescript
// 消息类型的联合类型
export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// 用户消息
export interface UserMessage {
  role: "user";
  content: Content[];
}

// 助手消息
export interface AssistantMessage {
  role: "assistant";
  content: Content[];
}

// 工具结果消息
export interface ToolResultMessage {
  role: "tool";
  content: ToolResult[];
}
```

**设计要点：**
- 使用 `role` 字段区分消息类型
- 每个消息包含 `Content[]` 数组，支持多模态内容

### Content 类型

```typescript
// 内容类型的联合类型
export type Content =
  | TextContent
  | ThinkingContent
  | ImageContent
  | ToolCall
  | ToolResult;

// 文本内容
export interface TextContent {
  type: "text";
  text: string;
}

// 思考/推理内容（Claude 3.7 Sonnet 等支持）
export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  signature?: string; // Anthropic 需要签名验证
}

// 图像内容
export interface ImageContent {
  type: "image";
  source: "base64" | "url";
  data: string; // base64 编码或 URL
  mimeType?: string; // image/png, image/jpeg 等
}

// 工具调用
export interface ToolCall {
  type: "tool_call";
  id: string; // 唯一标识
  name: string; // 工具名称
  arguments: Record<string, unknown>; // 参数
}

// 工具执行结果
export interface ToolResult {
  type: "tool_result";
  toolCallId: string; // 对应的 ToolCall ID
  content: string; // 结果内容
  isError?: boolean; // 是否出错
}
```

**设计要点：**
- 每个 Content 都有 `type` 字段，用于运行时类型收窄
- 使用 TypeScript 的**可辨识联合（Discriminated Unions）**模式

### 类型收窄示例

```typescript
function processContent(content: Content) {
  // TypeScript 会自动收窄类型
  switch (content.type) {
    case "text":
      // content 被收窄为 TextContent
      console.log(content.text);
      break;
    case "image":
      // content 被收窄为 ImageContent
      console.log(content.source, content.data);
      break;
    case "tool_call":
      // content 被收窄为 ToolCall
      console.log(content.name, content.arguments);
      break;
  }
}
```

### Tool 定义类型

```typescript
// 工具定义
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
}

// 工具参数（JSON Schema 子集）
export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty; // 数组元素类型
}
```

## 3. 事件类型层

### AgentMessageEvent 协议

这是 pi-ai 最核心的协议，定义了流式响应的所有事件：

```typescript
export type AgentMessageEvent =
  // 生命周期事件
  | StartEvent
  | DoneEvent
  | ErrorEvent
  
  // 文本事件
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  
  // 思考/推理事件
  | ThinkingStartEvent
  | ThinkingDeltaEvent
  | ThinkingEndEvent
  
  // 工具调用事件
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent;

// 开始事件
export interface StartEvent {
  type: "start";
}

// 完成事件
export interface DoneEvent {
  type: "done";
  usage?: Usage; // Token 使用量
}

// 错误事件
export interface ErrorEvent {
  type: "error";
  error: Error;
}

// 文本开始
export interface TextStartEvent {
  type: "text_start";
}

// 文本增量（流式输出）
export interface TextDeltaEvent {
  type: "text_delta";
  data: string; // 新增的文本片段
}

// 文本结束
export interface TextEndEvent {
  type: "text_end";
}

// 思考开始（Claude 3.7 等支持）
export interface ThinkingStartEvent {
  type: "thinking_start";
}

// 思考增量
export interface ThinkingDeltaEvent {
  type: "thinking_delta";
  data: string;
}

// 思考结束
export interface ThinkingEndEvent {
  type: "thinking_end";
}

// 工具调用开始
export interface ToolCallStartEvent {
  type: "toolcall_start";
  id: string; // ToolCall ID
  name: string; // 工具名称
}

// 工具调用参数增量（JSON 片段）
export interface ToolCallDeltaEvent {
  type: "toolcall_delta";
  id: string;
  arguments: string; // JSON 字符串片段
}

// 工具调用结束
export interface ToolCallEndEvent {
  type: "toolcall_end";
  id: string;
}

// Token 使用量
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

### 事件流的生命周期

```
start
  ├── text_start
  │     └── text_delta (多次)
  │     └── text_end
  ├── thinking_start
  │     └── thinking_delta (多次)
  │     └── thinking_end
  ├── toolcall_start
  │     └── toolcall_delta (多次)
  │     └── toolcall_end
  └── done
```

### 事件处理示例

```typescript
async function handleStream(stream: AsyncGenerator<AgentMessageEvent>) {
  let currentText = "";
  let currentToolCall: { id: string; name: string; args: string } | null = null;
  
  for await (const event of stream) {
    switch (event.type) {
      case "start":
        console.log("Stream started");
        break;
        
      case "text_delta":
        currentText += event.data;
        process.stdout.write(event.data); // 实时输出
        break;
        
      case "text_end":
        console.log("\nText complete:", currentText);
        break;
        
      case "toolcall_start":
        currentToolCall = {
          id: event.id,
          name: event.name,
          args: "",
        };
        console.log(`Tool call: ${event.name}`);
        break;
        
      case "toolcall_delta":
        if (currentToolCall) {
          currentToolCall.args += event.arguments;
        }
        break;
        
      case "toolcall_end":
        if (currentToolCall) {
          const args = JSON.parse(currentToolCall.args);
          console.log("Tool args:", args);
          // 执行工具...
        }
        break;
        
      case "done":
        console.log("Stream done, usage:", event.usage);
        break;
        
      case "error":
        console.error("Stream error:", event.error);
        break;
    }
  }
}
```

## 4. 配置类型层

### StreamOptions

```typescript
export interface StreamOptions {
  // 必需参数
  messages: Message[];
  
  // 模型参数
  temperature?: number; // 0-2，默认 1
  maxTokens?: number; // 最大输出 token 数
  
  // 工具
  tools?: Tool[];
  toolChoice?: "auto" | "none" | { type: "tool"; name: string };
  
  // 认证
  apiKey?: string;
  
  // 传输配置
  baseUrl?: string; // 自定义 API 端点
  headers?: Record<string, string>; // 额外请求头
  
  // 控制
  signal?: AbortSignal; // 用于取消请求
  
  // 回调
  onPayload?: (payload: unknown) => void; // 接收原始响应
  
  // 缓存（OpenAI 等支持）
  cacheRetention?: "auto" | "ephemeral";
  
  // 会话（用于跨 Provider 切换）
  sessionId?: string;
}
```

### SimpleStreamOptions

```typescript
// 简化版选项，支持思考/推理
export interface SimpleStreamOptions extends StreamOptions {
  // 是否启用思考/推理
  reasoning?: boolean;
  
  // 思考预算（Anthropic）
  thinkingBudget?: number;
}
```

## 5. 高级类型技巧

### 条件类型

```typescript
// 根据 API 类型推断选项类型
type ApiOptions<T extends Api> = T extends "anthropic-messages"
  ? AnthropicStreamOptions
  : T extends "openai-completions"
  ? OpenAIStreamOptions
  : StreamOptions;
```

### 映射类型

```typescript
// 将 Provider 名称映射到配置
export type ProviderConfigMap = {
  [K in KnownProvider]: {
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
  };
};
```

### 类型守卫

```typescript
// 类型守卫函数
function isTextContent(content: Content): content is TextContent {
  return content.type === "text";
}

function isToolCall(content: Content): content is ToolCall {
  return content.type === "tool_call";
}

// 使用
function processContents(contents: Content[]) {
  for (const content of contents) {
    if (isTextContent(content)) {
      // TypeScript 知道这是 TextContent
      console.log(content.text);
    } else if (isToolCall(content)) {
      // TypeScript 知道这是 ToolCall
      console.log(content.name);
    }
  }
}
```

## 类型系统的价值

1. **编译时检查** - 在代码运行前发现类型错误
2. **IDE 支持** - 自动补全、类型提示、重构支持
3. **文档即代码** - 类型定义就是最好的 API 文档
4. **重构安全** - 修改类型后，编译器会提示所有受影响的地方

## 总结

pi-ai 的类型系统设计非常优雅：

1. **分层设计** - 基础类型、消息类型、事件类型、配置类型层次分明
2. **可辨识联合** - 使用 `type` 字段实现运行时类型收窄
3. **严格约束** - 每个字段都有明确的类型，减少运行时错误
4. **类型推导** - 充分利用 TypeScript 的类型推导能力

这种设计让代码既安全又易用，是 TypeScript 项目类型设计的典范。

---

**下篇预告：**《Provider 注册机制与懒加载实现》 - 深入理解 pi-ai 的 Provider 管理系统。
