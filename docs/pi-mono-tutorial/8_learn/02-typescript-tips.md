# 22. TypeScript 高级技巧实践

问下大家，你有没有想过，优秀的 TypeScript 项目都用了哪些高级技巧？

OpenClaw 在阅读 pi-mono 源码的过程中，发现了很多 TypeScript 的高级用法。今天我们就来总结一下，从 pi-mono 中学到的 TypeScript 技巧。

## 1. 可辨识联合类型（Discriminated Unions）

### 应用场景

pi-ai 的 Message、Content、Event 类型都使用了可辨识联合。

### 代码示例

```typescript
// 基础类型
interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  source: "base64" | "url";
  data: string;
}

interface ToolCall {
  type: "tool_call";
  id: string;
  name: string;
}

// 联合类型
type Content = TextContent | ImageContent | ToolCall;

// 类型收窄
function processContent(content: Content) {
  switch (content.type) {
    case "text":
      // TypeScript 自动收窄为 TextContent
      console.log(content.text);
      break;
    case "image":
      // TypeScript 自动收窄为 ImageContent
      console.log(content.source, content.data);
      break;
    case "tool_call":
      // TypeScript 自动收窄为 ToolCall
      console.log(content.name);
      break;
  }
}
```

### 技巧要点

- **type 字段** - 使用字面量类型作为辨别字段
- **switch 收窄** - TypeScript 自动收窄类型
- ** exhaustiveness 检查** - 确保处理所有情况

## 2. 类型守卫（Type Guards）

### 应用场景

在 pi-agent 中用于运行时类型检查。

### 代码示例

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

// 自定义类型守卫
function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

// 过滤 undefined
const values = [1, undefined, 2, null, 3]
  .filter(isDefined);  // TypeScript 知道结果是 number[]
```

### 技巧要点

- **返回类型** - 使用 `value is Type` 语法
- **运行时检查** - 结合运行时类型检查
- **代码复用** - 可复用的类型守卫函数

## 3. 条件类型（Conditional Types）

### 应用场景

pi-ai 的 ApiOptions 映射使用了条件类型。

### 代码示例

```typescript
// 基础条件类型
type IsString<T> = T extends string ? true : false;

type A = IsString<string>;  // true
type B = IsString<number>;  // false

// 实际应用：根据 API 类型推断选项
type ApiOptions<T extends Api> = T extends "openai-completions"
  ? OpenAIStreamOptions
  : T extends "anthropic-messages"
  ? AnthropicStreamOptions
  : StreamOptions;

// 使用
const openaiOptions: ApiOptions<"openai-completions"> = {
  // TypeScript 知道这是 OpenAIStreamOptions
};

// 提取 Promise 返回值
type UnwrapPromise<T> = T extends Promise<infer R> ? R : T;

type Result = UnwrapPromise<Promise<string>>;  // string
```

### 技巧要点

- **extends** - 使用 extends 进行类型匹配
- **infer** - 使用 infer 提取类型
- **嵌套条件** - 支持嵌套条件类型

## 4. 映射类型（Mapped Types）

### 应用场景

pi-coding-agent 的配置类型转换使用了映射类型。

### 代码示例

```typescript
// 基础映射类型
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

type Partial<T> = {
  [P in keyof T]?: T[P];
};

type Required<T> = {
  [P in keyof T]-?: T[P];
};

// 实际应用：Provider 配置映射
type ProviderConfigMap = {
  [K in KnownProvider]: {
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
  };
};

// 使用
const configs: ProviderConfigMap = {
  openai: { apiKey: "xxx" },
  anthropic: { apiKey: "yyy" },
  // ... 必须包含所有 KnownProvider
};

// 键重映射
type EventPayloads = {
  [K in EventType as `on${Capitalize<K>}`]: EventPayload<K>;
};

// 结果：
// {
//   onMessageStart: MessageStartPayload,
//   onMessageUpdate: MessageUpdatePayload,
//   ...
// }
```

### 技巧要点

- **keyof** - 获取类型的所有键
- **in** - 遍历键
- **as** - 键重映射
- **修饰符** - readonly、?、-?

## 5. 模板字面量类型（Template Literal Types）

### 应用场景

pi-ai 的 Api 类型使用了模板字面量类型。

### 代码示例

```typescript
// 基础模板字面量
type Greeting = `Hello, ${string}`;

// 实际应用：API 标识
type Api = `${KnownProvider}/${string}`;

// 使用
const api: Api = "openai/gpt-4o";  // ✅
const invalid: Api = "unknown/model";  // ❌

// 组合模板
type EventName<T extends string> = `on${Capitalize<T>}`;
type ClickEvent = EventName<"click">;  // "onClick"

// 路径类型
type Path<T extends string[]> = T extends [infer F, ...infer R]
  ? F extends string
    ? R extends string[]
      ? `${F}/${Path<R>}`
      : F
    : never
  : "";

type MyPath = Path<["api", "v1", "users"]>;  // "api/v1/users"
```

### 技巧要点

- **${}** - 使用 ${} 插入类型
- **递归** - 可以递归构建复杂类型
- **验证** - 编译时验证字符串格式

## 6. 泛型约束（Generic Constraints）

### 应用场景

pi-agent 的工具系统使用了泛型约束。

### 代码示例

```typescript
// 基础约束
function logLength<T extends { length: number }>(arg: T): T {
  console.log(arg.length);
  return arg;
}

logLength("hello");  // ✅ string 有 length
logLength([1, 2, 3]);  // ✅ array 有 length
logLength(123);  // ❌ number 没有 length

// 多约束
interface HasName {
  name: string;
}

interface HasAge {
  age: number;
}

function greet<T extends HasName & HasAge>(person: T): string {
  return `Hello ${person.name}, you are ${person.age} years old`;
}

// keyof 约束
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: "Alice", age: 30 };
const name = getProperty(user, "name");  // TypeScript 知道是 string
const age = getProperty(user, "age");    // TypeScript 知道是 number
```

### 技巧要点

- **extends** - 使用 extends 约束泛型
- **&** - 使用 & 组合多个约束
- **keyof** - 使用 keyof 约束键类型

## 7. 类型推断（Type Inference）

### 应用场景

pi-mono 中大量使用类型推断减少冗余。

### 代码示例

```typescript
// 自动推断返回类型
function createMessage(role: "user" | "assistant", content: string) {
  return {
    role,
    content,
    timestamp: Date.now(),
  };
}

// TypeScript 自动推断返回类型为：
// { role: "user" | "assistant", content: string, timestamp: number }

// as const 推断
const config = {
  api: "openai",
  model: "gpt-4o",
} as const;

// config.api 类型是 "openai" 而不是 string

// 泛型推断
async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}

// 使用时指定类型
const user = await fetchData<User>("/api/user");

// 或者让 TypeScript 推断
const data = await fetchData("/api/user");  // 需要配合返回值类型
```

### 技巧要点

- **减少显式类型** - 让 TypeScript 自动推断
- **as const** - 使用 as const 获得字面量类型
- **泛型推断** - 从上下文推断泛型参数

## 8. 实用工具类型（Utility Types）

### 应用场景

pi-mono 中大量使用内置和自定义工具类型。

### 代码示例

```typescript
// 内置工具类型

// Pick - 选取部分属性
type MessagePreview = Pick<Message, "role" | "content">;

// Omit - 省略部分属性
type MessageWithoutId = Omit<Message, "id">;

// Extract - 提取联合类型中的子集
type TextContents = Extract<Content, { type: "text" }>;

// Exclude - 排除联合类型中的子集
type NonTextContents = Exclude<Content, { type: "text" }>;

// Record - 创建对象类型
type MessageMap = Record<string, Message>;

// Parameters - 获取函数参数类型
type StreamParams = Parameters<typeof stream>;

// ReturnType - 获取函数返回类型
type StreamReturn = ReturnType<typeof stream>;

// Awaited - 获取 Promise 返回值类型
type StreamValue = Awaited<ReturnType<typeof stream>>;

// 自定义工具类型

// DeepPartial - 深度 Partial
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Nullable - 可空类型
type Nullable<T> = T | null | undefined;

// NonNullable - 非空类型
type NonNull<T> = NonNullable<T>;

// Brand - 品牌类型（ nominal typing ）
type Brand<T, B> = T & { __brand: B };
type UserId = Brand<string, "UserId">;
type PostId = Brand<string, "PostId">;

const userId: UserId = "123" as UserId;
const postId: PostId = "456" as PostId;

// userId 和 postId 不能互换使用
```

### 技巧要点

- **组合使用** - 工具类型可以组合使用
- **自定义工具** - 根据需求自定义工具类型
- **品牌类型** - 使用品牌类型实现 nominal typing

## 9. 声明合并（Declaration Merging）

### 应用场景

扩展第三方库的类型定义。

### 代码示例

```typescript
// 扩展全局类型
declare global {
  interface Window {
    pi: PiAPI;
  }
}

// 使用
window.pi.sendMessage("Hello");

// 扩展模块类型
declare module "@mariozechner/pi-ai" {
  interface StreamOptions {
    // 添加自定义选项
    customOption?: string;
  }
}

// 扩展类声明
class Agent {
  run(): void;
}

interface Agent {
  stop(): void;  // 添加新方法
}

const agent = new Agent();
agent.run();   // ✅
agent.stop();  // ✅
```

### 技巧要点

- **global** - 使用 declare global 扩展全局
- **module** - 使用 declare module 扩展模块
- **interface** - 同名 interface 会自动合并

## 10. 类型安全的事件系统

### 应用场景

pi-tui 和 pi-web-ui 的事件系统。

### 代码示例

```typescript
// 类型安全的事件发射器
class TypedEventEmitter<Events extends Record<string, unknown>> {
  private listeners: {
    [K in keyof Events]?: Set<(data: Events[K]) => void>;
  } = {};
  
  on<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void
  ): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
    
    return () => {
      this.listeners[event]!.delete(listener);
    };
  }
  
  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const listeners = this.listeners[event];
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }
}

// 定义事件类型
interface AgentEvents {
  "message:start": { messageId: string };
  "message:update": { messageId: string; delta: string };
  "message:end": { messageId: string; finalContent: string };
  "tool:call": { toolCallId: string; name: string; args: unknown };
  "error": { error: Error };
}

// 使用
const emitter = new TypedEventEmitter<AgentEvents>();

emitter.on("message:start", (data) => {
  // TypeScript 知道 data 是 { messageId: string }
  console.log(data.messageId);
});

emitter.emit("message:start", { messageId: "123" });  // ✅
emitter.emit("message:start", { wrong: "data" });     // ❌ 类型错误
```

### 技巧要点

- **泛型约束** - 使用泛型约束事件类型
- **类型推断** - 事件数据自动推断
- **类型安全** - 编译时检查事件类型

## 总结

从 pi-mono 中学到的 TypeScript 技巧：

| 技巧 | 应用场景 | 核心价值 |
|-----|---------|---------|
| 可辨识联合 | Message/Event 类型 | 类型安全、自动收窄 |
| 类型守卫 | 运行时类型检查 | 代码复用、类型安全 |
| 条件类型 | ApiOptions 映射 | 动态类型推导 |
| 映射类型 | Provider 配置 | 批量类型转换 |
| 模板字面量 | API 标识 | 字符串类型验证 |
| 泛型约束 | 工具系统 | 灵活且安全 |
| 类型推断 | 减少冗余 | 简洁代码 |
| 工具类型 | 类型转换 | 代码复用 |
| 声明合并 | 扩展类型 | 增强第三方库 |
| 类型安全事件 | 事件系统 | 编译时检查 |

这些技巧让 pi-mono 的代码既类型安全又灵活，是 TypeScript 最佳实践的典范。

---

**至此，pi-mono 系列教程全部完成！** 🎉

感谢阅读！希望这个系列能帮助你深入理解 pi-mono 的架构设计和实现原理。
