# pi-ai 完整 API 参考

> **难度：参考** | **建议：按需查阅**

本文档是 pi-ai 的完整 API 参考，翻译自 `@mariozechner/pi-ai` 包的 README.md。建议配合前面的教程章节使用。

## 目录

- [pi-ai 完整 API 参考](#pi-ai-完整-api-参考)
  - [目录](#目录)
  - [支持的 Provider](#支持的-provider)
  - [快速开始](#快速开始)
    - [安装](#安装)
    - [基础使用](#基础使用)
  - [工具（Tools）](#工具tools)
    - [定义工具](#定义工具)
    - [处理工具调用](#处理工具调用)
    - [流式工具调用与部分 JSON](#流式工具调用与部分-json)
    - [验证工具参数](#验证工具参数)
    - [完整事件参考](#完整事件参考)
  - [图片输入](#图片输入)
  - [思考/推理](#思考推理)
    - [统一接口 (streamSimple/completeSimple)](#统一接口-streamsimplecompletesimple)
    - [Provider 特定选项 (stream/complete)](#provider-特定选项-streamcomplete)
    - [流式思考内容](#流式思考内容)
  - [停止原因](#停止原因)
  - [错误处理](#错误处理)
    - [中止请求](#中止请求)
    - [中止后继续](#中止后继续)
    - [调试 Provider Payload](#调试-provider-payload)
  - [API、模型和 Provider](#api模型和-provider)
    - [Provider 和模型](#provider-和模型)
    - [查询 Provider 和模型](#查询-provider-和模型)
    - [自定义模型](#自定义模型)
    - [OpenAI 兼容性设置](#openai-兼容性设置)
    - [类型安全](#类型安全)
  - [跨 Provider 切换](#跨-provider-切换)
    - [工作原理](#工作原理)
    - [示例：多 Provider 对话](#示例多-provider-对话)
    - [Provider 兼容性](#provider-兼容性)
  - [上下文序列化](#上下文序列化)
  - [浏览器使用](#浏览器使用)
    - [浏览器兼容性说明](#浏览器兼容性说明)
    - [环境变量（仅 Node.js）](#环境变量仅-nodejs)
      - [Antigravity 版本覆盖](#antigravity-版本覆盖)
      - [缓存保留](#缓存保留)
    - [检查环境变量](#检查环境变量)
  - [OAuth Provider](#oauth-provider)
    - [Vertex AI](#vertex-ai)
    - [CLI 登录](#cli-登录)
    - [程序化 OAuth](#程序化-oauth)
    - [登录流程示例](#登录流程示例)
    - [使用 OAuth Token](#使用-oauth-token)
    - [Provider 说明](#provider-说明)


## 支持的 Provider

pi-ai 支持以下 LLM Provider：

| Provider | API 类型 | 特点 |
|---------|---------|------|
| **OpenAI** | `openai-responses` | GPT-4o, GPT-5 系列 |
| **Azure OpenAI** | `azure-openai-responses` | 企业级 OpenAI |
| **OpenAI Codex** | `openai-codex-responses` | ChatGPT Plus/Pro |
| **Anthropic** | `anthropic-messages` | Claude 系列 |
| **Google** | `google-generative-ai` | Gemini API |
| **Vertex AI** | `google-vertex` | Google Cloud |
| **Gemini CLI** | `google-gemini-cli` | Cloud Code Assist |
| **Mistral** | `mistral-conversations` | 开源模型 |
| **Groq** | `openai-completions` | 高速推理 |
| **Cerebras** | `openai-completions` | 高性能推理 |
| **xAI** | `openai-completions` | Grok 模型 |
| **OpenRouter** | `openai-completions` | 统一接入多提供商 |
| **Vercel AI Gateway** | `openai-completions` | Vercel 网关 |
| **MiniMax** | `openai-completions` | 中文模型 |
| **GitHub Copilot** | `openai-completions` | Copilot 模型 |
| **Amazon Bedrock** | `bedrock-converse-stream` | AWS 企业级 |
| **OpenCode** | `openai-completions` | OpenCode 模型 |
| **Kimi For Coding** | `anthropic-messages` | Moonshot AI |
| **任何 OpenAI 兼容 API** | `openai-completions` | Ollama, vLLM, LM Studio 等 |

## 快速开始

### 安装

```bash
npm install @mariozechner/pi-ai
```

### 基础使用

```typescript
import { Type, getModel, stream, complete, Context, Tool } from '@mariozechner/pi-ai';

// 1. 获取模型（带类型推断和 IDE 自动补全）
const model = getModel('openai', 'gpt-4o-mini');

// 2. 定义工具（使用 TypeBox 实现类型安全）
const tools: Tool[] = [{
  name: 'get_time',
  description: '获取当前时间',
  parameters: Type.Object({
    timezone: Type.Optional(Type.String({ description: '时区（如 Asia/Shanghai）' }))
  })
}];

// 3. 创建对话上下文（可序列化，可在模型间传递）
const context: Context = {
  systemPrompt: '你是一个 helpful 助手。',
  messages: [{ role: 'user', content: '现在几点了？' }],
  tools
};

// 4. 流式调用
const s = stream(model, context);

for await (const event of s) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'toolcall_end':
      console.log(`\n调用工具: ${event.toolCall.name}`);
      break;
    case 'done':
      console.log('\n完成');
      break;
  }
}

// 5. 获取最终结果并添加到上下文
const finalMessage = await s.result();
context.messages.push(finalMessage);

// 6. 处理工具调用
const toolCalls = finalMessage.content.filter(b => b.type === 'toolCall');
for (const call of toolCalls) {
  const result = call.name === 'get_time'
    ? new Date().toLocaleString('zh-CN', {
        timeZone: call.arguments.timezone || 'Asia/Shanghai',
        dateStyle: 'full',
        timeStyle: 'long'
      })
    : '未知工具';

  context.messages.push({
    role: 'toolResult',
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: 'text', text: result }],
    isError: false,
    timestamp: Date.now()
  });
}

// 7. 如果有工具调用，继续对话
if (toolCalls.length > 0) {
  const continuation = await complete(model, context);
  console.log('工具执行后:', continuation.content);
}

// 8. 查看使用统计
console.log(`Token: ${finalMessage.usage.input} 输入, ${finalMessage.usage.output} 输出`);
console.log(`费用: $${finalMessage.usage.cost.total.toFixed(4)}`);
```

## 工具（Tools）

### 定义工具

使用 TypeBox 定义工具参数，实现类型安全和自动验证：

```typescript
import { Type, Tool, StringEnum } from '@mariozechner/pi-ai';

// 天气工具
const weatherTool: Tool = {
  name: 'get_weather',
  description: '获取指定位置的天气',
  parameters: Type.Object({
    location: Type.String({ description: '城市名称或坐标' }),
    units: StringEnum(['celsius', 'fahrenheit'], { default: 'celsius' })
  })
};

// 会议预订工具
const bookMeetingTool: Tool = {
  name: 'book_meeting',
  description: '预订会议',
  parameters: Type.Object({
    title: Type.String({ minLength: 1 }),
    startTime: Type.String({ format: 'date-time' }),
    endTime: Type.String({ format: 'date-time' }),
    attendees: Type.Array(Type.String({ format: 'email' }), { minItems: 1 })
  })
};
```

**注意**：为了 Google API 兼容性，请使用 `StringEnum` 辅助函数代替 `Type.Enum`。`Type.Enum` 生成的 `anyOf/const` 模式不被 Google 支持。

### 处理工具调用

工具结果使用内容块，可以包含文本和图片：

```typescript
import { readFileSync } from 'fs';

const context: Context = {
  messages: [{ role: 'user', content: '伦敦天气怎么样？' }],
  tools: [weatherTool]
};

const response = await complete(model, context);

// 检查响应中的工具调用
for (const block of response.content) {
  if (block.type === 'toolCall') {
    // 使用参数执行你的工具
    const result = await executeWeatherApi(block.arguments);

    // 添加文本内容的工具结果
    context.messages.push({
      role: 'toolResult',
      toolCallId: block.id,
      toolName: block.name,
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
      timestamp: Date.now()
    });
  }
}

// 工具结果也可以包含图片（适用于视觉模型）
const imageBuffer = readFileSync('chart.png');
context.messages.push({
  role: 'toolResult',
  toolCallId: 'tool_xyz',
  toolName: 'generate_chart',
  content: [
    { type: 'text', text: '生成的温度趋势图' },
    { type: 'image', data: imageBuffer.toString('base64'), mimeType: 'image/png' }
  ],
  isError: false,
  timestamp: Date.now()
});
```

### 流式工具调用与部分 JSON

流式传输期间，工具调用参数会逐步解析。这允许在完整参数可用前进行实时 UI 更新：

```typescript
const s = stream(model, context);

for await (const event of s) {
  if (event.type === 'toolcall_delta') {
    const toolCall = event.partial.content[event.contentIndex];

    // toolCall.arguments 在流式传输期间包含部分解析的 JSON
    // 这允许渐进式 UI 更新
    if (toolCall.type === 'toolCall' && toolCall.arguments) {
      // 注意：参数可能不完整，始终检查存在性
      if (toolCall.name === 'write_file' && toolCall.arguments.path) {
        console.log(`写入到: ${toolCall.arguments.path}`);

        // 内容可能是部分的或缺失
        if (toolCall.arguments.content) {
          console.log(`内容预览: ${toolCall.arguments.content.substring(0, 100)}...`);
        }
      }
    }
  }

  if (event.type === 'toolcall_end') {
    // 这里 toolCall.arguments 是完整的（但尚未验证）
    const toolCall = event.toolCall;
    console.log(`工具完成: ${toolCall.name}`, toolCall.arguments);
  }
}
```

**关于部分工具参数的重要说明：**
- `toolcall_delta` 事件期间，`arguments` 包含部分 JSON 的最佳解析结果
- 字段可能缺失或不完整 - 使用前始终检查存在性
- 字符串值可能在中途截断
- 数组可能不完整
- 嵌套对象可能部分填充
- 最小情况下，`arguments` 将是空对象 `{}`，不会是 `undefined`
- Google provider 不支持函数调用流式传输。你会收到一个包含完整参数的 `toolcall_delta` 事件。

### 验证工具参数

使用 `agentLoop` 时，工具参数会在执行前自动根据 TypeBox schema 验证。如果验证失败，错误会作为工具结果返回给模型，允许它重试。

使用 `stream()` 或 `complete()` 实现自己的工具执行循环时，使用 `validateToolCall` 在执行前验证参数：

```typescript
import { stream, validateToolCall, Tool } from '@mariozechner/pi-ai';

const tools: Tool[] = [weatherTool, calculatorTool];
const s = stream(model, { messages, tools });

for await (const event of s) {
  if (event.type === 'toolcall_end') {
    const toolCall = event.toolCall;

    try {
      // 根据工具的 schema 验证参数（无效参数会抛出）
      const validatedArgs = validateToolCall(tools, toolCall);
      const result = await executeMyTool(toolCall.name, validatedArgs);
      // ... 添加工具结果到上下文
    } catch (error) {
      // 验证失败 - 返回错误作为工具结果，让模型重试
      context.messages.push({
        role: 'toolResult',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: 'text', text: error.message }],
        isError: true,
        timestamp: Date.now()
      });
    }
  }
}
```

### 完整事件参考

助手消息生成期间发出的所有流式事件：

| 事件类型 | 描述 | 关键属性 |
|---------|------|---------|
| `start` | 流开始 | `partial`: 初始助手消息结构 |
| `text_start` | 文本块开始 | `contentIndex`: 内容数组中的位置 |
| `text_delta` | 收到文本块 | `delta`: 新文本, `contentIndex`: 位置 |
| `text_end` | 文本块完成 | `content`: 完整文本, `contentIndex`: 位置 |
| `thinking_start` | 思考块开始 | `contentIndex`: 内容数组中的位置 |
| `thinking_delta` | 收到思考块 | `delta`: 新文本, `contentIndex`: 位置 |
| `thinking_end` | 思考块完成 | `content`: 完整思考, `contentIndex`: 位置 |
| `toolcall_start` | 工具调用开始 | `contentIndex`: 内容数组中的位置 |
| `toolcall_delta` | 工具参数流式传输 | `delta`: JSON 块, `partial.content[contentIndex].arguments`: 部分解析的参数 |
| `toolcall_end` | 工具调用完成 | `toolCall`: 完整验证的工具调用，包含 `id`, `name`, `arguments` |
| `done` | 流完成 | `reason`: 停止原因 ("stop", "length", "toolUse"), `message`: 最终助手消息 |
| `error` | 发生错误 | `reason`: 错误类型 ("error" 或 "aborted"), `error`: 包含部分内容的 AssistantMessage |

## 图片输入

具有视觉能力的模型可以处理图片。你可以通过 `input` 属性检查模型是否支持图片。如果向非视觉模型传递图片，它们会被静默忽略。

```typescript
import { readFileSync } from 'fs';
import { getModel, complete } from '@mariozechner/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');

// 检查模型是否支持图片
if (model.input.includes('image')) {
  console.log('模型支持视觉');
}

const imageBuffer = readFileSync('image.png');
const base64Image = imageBuffer.toString('base64');

const response = await complete(model, {
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: '这张图片里有什么？' },
      { type: 'image', data: base64Image, mimeType: 'image/png' }
    ]
  }]
});

// 访问响应
for (const block of response.content) {
  if (block.type === 'text') {
    console.log(block.text);
  }
}
```

## 思考/推理

许多模型支持思考/推理能力，可以展示它们的内部思考过程。你可以通过 `reasoning` 属性检查模型是否支持推理。如果向非推理模型传递推理选项，它们会被静默忽略。

### 统一接口 (streamSimple/completeSimple)

```typescript
import { getModel, streamSimple, completeSimple } from '@mariozechner/pi-ai';

// 跨提供商的许多模型支持思考/推理
const model = getModel('anthropic', 'claude-sonnet-4-20250514');
// 或 getModel('openai', 'gpt-5-mini');
// 或 getModel('google', 'gemini-2.5-flash');
// 或 getModel('xai', 'grok-code-fast-1');
// 或 getModel('groq', 'openai/gpt-oss-20b');
// 或 getModel('cerebras', 'gpt-oss-120b');
// 或 getModel('openrouter', 'z-ai/glm-4.5v');

// 检查模型是否支持推理
if (model.reasoning) {
  console.log('模型支持推理/思考');
}

// 使用简化的推理选项
const response = await completeSimple(model, {
  messages: [{ role: 'user', content: '求解: 2x + 5 = 13' }]
}, {
  reasoning: 'medium'  // 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
});

// 访问思考和文本块
for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('思考:', block.thinking);
  } else if (block.type === 'text') {
    console.log('回复:', block.text);
  }
}
```

### Provider 特定选项 (stream/complete)

精细控制使用 provider 特定选项：

```typescript
import { getModel, complete } from '@mariozechner/pi-ai';

// OpenAI 推理 (o1, o3, gpt-5)
const openaiModel = getModel('openai', 'gpt-5-mini');
await complete(openaiModel, context, {
  reasoningEffort: 'medium',
  reasoningSummary: 'detailed'  // 仅 OpenAI Responses API
});

// Anthropic 思考 (Claude Sonnet 4)
const anthropicModel = getModel('anthropic', 'claude-sonnet-4-20250514');
await complete(anthropicModel, context, {
  thinkingEnabled: true,
  thinkingBudgetTokens: 8192  // 可选 token 限制
});

// Google Gemini 思考
const googleModel = getModel('google', 'gemini-2.5-flash');
await complete(googleModel, context, {
  thinking: {
    enabled: true,
    budgetTokens: 8192  // -1 动态, 0 禁用
  }
});
```

### 流式思考内容

流式传输时，思考内容通过特定事件传递：

```typescript
const s = streamSimple(model, context, { reasoning: 'high' });

for await (const event of s) {
  switch (event.type) {
    case 'thinking_start':
      console.log('[模型开始思考]');
      break;
    case 'thinking_delta':
      process.stdout.write(event.delta);  // 流式思考内容
      break;
    case 'thinking_end':
      console.log('\n[思考完成]');
      break;
  }
}
```

## 停止原因

每个 `AssistantMessage` 包含一个 `stopReason` 字段，指示生成如何结束：

- `"stop"` - 正常完成，模型完成了回复
- `"length"` - 输出达到最大 token 限制
- `"toolUse"` - 模型正在调用工具，期望工具结果
- `"error"` - 生成期间发生错误
- `"aborted"` - 请求通过 abort 信号取消

`AssistantMessage` 还可能包含 `responseId`，这是底层 API 暴露时的 provider 特定上游响应或消息标识符。不要假设它在所有 provider 中都存在。

## 错误处理

当请求以错误结束时（包括中止和工具调用验证错误），流式 API 会发出错误事件：

```typescript
// 流式中
for await (const event of stream) {
  if (event.type === 'error') {
    // event.reason 是 "error" 或 "aborted"
    // event.error 是包含部分内容的 AssistantMessage
    console.error(`错误 (${event.reason}):`, event.error.errorMessage);
    console.log('部分内容:', event.error.content);
  }
}

// 最终消息将包含错误详情
const message = await stream.result();
if (message.stopReason === 'error' || message.stopReason === 'aborted') {
  console.error('请求失败:', message.errorMessage);
  // message.content 包含错误前收到的任何部分内容
  // message.usage 包含部分 token 计数和费用
}
```

### 中止请求

Abort 信号允许你取消进行中的请求。中止的请求 `stopReason === 'aborted'`：

```typescript
import { getModel, stream } from '@mariozechner/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');
const controller = new AbortController();

// 2 秒后中止
setTimeout(() => controller.abort(), 2000);

const s = stream(model, {
  messages: [{ role: 'user', content: '写一篇长故事' }]
}, {
  signal: controller.signal
});

for await (const event of s) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'error') {
    console.log(`${event.reason === 'aborted' ? '已中止' : '错误'}:`, event.error.errorMessage);
  }
}

// 获取结果（如果中止可能是部分的）
const response = await s.result();
if (response.stopReason === 'aborted') {
  console.log('请求已中止:', response.errorMessage);
  console.log('收到的部分内容:', response.content);
  console.log('使用的 Token:', response.usage);
}
```

### 中止后继续

中止的消息可以添加到对话上下文并在后续请求中继续：

```typescript
const context = {
  messages: [
    { role: 'user', content: '详细解释量子计算' }
  ]
};

// 第一个请求在 2 秒后中止
const controller1 = new AbortController();
setTimeout(() => controller1.abort(), 2000);

const partial = await complete(model, context, { signal: controller1.signal });

// 关键：将部分响应添加到上下文
context.messages.push(partial);  // ← 保存已生成的部分内容
context.messages.push({ role: 'user', content: '请继续' }); // 再看到用户说"请继续"，就会理解需要接着之前的内容继续

// 继续对话
const continuation = await complete(model, context);
```

### 调试 Provider Payload

使用 `onPayload` 回调检查发送给 provider 的请求 payload。这对调试请求格式问题或 provider 验证错误很有用。

```typescript
const response = await complete(model, context, {
  onPayload: (payload) => {
    // 发送请求体前调用回调
    console.log('Provider payload:', JSON.stringify(payload, null, 2));
  }
});
```

请求发送前触发，可以查看完整的请求体内容，包括：
- `model` - 模型 ID
- `messages` - 消息数组
- `tools` - 工具定义
- `temperature` - 温度参数
- `maxTokens` - 最大 token 数
- 其他 Provider 特定选项

`stream`, `complete`, `streamSimple`, 和 `completeSimple` **都支持** `onPayload` 回调作为选项参数。

## API、模型和 Provider

### Provider 和模型

**Provider** 通过特定 API 提供模型。例如：
- **Anthropic** 模型使用 `anthropic-messages` API
- **Google** 模型使用 `google-generative-ai` API
- **OpenAI** 模型使用 `openai-responses` API
- **Mistral** 模型使用 `mistral-conversations` API
- **xAI, Cerebras, Groq 等** 模型使用 `openai-completions` API（OpenAI 兼容）

### 查询 Provider 和模型

```typescript
import { getProviders, getModels, getModel } from '@mariozechner/pi-ai';

// 获取所有可用 provider
const providers = getProviders();
console.log(providers); // ['openai', 'anthropic', 'google', 'xai', 'groq', ...]

// 获取 provider 的所有模型（完全类型化）
const anthropicModels = getModels('anthropic');
for (const model of anthropicModels) {
  console.log(`${model.id}: ${model.name}`);
  console.log(`  API: ${model.api}`); // 'anthropic-messages'
  console.log(`  上下文: ${model.contextWindow} tokens`);
  console.log(`  视觉: ${model.input.includes('image')}`);
  console.log(`  推理: ${model.reasoning}`);
}

// 获取特定模型（IDE 中 provider 和模型 ID 都有自动补全）
const model = getModel('openai', 'gpt-4o-mini');
console.log(`使用 ${model.name} 通过 ${model.api} API`);
```

### 自定义模型

你可以为本地推理服务器或自定义端点创建自定义模型：

```typescript
import { Model, stream } from '@mariozechner/pi-ai';

// 示例：使用 OpenAI 兼容 API 的 Ollama
const ollamaModel: Model<'openai-completions'> = {
  id: 'llama-3.1-8b',
  name: 'Llama 3.1 8B (Ollama)',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000
};

// 示例：带显式兼容性设置的 LiteLLM 代理
const litellmModel: Model<'openai-completions'> = {
  id: 'gpt-4o',
  name: 'GPT-4o (via LiteLLM)',
  api: 'openai-completions',
  provider: 'litellm',
  baseUrl: 'http://localhost:4000/v1',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 2.5, output: 10, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
  compat: {
    supportsStore: false,  // LiteLLM 不支持 store 字段
  }
};

// 示例：带自定义请求头的自定义端点（绕过 Cloudflare 机器人检测）
const proxyModel: Model<'anthropic-messages'> = {
  id: 'claude-sonnet-4',
  name: 'Claude Sonnet 4 (Proxied)',
  api: 'anthropic-messages',
  provider: 'custom-proxy',
  baseUrl: 'https://proxy.example.com/v1',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  contextWindow: 200000,
  maxTokens: 8192,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'X-Custom-Auth': 'bearer-token-here'
  }
};

// 使用自定义模型
const response = await stream(ollamaModel, context, {
  apiKey: 'dummy' // Ollama 不需要真实 key
});
```

一些 OpenAI 兼容服务器不理解推理能力模型使用的 `developer` 角色。对于这些 provider，设置 `compat.supportsDeveloperRole` 为 `false`，这样系统提示会作为 `system` 消息发送。如果服务器也不支持 `reasoning_effort`，同时设置 `compat.supportsReasoningEffort` 为 `false`。

这通常适用于 Ollama, vLLM, SGLang 和类似的 OpenAI 兼容服务器。你可以在 provider 级别或每个模型设置 `compat`。

```typescript
const ollamaReasoningModel: Model<'openai-completions'> = {
  id: 'gpt-oss:20b',
  name: 'GPT-OSS 20B (Ollama)',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: true,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 131072,
  maxTokens: 32000,
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
  }
};
```

### OpenAI 兼容性设置

`openai-completions` API 被许多 provider 实现，有细微差异。默认情况下，库基于 `baseUrl` 自动检测一小部分已知 OpenAI 兼容 provider（Cerebras, xAI, Chutes, DeepSeek, zAi, OpenCode 等）的兼容性设置。对于自定义代理或未知端点，你可以通过 `compat` 字段覆盖这些设置。对于 `openai-responses` 模型，compat 字段仅支持 Responses 特定的标志。

```typescript
interface OpenAICompletionsCompat {
  supportsStore?: boolean;           // provider 是否支持 `store` 字段 (默认: true)
  supportsDeveloperRole?: boolean;   // provider 是否支持 `developer` 角色 vs `system` (默认: true)
  supportsReasoningEffort?: boolean; // provider 是否支持 `reasoning_effort` (默认: true)
  supportsUsageInStreaming?: boolean; // provider 是否支持 `stream_options: { include_usage: true }` (默认: true)
  supportsStrictMode?: boolean;      // provider 是否支持工具定义中的 `strict` (默认: true)
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';  // 使用哪个字段名 (默认: max_completion_tokens)
  requiresToolResultName?: boolean;  // 工具结果是否需要 `name` 字段 (默认: false)
  requiresAssistantAfterToolResult?: boolean; // 工具结果后是否必须有助手消息 (默认: false)
  requiresThinkingAsText?: boolean;  // 思考块是否必须转换为文本 (默认: false)
  thinkingFormat?: 'openai' | 'zai' | 'qwen'; // 推理参数格式 (默认: openai)
  openRouterRouting?: OpenRouterRouting; // OpenRouter 路由偏好 (默认: {})
  vercelGatewayRouting?: VercelGatewayRouting; // Vercel AI Gateway 路由偏好 (默认: {})
}

interface OpenAIResponsesCompat {
  // 保留供将来使用
}
```

如果未设置 `compat`，库回退到基于 URL 的检测。如果 `compat` 部分设置，未指定字段使用检测到的默认值。这对以下情况有用：

- **LiteLLM 代理**: 可能不支持 `store` 字段
- **自定义推理服务器**: 可能使用非标准字段名
- **自托管端点**: 可能有不同的功能支持

### 类型安全

模型按其 API 类型化，保持模型元数据准确。当你直接调用 provider 函数时，强制执行 Provider 特定选项类型。泛型 `stream` 和 `complete` 函数接受带额外 provider 字段的 `StreamOptions`。

```typescript
import { streamAnthropic, type AnthropicOptions } from '@mariozechner/pi-ai';

// TypeScript 知道这是 Anthropic 模型
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');

const options: AnthropicOptions = {
  thinkingEnabled: true,
  thinkingBudgetTokens: 2048
};

await streamAnthropic(claude, context, options);
```

## 跨 Provider 切换

库支持在同一会话中不同 LLM provider 之间无缝切换。这允许你在保留上下文的同时切换模型，包括思考块、工具调用和工具结果。

### 工作原理

当来自一个 provider 的消息发送到不同 provider 时，库自动转换它们以实现兼容性：

- **用户和工具结果消息** 原样传递
- **来自相同 provider/API 的助手消息** 原样保留
- **来自不同 provider 的助手消息** 其思考块转换为带 `<thinking>` 标签的文本
- **工具调用和普通文本** 原样保留

### 示例：多 Provider 对话

```typescript
import { getModel, complete, Context } from '@mariozechner/pi-ai';

// 从 Claude 开始
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');
const context: Context = {
  messages: []
};

context.messages.push({ role: 'user', content: '25 * 18 是多少？' });
const claudeResponse = await complete(claude, context, {
  thinkingEnabled: true
});
context.messages.push(claudeResponse);

// 切换到 GPT-5 - 它会看到 Claude 的思考作为 <thinking> 标签文本
const gpt5 = getModel('openai', 'gpt-5-mini');
context.messages.push({ role: 'user', content: '那个计算正确吗？' });
const gptResponse = await complete(gpt5, context);
context.messages.push(gptResponse);

// 切换到 Gemini
const gemini = getModel('google', 'gemini-2.5-flash');
context.messages.push({ role: 'user', content: '原始问题是什么？' });
const geminiResponse = await complete(gemini, context);
```

### Provider 兼容性

所有 provider 可以处理来自其他 provider 的消息，包括：
- 文本内容
- 工具调用和工具结果（包括工具结果中的图片）
- 思考/推理块（为跨 provider 兼容性转换为标签文本）
- 带部分内容的中止消息

这支持灵活的工作流，你可以：
- 从快速模型开始获取初始响应
- 切换到更有能力的模型进行复杂推理
- 为特定任务使用专门模型
- 在 provider 中断期间保持对话连续性

## 上下文序列化

`Context` 对象可以使用标准 JSON 方法轻松序列化和反序列化，使其易于持久化对话、实现聊天历史或在服务间传输上下文：

```typescript
import { Context, getModel, complete } from '@mariozechner/pi-ai';

// 创建并使用上下文
const context: Context = {
  systemPrompt: '你是一个 helpful 助手。',
  messages: [
    { role: 'user', content: '什么是 TypeScript？' }
  ]
};

const model = getModel('openai', 'gpt-4o-mini');
const response = await complete(model, context);
context.messages.push(response);

// 序列化整个上下文
const serialized = JSON.stringify(context);
console.log('序列化上下文大小:', serialized.length, 'bytes');

// 保存到数据库、localStorage、文件等
localStorage.setItem('conversation', serialized);

// 稍后：反序列化并继续对话
const restored: Context = JSON.parse(localStorage.getItem('conversation')!);
restored.messages.push({ role: 'user', content: '告诉我更多关于它的类型系统' });

// 用任何模型继续
const newModel = getModel('anthropic', 'claude-3-5-haiku-20241022');
const continuation = await complete(newModel, restored);
```

> **注意**: 如果上下文包含图片（如图片输入部分所示编码为 base64），这些也会被序列化。

## 浏览器使用

库支持浏览器环境。你必须显式传递 API key，因为浏览器中环境变量不可用：

```typescript
import { getModel, complete } from '@mariozechner/pi-ai';

// 浏览器中必须显式传递 API key
const model = getModel('anthropic', 'claude-3-5-haiku-20241022');

const response = await complete(model, {
  messages: [{ role: 'user', content: '你好！' }]
}, {
  apiKey: 'your-api-key'
});
```

> **安全警告**: 在前端代码中暴露 API key 是危险的。任何人都可以提取和滥用你的 key。仅将此方法用于内部工具或演示。对于生产应用，使用保持 API key 安全的后端代理。

### 浏览器兼容性说明

- Amazon Bedrock (`bedrock-converse-stream`) 在浏览器环境中不受支持。
- 浏览器环境中不支持 OAuth 登录流程。在 Node.js 中使用 `@mariozechner/pi-ai/oauth` 入口点。
- 在浏览器构建中，Bedrock 仍可能出现在模型列表中。对 Bedrock 模型的调用在运行时失败。
- 如果你需要从 Web 应用使用 Bedrock 或基于 OAuth 的认证，使用服务器端代理或后端服务。

### 环境变量（仅 Node.js）

在 Node.js 环境中，你可以设置环境变量以避免传递 API key：

| Provider | 环境变量 |
|---------|---------|
| OpenAI | `OPENAI_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` 或 `AZURE_OPENAI_RESOURCE_NAME` (可选 `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` 如 `model=deployment,model2=deployment2`) |
| Anthropic | `ANTHROPIC_API_KEY` 或 `ANTHROPIC_OAUTH_TOKEN` |
| Google | `GEMINI_API_KEY` |
| Vertex AI | `GOOGLE_CLOUD_API_KEY` 或 `GOOGLE_CLOUD_PROJECT` (或 `GCLOUD_PROJECT`) + `GOOGLE_CLOUD_LOCATION` + ADC |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` |
| zAI | `ZAI_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| OpenCode Zen / OpenCode Go | `OPENCODE_API_KEY` |
| Kimi For Coding | `KIMI_API_KEY` |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` 或 `GH_TOKEN` 或 `GITHUB_TOKEN` |

设置后，库自动使用这些 key：

```typescript
// 使用环境中的 OPENAI_API_KEY
const model = getModel('openai', 'gpt-4o-mini');
const response = await complete(model, context);

// 或用显式 key 覆盖
const response = await complete(model, context, {
  apiKey: 'sk-different-key'
});
```

#### Antigravity 版本覆盖

设置 `PI_AI_ANTIGRAVITY_VERSION` 以在 Google 更新要求时覆盖 Antigravity User-Agent 版本：

```bash
export PI_AI_ANTIGRAVITY_VERSION="1.23.0"
```

#### 缓存保留

设置 `PI_CACHE_RETENTION=long` 以延长提示缓存保留：

| Provider | 默认 | 使用 `PI_CACHE_RETENTION=long` |
|---------|------|-------------------------------|
| Anthropic | 5 分钟 | 1 小时 |
| OpenAI | 内存中 | 24 小时 |

这只影响直接调用 `api.anthropic.com` 和 `api.openai.com`。代理和其他 provider 不受影响。

> **注意**: 延长的缓存保留可能增加 Anthropic 的费用（缓存写入按更高费率收费）。OpenAI 的 24 小时保留没有额外费用。

### 检查环境变量

```typescript
import { getEnvApiKey } from '@mariozechner/pi-ai';

// 检查环境变量中是否设置了 API key
const key = getEnvApiKey('openai');  // 检查 OPENAI_API_KEY
```

## OAuth Provider

几个 provider 需要 OAuth 认证而不是静态 API key：

- **Anthropic** (Claude Pro/Max 订阅)
- **OpenAI Codex** (ChatGPT Plus/Pro 订阅，访问 GPT-5.x Codex 模型)
- **GitHub Copilot** (Copilot 订阅)
- **Google Gemini CLI** (通过 Google Cloud Code Assist 的 Gemini 2.0/2.5；免费层或付费订阅)
- **Antigravity** (通过 Google Cloud 的免费 Gemini 3, Claude, GPT-OSS)

对于付费 Cloud Code Assist 订阅，设置 `GOOGLE_CLOUD_PROJECT` 或 `GOOGLE_CLOUD_PROJECT_ID` 为你的项目 ID。

### Vertex AI

Vertex AI 模型支持 Google Cloud API key 或 Application Default Credentials (ADC)：

- **API key**: 设置 `GOOGLE_CLOUD_API_KEY` 或在调用选项中传递 `apiKey`。
- **本地开发 (ADC)**: 运行 `gcloud auth application-default login`
- **CI/生产 (ADC)**: 设置 `GOOGLE_APPLICATION_CREDENTIALS` 指向服务账户 JSON key 文件

使用 ADC 时，同时设置 `GOOGLE_CLOUD_PROJECT` (或 `GCLOUD_PROJECT`) 和 `GOOGLE_CLOUD_LOCATION`。你也可以在调用选项中传递 `project`/`location`。使用 `GOOGLE_CLOUD_API_KEY` 时，不需要 `project` 和 `location`。

示例：

```bash
# 本地（使用你的用户凭证）
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="my-project"
export GOOGLE_CLOUD_LOCATION="us-central1"

# CI/生产（服务账户 key 文件）
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

```typescript
import { getModel, complete } from '@mariozechner/pi-ai';

(async () => {
  const model = getModel('google-vertex', 'gemini-2.5-flash');
  const response = await complete(model, {
    messages: [{ role: 'user', content: '来自 Vertex AI 的问候' }]
  }, {
    apiKey: process.env.GOOGLE_CLOUD_API_KEY,
  });

  for (const block of response.content) {
    if (block.type === 'text') console.log(block.text);
  }
})().catch(console.error);
```

官方文档: [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)

### CLI 登录

最快的认证方式：

```bash
npx @mariozechner/pi-ai login              # 交互式 provider 选择
npx @mariozechner/pi-ai login anthropic    # 登录特定 provider
npx @mariozechner/pi-ai list               # 列出可用 provider
```

凭证保存到当前目录的 `auth.json`。

### 程序化 OAuth

库通过 `@mariozechner/pi-ai/oauth` 入口点提供登录和 token 刷新函数。凭证存储由调用者负责。

```typescript
import {
  // 登录函数（返回凭证，不存储）
  loginAnthropic,
  loginOpenAICodex,
  loginGitHubCopilot,
  loginGeminiCli,
  loginAntigravity,

  // Token 管理
  refreshOAuthToken,   // (provider, credentials) => new credentials
  getOAuthApiKey,      // (provider, credentialsMap) => { newCredentials, apiKey } | null

  // 类型
  type OAuthProvider,  // 'anthropic' | 'openai-codex' | 'github-copilot' | 'google-gemini-cli' | 'google-antigravity'
  type OAuthCredentials,
} from '@mariozechner/pi-ai/oauth';
```

### 登录流程示例

```typescript
import { loginGitHubCopilot } from '@mariozechner/pi-ai/oauth';
import { writeFileSync } from 'fs';

const credentials = await loginGitHubCopilot({
  onAuth: (url, instructions) => {
    console.log(`打开: ${url}`);
    if (instructions) console.log(instructions);
  },
  onPrompt: async (prompt) => {
    return await getUserInput(prompt.message);
  },
  onProgress: (message) => console.log(message)
});

// 自己存储凭证
const auth = { 'github-copilot': { type: 'oauth', ...credentials } };
writeFileSync('auth.json', JSON.stringify(auth, null, 2));
```

### 使用 OAuth Token

使用 `getOAuthApiKey()` 获取 API key，过期时自动刷新：

```typescript
import { getModel, complete } from '@mariozechner/pi-ai';
import { getOAuthApiKey } from '@mariozechner/pi-ai/oauth';
import { readFileSync, writeFileSync } from 'fs';

// 加载你存储的凭证
const auth = JSON.parse(readFileSync('auth.json', 'utf-8'));

// 获取 API key（过期时刷新）
const result = await getOAuthApiKey('github-copilot', auth);
if (!result) throw new Error('未登录');

// 保存刷新的凭证
auth['github-copilot'] = { type: 'oauth', ...result.newCredentials };
writeFileSync('auth.json', JSON.stringify(auth, null, 2));

// 使用 API key
const model = getModel('github-copilot', 'gpt-4o');
const response = await complete(model, {
  messages: [{ role: 'user', content: '你好！' }]
}, { apiKey: result.apiKey });
```

### Provider 说明

**OpenAI Codex**: 需要 ChatGPT Plus 或 Pro 订阅。提供对具有扩展上下文窗口和推理能力的 GPT-5.x Codex 模型的访问。当在流选项中提供 `sessionId` 时，库自动处理基于会话的提示缓存。你可以在流选项中设置 `transport` 为 `"sse"`, `"websocket"`, 或 `"auto"` 进行 Codex Responses 传输选择。使用 WebSocket 和 `sessionId` 时，连接按会话复用，5 分钟不活动后过期。

**Azure OpenAI (Responses)**: 仅使用 Responses API。设置 `AZURE_OPENAI_API_KEY` 和 `AZURE_OPENAI_BASE_URL` 或 `AZURE_OPENAI_RESOURCE_NAME`。如有需要，使用 `AZURE_OPENAI_API_VERSION`（默认为 `v1`）覆盖 API 版本。部署名称默认视为模型 ID，使用 `azureDeploymentName` 或 `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` 以逗号分隔的 `model-id=deployment` 对覆盖（例如 `gpt-4o-mini=my-deployment,gpt-4o=prod`）。故意不支持基于传统部署的 URL。

**GitHub Copilot**: 如果你收到 "The requested model is not supported" 错误，在 VS Code 中手动启用模型：打开 Copilot Chat，点击模型选择器，选择模型（警告图标），然后点击 "Enable"。

**Google Gemini CLI / Antigravity**: 这些使用 Google Cloud OAuth。`getOAuthApiKey()` 返回的 `apiKey` 是包含 token 和项目 ID 的 JSON 字符串，库自动处理。

---

**文档版本**: 基于 `@mariozechner/pi-ai` README.md 翻译
**最后更新**: 2026-03-18
