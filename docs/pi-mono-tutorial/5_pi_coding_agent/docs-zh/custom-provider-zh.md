# 自定义 Provider

扩展可以通过 `pi.registerProvider()` 注册自定义模型 Provider。这可以实现：

- **代理 (Proxies)** - 通过企业代理或 API 网关路由请求
- **自定义端点** - 使用自托管或私有模型部署
- **OAuth/SSO** - 为企业 Provider 添加认证流程
- **自定义 API** - 为非标准 LLM API 实现流式处理

## 示例扩展

参考以下完整的 Provider 示例：

- [`examples/extensions/custom-provider-anthropic/`](../examples/extensions/custom-provider-anthropic/)
- [`examples/extensions/custom-provider-gitlab-duo/`](../examples/extensions/custom-provider-gitlab-duo/)
- [`examples/extensions/custom-provider-qwen-cli/`](../examples/extensions/custom-provider-qwen-cli/)

## 目录

- [示例扩展](#示例扩展)
- [快速参考](#快速参考)
- [覆盖现有 Provider](#覆盖现有-provider)
- [注册新 Provider](#注册新-provider)
- [注销 Provider](#注销-provider)
- [OAuth 支持](#oauth-支持)
- [自定义流式 API](#自定义流式-api)
- [测试你的实现](#测试你的实现)
- [配置参考](#配置参考)
- [模型定义参考](#模型定义参考)

## 快速参考

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 为现有 Provider 覆盖 baseUrl
  pi.registerProvider("anthropic", {
    baseUrl: "https://proxy.example.com"
  });

  // 注册带有模型的新 Provider
  pi.registerProvider("my-provider", {
    baseUrl: "https://api.example.com",
    apiKey: "MY_API_KEY",
    api: "openai-completions",
    models: [
      {
        id: "my-model",
        name: "My Model",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096
      }
    ]
  });
}
```

## 覆盖现有 Provider

最简单的使用场景：通过代理重定向现有 Provider。

```typescript
// 所有 Anthropic 请求现在都通过你的代理
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com"
});

// 为 OpenAI 请求添加自定义请求头
pi.registerProvider("openai", {
  headers: {
    "X-Custom-Header": "value"
  }
});

// 同时设置 baseUrl 和 headers
pi.registerProvider("google", {
  baseUrl: "https://ai-gateway.corp.com/google",
  headers: {
    "X-Corp-Auth": "CORP_AUTH_TOKEN"  // 环境变量名或字面值
  }
});
```

当只提供 `baseUrl` 和/或 `headers`（没有 `models`）时，该 Provider 的所有现有模型都会保留，只是使用新的端点。

## 注册新 Provider

要添加一个全新的 Provider，需要指定 `models` 以及必需的配置。

```typescript
pi.registerProvider("my-llm", {
  baseUrl: "https://api.my-llm.com/v1",
  apiKey: "MY_LLM_API_KEY",  // 环境变量名或字面值
  api: "openai-completions",  // 使用哪种流式 API
  models: [
    {
      id: "my-llm-large",
      name: "My LLM Large",
      reasoning: true,        // 支持扩展思考 (extended thinking)
      input: ["text", "image"],
      cost: {
        input: 3.0,           // 美元/百万 token
        output: 15.0,
        cacheRead: 0.3,
        cacheWrite: 3.75
      },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});
```

当提供 `models` 时，它会**替换**该 Provider 的所有现有模型。

## 注销 Provider

使用 `pi.unregisterProvider(name)` 可以移除之前通过 `pi.registerProvider(name, ...)` 注册的 Provider：

```typescript
// 注册
pi.registerProvider("my-llm", {
  baseUrl: "https://api.my-llm.com/v1",
  apiKey: "MY_LLM_API_KEY",
  api: "openai-completions",
  models: [
    {
      id: "my-llm-large",
      name: "My LLM Large",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200000,
      maxTokens: 16384
    }
  ]
});

// 之后，移除它
pi.unregisterProvider("my-llm");
```

注销操作会移除该 Provider 的动态模型、API 密钥回退、OAuth Provider 注册以及自定义流处理器注册。任何被覆盖的内置模型或 Provider 行为都会被恢复。

在初始扩展加载阶段之后进行的调用会立即生效，因此不需要 `/reload`。

### API 类型

`api` 字段决定了使用哪种流式实现：

| API | 用途 |
|-----|------|
| `anthropic-messages` | Anthropic Claude API 及兼容服务 |
| `openai-completions` | OpenAI Chat Completions API 及兼容服务 |
| `openai-responses` | OpenAI Responses API |
| `azure-openai-responses` | Azure OpenAI Responses API |
| `openai-codex-responses` | OpenAI Codex Responses API |
| `mistral-conversations` | Mistral SDK Conversations/Chat 流式处理 |
| `google-generative-ai` | Google Generative AI API |
| `google-gemini-cli` | Google Cloud Code Assist API |
| `google-vertex` | Google Vertex AI API |
| `bedrock-converse-stream` | Amazon Bedrock Converse API |

大多数兼容 OpenAI 的 Provider 都可以使用 `openai-completions`。使用 `compat` 处理特殊行为：

```typescript
models: [{
  id: "custom-model",
  // ...
  compat: {
    supportsDeveloperRole: false,      // 使用 "system" 而不是 "developer"
    supportsReasoningEffort: true,
    reasoningEffortMap: {              // 将 pi-ai 级别映射到 Provider 值
      minimal: "default",
      low: "default",
      medium: "default",
      high: "default",
      xhigh: "default"
    },
      maxTokensField: "max_tokens",      // 代替 "max_completion_tokens"
      requiresToolResultName: true,      // 工具结果需要 name 字段
      thinkingFormat: "qwen"            // 顶层 enable_thinking: true
    }
  }]
```

对于读取 `chat_template_kwargs.enable_thinking` 的本地 Qwen 兼容服务器，改用 `qwen-chat-template`。

> 迁移说明：Mistral 已从 `openai-completions` 迁移到 `mistral-conversations`。
> 对于原生 Mistral 模型，请使用 `mistral-conversations`。
> 如果你故意通过 `openai-completions` 路由 Mistral 兼容/自定义端点，请根据需要显式设置 `compat` 标志。

### 认证请求头

如果你的 Provider 期望 `Authorization: Bearer <key>` 但不使用标准 API，请设置 `authHeader: true`：

```typescript
pi.registerProvider("custom-api", {
  baseUrl: "https://api.example.com",
  apiKey: "MY_API_KEY",
  authHeader: true,  // 添加 Authorization: Bearer 请求头
  api: "openai-completions",
  models: [...]
});
```

## OAuth 支持

添加与 `/login` 集成的 OAuth/SSO 认证：

```typescript
import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai";

pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com/v1",
  api: "openai-responses",
  models: [...],
  oauth: {
    name: "Corporate AI (SSO)",

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      // 方式 1：基于浏览器的 OAuth
      callbacks.onAuth({ url: "https://sso.corp.com/authorize?..." });

      // 方式 2：设备码流程
      callbacks.onDeviceCode({
        userCode: "ABCD-1234",
        verificationUri: "https://sso.corp.com/device"
      });

      // 方式 3：提示输入 token/码
      const code = await callbacks.onPrompt({ message: "输入 SSO 码:" });

      // 换取令牌（你的实现）
      const tokens = await exchangeCodeForTokens(code);

      return {
        refresh: tokens.refreshToken,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      const tokens = await refreshAccessToken(credentials.refresh);
      return {
        refresh: tokens.refreshToken ?? credentials.refresh,
        access: tokens.accessToken,
        expires: Date.now() + tokens.expiresIn * 1000
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },

    // 可选：根据用户订阅修改模型
    modifyModels(models, credentials) {
      const region = decodeRegionFromToken(credentials.access);
      return models.map(m => ({
        ...m,
        baseUrl: `https://${region}.ai.corp.com/v1`
      }));
    }
  }
});
```

注册后，用户可以通过 `/login corporate-ai` 进行认证。

### OAuthLoginCallbacks

`callbacks` 对象提供三种认证方式：

```typescript
interface OAuthLoginCallbacks {
  // 在浏览器中打开 URL（用于 OAuth 重定向）
  onAuth(params: { url: string }): void;

  // 显示设备码（用于设备授权流程）
  onDeviceCode(params: { userCode: string; verificationUri: string }): void;

  // 提示用户输入（用于手动输入令牌）
  onPrompt(params: { message: string }): Promise<string>;
}
```

### OAuthCredentials

凭证持久化存储在 `~/.pi/agent/auth.json`：

```typescript
interface OAuthCredentials {
  refresh: string;   // 刷新令牌（用于 refreshToken()）
  access: string;    // 访问令牌（由 getApiKey() 返回）
  expires: number;   // 过期时间戳（毫秒）
}
```

## 自定义流式 API

对于使用非标准 API 的 Provider，可以实现 `streamSimple`。在编写自己的实现之前，请先研究现有的 Provider 实现：

**参考实现：**
- [anthropic.ts](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/providers/anthropic.ts) - Anthropic Messages API
- [mistral.ts](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/providers/mistral.ts) - Mistral Conversations API
- [openai-completions.ts](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/providers/openai-completions.ts) - OpenAI Chat Completions
- [openai-responses.ts](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/providers/openai-responses.ts) - OpenAI Responses API
- [google.ts](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/providers/google.ts) - Google Generative AI
- [amazon-bedrock.ts](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/providers/amazon-bedrock.ts) - AWS Bedrock

### 流式模式

所有 Provider 都遵循相同的模式：

```typescript
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  calculateCost,
  createAssistantMessageEventStream,
} from "@mariozechner/pi-ai";

function streamMyProvider(
  model: Model<any>,
  context: Context,
  options?: SimpleStreamOptions
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    // 初始化输出消息
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    };

    try {
      // 推送开始事件
      stream.push({ type: "start", partial: output });

      // 发起 API 请求并处理响应...
      // 在数据到达时推送内容事件...

      // 推送完成事件
      stream.push({
        type: "done",
        reason: output.stopReason as "stop" | "length" | "toolUse",
        message: output
      });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}
```

### 事件类型

按以下顺序通过 `stream.push()` 推送事件：

1. `{ type: "start", partial: output }` - 流已开始

2. 内容事件（可重复，为每个块跟踪 `contentIndex`）：
   - `{ type: "text_start", contentIndex, partial }` - 文本块开始
   - `{ type: "text_delta", contentIndex, delta, partial }` - 文本片段
   - `{ type: "text_end", contentIndex, content, partial }` - 文本块结束
   - `{ type: "thinking_start", contentIndex, partial }` - 思考开始
   - `{ type: "thinking_delta", contentIndex, delta, partial }` - 思考片段
   - `{ type: "thinking_end", contentIndex, content, partial }` - 思考结束
   - `{ type: "toolcall_start", contentIndex, partial }` - 工具调用开始
   - `{ type: "toolcall_delta", contentIndex, delta, partial }` - 工具调用 JSON 片段
   - `{ type: "toolcall_end", contentIndex, toolCall, partial }` - 工具调用结束

3. `{ type: "done", reason, message }` 或 `{ type: "error", reason, error }` - 流已结束

每个事件中的 `partial` 字段包含当前 `AssistantMessage` 的状态。在接收数据时更新 `output.content`，然后将 `output` 作为 `partial` 包含在内。

### 内容块

在内容块到达时将其添加到 `output.content`：

```typescript
// 文本块
output.content.push({ type: "text", text: "" });
stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });

// 当文本到达时
const block = output.content[contentIndex];
if (block.type === "text") {
  block.text += delta;
  stream.push({ type: "text_delta", contentIndex, delta, partial: output });
}

// 当块完成时
stream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
```

### 工具调用

工具调用需要累积 JSON 并进行解析：

```typescript
// 开始工具调用
output.content.push({
  type: "toolCall",
  id: toolCallId,
  name: toolName,
  arguments: {}
});
stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });

// 累积 JSON
let partialJson = "";
partialJson += jsonDelta;
try {
  block.arguments = JSON.parse(partialJson);
} catch {}
stream.push({ type: "toolcall_delta", contentIndex, delta: jsonDelta, partial: output });

// 完成
stream.push({
  type: "toolcall_end",
  contentIndex,
  toolCall: { type: "toolCall", id, name, arguments: block.arguments },
  partial: output
});
```

### 使用量和成本

从 API 响应更新使用量并计算成本：

```typescript
output.usage.input = response.usage.input_tokens;
output.usage.output = response.usage.output_tokens;
output.usage.cacheRead = response.usage.cache_read_tokens ?? 0;
output.usage.cacheWrite = response.usage.cache_write_tokens ?? 0;
output.usage.totalTokens = output.usage.input + output.usage.output +
                           output.usage.cacheRead + output.usage.cacheWrite;
calculateCost(model, output.usage);
```

### 注册

注册你的流式函数：

```typescript
pi.registerProvider("my-provider", {
  baseUrl: "https://api.example.com",
  apiKey: "MY_API_KEY",
  api: "my-custom-api",
  models: [...],
  streamSimple: streamMyProvider
});
```

## 测试你的实现

使用与内置 Provider 相同的测试套件来测试你的 Provider。从 [packages/ai/test/](https://github.com/badlogic/pi-mono/tree/main/packages/ai/test) 复制并调整这些测试文件：

| 测试 | 目的 |
|------|------|
| `stream.test.ts` | 基本流式处理、文本输出 |
| `tokens.test.ts` | Token 计数和使用量 |
| `abort.test.ts` | AbortSignal 处理 |
| `empty.test.ts` | 空/最小响应 |
| `context-overflow.test.ts` | 上下文窗口限制 |
| `image-limits.test.ts` | 图像输入处理 |
| `unicode-surrogate.test.ts` | Unicode 边缘情况 |
| `tool-call-without-result.test.ts` | 工具调用边缘情况 |
| `image-tool-result.test.ts` | 工具结果中的图像 |
| `total-tokens.test.ts` | 总 token 计算 |
| `cross-provider-handoff.test.ts` | Provider 之间的上下文移交 |

使用你的 Provider/模型对运行测试以验证兼容性。

## 配置参考

```typescript
interface ProviderConfig {
  /** API 端点 URL。定义模型时必需。 */
  baseUrl?: string;

  /** API 密钥或环境变量名。定义模型时必需（除非使用 oauth）。 */
  apiKey?: string;

  /** 流式处理的 API 类型。定义模型时在 Provider 或模型级别必需。 */
  api?: Api;

  /** 非标准 API 的自定义流式实现。 */
  streamSimple?: (
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions
  ) => AssistantMessageEventStream;

  /** 请求中包含的自定义请求头。值可以是环境变量名。 */
  headers?: Record<string, string>;

  /** 如果为 true，添加带有解析后的 API 密钥的 Authorization: Bearer 请求头。 */
  authHeader?: boolean;

  /** 要注册的模型。如果提供，将替换此 Provider 的所有现有模型。 */
  models?: ProviderModelConfig[];

  /** 用于 /login 支持的 OAuth Provider。 */
  oauth?: {
    name: string;
    login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
    refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
    getApiKey(credentials: OAuthCredentials): string;
    modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[];
  };
}
```

## 模型定义参考

```typescript
interface ProviderModelConfig {
  /** 模型 ID（例如 "claude-sonnet-4-20250514"）。 */
  id: string;

  /** 显示名称（例如 "Claude 4 Sonnet"）。 */
  name: string;

  /** 此特定模型的 API 类型覆盖。 */
  api?: Api;

  /** 模型是否支持扩展思考。 */
  reasoning: boolean;

  /** 支持的输入类型。 */
  input: ("text" | "image")[];

  /** 每百万 token 的成本（用于使用量跟踪）。 */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };

  /** 最大上下文窗口大小（以 token 为单位）。 */
  contextWindow: number;

  /** 最大输出 token 数。 */
  maxTokens: number;

  /** 此特定模型的自定义请求头。 */
  headers?: Record<string, string>;

  /** openai-completions API 的 OpenAI 兼容性设置。 */
  compat?: {
    supportsStore?: boolean;
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    reasoningEffortMap?: Partial<Record<"minimal" | "low" | "medium" | "high" | "xhigh", string>>;
    supportsUsageInStreaming?: boolean;
    maxTokensField?: "max_completion_tokens" | "max_tokens";
    requiresToolResultName?: boolean;
    requiresAssistantAfterToolResult?: boolean;
    requiresThinkingAsText?: boolean;
    thinkingFormat?: "openai" | "zai" | "qwen" | "qwen-chat-template";
  };
}
```

`qwen` 用于 DashScope 风格的顶层 `enable_thinking`。对于读取 `chat_template_kwargs.enable_thinking` 的本地 Qwen 兼容服务器，请使用 `qwen-chat-template`。