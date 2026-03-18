# 10. 消息转换与上下文管理

问下大家，你有没有想过，Agent 中的消息是怎么传递给 LLM 的？

OpenClaw 刚开始以为就是直接转发，但深入了解后发现，这里面的门道可多了：
- AgentMessage 和 LLM Message 的格式不一样
- 需要处理消息队列（steeringQueue + followUpQueue）
- 上下文太长需要截断
- 要添加系统提示

pi-agent 的消息转换系统设计得非常灵活，今天我们就来深入剖析。

## 消息类型对比

### AgentMessage vs LLM Message

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentMessage                             │
│                                                             │
│  {                                                          │
│    type: "user" | "assistant" | "tool_result",             │
│    id: string,                                             │
│    content: string,                                        │
│    timestamp: number,                                      │
│    toolCallId?: string,  // tool_result 特有               │
│    isError?: boolean,    // tool_result 特有               │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ convertToLlm()
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM Message                              │
│                                                             │
│  {                                                          │
│    role: "user" | "assistant" | "system" | "tool",         │
│    content: Content[]  // TextContent | ImageContent...    │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### 核心差异

| 特性 | AgentMessage | LLM Message |
|-----|-------------|-------------|
| 角色命名 | `type: "user"` | `role: "user"` |
| 内容格式 | `string` | `Content[]` |
| 元数据 | `id`, `timestamp` | 无 |
| 工具结果 | `tool_result` 类型 | `role: "tool"` |

## 消息转换流程

### 完整转换流程

```
┌─────────────────────────────────────────────────────────────┐
│                   消息队列                                   │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  steeringQueue  │  │  followUpQueue  │                   │
│  │  [用户消息]     │  │  [工具结果]     │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
└───────────┼────────────────────┼─────────────────────────────┘
            │                    │
            └────────────────────┘
                         │
                         ▼
            ┌─────────────────────┐
            │   合并消息队列      │
            │   [...steering,     │
            │    ...followUp]     │
            └──────────┬──────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │   convertToLlm()    │
            │   转换为 LLM 格式   │
            └──────────┬──────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  transformContext() │
            │  - 添加系统提示     │
            │  - 截断上下文       │
            │  - 其他处理         │
            └──────────┬──────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │   发送给 LLM        │
            └─────────────────────┘
```

## convertToLlm 实现

### 基础转换

```typescript
// packages/agent/src/message-utils.ts

import type { Message, Content, TextContent } from "@mariozechner/pi-ai";
import type { AgentMessage } from "./types.js";

/**
 * 将 AgentMessage 转换为 LLM Message
 */
export function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.map(convertSingleMessage);
}

function convertSingleMessage(agentMsg: AgentMessage): Message {
  // 转换 role
  const role = convertRole(agentMsg.type);
  
  // 转换 content
  const content: Content[] = [
    { type: "text", text: agentMsg.content },
  ];
  
  return { role, content };
}

function convertRole(type: AgentMessage["type"]): Message["role"] {
  switch (type) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool_result":
      return "tool";
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}
```

### 带工具调用的转换

```typescript
function convertSingleMessage(agentMsg: AgentMessage): Message {
  const role = convertRole(agentMsg.type);
  const content: Content[] = [];
  
  // 添加文本内容
  if (agentMsg.content) {
    content.push({ type: "text", text: agentMsg.content });
  }
  
  // 如果是助手消息且包含工具调用
  if (agentMsg.type === "assistant" && agentMsg.toolCalls) {
    for (const toolCall of agentMsg.toolCalls) {
      content.push({
        type: "tool_call",
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      });
    }
  }
  
  // 如果是工具结果消息
  if (agentMsg.type === "tool_result") {
    content.push({
      type: "tool_result",
      toolCallId: agentMsg.toolCallId!,
      content: agentMsg.content,
      isError: agentMsg.isError ?? false,
    });
  }
  
  return { role, content };
}
```

## 上下文管理

### transformContext 的作用

```typescript
export interface AgentLoopConfig {
  /**
   * 转换上下文
   * 可以用来：
   * - 添加系统提示
   * - 截断过长的上下文
   * - 修改消息内容
   */
  transformContext?: (messages: Message[]) => Message[];
}
```

### 添加系统提示

```typescript
function addSystemPrompt(messages: Message[]): Message[] {
  const systemMessage: Message = {
    role: "system",
    content: [
      {
        type: "text",
        text: `You are a helpful coding assistant.
You can use tools to help the user.
Always be concise and helpful.`,
      },
    ],
  };
  
  // 插入到消息列表开头
  return [systemMessage, ...messages];
}

const config: AgentLoopConfig = {
  transformContext: addSystemPrompt,
};
```

### 上下文截断

```typescript
/**
 * 截断上下文，保留最近的 N 条消息
 */
function truncateContext(maxMessages: number) {
  return (messages: Message[]): Message[] => {
    if (messages.length <= maxMessages) {
      return messages;
    }
    
    // 保留系统消息（如果有）
    const systemMessages = messages.filter(m => m.role === "system");
    const otherMessages = messages.filter(m => m.role !== "system");
    
    // 从其他消息中保留最近的
    const recentMessages = otherMessages.slice(-maxMessages);
    
    return [...systemMessages, ...recentMessages];
  };
}

const config: AgentLoopConfig = {
  transformContext: truncateContext(20),  // 保留最近 20 条
};
```

### 按 Token 截断

```typescript
/**
 * 按 Token 数量截断上下文
 */
function truncateByTokens(maxTokens: number) {
  return (messages: Message[]): Message[] => {
    let totalTokens = 0;
    const result: Message[] = [];
    
    // 从后往前遍历，优先保留最近的消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const tokens = estimateTokens(message);
      
      if (totalTokens + tokens > maxTokens) {
        break;
      }
      
      totalTokens += tokens;
      result.unshift(message);  // 插入到开头
    }
    
    return result;
  };
}

/**
 * 估算消息的 Token 数量（简化版）
 */
function estimateTokens(message: Message): number {
  let text = "";
  for (const content of message.content) {
    if (content.type === "text") {
      text += content.text;
    }
  }
  
  // 粗略估算：1 token ≈ 4 个字符
  return Math.ceil(text.length / 4);
}

const config: AgentLoopConfig = {
  transformContext: truncateByTokens(8000),  // 保留 8000 token
};
```

## 消息队列管理

### steeringQueue vs followUpQueue

```typescript
export class Agent {
  // 引导消息队列 - 高优先级
  private steeringQueue: AgentMessage[] = [];
  
  // 跟进消息队列 - 普通优先级
  private followUpQueue: AgentMessage[] = [];
  
  /**
   * 添加引导消息
   * 用于：用户输入、系统指令
   */
  addSteeringMessage(message: AgentMessage): void {
    this.steeringQueue.push(message);
  }
  
  /**
   * 添加跟进消息
   * 用于：工具结果、自动生成的消息
   */
  addFollowUpMessage(message: AgentMessage): void {
    this.followUpQueue.push(message);
  }
  
  /**
   * 获取待处理消息
   * steeringQueue 在前，followUpQueue 在后
   */
  getPendingMessages(): AgentMessage[] {
    return [...this.steeringQueue, ...this.followUpQueue];
  }
  
  /**
   * 清空队列
   */
  clearQueues(): void {
    this.steeringQueue = [];
    this.followUpQueue = [];
  }
  
  /**
   * 将队列消息移到历史记录
   */
  commitQueues(): void {
    const pending = this.getPendingMessages();
    this.history.push(...pending);
    this.clearQueues();
  }
}
```

### 为什么需要两个队列？

**场景示例：**

```
用户: "查一下北京天气"
    │
    ▼
steeringQueue: [{type: "user", content: "查一下北京天气"}]
    │
    ▼
Agent 调用 LLM
    │
    ▼
LLM 决定调用工具: get_weather({city: "北京"})
    │
    ▼
执行工具，得到结果: "晴天 25°C"
    │
    ▼
followUpQueue: [{type: "tool_result", content: "晴天 25°C"}]
    │
    ▼
再次调用 LLM
    │
    ▼
LLM 回复: "北京今天晴天，25°C"
    │
    ▼
提交到历史记录
```

**好处：**
1. **优先级控制** - steering 消息优先处理
2. **循环控制** - 可以控制是否继续循环
3. **清晰分离** - 用户输入和自动消息分开

## 完整配置示例

### 基础配置

```typescript
import { AgentLoopConfig } from "@mariozechner/pi-agent-core";

const config: AgentLoopConfig = {
  // 消息转换
  convertToLlm: (messages) => {
    return messages.map(msg => {
      const roleMap = {
        user: "user",
        assistant: "assistant",
        tool_result: "tool",
      };
      
      return {
        role: roleMap[msg.type],
        content: [{ type: "text", text: msg.content }],
      };
    });
  },
  
  // 上下文转换
  transformContext: (messages) => {
    // 1. 添加系统提示
    const systemMessage = {
      role: "system",
      content: [{ type: "text", text: "You are a helpful assistant." }],
    };
    
    // 2. 截断上下文（保留最近 20 条）
    const recentMessages = messages.slice(-20);
    
    return [systemMessage, ...recentMessages];
  },
  
  // 获取消息队列
  getSteeringMessages: () => agent.getSteeringQueue(),
  getFollowUpMessages: () => agent.getFollowUpQueue(),
};
```

### 高级配置

```typescript
const config: AgentLoopConfig = {
  convertToLlm: (messages) => {
    return messages.map(msg => {
      const content: Content[] = [];
      
      // 处理文本内容
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      
      // 处理工具调用
      if (msg.type === "assistant" && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: "tool_call",
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          });
        }
      }
      
      // 处理工具结果
      if (msg.type === "tool_result") {
        content.push({
          type: "tool_result",
          toolCallId: msg.toolCallId,
          content: msg.content,
          isError: msg.isError,
        });
      }
      
      return {
        role: msg.type === "user" ? "user" 
            : msg.type === "assistant" ? "assistant" 
            : "tool",
        content,
      };
    });
  },
  
  transformContext: (messages) => {
    // 1. 保留系统消息
    const systemMsgs = messages.filter(m => m.role === "system");
    const otherMsgs = messages.filter(m => m.role !== "system");
    
    // 2. 按 token 截断
    let tokens = 0;
    const maxTokens = 8000;
    const result: Message[] = [];
    
    for (let i = otherMsgs.length - 1; i >= 0; i--) {
      const msg = otherMsgs[i];
      const msgTokens = estimateTokens(msg);
      
      if (tokens + msgTokens > maxTokens) {
        // 添加截断提示
        result.unshift({
          role: "system",
          content: [{ 
            type: "text", 
            text: "... (earlier messages truncated)" 
          }],
        });
        break;
      }
      
      tokens += msgTokens;
      result.unshift(msg);
    }
    
    return [...systemMsgs, ...result];
  },
  
  getSteeringMessages: () => agent.getSteeringQueue(),
  getFollowUpMessages: () => agent.getFollowUpQueue(),
};
```

## 多模态消息处理

### 处理图片

```typescript
function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages.map(msg => {
    const content: Content[] = [];
    
    // 如果有附件
    if (msg.attachments) {
      for (const attachment of msg.attachments) {
        if (attachment.type === "image") {
          content.push({
            type: "image",
            source: attachment.source,  // "base64" | "url"
            data: attachment.data,
            mimeType: attachment.mimeType,
          });
        }
      }
    }
    
    // 添加文本
    if (msg.content) {
      content.push({ type: "text", text: msg.content });
    }
    
    return {
      role: msg.type === "user" ? "user" : "assistant",
      content,
    };
  });
}
```

## 总结

消息转换与上下文管理是 Agent 的核心机制：

1. **convertToLlm** - 将 AgentMessage 转换为 LLM Message
2. **transformContext** - 添加系统提示、截断上下文
3. **消息队列** - steeringQueue 和 followUpQueue 分离用户输入和自动消息
4. **多模态支持** - 处理文本、图片等多种内容类型

这种设计让 Agent 能够灵活地控制与 LLM 的交互，支持各种复杂场景。

---

**至此，pi-agent 核心篇章完成！** 接下来可以进入 pi-tui、pi-coding-agent 等应用层的教程。
