# 6. 流式响应与事件驱动架构

问下大家，你在使用 ChatGPT 的时候，有没有注意到它的回复是**一个字一个字**蹦出来的？

这就是**流式响应（Streaming Response）**。如果等整个回复生成完再显示，用户可能要等好几秒，体验很差。流式响应让用户能实时看到 AI 的思考过程。

pi-ai 的流式响应是怎么实现的？今天我们就来深入剖析。

## 流式响应的原理

### 传统方式 vs 流式方式

**传统方式（阻塞式）：**
```
用户提问 -> 等待 AI 生成完整回复 -> 显示完整回复
              ↑
         用户等待 5-10 秒
```

**流式方式（增量式）：**
```
用户提问 -> 收到第一个字 -> 显示第一个字
         -> 收到第二个字 -> 显示第二个字
         -> ...
         -> 收到最后一个字 -> 显示完成
```

### HTTP 流式传输

流式响应基于 HTTP 的 **Chunked Transfer Encoding**：

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Transfer-Encoding: chunked

{"choices":[{"delta":{"content":"Hello"}}]}
{"choices":[{"delta":{"content":" world"}}]}
{"choices":[{"delta":{"content":"!"}}]}
```

## pi-ai 的流式架构

```mermaid
flowchart TB
    subgraph "应用层"
        A[for await of stream]
    end
    
    subgraph "Event Generator"
        EG[async function* stream\(\)<br/>AsyncGenerator]
    end
    
    subgraph "Provider 适配层"
        OS[OpenAI Stream]
        UE[统一事件]
        AS[Anthropic Stream]
    end
    
    subgraph "HTTP 流式响应"
        HTTP[fetch\(\) + ReadableStream]
    end
    
    A --> EG
    EG --> OS
    EG --> AS
    OS --> UE
    AS --> UE
    UE --> HTTP
```

## 核心实现

### stream() 函数

```typescript
// packages/ai/src/stream.ts

export async function* stream(
  api: Api,
  options: StreamOptions
): AsyncGenerator<AgentMessageEvent> {
  // 1. 解析 API 标识
  const [providerName, modelId] = api.split("/");
  
  // 2. 获取 Provider
  const provider = getApiProvider(providerName);
  
  // 3. 调用 Provider 的 stream 方法
  const providerStream = await provider.stream(modelId, options);
  
  // 4. 转发事件
  for await (const event of providerStream) {
    yield event;
  }
}
```

**关键点：**
- 使用 `async function*` 定义异步生成器
- 返回 `AsyncGenerator<AgentMessageEvent>`
- 使用 `yield` 产生事件

### 异步生成器详解

```typescript
// 异步生成器函数
async function* generateEvents(): AsyncGenerator<AgentMessageEvent> {
  yield { type: "start" };
  
  yield { type: "text_start" };
  yield { type: "text_delta", data: "Hello" };
  yield { type: "text_delta", data: " world" };
  yield { type: "text_delta", data: "!" };
  yield { type: "text_end" };
  
  yield { type: "done" };
}

// 消费异步生成器
async function consume() {
  for await (const event of generateEvents()) {
    console.log(event);
  }
}
```

## Provider 流式实现

### OpenAI 流解析

```typescript
// packages/ai/src/providers/openai.ts

async function* parseOpenAIStream(
  response: Response
): AsyncGenerator<AgentMessageEvent> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }
  
  // 发送开始事件
  yield { type: "start" };
  yield { type: "text_start" };
  
  const decoder = new TextDecoder();
  let buffer = "";
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // 解码二进制数据
      buffer += decoder.decode(value, { stream: true });
      
      // OpenAI 的流格式：
      // data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n
      // data: {"choices":[{"delta":{"content":" world"}}]}\n\n
      
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // 保留不完整的行
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6); // 去掉 "data: "
          
          if (data === "[DONE]") {
            yield { type: "text_end" };
            yield { type: "done" };
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;
            
            // 文本增量
            if (delta?.content) {
              yield { type: "text_delta", data: delta.content };
            }
            
            // 工具调用
            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                if (toolCall.id) {
                  yield {
                    type: "toolcall_start",
                    id: toolCall.id,
                    name: toolCall.function.name,
                  };
                }
                if (toolCall.function?.arguments) {
                  yield {
                    type: "toolcall_delta",
                    id: toolCall.index.toString(),
                    arguments: toolCall.function.arguments,
                  };
                }
              }
            }
          } catch (e) {
            console.warn("Failed to parse SSE data:", data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  
  yield { type: "text_end" };
  yield { type: "done" };
}
```

### Anthropic 流解析

```typescript
// packages/ai/src/providers/anthropic.ts

async function* parseAnthropicStream(
  response: Response
): AsyncGenerator<AgentMessageEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  
  yield { type: "start" };
  
  const decoder = new TextDecoder();
  let buffer = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      
      const data = line.slice(6);
      
      try {
        const event = JSON.parse(data);
        
        switch (event.type) {
          case "content_block_start":
            if (event.content_block.type === "thinking") {
              yield { type: "thinking_start" };
            } else if (event.content_block.type === "text") {
              yield { type: "text_start" };
            }
            break;
            
          case "content_block_delta":
            if (event.delta.type === "thinking_delta") {
              yield { type: "thinking_delta", data: event.delta.thinking };
            } else if (event.delta.type === "text_delta") {
              yield { type: "text_delta", data: event.delta.text };
            }
            break;
            
          case "content_block_stop":
            // 根据当前块类型发送结束事件
            break;
        }
      } catch (e) {
        console.warn("Failed to parse event:", data);
      }
    }
  }
  
  yield { type: "done" };
}
```

## 事件流处理模式

### 模式 1：实时显示

```typescript
async function realtimeDisplay(stream: AsyncGenerator<AgentMessageEvent>) {
  let currentText = "";
  
  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
        currentText += event.data;
        // 实时更新 UI
        updateUI(currentText);
        break;
        
      case "done":
        console.log("Complete:", currentText);
        break;
        
      case "error":
        console.error("Error:", event.error);
        break;
    }
  }
}
```

### 模式 2：收集完整消息

```typescript
async function collectMessage(stream: AsyncGenerator<AgentMessageEvent>): Promise<string> {
  let text = "";
  
  for await (const event of stream) {
    if (event.type === "text_delta") {
      text += event.data;
    }
  }
  
  return text;
}

// 使用
const message = await collectMessage(stream("openai/gpt-4o", options));
console.log(message);
```

### 模式 3：处理工具调用

```typescript
async function handleWithTools(stream: AsyncGenerator<AgentMessageEvent>) {
  const toolCalls: Map<string, { name: string; args: string }> = new Map();
  
  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
        process.stdout.write(event.data);
        break;
        
      case "toolcall_start":
        toolCalls.set(event.id, { name: event.name, args: "" });
        console.log(`\n[Tool: ${event.name}]`);
        break;
        
      case "toolcall_delta":
        const tool = toolCalls.get(event.id);
        if (tool) {
          tool.args += event.arguments;
        }
        break;
        
      case "toolcall_end":
        const completed = toolCalls.get(event.id);
        if (completed) {
          const args = JSON.parse(completed.args);
          const result = await executeTool(completed.name, args);
          console.log(`[Result: ${result}]`);
        }
        break;
    }
  }
}
```

### 模式 4：处理思考/推理

```typescript
async function handleWithThinking(stream: AsyncGenerator<AgentMessageEvent>) {
  let thinking = "";
  let answer = "";
  let isThinking = false;
  
  for await (const event of stream) {
    switch (event.type) {
      case "thinking_start":
        isThinking = true;
        console.log("[Thinking...]");
        break;
        
      case "thinking_delta":
        thinking += event.data;
        break;
        
      case "thinking_end":
        isThinking = false;
        console.log("\n[Thinking complete]");
        break;
        
      case "text_delta":
        answer += event.data;
        process.stdout.write(event.data);
        break;
    }
  }
  
  return { thinking, answer };
}
```

## 取消流式请求

使用 `AbortSignal` 取消正在进行的流式请求：

```typescript
const controller = new AbortController();

// 启动流式请求
const stream = stream("openai/gpt-4o", {
  messages: [...],
  signal: controller.signal, // 传入 signal
});

// 5 秒后取消
setTimeout(() => {
  controller.abort();
}, 5000);

try {
  for await (const event of stream) {
    console.log(event);
  }
} catch (error) {
  if (error.name === "AbortError") {
    console.log("Stream aborted");
  }
}
```

## 错误处理

```typescript
async function safeStream(stream: AsyncGenerator<AgentMessageEvent>) {
  try {
    for await (const event of stream) {
      if (event.type === "error") {
        console.error("Stream error:", event.error);
        // 可以选择继续或中断
        continue;
      }
      
      // 处理正常事件...
    }
  } catch (error) {
    console.error("Unexpected error:", error);
  }
}
```

## 性能优化

### 1. 背压控制

如果消费速度跟不上生产速度，可以使用背压控制：

```typescript
async function* withBackPressure<T>(
  stream: AsyncGenerator<T>,
  maxBuffer: number
): AsyncGenerator<T> {
  const buffer: T[] = [];
  
  for await (const item of stream) {
    buffer.push(item);
    
    // 缓冲区满了，暂停读取
    while (buffer.length > maxBuffer) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    yield buffer.shift()!;
  }
  
  // 清空缓冲区
  while (buffer.length > 0) {
    yield buffer.shift()!;
  }
}
```

### 2. 批处理

对于高频事件，可以批量处理：

```typescript
async function* batchEvents<T>(
  stream: AsyncGenerator<T>,
  maxSize: number,
  maxWait: number
): AsyncGenerator<T[]> {
  let batch: T[] = [];
  let timeout: NodeJS.Timeout | null = null;
  
  for await (const event of stream) {
    batch.push(event);
    
    if (batch.length >= maxSize) {
      yield batch;
      batch = [];
      if (timeout) clearTimeout(timeout);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        if (batch.length > 0) {
          yield batch;
          batch = [];
        }
        timeout = null;
      }, maxWait);
    }
  }
  
  if (batch.length > 0) {
    yield batch;
  }
}
```

## 总结

pi-ai 的流式响应设计非常优雅：

1. **异步生成器** - 使用 `async function*` 实现流式输出
2. **统一事件协议** - 所有 Provider 转换为统一的 AgentMessageEvent
3. **实时处理** - 支持实时显示、工具调用、思考/推理等多种模式
4. **可取消** - 使用 AbortSignal 支持取消请求
5. **错误处理** - 统一的错误事件处理机制

这种设计让流式响应变得简单直观，开发者无需关心底层 HTTP 细节。

---

**下篇预告：**《Agent 核心概念：状态、消息、事件流》 - 开始深入 pi-agent 运行时。
