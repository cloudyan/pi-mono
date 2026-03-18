# 9. 工具调用与执行模式

问下大家，你有没有用过 ChatGPT 的插件功能？比如让它帮你查天气、算数学题、搜索网页？

这些功能背后就是**工具调用（Tool Calling）**。工具调用让 LLM 不再只是"聊天"，而是能真正"做事"。

pi-agent 的工具系统设计得非常灵活，支持顺序执行、并行执行，还能自定义工具行为。今天我们就来深入剖析。

## 什么是工具调用？

### 工具调用的流程

```
用户提问
    │
    ▼
"北京今天天气怎么样？"
    │
    ▼
┌─────────────────┐
│      LLM       │
│  "我来查一下"   │
│  [调用工具]     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  get_weather    │
│  {city: "北京"} │
└────────┬────────┘
         │
         ▼
    "晴天 25°C"
         │
         ▼
┌─────────────────┐
│      LLM       │
│ "北京今天晴天， │
│  25°C"          │
└─────────────────┘
```

### 工具调用的本质

工具调用其实是 LLM 的**函数调用能力**：

1. **定义工具** - 告诉 LLM 有哪些工具可用
2. **生成调用** - LLM 决定什么时候调用哪个工具
3. **执行工具** - Agent 实际执行工具代码
4. **返回结果** - 将结果反馈给 LLM
5. **生成回复** - LLM 基于结果生成最终回复

## pi-agent 的工具系统

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                     工具系统架构                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  工具定义层                          │   │
│  │  Tool {                                             │   │
│  │    name: string;                                    │   │
│  │    description: string;                             │   │
│  │    parameters: JSONSchema;                          │   │
│  │    execute: (args) => Promise<string>;              │   │
│  │  }                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  工具调用层                          │   │
│  │  ToolCall {                                         │   │
│  │    id: string;                                      │   │
│  │    name: string;                                    │   │
│  │    arguments: Record<string, unknown>;              │   │
│  │  }                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  执行层                              │   │
│  │  - 顺序执行 (sequential)                            │   │
│  │  - 并行执行 (parallel)                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  钩子层                              │   │
│  │  - beforeToolCall                                   │   │
│  │  - afterToolCall                                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 工具定义

### Tool 接口

```typescript
// packages/agent/src/types.ts

export interface Tool {
  /** 工具名称（唯一标识） */
  name: string;
  
  /** 工具描述（LLM 用来理解工具用途） */
  description: string;
  
  /** 参数定义（JSON Schema 格式） */
  parameters: ToolParameters;
  
  /** 执行函数 */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;  // 用于数组类型
}
```

### 工具定义示例

#### 天气查询工具

```typescript
const weatherTool: Tool = {
  name: "get_weather",
  description: "Get the current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "The name of the city",
      },
      unit: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        description: "Temperature unit",
      },
    },
    required: ["city"],
  },
  execute: async (args) => {
    const { city, unit = "celsius" } = args;
    // 调用天气 API
    const response = await fetch(
      `https://api.weather.com/v1/current?city=${city}&unit=${unit}`
    );
    const data = await response.json();
    return `Weather in ${city}: ${data.condition}, ${data.temperature}°${unit === "celsius" ? "C" : "F"}`;
  },
};
```

#### 文件读取工具

```typescript
const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file",
      },
      encoding: {
        type: "string",
        enum: ["utf-8", "base64"],
        description: "File encoding",
      },
    },
    required: ["path"],
  },
  execute: async (args) => {
    const { path, encoding = "utf-8" } = args;
    const content = await fs.readFile(path, encoding);
    return content;
  },
};
```

#### 计算器工具

```typescript
const calculatorTool: Tool = {
  name: "calculate",
  description: "Perform mathematical calculations",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate",
      },
    },
    required: ["expression"],
  },
  execute: async (args) => {
    const { expression } = args;
    // 注意：实际使用时要防止代码注入
    const result = eval(expression);  // 简化示例，实际要用安全的方式
    return String(result);
  },
};
```

## 工具注册

### 在 Agent 中注册工具

```typescript
import { Agent } from "@mariozechner/pi-agent-core";

const agent = new Agent({
  api: "openai/gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// 注册工具
agent.registerTool(weatherTool);
agent.registerTool(readFileTool);
agent.registerTool(calculatorTool);

// 获取工具
const tool = agent.getTool("get_weather");

// 获取所有工具
const allTools = agent.getAllTools();
```

### 工具注册实现

```typescript
// packages/agent/src/agent.ts

export class Agent {
  private tools: Map<string, Tool> = new Map();
  
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool ${tool.name} is already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
  }
  
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  unregisterTool(name: string): void {
    this.tools.delete(name);
  }
  
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
```

## 工具调用流程

### 完整流程

```typescript
// 1. 用户发送消息
agent.addSteeringMessage({
  type: "user",
  content: "北京今天天气怎么样？",
});

// 2. AgentLoop 调用 LLM，传入可用工具
const stream = stream("openai/gpt-4o", {
  messages: [...],
  tools: agent.getAllTools().map(convertToLlmTool),
});

// 3. LLM 决定调用工具
// 返回: tool_call {name: "get_weather", arguments: {city: "北京"}}

// 4. Agent 解析工具调用
const toolCall = parseToolCall(event);

// 5. 执行工具
const result = await executeTool(toolCall);
// 结果: "Weather in Beijing: Sunny, 25°C"

// 6. 将结果添加到消息队列
agent.addFollowUpMessage({
  type: "tool_result",
  toolCallId: toolCall.id,
  content: result,
});

// 7. 再次调用 LLM，让它基于结果生成回复
// LLM: "北京今天晴天，25°C"
```

### 工具调用解析

```typescript
// 从流式响应中解析工具调用
async function* parseToolCalls(
  stream: AsyncGenerator<AgentMessageEvent>
): AsyncGenerator<AgentMessageEvent, ToolCall[]> {
  const toolCalls: Map<string, Partial<ToolCall>> = new Map();
  let currentToolCallId: string | null = null;
  
  for await (const event of stream) {
    yield event;  // 转发事件
    
    switch (event.type) {
      case "toolcall_start":
        currentToolCallId = event.id;
        toolCalls.set(event.id, {
          id: event.id,
          name: event.name,
          arguments: "",
        });
        break;
        
      case "toolcall_delta":
        if (currentToolCallId) {
          const toolCall = toolCalls.get(currentToolCallId);
          if (toolCall) {
            toolCall.arguments += event.arguments;
          }
        }
        break;
        
      case "toolcall_end":
        currentToolCallId = null;
        break;
    }
  }
  
  // 解析 JSON 参数
  return Array.from(toolCalls.values()).map(tc => ({
    id: tc.id!,
    name: tc.name!,
    arguments: JSON.parse(tc.arguments as string),
  }));
}
```

## 工具执行模式

### 顺序执行（Sequential）

```typescript
// 一个接一个执行
async function executeSequentially(
  toolCalls: ToolCall[],
  agent: Agent
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  
  for (const toolCall of toolCalls) {
    const tool = agent.getTool(toolCall.name);
    if (!tool) {
      results.push({
        toolCallId: toolCall.id,
        content: `Error: Unknown tool ${toolCall.name}`,
        isError: true,
      });
      continue;
    }
    
    try {
      const content = await tool.execute(toolCall.arguments);
      results.push({
        toolCallId: toolCall.id,
        content,
        isError: false,
      });
    } catch (error) {
      results.push({
        toolCallId: toolCall.id,
        content: error instanceof Error ? error.message : String(error),
        isError: true,
      });
    }
  }
  
  return results;
}
```

**适用场景：**
- 工具之间有依赖关系
- 需要按顺序执行
- 资源有限，不能并行

### 并行执行（Parallel）

```typescript
// 同时执行所有工具
async function executeInParallel(
  toolCalls: ToolCall[],
  agent: Agent
): Promise<ToolResult[]> {
  const promises = toolCalls.map(async (toolCall) => {
    const tool = agent.getTool(toolCall.name);
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: `Error: Unknown tool ${toolCall.name}`,
        isError: true,
      };
    }
    
    try {
      const content = await tool.execute(toolCall.arguments);
      return {
        toolCallId: toolCall.id,
        content,
        isError: false,
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        content: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  });
  
  return await Promise.all(promises);
}
```

**适用场景：**
- 工具之间相互独立
- 需要快速响应
- I/O 密集型操作（如网络请求）

### 配置执行模式

```typescript
const config: AgentLoopConfig = {
  // ... 其他配置
  toolExecutionMode: "parallel",  // 或 "sequential"
};
```

## 工具执行钩子

### beforeToolCall

在工具执行前调用，可以用来：
- 权限检查
- 日志记录
- 参数校验

```typescript
const config: AgentLoopConfig = {
  beforeToolCall: async (toolCall) => {
    console.log(`[Before] Executing tool: ${toolCall.name}`);
    console.log(`Arguments:`, toolCall.arguments);
    
    // 权限检查
    if (toolCall.name === "delete_file") {
      throw new Error("Permission denied: cannot delete files");
    }
    
    // 参数校验
    if (toolCall.name === "read_file") {
      const path = toolCall.arguments.path as string;
      if (path.includes("..")) {
        throw new Error("Invalid path: directory traversal detected");
      }
    }
  },
};
```

### afterToolCall

在工具执行后调用，可以用来：
- 结果处理
- 日志记录
- 缓存结果

```typescript
const config: AgentLoopConfig = {
  afterToolCall: async (toolCall, result) => {
    console.log(`[After] Tool ${toolCall.name} executed`);
    console.log(`Result:`, result);
    
    // 记录到日志系统
    await logToolExecution({
      tool: toolCall.name,
      arguments: toolCall.arguments,
      result,
      timestamp: Date.now(),
    });
  },
};
```

## 完整示例

### 构建一个支持工具的 Agent

```typescript
import { Agent, Tool } from "@mariozechner/pi-agent-core";

// 定义工具
const tools: Tool[] = [
  {
    name: "get_weather",
    description: "Get weather for a city",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
      },
      required: ["city"],
    },
    execute: async (args) => {
      const { city } = args;
      // 模拟 API 调用
      return `Weather in ${city}: Sunny, 25°C`;
    },
  },
  {
    name: "calculate",
    description: "Calculate mathematical expression",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string" },
      },
      required: ["expression"],
    },
    execute: async (args) => {
      // 使用安全的计算方式
      const { expression } = args;
      const result = safeCalculate(expression);
      return String(result);
    },
  },
];

// 创建 Agent
const agent = new Agent({
  api: "openai/gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// 注册工具
tools.forEach(tool => agent.registerTool(tool));

// 配置 AgentLoop
const config: AgentLoopConfig = {
  convertToLlm: (messages) => /* ... */,
  getSteeringMessages: () => agent.getSteeringQueue(),
  getFollowUpMessages: () => agent.getFollowUpQueue(),
  toolExecutionMode: "parallel",
  
  beforeToolCall: async (toolCall) => {
    console.log(`🛠️  Executing: ${toolCall.name}`);
  },
  
  afterToolCall: async (toolCall, result) => {
    console.log(`✅ Result: ${result}`);
  },
  
  onEvent: (event) => {
    if (event.type === "message_update") {
      process.stdout.write(event.delta);
    }
  },
};

// 运行
async function chat(input: string) {
  agent.addSteeringMessage({
    type: "user",
    content: input,
  });
  
  const stream = runAgentLoop(config, {
    api: "openai/gpt-4o",
    tools: agent.getAllTools(),
  });
  
  for await (const event of stream) {
    // 事件已在上面的 onEvent 中处理
  }
}

// 测试
await chat("北京天气怎么样？25乘以4等于多少？");
// 输出：
// 🛠️  Executing: get_weather
// 🛠️  Executing: calculate
// ✅ Result: Weather in Beijing: Sunny, 25°C
// ✅ Result: 100
// 北京今天晴天，25°C。25乘以4等于100。
```

## 工具最佳实践

### 1. 工具命名

- 使用动词开头：`get_`, `search_`, `calculate_`, `create_`
- 使用下划线分隔：`get_weather`, `not getWeather`
- 保持简洁：`search`, 不是 `perform_web_search`

### 2. 描述清晰

```typescript
// 好的描述
{
  name: "get_weather",
  description: "Get the current weather conditions (temperature, humidity, conditions) for a specific city",
}

// 差的描述
{
  name: "get_weather",
  description: "Get weather",  // 太简略
}
```

### 3. 参数设计

```typescript
// 好的参数设计
{
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "The name of the city, e.g., 'Beijing', 'New York'",
      },
      unit: {
        type: "string",
        enum: ["celsius", "fahrenheit"],
        description: "Temperature unit, defaults to celsius",
      },
    },
    required: ["city"],  // 明确哪些是必须的
  },
}
```

### 4. 错误处理

```typescript
{
  execute: async (args) => {
    try {
      const result = await fetchData(args);
      return JSON.stringify(result);
    } catch (error) {
      // 返回清晰的错误信息
      return `Error: ${error.message}`;
    }
  },
}
```

### 5. 安全性

```typescript
{
  execute: async (args) => {
    const { path } = args;
    
    // 路径校验
    if (path.includes("..") || path.startsWith("/")) {
      throw new Error("Invalid path");
    }
    
    // 限制访问范围
    const fullPath = path.join(safeBaseDir, path);
    
    return await fs.readFile(fullPath, "utf-8");
  },
}
```

## 总结

pi-agent 的工具系统设计得非常完善：

1. **清晰的接口** - Tool、ToolCall、ToolResult 定义明确
2. **灵活的执行** - 支持顺序和并行两种模式
3. **丰富的钩子** - beforeToolCall/afterToolCall 支持自定义逻辑
4. **类型安全** - TypeScript 类型系统保证代码正确性
5. **易于扩展** - 注册/注销工具简单直观

工具调用是 Agent 的核心能力，掌握它你就能构建出真正有用的 AI 应用。

---

**下篇预告：**《消息转换与上下文管理》 - 深入理解 AgentMessage 到 LLM Message 的转换机制。
