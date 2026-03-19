# packages/ai 问题解答

## 目录

- [packages/ai 问题解答](#packagesai-问题解答)
  - [目录](#目录)
  - [1. 对于 const model = getModel('openai', 'gpt-4o-mini'); model 相关的配置从哪里来的？](#1-对于-const-model--getmodelopenai-gpt-4o-mini-model-相关的配置从哪里来的)
  - [2. maxTokens 配置与截断检测](#2-maxtokens-配置与截断检测)
  - [3. TypeBox vs Zod 什么差别，优劣？\*\*](#3-typebox-vs-zod-什么差别优劣)
  - [4. stream() 返回的是什么？result() 方法的作用](#4-stream-返回的是什么result-方法的作用)
  - [5. budgetTokens 是什么作用，还可以 -1 设置动态？](#5-budgettokens-是什么作用还可以--1-设置动态)
  - [6. 中止的消息可以添加到对话上下文并在后续请求中继续？](#6-中止的消息可以添加到对话上下文并在后续请求中继续)


## 1. 对于 const model = getModel('openai', 'gpt-4o-mini'); model 相关的配置从哪里来的？

**A: 配置来源与机制**

```typescript
const model = getModel('openai', 'gpt-4o-mini');
// 返回完整的 Model 对象，包含 contextWindow、maxTokens、cost 等
```

**配置存储位置：**

| 文件 | 作用 |
|------|------|
| `packages/ai/src/models.generated.ts` | 预定义所有模型配置（自动生成） |
| `packages/ai/src/models.ts` | 模型注册表和 getModel() 函数 |
| `packages/ai/src/types.ts` | Model 接口定义 |

**配置获取流程：**

1. **预定义配置**：所有模型的上下文长度、最大 token 数、成本等信息预定义在 `models.generated.ts`

2. **自动生成**：通过 `npm run generate-models` 脚本从各提供商 API 自动获取更新

3. **类型安全**：使用 TypeScript `satisfies` 确保配置符合 `Model` 接口

4. **运行时查找**：模块加载时注册到 `modelRegistry` Map，`getModel()` 直接查找返回

**Model 接口关键字段：**

```typescript
interface Model<TApi> {
  id: string;              // 模型 ID，如 "gpt-4o-mini"
  name: string;            // 显示名称
  api: TApi;               // API 类型
  provider: Provider;      // 提供商
  contextWindow: number;   // 上下文窗口大小（输入限制）
  maxTokens: number;       // 最大输出 token 数
  cost: {                  // 成本（$/million tokens）
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  // ...
}
```

**使用示例：**

```typescript
const model = getModel('openai', 'gpt-4o-mini');
console.log(model.contextWindow);  // 128000
console.log(model.maxTokens);      // 16384
console.log(model.cost.input);     // 0.15
```

## 2. maxTokens 配置与截断检测

**Q: `maxTokens` 应该配置多大？**

A: 不要无脑设最大，应该根据场景预估：

```typescript
// 简单问答
await complete(model, context, { maxTokens: 1024 });

// 代码生成
await complete(model, context, { maxTokens: 4096 });

// 长文写作（使用模型上限）
await complete(model, context, { maxTokens: model.maxTokens });
```

**配置层级**（优先级从高到低）：
1. 运行时传入参数 `{ maxTokens: 2048 }`
2. 配置文件默认值
3. 模型定义值（`model.maxTokens` - 能力上限）

**Q: 输出超过 maxTokens 会怎样？**

A: 会被截断，内容不完整。pi-ai 提供截断检测机制：

```typescript
// 流式检测
for await (const event of stream) {
  if (event.type === 'done' && event.reason === 'length') {
    console.warn('输出被截断！');
    // 处理续写逻辑
  }
}

// 非流式检测
const response = await complete(model, context, { maxTokens: 1000 });
if (response.stopReason === 'length') {
  console.warn('输出被截断！');
}
```

`StopReason` 类型：`"stop" | "length" | "toolUse" | "error" | "aborted"`

- `"length"` - 达到 maxTokens 限制，输出被截断
- `"stop"` - 正常完成
- `"toolUse"` - 因工具调用而停止

## 3. TypeBox vs Zod 什么差别，优劣？**

pi-ai 定义工具（使用 TypeBox 实现类型安全）

A: 两者都是 TypeScript 运行时类型验证库，但设计理念不同：

| 特性 | **TypeBox** | **Zod** |
|------|-------------|---------|
| **核心理念** | JSON Schema 是原生格式，TypeScript 类型由 Schema 推导 | TypeScript 优先，通过 Schema 推导静态类型 |
| **JSON Schema** | 原生输出，符合标准 | 需要 `z.toJSONSchema()` 转换，部分类型无法表示 |
| **性能** | 极快（JIT 编译） | Zod 4 大幅提升（14x 字符串解析） |
| **Bundle 大小** | 更小（无运行时依赖） | ~2kb (core) / ~17kb (full) |
| **社区规模** | ~5.6k stars | ~37.5k stars |

**Schema 定义对比：**

```typescript
// TypeBox: JSON Schema → TypeScript 类型
import { Type, Static } from '@sinclair/typebox';

const UserSchema = Type.Object({
  name: Type.String(),
  age: Type.Number(),
});
type User = Static<typeof UserSchema>; // { name: string; age: number; }

// 原生 JSON Schema 输出
console.log(UserSchema);
// { type: 'object', properties: { name: { type: 'string' }, ... } }
```

```typescript
// Zod: TypeScript 类型 ← Schema 定义
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
});
type User = z.infer<typeof UserSchema>; // { name: string; age: number; }

// 需要转换才能获得 JSON Schema
import { zodToJsonSchema } from 'zod-to-json-schema';
const jsonSchema = zodToJsonSchema(UserSchema);
```

**选择建议：**

- **选 TypeBox**: 需要标准 JSON Schema（如 API 文档、LLM 工具定义）、追求性能、Schema 作为"真相来源"
- **选 Zod**: 更看重开发体验、需要丰富的类型变换（`.transform()`、`.refine()`）、团队已熟悉 Zod

**pi-ai 为什么选择 TypeBox？**

1. **LLM 工具调用需要 JSON Schema**: OpenAI、Anthropic 等提供商的工具定义都使用 JSON Schema 格式
2. **类型推导更直接**: Schema 即类型，无需额外转换
3. **性能优势**: JIT 编译器可为高频验证场景生成优化代码
4. **零依赖**: 更小的包体积

```typescript
// pi-ai 中的工具定义示例
import { Type, Static } from '@sinclair/typebox';

const CalculatorSchema = Type.Object({
  operation: Type.Union([
    Type.Literal('add'),
    Type.Literal('subtract'),
    Type.Literal('multiply'),
    Type.Literal('divide'),
  ]),
  a: Type.Number(),
  b: Type.Number(),
});

type CalculatorInput = Static<typeof CalculatorSchema>;

// 直接用于 LLM 工具定义
const tool = {
  name: 'calculator',
  description: '执行数学运算',
  parameters: CalculatorSchema, // 直接传递 JSON Schema
};
```

## 4. stream() 返回的是什么？result() 方法的作用

**Q: `const s = stream(model, context)` 返回的 `s` 是流还是 Promise？`

**A: `s` 是 `AssistantMessageEventStream`，具有双重特性：**

| 特性 | 说明 |
|------|------|
| **AsyncIterable** | 可以用 `for await...of` 遍历事件流 |
| **Promise-like** | 有 `.result()` 方法，返回 Promise |

**源码定义**（`packages/ai/src/utils/event-stream.ts`）：

```typescript
export interface AssistantMessageEventStream extends AsyncIterable<AssistantMessageEvent> {
  [Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent>;
  result(): Promise<AssistantMessage>;  // ← 获取最终结果
}
```

**Q: `await s.result()` 返回什么？**

**A: 返回 `Promise<AssistantMessage>`，包含完整消息：**

```typescript
interface AssistantMessage {
  type: "assistant";
  content: string;           // 完整文本内容
  reasoning?: string;        // 推理过程
  toolCalls?: ToolCall[];    // 工具调用
  usage?: Usage;             // Token 使用量
  stopReason: StopReason;    // 停止原因
  errorMessage?: string;     // 错误信息
}
```

**三种使用方式：**

```typescript
import { stream, streamSimple, complete } from '@pi-mono/ai';

// 方式 1: 仅获取最终结果（不处理中间事件）
const s = stream(model, context);
const final = await s.result();
console.log(final.content);

// 方式 2: 遍历事件流 + 获取最终结果
const s = stream(model, context);
for await (const event of s) {
  if (event.type === 'text') {
    process.stdout.write(event.content);  // 实时输出
  }
}
const final = await s.result();  // 获取完整结果
console.log('\n总 token:', final.usage?.totalTokens);

// 方式 3: 使用 streamSimple（简化版，无 .result()）
const stream = await streamSimple(model, context);
for await (const chunk of stream) {
  console.log(chunk.content);
}
// 注意：streamSimple 没有 .result()，需手动收集
```

**API 对比：**

| 函数 | 返回类型 | 特点 |
|------|----------|------|
| `stream()` | `AssistantMessageEventStream` | 完整事件流 + `.result()` 方法 |
| `streamSimple()` | `AsyncIterable<TextStreamChunk>` | 简化版，只有文本内容 |
| `complete()` | `Promise<AssistantMessage>` | 非流式，直接返回完整结果 |


## 5. budgetTokens 是什么作用，还可以 -1 设置动态？

**A: `budgetTokens` 是 Google Gemini 模型推理/思考（thinking）功能的 token 预算参数**

**Google Gemini 的 `thinkingBudget` 参数：**

| 值 | 含义 | 适用模型 |
|----|------|----------|
| `-1` | **动态模式**：API 根据任务复杂度自动决定思考预算 | Gemini 2.5 系列 |
| `0` | **禁用思考** | Gemini 2.5 Flash |
| `1 ~ 32768` | **固定预算**：指定具体的思考 token 数量 | Gemini 2.5 系列 |
| `thinkingLevel` | **级别模式**：`"LOW"` / `"HIGH"` | Gemini 3 系列 |

**使用示例：**

```typescript
import { complete } from '@mariozechner/pi-ai';

const googleModel = getModel('google', 'gemini-2.5-flash');

// -1 = 动态模式（API 自动决定）
await complete(googleModel, context, {
  thinking: {
    enabled: true,
    budgetTokens: -1
  }
});

// 固定预算
await complete(googleModel, context, {
  thinking: {
    enabled: true,
    budgetTokens: 8192
  }
});
```

**多 Provider 适配说明：**

pi-ai 统一了多提供商的推理接口，但底层实现不同：

| Provider | 参数 | 动态模式 |
|----------|------|----------|
| **Google** | `budgetTokens: number` / `thinkingLevel: enum` | `-1` 表示动态 |
| **Anthropic** | `thinkingBudgetTokens: number` / `effort: enum` | 无 `-1`，新模型用 `adaptive` |
| **OpenAI** | `reasoningEffort: enum` | 无 `-1`，用 `"low"` / `"medium"` / `"high"` |

**推荐使用统一接口：**

```typescript
import { completeSimple } from '@mariozechner/pi-ai';

// pi-ai 自动映射到各 Provider 的对应参数
const response = await completeSimple(model, context, {
  reasoning: 'medium'  // 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
});
```

**默认预算映射（使用 reasoning 级别时）：**

| 级别 | Gemini 2.5 Pro | Gemini 2.5 Flash | Gemini 3 | 其他 |
|------|----------------|------------------|----------|------|
| `minimal` | 128 | 128 | `LOW` | -1 |
| `low` | 2048 | 2048 | `LOW` | -1 |
| `medium` | 8192 | 8192 | `HIGH` | -1 |
| `high` | 32768 | 24576 | `HIGH` | -1 |

**重要提示：**
- `budgetTokens: -1` 是 **Google Gemini API 原生支持**的参数值
- Gemini 2.5 系列用 `thinkingBudget`，Gemini 3 系列用 `thinkingLevel`，两者不能混用
- Anthropic 和 OpenAI 没有 `-1` 概念，pi-ai 在内部自动转换


## 6. 中止的消息可以添加到对话上下文并在后续请求中继续？

**A: 这是 pi-ai 的一个强大特性：即使请求被中止，已生成的部分内容也可以被保留并用于继续对话。**

**核心概念**

当你主动中止（取消）一个正在进行的 AI 请求后，**已经生成的部分回复内容可以被保留下来**，作为对话历史的一部分，然后在新的请求中继续对话。

**典型使用场景**

| 场景 | 说明 |
|------|------|
| **节省 Token** | 不需要重新生成前面的内容 |
| **控制响应长度** | 先快速预览，再决定是否需要更多 |
| **流式交互** | 类似 ChatGPT 的"继续生成"功能 |
| **避免重复** | 保留已生成的思考过程或内容 |

**代码示例**

```typescript
const context = {
  messages: [
    { role: 'user', content: '详细解释量子计算' }
  ]
};

// 第一个请求在 2 秒后中止（只拿到了部分内容）
const controller1 = new AbortController();
setTimeout(() => controller1.abort(), 2000);

const partial = await complete(model, context, { signal: controller1.signal });

// 关键：将部分响应添加到上下文
context.messages.push(partial);  // ← 保存已生成的内容
context.messages.push({ role: 'user', content: '请继续' });  // ← 要求继续

// 继续对话（AI 会接着刚才的内容继续生成）
const continuation = await complete(model, context);
```

**关键点说明**

1. **`partial` 包含什么**：虽然请求被中止，但 `partial` 是一个完整的 `AssistantMessage` 对象，包含了已生成的部分内容、token 使用量等信息

2. **`stopReason` 标识**：被中止的消息的 `stopReason` 会是 `"aborted"`，而不是正常的 `"stop"`

3. **为什么能继续**：LLM 看到对话历史中有不完整的助手回复，再看到用户说"请继续"，就会理解需要接着之前的内容继续生成

4. **跨 Provider 支持**：pi-ai 支持在不同 Provider 之间继续对话，思考块等内容会自动转换格式

**实际应用示例**

```typescript
// 场景：生成长篇文章，分段获取
const context = { messages: [{ role: 'user', content: '写一篇关于 AI 的 5000 字文章' }] };

// 第一段：获取开头部分
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // 5秒后中止
const part1 = await complete(model, context, { signal: controller.signal });

// 保存并继续
context.messages.push(part1);
context.messages.push({ role: 'user', content: '继续写下去' });
const part2 = await complete(model, context);

// 合并结果
const fullArticle = part1.content + part2.content;
```

这种机制让你可以更灵活地控制 AI 的响应，实现类似"暂停-继续"的交互体验。
