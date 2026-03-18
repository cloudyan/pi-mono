# 高级使用模式与最佳实践

> **难度：专家** | **预计阅读时间：20 分钟**

掌握了 pi-ai 的基础用法后，如何将其应用到复杂的生产环境中？本文档分享一些高级使用模式和最佳实践，帮助你构建更强大的 AI 应用。

## 目录

1. [Agent Loop 模式](#agent-loop-模式)
2. [对话状态管理](#对话状态管理)
3. [流式 UI 更新](#流式-ui-更新)
4. [多模态处理](#多模态处理)
5. [性能优化](#性能优化)
6. [安全最佳实践](#安全最佳实践)

## Agent Loop 模式

### 基础 Agent Loop

```typescript
import {
  getModel,
  complete,
  Context,
  Tool,
  Type,
  AssistantMessage,
} from "@mariozechner/pi-ai";

class Agent {
  private context: Context;
  private model: Model<Api>;
  private tools: Tool[];
  private maxIterations: number;

  constructor(model: Model<Api>, tools: Tool[], systemPrompt: string) {
    this.model = model;
    this.tools = tools;
    this.maxIterations = 10;
    this.context = {
      systemPrompt,
      messages: [],
      tools,
    };
  }

  async run(userInput: string): Promise<AssistantMessage> {
    // 添加用户输入
    this.context.messages.push({
      role: "user",
      content: userInput,
      timestamp: Date.now(),
    });

    let iterations = 0;

    while (iterations < this.maxIterations) {
      // 调用模型
      const response = await complete(this.model, this.context);
      this.context.messages.push(response);

      // 检查是否需要工具调用
      const toolCalls = response.content.filter(
        (b) => b.type === "toolCall"
      );

      if (toolCalls.length === 0) {
        // 没有工具调用，直接返回结果
        return response;
      }

      // 执行工具调用
      for (const call of toolCalls) {
        const result = await this.executeTool(call);
        this.context.messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false,
          timestamp: Date.now(),
        });
      }

      iterations++;
    }

    throw new Error("达到最大迭代次数");
  }

  private async executeTool(call: ToolCall): Promise<unknown> {
    // 工具执行逻辑
    switch (call.name) {
      case "search":
        return await searchWeb(call.arguments.query);
      case "calculate":
        return eval(call.arguments.expression);
      default:
        throw new Error(`未知工具: ${call.name}`);
    }
  }
}

// 使用
const agent = new Agent(
  getModel("openai", "gpt-4o"),
  [searchTool, calculateTool],
  "你是一个 helpful 助手"
);

const result = await agent.run("搜索 TypeScript 最新版本并计算发布时间");
```

### 流式 Agent Loop

```typescript
async function* streamAgent(
  model: Model<Api>,
  context: Context,
): AsyncGenerator<AgentEvent> {
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    const stream = streamSimple(model, context);
    let assistantMessage: AssistantMessage | null = null;

    // 流式输出
    for await (const event of stream) {
      yield { type: "stream", event };

      if (event.type === "done") {
        assistantMessage = event.message;
      }
    }

    if (!assistantMessage) {
      throw new Error("流结束但没有消息");
    }

    context.messages.push(assistantMessage);

    // 检查工具调用
    const toolCalls = assistantMessage.content.filter(
      (b) => b.type === "toolCall"
    );

    if (toolCalls.length === 0) {
      yield { type: "complete", message: assistantMessage };
      return;
    }

    // 执行工具
    for (const call of toolCalls) {
      yield { type: "tool_start", toolCall: call };

      try {
        const result = await executeTool(call);
        context.messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false,
          timestamp: Date.now(),
        });

        yield { type: "tool_complete", toolCall: call, result };
      } catch (error) {
        context.messages.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: "text", text: String(error) }],
          isError: true,
          timestamp: Date.now(),
        });

        yield { type: "tool_error", toolCall: call, error };
      }
    }

    iterations++;
  }

  throw new Error("达到最大迭代次数");
}

// 使用
for await (const event of streamAgent(model, context)) {
  switch (event.type) {
    case "stream":
      if (event.event.type === "text_delta") {
        process.stdout.write(event.event.delta);
      }
      break;
    case "tool_start":
      console.log(`\n[调用工具: ${event.toolCall.name}]`);
      break;
    case "tool_complete":
      console.log(`[工具完成]`);
      break;
    case "complete":
      console.log("\n[完成]");
      break;
  }
}
```

## 对话状态管理

### 持久化存储

```typescript
import { Context, AssistantMessage } from "@mariozechner/pi-ai";

interface ConversationStore {
  save(id: string, context: Context): Promise<void>;
  load(id: string): Promise<Context | null>;
  list(): Promise<string[]>;
  delete(id: string): Promise<void>;
}

// 文件系统存储
class FileSystemStore implements ConversationStore {
  private dir: string;

  constructor(dir: string = "./conversations") {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  async save(id: string, context: Context): Promise<void> {
    const path = join(this.dir, `${id}.json`);
    await fs.promises.writeFile(path, JSON.stringify(context, null, 2));
  }

  async load(id: string): Promise<Context | null> {
    try {
      const path = join(this.dir, `${id}.json`);
      const data = await fs.promises.readFile(path, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async list(): Promise<string[]> {
    const files = await fs.promises.readdir(this.dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  async delete(id: string): Promise<void> {
    const path = join(this.dir, `${id}.json`);
    await fs.promises.unlink(path);
  }
}

// 使用
const store = new FileSystemStore();

// 保存对话
await store.save("conv-123", context);

// 加载对话
const restored = await store.load("conv-123");
if (restored) {
  const response = await complete(model, restored);
}
```

### 对话历史管理

```typescript
class ConversationManager {
  private context: Context;
  private maxMessages: number;
  private maxTokens: number;

  constructor(systemPrompt: string, maxMessages: number = 50) {
    this.context = {
      systemPrompt,
      messages: [],
    };
    this.maxMessages = maxMessages;
    this.maxTokens = 100000;
  }

  async addUserMessage(content: string): Promise<void> {
    this.context.messages.push({
      role: "user",
      content,
      timestamp: Date.now(),
    });

    await this.trimIfNeeded();
  }

  async addAssistantMessage(message: AssistantMessage): Promise<void> {
    this.context.messages.push(message);
    await this.trimIfNeeded();
  }

  private async trimIfNeeded(): Promise<void> {
    // 策略 1：限制消息数量
    while (this.context.messages.length > this.maxMessages) {
      // 保留系统消息和最近的对话
      const removed = this.context.messages.splice(0, 2); // 移除最早的一对问答
      console.log("移除旧消息:", removed.length);
    }

    // 策略 2：限制 Token 数（估算）
    const estimatedTokens = this.estimateTokens();
    if (estimatedTokens > this.maxTokens) {
      // 压缩或移除旧消息
      await this.compressOldMessages();
    }
  }

  private estimateTokens(): number {
    // 简单估算：1 token ≈ 4 字符
    const text = JSON.stringify(this.context.messages);
    return Math.ceil(text.length / 4);
  }

  private async compressOldMessages(): Promise<void> {
    // 将旧消息压缩为摘要
    const oldMessages = this.context.messages.slice(0, -10);
    const recentMessages = this.context.messages.slice(-10);

    const summaryModel = getModel("openai", "gpt-4o-mini");
    const summary = await complete(summaryModel, {
      messages: [
        {
          role: "user",
          content: `请总结以下对话的关键信息（100字以内）：\n${JSON.stringify(oldMessages)}`,
        },
      ],
    });

    this.context.messages = [
      {
        role: "assistant",
        ...summary,
      },
      ...recentMessages,
    ];
  }

  getContext(): Context {
    return this.context;
  }
}
```

## 流式 UI 更新

### React Hook

```typescript
import { useState, useCallback } from "react";
import {
  getModel,
  streamSimple,
  Context,
  AssistantMessageEvent,
} from "@mariozechner/pi-ai";

interface UseStreamingChatOptions {
  model: Model<Api>;
  systemPrompt?: string;
}

interface UseStreamingChatReturn {
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
}

export function useStreamingChat(
  options: UseStreamingChatOptions
): UseStreamingChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      // 添加用户消息
      const userMessage: Message = {
        role: "user",
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // 准备上下文
      const context: Context = {
        systemPrompt: options.systemPrompt,
        messages: [...messages, userMessage],
      };

      // 创建 AbortController
      abortControllerRef.current = new AbortController();
      setIsStreaming(true);

      // 添加空的助手消息
      const assistantMessageId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          isStreaming: true,
        },
      ]);

      try {
        const stream = streamSimple(options.model, context, {
          signal: abortControllerRef.current.signal,
        });

        let fullContent = "";

        for await (const event of stream) {
          if (event.type === "text_delta") {
            fullContent += event.delta;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: fullContent }
                  : msg
              )
            );
          } else if (event.type === "toolcall_start") {
            // 显示工具调用指示器
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, isUsingTool: true }
                  : msg
              )
            );
          }
        }

        // 标记完成
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, isStreaming: false, isUsingTool: false }
              : msg
          )
        );
      } catch (error) {
        console.error("Streaming error:", error);
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [options.model, options.systemPrompt, messages]
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
  };
}

// 使用
function ChatComponent() {
  const { messages, isStreaming, sendMessage, stopStreaming } =
    useStreamingChat({
      model: getModel("openai", "gpt-4o"),
      systemPrompt: "你是一个 helpful 助手",
    });

  return (
    <div>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && <StreamingIndicator />}
      <Input onSend={sendMessage} onStop={stopStreaming} />
    </div>
  );
}
```

### 打字机效果

```typescript
import { useState, useEffect } from "react";

function TypewriterText({ text, speed = 30 }: { text: string; speed?: number }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return <span>{displayedText}</span>;
}

// 在流式响应中使用
function StreamingMessage({ stream }: { stream: AssistantMessageEventStream }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const consumeStream = async () => {
      for await (const event of stream) {
        if (event.type === "text_delta") {
          setText((prev) => prev + event.delta);
        }
      }
    };

    consumeStream();
  }, [stream]);

  return <TypewriterText text={text} />;
}
```

## 多模态处理

### 图片分析流程

```typescript
import { readFileSync } from "fs";
import { getModel, complete, Context } from "@mariozechner/pi-ai";

async function analyzeImage(imagePath: string): Promise<string> {
  // 读取图片
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  // 选择视觉模型
  const visionModel = getModel("openai", "gpt-4o");

  // 验证模型支持图片
  if (!visionModel.input.includes("image")) {
    throw new Error("模型不支持图片输入");
  }

  const context: Context = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "详细描述这张图片的内容" },
          {
            type: "image",
            data: base64Image,
            mimeType: "image/png",
          },
        ],
      },
    ],
  };

  const response = await complete(visionModel, context);

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// 批量处理
async function analyzeImages(imagePaths: string[]): Promise<string[]> {
  const results = await Promise.all(
    imagePaths.map((path) => analyzeImage(path))
  );
  return results;
}
```

### 多轮图片对话

```typescript
async function multiTurnImageChat() {
  const visionModel = getModel("openai", "gpt-4o");
  const context: Context = {
    messages: [],
  };

  // 第 1 轮：发送图片
  const image1 = readFileSync("chart1.png").toString("base64");
  context.messages.push({
    role: "user",
    content: [
      { type: "text", text: "分析这张图表" },
      { type: "image", data: image1, mimeType: "image/png" },
    ],
  });

  const response1 = await complete(visionModel, context);
  context.messages.push(response1);

  // 第 2 轮：发送另一张图片进行对比
  const image2 = readFileSync("chart2.png").toString("base64");
  context.messages.push({
    role: "user",
    content: [
      { type: "text", text: "与这张图表对比有什么差异？" },
      { type: "image", data: image2, mimeType: "image/png" },
    ],
  });

  const response2 = await complete(visionModel, context);

  return response2;
}
```

## 性能优化

### 并发控制

```typescript
import pLimit from "p-limit";

const limit = pLimit(5); // 最多 5 个并发请求

async function batchProcess(
  queries: string[],
  model: Model<Api>
): Promise<AssistantMessage[]> {
  const promises = queries.map((query) =>
    limit(async () => {
      const context: Context = {
        messages: [{ role: "user", content: query }],
      };
      return await complete(model, context);
    })
  );

  return await Promise.all(promises);
}
```

### 缓存策略

```typescript
import NodeCache from "node-cache";

const responseCache = new NodeCache({ stdTTL: 3600 }); // 1 小时缓存

async function completeWithCache(
  model: Model<Api>,
  context: Context
): Promise<AssistantMessage> {
  const cacheKey = JSON.stringify({ model: model.id, context });

  const cached = responseCache.get<AssistantMessage>(cacheKey);
  if (cached) {
    console.log("缓存命中");
    return cached;
  }

  const response = await complete(model, context);
  responseCache.set(cacheKey, response);

  return response;
}
```

### 流式批处理

```typescript
async function* streamBatch(
  queries: string[],
  model: Model<Api>
): AsyncGenerator<{ query: string; event: AssistantMessageEvent }> {
  const streams = queries.map((query) => ({
    query,
    stream: streamSimple(model, {
      messages: [{ role: "user", content: query }],
    }),
  }));

  // 使用 Promise.race 实现多流交错
  const iterators = streams.map(({ query, stream }) => ({
    query,
    iterator: stream[Symbol.asyncIterator](),
  }));

  while (iterators.length > 0) {
    const races = iterators.map(async ({ query, iterator }, index) => {
      const result = await iterator.next();
      return { query, result, index };
    });

    const { query, result, index } = await Promise.race(races);

    if (result.done) {
      iterators.splice(index, 1);
    } else {
      yield { query, event: result.value };
    }
  }
}
```

## 安全最佳实践

### API Key 管理

```typescript
// 永远不要在前端暴露 API Key
// 使用环境变量或密钥管理服务

// ✅ 正确：服务端调用
import { getModel, complete } from "@mariozechner/pi-ai";

const model = getModel("openai", "gpt-4o");
const response = await complete(model, context, {
  apiKey: process.env.OPENAI_API_KEY,
});

// ❌ 错误：前端暴露 API Key
// 浏览器中：
const response = await complete(model, context, {
  apiKey: "sk-xxx", // 危险！任何人都可以提取这个 key
});
```

### 输入验证

```typescript
import { z } from "zod";

const userInputSchema = z.object({
  message: z.string().max(4000), // 限制输入长度
  conversationId: z.string().uuid(),
});

async function handleChatRequest(req: Request) {
  const validated = userInputSchema.parse(req.body);

  // 额外的内容过滤
  if (containsSensitiveContent(validated.message)) {
    throw new Error("内容包含敏感信息");
  }

  // 继续处理...
}

function containsSensitiveContent(text: string): boolean {
  // 检查信用卡号、密码等敏感信息
  const patterns = [
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // 信用卡
    /password[:\s]+\S+/i, // 密码
    /api[_-]?key[:\s]+\S+/i, // API Key
  ];

  return patterns.some((pattern) => pattern.test(text));
}
```

### 输出过滤

```typescript
async function safeComplete(
  model: Model<Api>,
  context: Context
): Promise<AssistantMessage> {
  const response = await complete(model, context);

  // 检查输出内容
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (containsInappropriateContent(text)) {
    throw new Error("生成内容包含不当信息");
  }

  return response;
}

function containsInappropriateContent(text: string): boolean {
  // 实现内容安全检查
  // 可以使用第三方服务如 Azure Content Safety
  return false;
}
```

### 速率限制

```typescript
import { RateLimiter } from "limiter";

const limiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: "minute",
});

async function rateLimitedComplete(
  userId: string,
  model: Model<Api>,
  context: Context
): Promise<AssistantMessage> {
  // 检查用户速率限制
  const userLimiter = getUserLimiter(userId);

  if (!(await userLimiter.tryRemoveTokens(1))) {
    throw new Error("请求过于频繁，请稍后再试");
  }

  return await complete(model, context);
}

const userLimiters = new Map<string, RateLimiter>();

function getUserLimiter(userId: string): RateLimiter {
  if (!userLimiters.has(userId)) {
    userLimiters.set(
      userId,
      new RateLimiter({
        tokensPerInterval: 20,
        interval: "hour",
      })
    );
  }
  return userLimiters.get(userId)!;
}
```

## 总结

本文档介绍了 pi-ai 的高级使用模式：

1. **Agent Loop**：构建自主运行的 AI Agent
2. **状态管理**：持久化存储和对话历史管理
3. **流式 UI**：React Hook 和打字机效果
4. **多模态**：图片分析和多轮对话
5. **性能优化**：并发控制、缓存、批处理
6. **安全实践**：API Key 管理、输入输出过滤、速率限制

掌握这些模式后，你可以构建生产级的 AI 应用。

---

**系列完结**：恭喜你完成了 pi-ai 深入浅出系列教程！
