# 消息格式转换：统一协议与 Provider 适配

> **难度：进阶** | **预计阅读时间：20 分钟**

当你同时使用 OpenAI、Anthropic 和 Google 的 API 时，会发现它们的消息格式各不相同：

- **OpenAI**: `messages: [{role: "user", content: "Hello"}]`
- **Anthropic**: `messages: [{role: "user", content: [{type: "text", text: "Hello"}]}]`
- **Google**: `contents: [{role: "user", parts: [{text: "Hello"}]}]`

pi-ai 是如何在内部统一处理这些差异的？今天我们就来深入剖析消息格式转换机制。

## 消息格式差异全景

### 不同 Provider 的消息结构

```typescript
// OpenAI 格式
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are helpful" },
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ]
}

// Anthropic 格式
{
  "model": "claude-3-5-sonnet",
  "system": "You are helpful",
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "Hello" }] },
    { "role": "assistant", "content": [{ "type": "text", "text": "Hi there!" }] }
  ]
}

// Google 格式
{
  "model": "gemini-pro",
  "systemInstruction": { "parts": [{ "text": "You are helpful" }] },
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello" }] },
    { "role": "model", "parts": [{ "text": "Hi there!" }] }
  ]
}
```

### 差异对比表

| 维度 | OpenAI | Anthropic | Google |
|-----|--------|-----------|--------|
| **消息字段** | `messages` | `messages` | `contents` |
| **系统提示** | `messages[0].role="system"` | 顶层 `system` | `systemInstruction` |
| **角色名称** | `system/user/assistant/tool` | `user/assistant` | `user/model` |
| **内容格式** | `string` 或 `array` | 必须是 `array` | `parts` 数组 |
| **图片格式** | `image_url` | `image` + `source` | `inlineData` |
| **工具调用** | `tool_calls` | `tool_use` | `functionCalls` |

## pi-ai 的消息转换架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     统一 Context 格式                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  {                                                        │   │
│  │    systemPrompt?: string,                                 │   │
│  │    messages: [                                            │   │
│  │      { role: "user", content: "..." },                    │   │
│  │      { role: "assistant", content: [...] },               │   │
│  │      { role: "toolResult", toolCallId: "...", ... }       │   │
│  │    ],                                                     │   │
│  │    tools?: [...]                                          │   │
│  │  }                                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│ OpenAI Adapter  │ │ Anthropic    │ │ Google       │
│                 │ │ Adapter      │ │ Adapter      │
│ - messages      │ │ - messages   │ │ - contents   │
│ - system role   │ │ - system     │ │ - systemInst │
│ - tool_calls    │ │ - tool_use   │ │ - functionCa │
└─────────────────┘ └──────────────┘ └──────────────┘
```

## 核心转换函数

### transformMessages - 通用转换入口

```typescript
// packages/ai/src/providers/transform-messages.ts

/**
 * 将统一格式的 Context 转换为 Provider 特定格式
 * @param context - 统一的对话上下文
 * @param targetApi - 目标 API 类型
 * @param model - 模型配置
 * @returns Provider 特定的消息数组
 */
export function transformMessages(
  context: Context,
  targetApi: Api,
  model: Model<Api>,
): unknown[] {
  switch (targetApi) {
    case "openai-completions":
    case "openai-responses":
      return transformToOpenAI(context, model);
    case "anthropic-messages":
      return transformToAnthropic(context, model);
    case "google-generative-ai":
    case "google-vertex":
      return transformToGoogle(context, model);
    case "bedrock-converse-stream":
      return transformToBedrock(context, model);
    // ... 其他 Provider
    default:
      throw new Error(`Unsupported API: ${targetApi}`);
  }
}
```

### OpenAI 格式转换

```typescript
// packages/ai/src/providers/openai-completions.ts

function transformToOpenAI(
  context: Context,
  model: Model<"openai-completions">,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  // 1. 处理系统提示
  if (context.systemPrompt) {
    // 检查模型是否支持 developer 角色（用于推理模型）
    if (model.compat?.supportsDeveloperRole !== false) {
      messages.push({
        role: "developer",
        content: context.systemPrompt,
      });
    } else {
      messages.push({
        role: "system",
        content: context.systemPrompt,
      });
    }
  }

  // 2. 处理消息历史
  for (const message of context.messages) {
    switch (message.role) {
      case "user":
        messages.push(transformUserMessageToOpenAI(message));
        break;

      case "assistant":
        messages.push(transformAssistantMessageToOpenAI(message));
        break;

      case "toolResult":
        messages.push(transformToolResultToOpenAI(message));
        break;
    }
  }

  return messages;
}

// 用户消息转换
function transformUserMessageToOpenAI(
  message: UserMessage,
): OpenAI.Chat.Completions.ChatCompletionUserMessageParam {
  if (typeof message.content === "string") {
    return { role: "user", content: message.content };
  }

  // 多模态内容
  return {
    role: "user",
    content: message.content.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      } else if (block.type === "image") {
        return {
          type: "image_url",
          image_url: {
            url: `data:${block.mimeType};base64,${block.data}`,
          },
        };
      }
      throw new Error(`Unsupported content block: ${block}`);
    }),
  };
}

// 助手消息转换
function transformAssistantMessageToOpenAI(
  message: AssistantMessage,
): OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam {
  const content: string[] = [];
  const tool_calls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      content.push(block.text);
    } else if (block.type === "thinking") {
      // 思考块转换为文本（带标签）
      content.push(`<thinking>${block.thinking}</thinking>`);
    } else if (block.type === "toolCall") {
      tool_calls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.arguments),
        },
      });
    }
  }

  return {
    role: "assistant",
    content: content.join("\n"),
    tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
  };
}

// 工具结果转换
function transformToolResultToOpenAI(
  message: ToolResultMessage,
): OpenAI.Chat.Completions.ChatCompletionToolMessageParam {
  const content = message.content
    .map((block) => {
      if (block.type === "text") {
        return block.text;
      } else if (block.type === "image") {
        // OpenAI 工具结果不支持图片，转换为描述
        return `[Image: ${block.mimeType}]`;
      }
      return "";
    })
    .join("\n");

  return {
    role: "tool",
    tool_call_id: message.toolCallId,
    content: message.isError ? `Error: ${content}` : content,
  };
}
```

### Anthropic 格式转换

```typescript
// packages/ai/src/providers/anthropic.ts

function transformToAnthropic(
  context: Context,
  model: Model<"anthropic-messages">,
): {
  system?: string;
  messages: Anthropic.Messages.MessageParam[];
} {
  const messages: Anthropic.Messages.MessageParam[] = [];

  // 1. 处理消息历史
  for (const message of context.messages) {
    switch (message.role) {
      case "user":
        messages.push(transformUserMessageToAnthropic(message));
        break;

      case "assistant":
        messages.push(transformAssistantMessageToAnthropic(message));
        break;

      case "toolResult":
        messages.push(transformToolResultToAnthropic(message));
        break;
    }
  }

  return {
    system: context.systemPrompt,
    messages,
  };
}

// 用户消息转换
function transformUserMessageToAnthropic(
  message: UserMessage,
): Anthropic.Messages.MessageParam {
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  if (typeof message.content === "string") {
    content.push({ type: "text", text: message.content });
  } else {
    for (const block of message.content) {
      if (block.type === "text") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "image") {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: block.mimeType as Anthropic.Messages.ImageBlockParam.Source["media_type"],
            data: block.data,
          },
        });
      }
    }
  }

  return { role: "user", content };
}

// 助手消息转换
function transformAssistantMessageToAnthropic(
  message: AssistantMessage,
): Anthropic.Messages.MessageParam {
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      // Anthropic 原生支持思考块
      content.push({
        type: "thinking",
        thinking: block.thinking,
        signature: block.thinkingSignature,
      });
    } else if (block.type === "toolCall") {
      content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.arguments,
      });
    }
  }

  return { role: "assistant", content };
}

// 工具结果转换
function transformToolResultToAnthropic(
  message: ToolResultMessage,
): Anthropic.Messages.MessageParam {
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      content.push({
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: block.text,
        is_error: message.isError,
      });
    } else if (block.type === "image") {
      content.push({
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: [{
          type: "image",
          source: {
            type: "base64",
            media_type: block.mimeType as Anthropic.Messages.ImageBlockParam.Source["media_type"],
            data: block.data,
          },
        }],
        is_error: message.isError,
      });
    }
  }

  return { role: "user", content };
}
```

### Google 格式转换

```typescript
// packages/ai/src/providers/google.ts

function transformToGoogle(
  context: Context,
  model: Model<"google-generative-ai">,
): {
  systemInstruction?: { parts: [{ text: string }] };
  contents: Google.GenerativeAI.Content[];
} {
  const contents: Google.GenerativeAI.Content[] = [];

  // 1. 处理消息历史
  for (const message of context.messages) {
    switch (message.role) {
      case "user":
        contents.push(transformUserMessageToGoogle(message));
        break;

      case "assistant":
        contents.push(transformAssistantMessageToGoogle(message));
        break;

      case "toolResult":
        contents.push(transformToolResultToGoogle(message));
        break;
    }
  }

  return {
    systemInstruction: context.systemPrompt
      ? { parts: [{ text: context.systemPrompt }] }
      : undefined,
    contents,
  };
}

// 用户消息转换
function transformUserMessageToGoogle(
  message: UserMessage,
): Google.GenerativeAI.Content {
  const parts: Google.GenerativeAI.Part[] = [];

  if (typeof message.content === "string") {
    parts.push({ text: message.content });
  } else {
    for (const block of message.content) {
      if (block.type === "text") {
        parts.push({ text: block.text });
      } else if (block.type === "image") {
        parts.push({
          inlineData: {
            mimeType: block.mimeType,
            data: block.data,
          },
        });
      }
    }
  }

  return { role: "user", parts };
}

// 助手消息转换
function transformAssistantMessageToGoogle(
  message: AssistantMessage,
): Google.GenerativeAI.Content {
  const parts: Google.GenerativeAI.Part[] = [];
  const functionCalls: Google.GenerativeAI.FunctionCall[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      parts.push({ text: block.text });
    } else if (block.type === "thinking") {
      // Google 不原生支持思考块，转换为文本
      parts.push({ text: `<thinking>${block.thinking}</thinking>` });
    } else if (block.type === "toolCall") {
      functionCalls.push({
        name: block.name,
        args: block.arguments,
      });
    }
  }

  // Google 将工具调用放在单独的字段
  return {
    role: "model",
    parts: [
      ...parts,
      ...functionCalls.map((call) => ({ functionCall: call })),
    ],
  };
}

// 工具结果转换
function transformToolResultToGoogle(
  message: ToolResultMessage,
): Google.GenerativeAI.Content {
  const parts: Google.GenerativeAI.Part[] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      parts.push({
        functionResponse: {
          name: message.toolName,
          response: {
            result: block.text,
            error: message.isError ? block.text : undefined,
          },
        },
      });
    } else if (block.type === "image") {
      parts.push({
        inlineData: {
          mimeType: block.mimeType,
          data: block.data,
        },
      });
    }
  }

  return { role: "user", parts };
}
```

## 跨 Provider 消息转换

当在同一会话中切换 Provider 时，需要将消息从源 Provider 格式转换为目标 Provider 格式：

```typescript
// packages/ai/src/providers/transform-messages.ts

/**
 * 转换消息以适应目标 Provider
 * 用于跨 Provider 切换场景
 */
export function transformMessagesForTargetProvider(
  messages: Message[],
  sourceApi: Api,
  targetApi: Api,
): Message[] {
  if (sourceApi === targetApi) {
    // 相同 API，无需转换
    return messages;
  }

  return messages.map((message) => {
    if (message.role === "assistant") {
      return transformAssistantMessageForTarget(message, targetApi);
    }
    // 用户和工具结果消息通常不需要转换
    return message;
  });
}

function transformAssistantMessageForTarget(
  message: AssistantMessage,
  targetApi: Api,
): AssistantMessage {
  const newContent = message.content.map((block) => {
    if (block.type === "thinking") {
      // 思考块转换：转换为带标签的文本
      return {
        type: "text",
        text: `<thinking>\n${block.thinking}\n</thinking>`,
      };
    }
    return block;
  });

  return {
    ...message,
    api: targetApi,
    content: newContent,
  };
}
```

## 工具定义转换

不同 Provider 的工具定义格式也不同：

```typescript
// packages/ai/src/providers/transform-messages.ts

export function transformToolsToOpenAI(tools: Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function transformToolsToAnthropic(tools: Tool[]): Anthropic.Messages.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

export function transformToolsToGoogle(tools: Tool[]): Google.GenerativeAI.Tool[] {
  return tools.map((tool) => ({
    functionDeclarations: [{
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }],
  }));
}
```

## 响应解析

转换是双向的——发送请求时转换输入，接收响应时解析输出：

```typescript
// packages/ai/src/providers/openai-completions.ts

async function* parseOpenAIStream(
  response: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>,
  model: Model<"openai-completions">,
): AsyncGenerator<AssistantMessageEvent> {
  let contentIndex = 0;
  const contentBlocks: ContentBlock[] = [];

  for await (const chunk of response) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const delta = choice.delta;

    // 文本增量
    if (delta.content) {
      yield {
        type: "text_delta",
        contentIndex,
        delta: delta.content,
        partial: createPartialMessage(model, contentBlocks),
      };
      contentIndex++;
    }

    // 工具调用
    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.id) {
          yield {
            type: "toolcall_start",
            contentIndex,
            partial: createPartialMessage(model, contentBlocks),
          };
        }
        if (toolCall.function?.arguments) {
          yield {
            type: "toolcall_delta",
            contentIndex,
            delta: toolCall.function.arguments,
            partial: createPartialMessage(model, contentBlocks),
          };
        }
      }
    }
  }

  // 完成事件
  yield {
    type: "done",
    reason: "stop",
    message: createFinalMessage(model, contentBlocks),
  };
}
```

## 兼容性处理

### OpenAI 兼容性设置

```typescript
// packages/ai/src/providers/openai-completions.ts

interface OpenAICompletionsCompat {
  // 是否支持 developer 角色（用于推理模型）
  supportsDeveloperRole?: boolean;

  // 是否支持 reasoning_effort 参数
  supportsReasoningEffort?: boolean;

  // 是否支持 store 参数
  supportsStore?: boolean;

  // max_tokens 字段名
  maxTokensField?: "max_completion_tokens" | "max_tokens";

  // 工具结果是否需要 name 字段
  requiresToolResultName?: boolean;

  // 思考块格式
  thinkingFormat?: "openai" | "zai" | "qwen";
}

function applyCompatibilitySettings(
  messages: unknown[],
  compat: OpenAICompletionsCompat,
): unknown[] {
  if (compat.supportsDeveloperRole === false) {
    // 将 developer 角色转换为 system
    for (const msg of messages) {
      if (msg.role === "developer") {
        msg.role = "system";
      }
    }
  }

  return messages;
}
```

## 最佳实践

### 1. 使用统一 Context 格式

```typescript
// 推荐：使用统一的 Context 格式
const context: Context = {
  systemPrompt: "You are helpful",
  messages: [
    { role: "user", content: "Hello", timestamp: Date.now() },
  ],
};

// pi-ai 会自动转换为目标 Provider 格式
const response = await complete(model, context);
```

### 2. 处理跨 Provider 切换

```typescript
// 跨 Provider 切换时，消息会自动转换
const claude = getModel("anthropic", "claude-sonnet-4");
const gpt = getModel("openai", "gpt-4o");

const context: Context = { messages: [] };

// 使用 Claude
const r1 = await complete(claude, context);
context.messages.push(r1);

// 切换到 GPT（思考块会自动转换）
const r2 = await complete(gpt, context);
```

### 3. 自定义转换逻辑

```typescript
// 如果需要自定义转换，可以扩展 transformMessages
import { transformMessages } from "@mariozechner/pi-ai";

function customTransformMessages(context: Context, targetApi: Api) {
  const messages = transformMessages(context, targetApi, model);

  // 添加自定义处理
  if (targetApi === "openai-completions") {
    // 自定义 OpenAI 格式处理
  }

  return messages;
}
```

## 总结

pi-ai 的消息转换机制设计精妙：

1. **统一 Context 格式**：内部使用统一的 `Context` 格式
2. **Provider 适配器**：每个 Provider 有自己的转换函数
3. **双向转换**：请求时转换输入，响应时解析输出
4. **跨 Provider 支持**：自动处理不同 Provider 间的消息转换
5. **兼容性处理**：通过 `compat` 设置处理 Provider 差异

这种设计让开发者无需关心底层差异，一套代码支持 20+ LLM Provider。

---

**下篇预告：**《错误处理与终止机制》 - 深入理解 pi-ai 的错误处理设计。
