# 5. Provider 注册机制与懒加载实现

问下大家，如果你的应用要支持 20+ 个 LLM Provider，你会怎么管理这些 Provider 的代码？

OpenClaw 刚开始想的是把所有 Provider 的代码都打包在一起，结果发现：
- 包体积巨大，加载慢
- 很多 Provider 用户根本用不到
- 新增 Provider 需要修改核心代码

pi-ai 是怎么优雅地解决这个问题的？今天我们就来聊聊它的 Provider 注册机制。

## 核心问题

1. **如何动态注册 Provider？** - 不修改核心代码就能添加新 Provider
2. **如何实现懒加载？** - 用不到的 Provider 代码不加载
3. **如何管理 Provider 依赖？** - 每个 Provider 可能有不同的依赖

## 架构设计

pi-ai 采用**注册表模式（Registry Pattern）** + **懒加载（Lazy Loading）**：

```
┌─────────────────────────────────────────────────────────────┐
│                     应用层                                  │
│                    stream("openai/gpt-4o")                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  API Registry（注册表）                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Map<string, ApiProvider> providers                │   │
│  │  - openai -> OpenAI Provider                       │   │
│  │  - anthropic -> Anthropic Provider                 │   │
│  │  - google -> Google Provider                       │   │
│  │  - ...                                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  registerApiProvider(provider)                             │
│  getApiProvider(name)                                      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                Provider 实现（懒加载）                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   OpenAI     │  │  Anthropic   │  │    Google    │      │
│  │  Provider    │  │   Provider   │  │   Provider   │      │
│  │  (按需加载)   │  │   (按需加载)  │  │   (按需加载)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 注册表实现

### ApiProvider 接口

```typescript
// packages/ai/src/api-registry.ts

export interface ApiProvider {
  /** Provider 名称 */
  name: string;
  
  /** 流式调用 */
  stream: (
    model: string,
    options: StreamOptions
  ) => Promise<AsyncGenerator<AgentMessageEvent>>;
  
  /** 获取可用模型列表 */
  getModels: () => Promise<Model[]>;
}

// 模型定义
export interface Model {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsStreaming?: boolean;
}
```

### 注册表核心代码

```typescript
// packages/ai/src/api-registry.ts

// 使用 Map 存储 Provider
const providers = new Map<string, ApiProvider>();

/**
 * 注册 Provider
 */
export function registerApiProvider(provider: ApiProvider): void {
  if (providers.has(provider.name)) {
    console.warn(`Provider ${provider.name} is already registered, overwriting`);
  }
  providers.set(provider.name, provider);
}

/**
 * 获取 Provider
 */
export function getApiProvider(name: string): ApiProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(
      `Unknown provider: ${name}. ` +
      `Available providers: ${Array.from(providers.keys()).join(", ")}`
    );
  }
  return provider;
}

/**
 * 获取所有已注册的 Provider 名称
 */
export function getRegisteredProviders(): string[] {
  return Array.from(providers.keys());
}

/**
 * 注销 Provider
 */
export function unregisterApiProvider(name: string): void {
  providers.delete(name);
}
```

## 懒加载实现

### 为什么要懒加载？

pi-ai 支持 20+ Provider，如果全部打包：
- 包体积会很大
- 启动时间变慢
- 内存占用增加

懒加载的好处：
- 只加载实际使用的 Provider
- 减小包体积
- 加快启动速度

### 懒加载实现方式

pi-ai 使用**动态导入（Dynamic Import）**实现懒加载：

```typescript
// packages/ai/src/providers/register-builtins.ts

// 定义 Provider 加载器
interface ProviderLoader {
  name: string;
  loader: () => Promise<{ provider: ApiProvider }>;
}

// Provider 加载器列表
const providerLoaders: ProviderLoader[] = [
  {
    name: "openai",
    loader: async () => {
      const { openaiProvider } = await import("./openai.js");
      return { provider: openaiProvider };
    },
  },
  {
    name: "anthropic",
    loader: async () => {
      const { anthropicProvider } = await import("./anthropic.js");
      return { provider: anthropicProvider };
    },
  },
  {
    name: "google",
    loader: async () => {
      const { googleProvider } = await import("./google.js");
      return { provider: googleProvider };
    },
  },
  // ... 更多 Provider
];

// 懒加载并注册所有内置 Provider
export async function registerBuiltinProviders(): Promise<void> {
  for (const { name, loader } of providerLoaders) {
    try {
      const { provider } = await loader();
      registerApiProvider(provider);
    } catch (error) {
      console.warn(`Failed to load provider ${name}:`, error);
    }
  }
}
```

### 按需加载单个 Provider

如果你只想加载特定的 Provider：

```typescript
// 手动注册单个 Provider
export async function registerOpenAIProvider(): Promise<void> {
  const { openaiProvider } = await import("./providers/openai.js");
  registerApiProvider(openaiProvider);
}

// 使用
await registerOpenAIProvider();
const stream = stream("openai/gpt-4o", { ... });
```

## Provider 实现示例

### OpenAI Provider

```typescript
// packages/ai/src/providers/openai.ts

import { ApiProvider, registerApiProvider } from "../api-registry.js";

export const openaiProvider: ApiProvider = {
  name: "openai",
  
  async stream(model: string, options: StreamOptions) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify({
        model,
        messages: convertMessages(options.messages),
        stream: true,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: options.tools?.map(convertTool),
        tool_choice: options.toolChoice,
      }),
      signal: options.signal,
    });
    
    return parseStream(response);
  },
  
  async getModels() {
    return [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsStreaming: true,
      },
      // ... 更多模型
    ];
  },
};

// 自动注册（如果使用静态导入）
// registerApiProvider(openaiProvider);
```

### Anthropic Provider

```typescript
// packages/ai/src/providers/anthropic.ts

export const anthropicProvider: ApiProvider = {
  name: "anthropic",
  
  async stream(model: string, options: StreamOptions) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: convertToAnthropicFormat(options.messages),
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
        tools: options.tools?.map(convertToolToAnthropic),
      }),
      signal: options.signal,
    });
    
    return parseAnthropicStream(response);
  },
  
  async getModels() {
    return [
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        contextWindow: 200000,
        supportsTools: true,
        supportsVision: true,
        supportsStreaming: true,
      },
    ];
  },
};
```

## 自动注册机制

### 入口文件自动注册

pi-ai 的入口文件会自动注册所有内置 Provider：

```typescript
// packages/ai/src/index.ts

// 导出类型
export type { 
  ApiProvider, 
  StreamOptions, 
  AgentMessageEvent,
  Message,
  Content,
  Tool,
} from "./types.js";

// 导出函数
export { stream, streamSimple } from "./stream.js";
export { 
  registerApiProvider, 
  getApiProvider,
  getRegisteredProviders,
} from "./api-registry.js";

// 自动注册内置 Provider（懒加载）
import { registerBuiltinProviders } from "./providers/register-builtins.js";
registerBuiltinProviders().catch(console.error);
```

### 子路径导出

pi-ai 还支持通过子路径单独导入 Provider：

```json
// packages/ai/package.json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./providers/openai": {
      "types": "./dist/providers/openai.d.ts",
      "default": "./dist/providers/openai.js"
    },
    "./providers/anthropic": {
      "types": "./dist/providers/anthropic.d.ts",
      "default": "./dist/providers/anthropic.js"
    }
  }
}
```

使用方式：

```typescript
// 只导入 OpenAI Provider
import { openaiProvider } from "@mariozechner/pi-ai/providers/openai";
import { registerApiProvider } from "@mariozechner/pi-ai";

registerApiProvider(openaiProvider);
```

## 自定义 Provider

你可以轻松添加自己的 Provider：

```typescript
// my-provider.ts
import { ApiProvider, registerApiProvider } from "@mariozechner/pi-ai";

const myProvider: ApiProvider = {
  name: "my-provider",
  
  async stream(model, options) {
    // 调用你的 API
    const response = await fetch("https://my-api.com/chat", {
      method: "POST",
      headers: { "Authorization": `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        model,
        messages: options.messages,
      }),
    });
    
    // 转换为统一事件流
    return convertToEventStream(response);
  },
  
  async getModels() {
    return [
      { id: "my-model", name: "My Model", provider: "my-provider", contextWindow: 100000 },
    ];
  },
};

// 注册
registerApiProvider(myProvider);
```

## 使用示例

### 基础使用

```typescript
import { stream } from "@mariozechner/pi-ai";

// 自动加载 OpenAI Provider
const response = stream("openai/gpt-4o", {
  messages: [{ role: "user", content: [{ type: "text", text: "Hello!" }] }],
  apiKey: process.env.OPENAI_API_KEY,
});
```

### 查看已注册 Provider

```typescript
import { getRegisteredProviders } from "@mariozechner/pi-ai";

console.log(getRegisteredProviders());
// ["openai", "anthropic", "google", "mistral", ...]
```

### 动态切换 Provider

```typescript
import { stream, getApiProvider } from "@mariozechner/pi-ai";

// 获取 Provider 信息
const openai = getApiProvider("openai");
const models = await openai.getModels();
console.log(models);

// 使用不同 Provider
const providers = ["openai", "anthropic", "google"];
for (const provider of providers) {
  const response = stream(`${provider}/default-model`, { ... });
  // ...
}
```

## 总结

pi-ai 的 Provider 注册机制设计得非常优雅：

1. **注册表模式** - 使用 Map 存储 Provider，支持动态注册/注销
2. **懒加载** - 通过动态导入（Dynamic Import）实现按需加载
3. **统一接口** - 所有 Provider 实现相同的 ApiProvider 接口
4. **自动注册** - 入口文件自动注册内置 Provider
5. **子路径导出** - 支持单独导入特定 Provider

这种设计让 pi-ai 既能支持大量 Provider，又保持了轻量和高效。

---

**下篇预告：**《流式响应与事件驱动架构》 - 深入理解 pi-ai 的流式处理机制。
