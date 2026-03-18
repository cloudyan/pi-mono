# 工具调用执行机制

> **难度：进阶** | **预计阅读时间：20 分钟**

上一章我们了解了 AgentLoop 的事件循环。本章将深入工具调用的执行机制——这是 Agent 与外部世界交互的核心能力。

## 为什么工具执行很重要？

想象一个 AI 助手，它只能"说话"而不能"做事"：

```
用户：请帮我读取 package.json 的内容

AI（无工具）：我无法直接读取文件，但我可以告诉你 package.json 通常包含...

用户：😤 我是要你实际读取我的文件！
```

有了工具执行能力，AI 才能真正帮助用户完成任务：

```
用户：请帮我读取 package.json 的内容

AI：我来帮你读取。
[调用 read_file 工具]
[返回文件内容]

这是你的 package.json 内容：
{
  "name": "my-project",
  "version": "1.0.0",
  ...
}
```

## 工具执行架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     工具执行流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LLM 响应                                                        │
│    │                                                            │
│    ▼                                                            │
│  解析 toolCall 内容                                              │
│    │                                                            │
│    ▼                                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              executeToolCalls()                          │   │
│  │  1. 准备工具调用（before 钩子）                           │   │
│  │  2. 执行工具（并行/串行）                                 │   │
│  │  3. 处理结果（after 钩子）                                │   │
│  │  4. 构造 ToolResultMessage                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│    │                                                            │
│    ▼                                                            │
│  返回结果给 LLM                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 工具定义回顾

```typescript
// packages/agent/src/types.ts

export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> 
  extends Tool<TParameters> {
  label: string;  // UI 显示用的标签
  execute: (
    toolCallId: string,                    // 工具调用 ID
    params: Static<TParameters>,           // 解析后的参数
    signal?: AbortSignal,                  // 取消信号
    onUpdate?: AgentToolUpdateCallback<TDetails>,  // 流式更新回调
  ) => Promise<AgentToolResult<TDetails>>;
}

export interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];  // 返回给 LLM 的内容
  details: T;  // 额外详情（用于 UI 显示、日志等）
}
```

### 关键设计：details 字段

`details` 是 AgentTool 区别于 pi-ai Tool 的重要特性：

```typescript
const readFileTool: AgentTool = {
  name: "read_file",
  label: "读取文件",
  description: "读取文件内容",
  parameters: Type.Object({
    path: Type.String(),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const content = await fs.readFile(params.path, "utf-8");
    
    return {
      // 返回给 LLM 的内容（简洁）
      content: [{ type: "text", text: content }],
      
      // 返回给 UI 的详情（丰富）
      details: {
        path: params.path,
        size: content.length,
        lines: content.split("\n").length,
        lastModified: (await fs.stat(params.path)).mtime,
      },
    };
  },
};
```

这样 UI 可以显示：
- LLM 看到的：文件内容
- 用户看到的：文件路径、大小、行数、修改时间等元信息

## 工具执行流程

### 1. 解析工具调用

当 LLM 返回包含 toolCall 的响应时：

```typescript
// 助手消息的内容可能包含多个工具调用
const assistantMessage: AssistantMessage = {
  role: "assistant",
  content: [
    { type: "text", text: "我来帮你读取文件。" },
    { 
      type: "toolCall", 
      id: "call_abc123",
      name: "read_file",
      arguments: '{"path": "/path/to/file.txt"}'
    },
    { 
      type: "toolCall", 
      id: "call_def456",
      name: "read_file",
      arguments: '{"path": "/path/to/another.txt"}'
    },
  ],
  stopReason: "tool_calls",
  // ...
};

// 提取工具调用
const toolCalls = assistantMessage.content.filter(c => c.type === "toolCall");
```

### 2. 准备工具调用

```typescript
// packages/agent/src/agent-loop.ts

async function executeToolCalls(
  context: AgentContext,
  assistantMessage: AssistantMessage,
  config: AgentLoopConfig,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ToolResultMessage[]> {
  // 1. 查找工具
  const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
  
  // 2. 准备工具调用（验证参数、执行 before 钩子）
  const prepared = await Promise.all(
    toolCalls.map(async (tc) => {
      const tool = context.tools.find((t) => t.name === tc.name);
      if (!tool) throw new Error(`Unknown tool: ${tc.name}`);
      
      // 解析参数
      const args = JSON.parse(tc.arguments);
      
      // 执行 before 钩子
      if (config.beforeToolExecution) {
        await config.beforeToolExecution(tc.id, tool, args);
      }
      
      return { toolCall: tc, tool, args };
    })
  );
  
  // 3. 执行工具...
}
```

### 3. 并行 vs 串行执行

AgentLoop 支持两种执行模式：

#### 并行执行（默认）

```typescript
// 所有工具同时执行
const results = await Promise.all(
  prepared.map((p) => executePreparedToolCall(p, context, signal, emit))
);
```

**适用场景**：
- 读取多个独立的文件
- 查询多个不相关的数据源
- 执行无依赖的计算任务

#### 串行执行

```typescript
// 工具按顺序执行
const results: ToolExecutionResult[] = [];
for (const p of prepared) {
  const result = await executePreparedToolCall(p, context, signal, emit);
  results.push(result);
}
```

**适用场景**：
- 工具之间有依赖关系（如先创建目录，再写入文件）
- 需要控制执行顺序以避免冲突
- 资源受限，需要限制并发

**如何配置**：

```typescript
// 当前版本默认并行，未来可能支持配置
const agent = new Agent({
  // 串行执行（假设未来版本支持）
  toolExecutionMode: "sequential",
});
```

### 4. 执行单个工具

```typescript
async function executePreparedToolCall(
  prepared: PreparedToolCall,
  context: AgentContext,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ToolExecutionResult> {
  const { toolCall, tool, args } = prepared;
  
  // 1. 发射开始事件
  await emit({
    type: "tool_execution_start",
    toolCallId: toolCall.id,
    toolName: tool.name,
    args,
  });
  
  // 2. 添加到 pending 集合
  context.pendingToolCalls.add(toolCall.id);
  
  try {
    // 3. 执行工具
    const result = await tool.execute(
      toolCall.id,
      args,
      signal,
      // 流式更新回调
      (update) => emit({
        type: "tool_execution_update",
        toolCallId: toolCall.id,
        update,
      })
    );
    
    // 4. 执行 after 钩子
    if (config.afterToolExecution) {
      await config.afterToolExecution(toolCall.id, tool, args, result);
    }
    
    // 5. 发射完成事件
    await emit({
      type: "tool_execution_end",
      toolCallId: toolCall.id,
      toolName: tool.name,
      result,
      isError: false,
    });
    
    return { result, isError: false };
  } catch (error: any) {
    // 6. 错误处理
    const errorResult = createErrorToolResult(error.message);
    
    await emit({
      type: "tool_execution_end",
      toolCallId: toolCall.id,
      toolName: tool.name,
      result: errorResult,
      isError: true,
    });
    
    return { result: errorResult, isError: true };
  } finally {
    // 7. 从 pending 集合移除
    context.pendingToolCalls.delete(toolCall.id);
  }
}
```

## 流式工具更新

某些工具可能需要长时间运行（如编译代码、下载文件），这时可以使用流式更新：

```typescript
const longRunningTool: AgentTool = {
  name: "compile_project",
  label: "编译项目",
  description: "编译整个项目",
  parameters: Type.Object({
    projectPath: Type.String(),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 发送进度更新
    onUpdate?.({
      content: [{ type: "text", text: "开始编译..." }],
      details: { progress: 0, stage: "init" },
    });
    
    // 阶段 1：解析依赖
    await parseDependencies(params.projectPath);
    onUpdate?.({
      content: [{ type: "text", text: "依赖解析完成" }],
      details: { progress: 25, stage: "dependencies" },
    });
    
    // 阶段 2：类型检查
    await typeCheck(params.projectPath);
    onUpdate?.({
      content: [{ type: "text", text: "类型检查完成" }],
      details: { progress: 50, stage: "typecheck" },
    });
    
    // 阶段 3：编译
    await compile(params.projectPath);
    onUpdate?.({
      content: [{ type: "text", text: "编译完成" }],
      details: { progress: 75, stage: "compile" },
    });
    
    // 阶段 4：打包
    const output = await bundle(params.projectPath);
    onUpdate?.({
      content: [{ type: "text", text: "打包完成" }],
      details: { progress: 100, stage: "bundle" },
    });
    
    return {
      content: [{ type: "text", text: output }],
      details: { 
        duration: Date.now() - startTime,
        outputSize: output.length,
      },
    };
  },
};
```

### UI 显示效果

```
[工具开始] 编译项目
  ↳ 进度: 0% - 初始化
  ↳ 进度: 25% - 依赖解析完成
  ↳ 进度: 50% - 类型检查完成
  ↳ 进度: 75% - 编译完成
  ↳ 进度: 100% - 打包完成
[工具完成] 编译项目 (耗时 3.2s, 输出 1.5MB)
```

## Before/After 钩子

工具执行前后可以插入自定义逻辑：

```typescript
const agent = new Agent({
  // 工具执行前
  beforeToolExecution: async (toolCallId, tool, args) => {
    // 1. 权限检查
    if (tool.name === "write_file" && args.path.includes("/etc/")) {
      throw new Error("无权修改系统文件");
    }
    
    // 2. 日志记录
    console.log(`[Tool] ${tool.name}(${JSON.stringify(args)})`);
    
    // 3. 速率限制
    await rateLimiter.check(tool.name);
  },
  
  // 工具执行后
  afterToolExecution: async (toolCallId, tool, args, result) => {
    // 1. 结果缓存
    if (tool.name === "read_file") {
      cache.set(args.path, result);
    }
    
    // 2. 审计日志
    auditLog.record({
      tool: tool.name,
      args,
      result: result.content[0].text.slice(0, 100),
      timestamp: Date.now(),
    });
    
    // 3. 指标收集
    metrics.recordToolExecution(tool.name, Date.now() - startTime);
  },
});
```

## 工具结果处理

工具执行完成后，结果被转换为 `ToolResultMessage`：

```typescript
function createToolResultMessage(
  toolCall: ToolCallContent,
  result: AgentToolResult<any>,
  isError: boolean,
): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    content: result.content,
    isError,
  };
}
```

### 错误结果的特殊处理

```typescript
function createErrorToolResult(errorMessage: string): AgentToolResult<{}> {
  return {
    content: [{ type: "text", text: `Error: ${errorMessage}` }],
    details: {},
  };
}
```

**重要**：错误结果会被标记 `isError: true`，LLM 会看到错误信息并决定如何处理。

## 完整示例：文件操作工具集

```typescript
import { Type } from "@sinclair/typebox";
import * as fs from "fs/promises";
import * as path from "path";

// 读取文件工具
const readFileTool: AgentTool = {
  name: "read_file",
  label: "读取文件",
  description: "读取指定文件的内容",
  parameters: Type.Object({
    path: Type.String({ description: "文件路径" }),
  }),
  execute: async (toolCallId, params, signal) => {
    const content = await fs.readFile(params.path, "utf-8");
    return {
      content: [{ type: "text", text: content }],
      details: {
        path: params.path,
        size: content.length,
        lines: content.split("\n").length,
      },
    };
  },
};

// 写入文件工具
const writeFileTool: AgentTool = {
  name: "write_file",
  label: "写入文件",
  description: "将内容写入指定文件",
  parameters: Type.Object({
    path: Type.String({ description: "文件路径" }),
    content: Type.String({ description: "文件内容" }),
  }),
  execute: async (toolCallId, params, signal) => {
    await fs.writeFile(params.path, params.content, "utf-8");
    return {
      content: [{ type: "text", text: `File written to ${params.path}` }],
      details: {
        path: params.path,
        size: params.content.length,
      },
    };
  },
};

// 列出目录工具
const listDirectoryTool: AgentTool = {
  name: "list_directory",
  label: "列出目录",
  description: "列出指定目录的内容",
  parameters: Type.Object({
    path: Type.String({ description: "目录路径" }),
  }),
  execute: async (toolCallId, params, signal) => {
    const entries = await fs.readdir(params.path, { withFileTypes: true });
    const listing = entries
      .map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    
    return {
      content: [{ type: "text", text: listing }],
      details: {
        path: params.path,
        fileCount: entries.filter(e => e.isFile()).length,
        dirCount: entries.filter(e => e.isDirectory()).length,
      },
    };
  },
};

// 使用工具集
const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个文件管理助手。",
    model: getModel("openai", "gpt-4o-mini"),
    tools: [readFileTool, writeFileTool, listDirectoryTool],
  },
  beforeToolExecution: async (toolCallId, tool, args) => {
    console.log(`[执行] ${tool.label}: ${JSON.stringify(args)}`);
  },
});

// 示例对话
await agent.prompt("读取 package.json 的内容");
// AI 会调用 read_file 工具，然后回复文件内容
```

## 工具调用的生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                    工具调用完整生命周期                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. LLM 生成 toolCall                                           │
│     └── 包含：id, name, arguments                               │
│                                                                 │
│  2. 解析参数                                                     │
│     └── JSON.parse(arguments) → 验证参数类型                     │
│                                                                 │
│  3. 查找工具                                                     │
│     └── tools.find(t => t.name === toolCall.name)               │
│                                                                 │
│  4. 执行 before 钩子                                             │
│     └── beforeToolExecution?.(id, tool, args)                   │
│                                                                 │
│  5. 发射 tool_execution_start 事件                               │
│                                                                 │
│  6. 执行工具                                                     │
│     └── tool.execute(id, args, signal, onUpdate)                │
│         ├── 可能多次调用 onUpdate（流式更新）                    │
│         └── 返回 AgentToolResult                                │
│                                                                 │
│  7. 执行 after 钩子                                              │
│     └── afterToolExecution?.(id, tool, args, result)            │
│                                                                 │
│  8. 发射 tool_execution_end 事件                                 │
│                                                                 │
│  9. 构造 ToolResultMessage                                      │
│     └── { role: "toolResult", toolCallId, content, isError }    │
│                                                                 │
│  10. 添加到对话历史                                              │
│      └── messages.push(toolResultMessage)                       │
│                                                                 │
│  11. 返回给 LLM                                                  │
│      └── 进入下一轮对话                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 最佳实践

### ✅ 应该做的

1. **使用 details 传递元信息**
   ```typescript
   return {
     content: [{ type: "text", text: data }],
     details: { count: data.length, source: "api" },
   };
   ```

2. **抛出错误而非返回错误内容**
   ```typescript
   // ✅ 正确
   if (!exists) throw new Error("File not found");
   
   // ❌ 错误
   return { content: [{ text: "Error: not found" }] };
   ```

3. **支持取消信号**
   ```typescript
   execute: async (id, params, signal) => {
     const result = await fetch(url, { signal });
     // ...
   };
   ```

4. **使用流式更新处理长时间任务**
   ```typescript
   for (const step of steps) {
     await doStep(step);
     onUpdate?.({ content: [...], details: { progress } });
   }
   ```

### ❌ 避免的错误

1. **在工具中直接修改 UI 状态**
   ```typescript
   // ❌ 错误：工具应该只返回数据
   execute: async () => {
     ui.showLoading();  // 不要这样做！
     // ...
   };
   ```

2. **忽略 signal 导致无法取消**
   ```typescript
   // ❌ 错误
   execute: async (id, params) => {
     await longRunningOperation();  // 无法取消！
   };
   ```

3. **返回过大的内容**
   ```typescript
   // ❌ 错误：返回整个文件内容
   return { content: [{ text: fileContent }] };  // 10MB!
   
   // ✅ 正确：截断或分页
   return { content: [{ text: fileContent.slice(0, 10000) }] };
   ```

## 总结

工具执行机制的核心要点：

1. **AgentTool 接口**：包含 label 和 execute 函数
2. **details 字段**：区分 LLM 内容和 UI 元信息
3. **并行执行**：默认同时执行多个独立工具
4. **流式更新**：支持长时间任务的进度反馈
5. **Before/After 钩子**：插入权限检查、日志、缓存等逻辑
6. **错误处理**：抛出错误，Agent 会自动转换为错误结果

---

**下篇预告**: [04-message-transform.md](04-message-transform.md) —— 消息转换与上下文管理，包括自定义消息类型、上下文修剪、消息过滤等高级技巧。
