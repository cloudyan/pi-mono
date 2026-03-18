# 消息转换与上下文管理

> **难度：进阶** | **预计阅读时间：20 分钟**

上一章我们了解了工具执行机制。本章将深入消息转换和上下文管理——这是 Agent 灵活性的关键所在。

## 为什么需要消息转换？

想象你在构建一个 IDE 插件：

```
┌─────────────────────────────────────────────────────────────┐
│                      IDE 界面                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  用户: 帮我优化这段代码                                 │ │
│  │                                                       │ │
│  │  [代码编辑器 - 显示当前文件]                             │ │
│  │  ┌─────────────────────────────────────────────────┐ │ │
│  │  │ function calculate(x) {                         │ │ │
│  │  │   return x * 2;  // 需要优化                   │ │ │
│  │  │ }                                               │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  │                                                       │ │
│  │  AI: 我来帮你优化...                                  │ │
│  │  [思考过程...]                                        │ │
│  │  [建议的修改]                                         │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

在这个场景中：
- **UI 需要显示**：代码编辑器、思考过程、修改建议
- **但 LLM 只需要看到**：用户问题和当前代码

这就是消息转换的价值所在。

## 消息转换架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    消息转换流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AgentMessage[]                                                  │
│    │                                                            │
│    ▼                                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              transformContext()                          │   │
│  │  可选：修剪消息历史、添加元信息等                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│    │                                                            │
│    ▼                                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              convertToLlm()                              │   │
│  │  必需：转换为 LLM 兼容格式，过滤自定义消息                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│    │                                                            │
│    ▼                                                            │
│  Message[]                                                       │
│    │                                                            │
│    ▼                                                            │
│  LLM                                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 两层转换

### 第一层：transformContext（可选）

用于在发送给 LLM 之前修改消息列表：

```typescript
const agent = new Agent({
  transformContext: async (messages, signal) => {
    // 1. 修剪过长的历史
    const trimmed = trimMessages(messages, { maxTokens: 8000 });
    
    // 2. 添加当前文件上下文
    const currentFile = await getCurrentFile();
    const contextMessage: UserMessage = {
      role: "user",
      content: [{ 
        type: "text", 
        text: `当前文件: ${currentFile.path}\n\n${currentFile.content}` 
      }],
      timestamp: Date.now(),
    };
    
    return [...trimmed, contextMessage];
  },
});
```

**典型用途**：
- 修剪消息历史（控制 token 数量）
- 添加动态上下文（当前文件、选中代码等）
- 注入系统指令
- 消息重排序

### 第二层：convertToLlm（必需）

将 `AgentMessage[]` 转换为 `Message[]`，这是必须提供的：

```typescript
const agent = new Agent({
  convertToLlm: (messages) => {
    return messages.flatMap((m) => {
      // 1. 过滤掉 UI 专用消息
      if (m.role === "codePreview" || m.role === "notification") {
        return [];
      }
      
      // 2. 转换自定义消息为标准消息
      if (m.role === "thinking") {
        // 将思考消息转换为文本
        return [{
          role: "assistant",
          content: [{ type: "text", text: m.content }],
          timestamp: m.timestamp,
        }];
      }
      
      // 3. 标准消息直接透传
      if (isStandardMessage(m)) {
        return [m];
      }
      
      // 4. 未知消息类型处理
      console.warn(`Unknown message role: ${m.role}`);
      return [];
    });
  },
});
```

## 自定义消息类型

通过 TypeScript 的声明合并扩展 `CustomAgentMessages`：

### 1. 声明扩展

```typescript
// types/custom-messages.ts

declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    // 代码预览消息
    codePreview: {
      role: "codePreview";
      language: string;
      code: string;
      timestamp: number;
    };
    
    // 思考过程消息
    thinking: {
      role: "thinking";
      content: string;
      timestamp: number;
    };
    
    // 系统通知
    notification: {
      role: "notification";
      text: string;
      level: "info" | "warning" | "error";
      timestamp: number;
    };
    
    // 文件引用
    fileReference: {
      role: "fileReference";
      path: string;
      range?: { start: number; end: number };
      timestamp: number;
    };
  }
}
```

### 2. 使用自定义消息

```typescript
import type { AgentMessage } from "@mariozechner/pi-agent-core";

// 现在 AgentMessage 包含自定义类型
const codePreview: AgentMessage = {
  role: "codePreview",
  language: "typescript",
  code: "const x = 1;",
  timestamp: Date.now(),
};

const thinking: AgentMessage = {
  role: "thinking",
  content: "让我分析一下这个问题...",
  timestamp: Date.now(),
};

// 添加到 Agent
agent.appendMessage(codePreview);
agent.appendMessage(thinking);
```

### 3. 转换函数实现

```typescript
const agent = new Agent({
  convertToLlm: (messages) => {
    return messages.flatMap((m) => {
      switch (m.role) {
        // UI 专用消息：过滤掉
        case "codePreview":
        case "notification":
        case "fileReference":
          return [];
        
        // 思考消息：转换为助手文本
        case "thinking":
          return [{
            role: "assistant",
            content: [{ type: "text", text: `<thinking>${m.content}</thinking>` }],
            timestamp: m.timestamp,
          }];
        
        // 标准消息：直接透传
        case "user":
        case "assistant":
        case "toolResult":
          return [m];
        
        default:
          return [];
      }
    });
  },
});
```

## 上下文修剪策略

长对话会消耗大量 token，需要智能修剪：

### 策略一：保留最近 N 条

```typescript
function keepRecentMessages(messages: AgentMessage[], count: number): AgentMessage[] {
  return messages.slice(-count);
}

const agent = new Agent({
  transformContext: (messages) => keepRecentMessages(messages, 10),
});
```

**优点**：简单直观
**缺点**：可能丢失重要上下文

### 策略二：按 Token 数量修剪

```typescript
import { countMessageTokens } from "@mariozechner/pi-ai";

function trimByTokens(
  messages: AgentMessage[], 
  maxTokens: number
): AgentMessage[] {
  let totalTokens = 0;
  const result: AgentMessage[] = [];
  
  // 从后向前遍历，保留最新消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = countMessageTokens(messages[i]);
    if (totalTokens + tokens > maxTokens) break;
    
    result.unshift(messages[i]);
    totalTokens += tokens;
  }
  
  return result;
}

const agent = new Agent({
  transformContext: (messages) => trimByTokens(messages, 4000),
});
```

**优点**：精确控制 token 使用
**缺点**：需要计算 token

### 策略三：智能摘要

```typescript
async function summarizeOldMessages(
  messages: AgentMessage[],
  model: Model<any>
): Promise<AgentMessage[]> {
  const threshold = 20; // 超过 20 条开始摘要
  
  if (messages.length <= threshold) {
    return messages;
  }
  
  // 保留最近的对话
  const recent = messages.slice(-10);
  const old = messages.slice(0, -10);
  
  // 生成摘要
  const summary = await generateSummary(old, model);
  
  return [
    {
      role: "assistant",
      content: [{ type: "text", text: `[Earlier conversation summary: ${summary}]` }],
      timestamp: old[old.length - 1].timestamp,
    },
    ...recent,
  ];
}
```

**优点**：保留更多信息
**缺点**：需要额外的 LLM 调用

### 策略四：保留关键消息

```typescript
function preserveImportantMessages(messages: AgentMessage[]): AgentMessage[] {
  // 标记重要消息
  const isImportant = (m: AgentMessage) => {
    // 系统提示变更
    if (m.role === "assistant" && m.content.some(c => 
      c.type === "text" && c.text.includes("system prompt")
    )) return true;
    
    // 工具结果（特别是错误）
    if (m.role === "toolResult" && m.isError) return true;
    
    // 用户明确标记的
    if (m.role === "user" && m.content.some(c =>
      c.type === "text" && c.text.startsWith("[IMPORTANT]")
    )) return true;
    
    return false;
  };
  
  // 保留重要消息 + 最近消息
  const important = messages.filter(isImportant);
  const recent = messages.slice(-5);
  
  // 合并去重
  const seen = new Set<string>();
  return [...important, ...recent].filter(m => {
    const key = `${m.role}-${m.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

## 动态上下文注入

### 场景一：代码编辑器

```typescript
const agent = new Agent({
  transformContext: async (messages, signal) => {
    // 获取当前编辑器状态
    const editorState = await getEditorState();
    
    // 构建上下文消息
    const contextParts: string[] = [];
    
    if (editorState.currentFile) {
      contextParts.push(`Current file: ${editorState.currentFile.path}`);
      contextParts.push(`\n\`\`\`${editorState.currentFile.language}`);
      contextParts.push(editorState.currentFile.content);
      contextParts.push(`\`\`\``);
    }
    
    if (editorState.selectedText) {
      contextParts.push(`\nSelected text:`);
      contextParts.push(`\`\`\``);
      contextParts.push(editorState.selectedText);
      contextParts.push(`\`\`\``);
    }
    
    const contextMessage: UserMessage = {
      role: "user",
      content: [{ type: "text", text: contextParts.join("\n") }],
      timestamp: Date.now(),
    };
    
    // 替换最后一条上下文消息（如果存在）
    const withoutOldContext = messages.filter(m => 
      !(m.role === "user" && m.content[0]?.text?.startsWith("Current file:"))
    );
    
    return [...withoutOldContext, contextMessage];
  },
});
```

### 场景二：项目管理

```typescript
const agent = new Agent({
  transformContext: async (messages) => {
    // 获取项目状态
    const projectState = await getProjectState();
    
    const contextMessage: UserMessage = {
      role: "user",
      content: [{
        type: "text",
        text: `
Project context:
- Active tasks: ${projectState.activeTasks.join(", ")}
- Current sprint: ${projectState.sprint}
- Blockers: ${projectState.blockers.join(", ") || "None"}
        `.trim(),
      }],
      timestamp: Date.now(),
    };
    
    return [...messages, contextMessage];
  },
});
```

## 消息过滤与转换模式

### 模式一：内容过滤

```typescript
const agent = new Agent({
  convertToLlm: (messages) => {
    return messages.flatMap((m) => {
      // 过滤敏感信息
      if (m.role === "user") {
        const filtered = m.content.map(c => {
          if (c.type === "text") {
            return {
              ...c,
              text: c.text.replace(/password:\s*\S+/gi, "password: [REDACTED]"),
            };
          }
          return c;
        });
        return [{ ...m, content: filtered }];
      }
      return [m];
    });
  },
});
```

### 模式二：格式转换

```typescript
const agent = new Agent({
  convertToLlm: (messages) => {
    return messages.flatMap((m) => {
      // 将 Markdown 转换为纯文本
      if (m.role === "user" && m.content[0]?.type === "text") {
        const plainText = markdownToPlainText(m.content[0].text);
        return [{
          ...m,
          content: [{ type: "text", text: plainText }],
        }];
      }
      return [m];
    });
  },
});
```

### 模式三：消息合并

```typescript
const agent = new Agent({
  convertToLlm: (messages) => {
    const result: Message[] = [];
    let currentMerge: Message | null = null;
    
    for (const m of messages) {
      // 合并连续的助手消息
      if (m.role === "assistant" && currentMerge?.role === "assistant") {
        currentMerge.content.push(...m.content);
      } else {
        if (currentMerge) result.push(currentMerge);
        currentMerge = m;
      }
    }
    
    if (currentMerge) result.push(currentMerge);
    return result;
  },
});
```

## 完整示例：IDE 助手

```typescript
// ide-agent.ts
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

// 1. 扩展自定义消息类型
declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    codePreview: {
      role: "codePreview";
      language: string;
      code: string;
      timestamp: number;
    };
    thinking: {
      role: "thinking";
      content: string;
      timestamp: number;
    };
  }
}

// 2. 定义工具
const readFileTool: AgentTool = {
  name: "read_file",
  label: "读取文件",
  description: "读取文件内容",
  parameters: Type.Object({ path: Type.String() }),
  execute: async (id, params) => {
    const content = await fs.readFile(params.path, "utf-8");
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};

// 3. 创建 Agent
const ideAgent = new Agent({
  initialState: {
    systemPrompt: "你是一个 IDE 编程助手。",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools: [readFileTool, writeFileTool, listDirectoryTool],
  },
  
  // 4. 上下文转换：注入当前文件
  transformContext: async (messages) => {
    const currentFile = await getCurrentFileFromEditor();
    if (!currentFile) return messages;
    
    // 移除旧的上下文消息
    const withoutOldContext = messages.filter(m =>
      !(m.role === "user" && m.content[0]?.text?.startsWith("Current file:"))
    );
    
    // 添加新的上下文
    const contextMessage: UserMessage = {
      role: "user",
      content: [{
        type: "text",
        text: `Current file: ${currentFile.path}\n\`\`\`${currentFile.language}\n${currentFile.content}\n\`\`\``,
      }],
      timestamp: Date.now(),
    };
    
    return [...withoutOldContext, contextMessage];
  },
  
  // 5. 消息转换：过滤自定义消息
  convertToLlm: (messages) => {
    return messages.flatMap((m) => {
      // 过滤 UI 消息
      if (m.role === "codePreview" || m.role === "thinking") {
        return [];
      }
      // 标准消息透传
      return [m];
    });
  },
});

// 6. 订阅事件更新 UI
ideAgent.subscribe((event) => {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        updateEditorPreview(event.assistantMessageEvent.delta);
      }
      break;
    case "tool_execution_start":
      showToolIndicator(event.toolName);
      break;
    case "tool_execution_end":
      hideToolIndicator(event.toolName);
      break;
  }
});

// 7. 添加思考消息（仅 UI 显示）
function addThinkingMessage(content: string) {
  ideAgent.appendMessage({
    role: "thinking",
    content,
    timestamp: Date.now(),
  });
}

// 8. 添加代码预览（仅 UI 显示）
function addCodePreview(language: string, code: string) {
  ideAgent.appendMessage({
    role: "codePreview",
    language,
    code,
    timestamp: Date.now(),
  });
}
```

## 最佳实践

### ✅ 应该做的

1. **保持 convertToLlm 纯函数**
   ```typescript
   // ✅ 正确：无副作用
   convertToLlm: (messages) => messages.filter(...)
   
   // ❌ 错误：有副作用
   convertToLlm: (messages) => {
     console.log("Converting...");  // 副作用
     return messages.filter(...);
   }
   ```

2. **处理所有自定义消息类型**
   ```typescript
   convertToLlm: (messages) => {
     return messages.flatMap((m) => {
       switch (m.role) {
         case "codePreview": return [];
         case "thinking": return [...];
         // 别忘了 default！
         default: return [m];
       }
     });
   }
   ```

3. **使用 flatMap 处理过滤**
   ```typescript
   // ✅ 正确：flatMap 可以返回空数组过滤
   return messages.flatMap(m => 
     shouldInclude(m) ? [m] : []
   );
   ```

4. **保留时间戳**
   ```typescript
   // 转换时保留原始时间戳
   return [{
     role: "assistant",
     content: [...],
     timestamp: m.timestamp,  // 保留！
   }];
   ```

### ❌ 避免的错误

1. **修改原始消息**
   ```typescript
   // ❌ 错误：修改了原始消息
   convertToLlm: (messages) => {
     messages[0].content = "modified";  // 不要这样做！
     return messages;
   }
   
   // ✅ 正确：创建新对象
   convertToLlm: (messages) => {
     return messages.map(m => ({
       ...m,
       content: "modified",
     }));
   }
   ```

2. **丢失消息**
   ```typescript
   // ❌ 错误：未处理未知类型
   convertToLlm: (messages) => {
     return messages.filter(m => 
       m.role === "user" || m.role === "assistant"
     );
   }
   ```

3. **在 transformContext 中做太多事**
   ```typescript
   // ❌ 错误：阻塞操作
   transformContext: async (messages) => {
     const data = await heavyComputation();  // 太慢！
     return [...messages, data];
   }
   ```

## 总结

消息转换与上下文管理的核心要点：

1. **两层转换**：transformContext（可选）+ convertToLlm（必需）
2. **自定义消息**：通过声明合并扩展 CustomAgentMessages
3. **上下文修剪**：token 控制、智能摘要、关键消息保留
4. **动态注入**：编辑器状态、项目信息等实时上下文
5. **转换模式**：过滤、格式转换、消息合并

---

**下篇预告**: [05-advanced-patterns.md](05-advanced-patterns.md) —— 高级模式与最佳实践，包括状态持久化、多 Agent 协作、错误恢复策略等。
