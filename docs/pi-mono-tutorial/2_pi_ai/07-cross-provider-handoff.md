# 跨 Provider 切换实现

> **难度：进阶** | **预计阅读时间：15 分钟**

想象一下这个场景：你正在用 Claude 进行深度推理，突然需要切换到 GPT-4o 来生成代码，然后再切回 Claude 继续分析。传统的做法是分别调用不同 API，手动处理消息格式转换，非常麻烦。

pi-ai 的跨 Provider 切换功能让这一切变得简单——你可以在同一会话中无缝切换不同 LLM，就像切换不同模型一样自然。

## 为什么需要跨 Provider 切换？

### 实际应用场景

```
场景 1：多模型协作
├── Claude (深度推理)
│   └── 分析复杂问题
├── GPT-4o (代码生成)
│   └── 生成解决方案代码
└── Gemini (多模态)
    └── 分析代码执行结果图表

场景 2：成本优化
├── GPT-4o-mini (快速响应)
│   └── 处理简单查询
└── Claude (复杂推理)
    └── 处理需要深度思考的问题

场景 3：故障转移
├── OpenAI (主模型)
│   └── 正常服务
└── Anthropic (备用)
    └── OpenAI 故障时自动切换
```

### 技术挑战

跨 Provider 切换面临的主要挑战：

1. **消息格式差异**：不同 Provider 的消息格式不同
2. **思考块处理**：某些 Provider 支持思考块，某些不支持
3. **工具调用兼容性**：工具调用格式在不同 Provider 间可能不同
4. **上下文保留**：需要保留完整的对话历史

## pi-ai 的解决方案

### 核心设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     统一 Context 格式                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Context {                                               │   │
│  │    systemPrompt?: string,                                │   │
│  │    messages: [                                           │   │
│  │      { role: "user", content: "..." },                   │   │
│  │      { role: "assistant", content: [...], api: "..." },  │   │
│  │      { role: "toolResult", ... }                         │   │
│  │    ]                                                     │   │
│  │  }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│ Claude (Anthropic)              │ │ GPT-4o       │ │ Gemini       │
│                                 │ │ (OpenAI)     │ │ (Google)     │
│ - 原生支持思考块                │ │ - 思考块转   │ │ - 思考块转   │
│ - tool_use 格式                 │ │   换为文本   │ │   换为文本   │
│ - 消息原样传递                  │ │ - 消息转换   │ │ - 消息转换   │
└─────────────────┘ └──────────────┘ └──────────────┘
```

### 切换规则

```typescript
// packages/ai/src/providers/transform-messages.ts

/**
 * 跨 Provider 消息转换规则：
 *
 * 1. 用户消息：原样传递
 * 2. 工具结果消息：原样传递
 * 3. 助手消息（相同 API）：原样传递
 * 4. 助手消息（不同 API）：转换思考块为文本
 */
export function transformMessagesForTargetProvider(
  messages: Message[],
  sourceApi: Api,
  targetApi: Api,
): Message[] {
  if (sourceApi === targetApi) {
    return messages;  // 相同 API，无需转换
  }

  return messages.map((message) => {
    if (message.role === "assistant") {
      return transformAssistantMessage(message, targetApi);
    }
    return message;
  });
}

function transformAssistantMessage(
  message: AssistantMessage,
  targetApi: Api,
): AssistantMessage {
  // 如果目标 API 与消息来源相同，无需转换
  if (message.api === targetApi) {
    return message;
  }

  const newContent = message.content.map((block) => {
    if (block.type === "thinking") {
      // 思考块转换为带标签的文本
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

## 使用示例

### 基础切换

```typescript
import { getModel, complete, Context } from "@mariozechner/pi-ai";

const context: Context = {
  messages: []
};

// 第 1 轮：使用 Claude 进行深度推理
const claude = getModel("anthropic", "claude-sonnet-4-20250514");
context.messages.push({
  role: "user",
  content: "分析这个算法的复杂度"
});

const claudeResponse = await complete(claude, context, {
  thinkingEnabled: true
});
context.messages.push(claudeResponse);

// Claude 的回复包含思考块
console.log("Claude 的思考:", claudeResponse.content
  .filter(b => b.type === "thinking")
  .map(b => b.thinking)
);

// 第 2 轮：切换到 GPT-4o 生成代码
const gpt4o = getModel("openai", "gpt-4o");
context.messages.push({
  role: "user",
  content: "根据上述分析，用 Python 实现这个算法"
});

const gptResponse = await complete(gpt4o, context);
context.messages.push(gptResponse);

// GPT-4o 会看到 Claude 的思考作为 <thinking> 标签文本
console.log("GPT-4o 的代码:", gptResponse.content
  .filter(b => b.type === "text")
  .map(b => b.text)
);

// 第 3 轮：切回 Claude 继续分析
context.messages.push({
  role: "user",
  content: "优化这段代码的性能"
});

const claudeResponse2 = await complete(claude, context);
// Claude 可以看到 GPT-4o 生成的代码
```

### 带工具调用的切换

```typescript
import { getModel, complete, Context, Tool, Type } from "@mariozechner/pi-ai";

// 定义工具
const executeCodeTool: Tool = {
  name: "execute_code",
  description: "执行 Python 代码",
  parameters: Type.Object({
    code: Type.String({ description: "Python 代码" })
  })
};

const context: Context = {
  messages: [{
    role: "user",
    content: "写一个计算斐波那契数列的函数并执行"
  }],
  tools: [executeCodeTool]
};

// 第 1 轮：GPT-4o 生成代码
const gpt4o = getModel("openai", "gpt-4o");
const gptResponse = await complete(gpt4o, context);
context.messages.push(gptResponse);

// 提取工具调用
const toolCall = gptResponse.content
  .find(b => b.type === "toolCall");

if (toolCall) {
  // 执行代码
  const result = executePythonCode(toolCall.arguments.code);

  // 添加工具结果
  context.messages.push({
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: [{ type: "text", text: result }],
    isError: false,
    timestamp: Date.now()
  });
}

// 第 2 轮：切换到 Claude 分析执行结果
const claude = getModel("anthropic", "claude-sonnet-4-20250514");
context.messages.push({
  role: "user",
  content: "分析执行结果，找出性能瓶颈"
});

const claudeResponse = await complete(claude, context, {
  thinkingEnabled: true
});
// Claude 可以看到完整的代码和执行结果
```

### 带图片的切换

```typescript
import { readFileSync } from "fs";

const context: Context = {
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "分析这张图表" },
      {
        type: "image",
        data: readFileSync("chart.png").toString("base64"),
        mimeType: "image/png"
      }
    ]
  }]
};

// 第 1 轮：GPT-4o-Vision 分析图片
const gpt4o = getModel("openai", "gpt-4o");
const gptResponse = await complete(gpt4o, context);
context.messages.push(gptResponse);

// 第 2 轮：切换到 Claude 进行深度分析
const claude = getModel("anthropic", "claude-sonnet-4-20250514");
context.messages.push({
  role: "user",
  content: "根据图表趋势，预测下季度数据"
});

const claudeResponse = await complete(claude, context, {
  thinkingEnabled: true
});
// Claude 可以看到 GPT-4o 的图片分析结果
```

## 内部实现

### Context 序列化

跨 Provider 切换的关键在于 `Context` 的可序列化：

```typescript
// Context 可以完全序列化为 JSON
const serialized = JSON.stringify(context);

// 保存到存储
localStorage.setItem("conversation", serialized);

// 从存储恢复
const restored: Context = JSON.parse(localStorage.getItem("conversation")!);

// 用任何模型继续
const newModel = getModel("anthropic", "claude-sonnet-4");
const response = await complete(newModel, restored);
```

### 消息转换流程

```typescript
// packages/ai/src/stream.ts

export async function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: ProviderStreamOptions,
): AssistantMessageEventStream {
  // 1. 获取 Provider
  const provider = getApiProvider(model.api);
  if (!provider) {
    throw new Error(`Unknown API: ${model.api}`);
  }

  // 2. 转换消息以适应目标 Provider
  const transformedContext = {
    ...context,
    messages: transformMessagesForTargetProvider(
      context.messages,
      context.messages[context.messages.length - 1]?.api || model.api,
      model.api
    ),
  };

  // 3. 调用 Provider
  return provider.stream(model, transformedContext, options);
}
```

### 思考块转换细节

```typescript
// 源：Claude (Anthropic)
{
  role: "assistant",
  content: [
    {
      type: "thinking",
      thinking: "让我分析这个问题...",
      thinkingSignature: "..."
    },
    {
      type: "text",
      text: "答案是 42"
    }
  ],
  api: "anthropic-messages"
}

// 转换后：发送到 GPT-4o (OpenAI)
{
  role: "assistant",
  content: [
    {
      type: "text",
      text: "<thinking>\n让我分析这个问题...\n</thinking>\n答案是 42"
    }
  ],
  api: "openai-responses"
}
```

## 高级用法

### 自动故障转移

```typescript
async function completeWithFallback(
  context: Context,
  primaryModel: Model<Api>,
  fallbackModels: Model<Api>[],
): Promise<AssistantMessage> {
  try {
    return await complete(primaryModel, context);
  } catch (error) {
    console.warn("主模型失败:", error);

    for (const fallbackModel of fallbackModels) {
      try {
        console.log(`尝试备用模型: ${fallbackModel.id}`);
        return await complete(fallbackModel, context);
      } catch (fallbackError) {
        console.warn("备用模型也失败:", fallbackError);
      }
    }

    throw new Error("所有模型都失败");
  }
}

// 使用
const response = await completeWithFallback(
  context,
  getModel("openai", "gpt-4o"),
  [
    getModel("anthropic", "claude-sonnet-4-20250514"),
    getModel("google", "gemini-2.5-flash"),
  ]
);
```

### 智能模型选择

```typescript
async function completeWithSmartRouting(
  context: Context,
  query: string,
): Promise<AssistantMessage> {
  // 根据查询内容选择最合适的模型
  const model = selectModel(query);

  return await complete(model, context);
}

function selectModel(query: string): Model<Api> {
  // 代码相关 → GPT-4o
  if (query.includes("代码") || query.includes("programming")) {
    return getModel("openai", "gpt-4o");
  }

  // 深度推理 → Claude
  if (query.includes("分析") || query.includes("推理")) {
    return getModel("anthropic", "claude-sonnet-4-20250514");
  }

  // 多模态 → Gemini
  if (query.includes("图片") || query.includes("图表")) {
    return getModel("google", "gemini-2.5-flash");
  }

  // 默认 → GPT-4o-mini
  return getModel("openai", "gpt-4o-mini");
}
```

### 成本优化策略

```typescript
async function completeWithCostOptimization(
  context: Context,
  complexity: "low" | "medium" | "high",
): Promise<AssistantMessage> {
  // 根据复杂度选择模型
  const model = getModelForComplexity(complexity);

  const response = await complete(model, context);

  console.log(`使用模型: ${model.id}`);
  console.log(`成本: $${response.usage.cost.total.toFixed(4)}`);

  return response;
}

function getModelForComplexity(
  complexity: "low" | "medium" | "high"
): Model<Api> {
  switch (complexity) {
    case "low":
      // 简单查询用便宜模型
      return getModel("openai", "gpt-4o-mini");
    case "medium":
      // 中等复杂度用平衡模型
      return getModel("anthropic", "claude-3-5-haiku");
    case "high":
      // 复杂查询用最强模型
      return getModel("openai", "gpt-4o");
  }
}
```

## 最佳实践

### 1. 保留消息历史

```typescript
// 推荐：保留完整的消息历史
const context: Context = {
  messages: []
};

// 添加用户消息
context.messages.push({
  role: "user",
  content: "问题 1",
  timestamp: Date.now()
});

// 获取回复并添加
const response1 = await complete(model1, context);
context.messages.push(response1);

// 切换模型时，历史会自动保留
const response2 = await complete(model2, context);
```

### 2. 处理思考块

```typescript
// 如果需要在不同 Provider 间保留思考过程
const response = await complete(claude, context, {
  thinkingEnabled: true
});

// 思考块会自动转换为文本发送给其他 Provider
context.messages.push(response);

// GPT-4o 会看到 <thinking>...</thinking> 标签
const gptResponse = await complete(gpt4o, context);
```

### 3. 验证模型能力

```typescript
// 切换前验证模型能力
const model = getModel("openai", "gpt-4o");

// 检查是否支持图片
if (model.input.includes("image")) {
  // 可以发送图片
}

// 检查是否支持推理
if (model.reasoning) {
  // 可以启用推理
}
```

### 4. 优雅降级

```typescript
async function completeWithGracefulDegradation(
  context: Context,
  preferredModel: Model<Api>,
): Promise<AssistantMessage> {
  try {
    return await complete(preferredModel, context);
  } catch (error) {
    // 如果首选模型失败，降级到更便宜的模型
    const fallbackModel = getModel("openai", "gpt-4o-mini");
    console.warn(`降级到 ${fallbackModel.id}`);
    return await complete(fallbackModel, context);
  }
}
```

## 限制与注意事项

### 1. 思考块转换

```typescript
// 注意：思考块在不同 Provider 间会转换为文本
// Claude → GPT-4o：思考块变成 <thinking>...</thinking>
// 这意味着 GPT-4o 无法区分"思考"和"回复"

// 如果需要保留思考结构，建议不要频繁切换
```

### 2. 工具调用兼容性

```typescript
// 不同 Provider 的工具调用格式不同
// 但 pi-ai 会自动转换，所以通常无需担心

// 注意：某些 Provider 可能不支持某些工具特性
// 例如：Google 不支持工具调用流式传输
```

### 3. Token 限制

```typescript
// 切换 Provider 时，注意上下文长度限制
const model1 = getModel("openai", "gpt-4o");  // 128k context
const model2 = getModel("anthropic", "claude-haiku");  // 200k context

// 如果上下文很长，确保目标模型支持
if (estimateTokens(context) > model2.contextWindow) {
  console.warn("上下文可能超出目标模型限制");
}
```

## 总结

pi-ai 的跨 Provider 切换功能设计精妙：

1. **统一 Context**：使用统一的 `Context` 格式，支持完整序列化
2. **自动转换**：消息自动转换为目标 Provider 格式
3. **思考块处理**：思考块在不同 Provider 间智能转换
4. **工具兼容**：工具调用格式自动适配
5. **灵活应用**：支持故障转移、成本优化、智能路由等场景

这种设计让多模型协作变得简单直观，开发者可以灵活组合不同 Provider 的优势。

---

**下篇预告：**《高级使用模式与最佳实践》 - pi-ai 的高级技巧和实战建议。
