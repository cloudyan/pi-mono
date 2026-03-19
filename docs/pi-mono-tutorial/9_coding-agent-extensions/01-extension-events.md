# 01. 事件驱动架构

> **难度：进阶** | **预计阅读时间：30 分钟**

## 问题引入

想象这样一个场景：你想在 pi 执行 `rm -rf` 命令前弹出一个确认框，或者在每次工具执行后记录日志，甚至想在 Agent 思考时实时显示进度。

传统的做法是什么？你可能需要修改 pi 的源码，在关键位置插入钩子函数。但这样做有几个问题：

1. **侵入性强** - 需要修改核心代码，升级时容易冲突
2. **耦合度高** - 功能和核心逻辑混在一起，难以维护
3. **扩展困难** - 每增加一个功能都要改源码

pi 的 Extension 系统采用**事件驱动架构**来解决这些问题。通过定义清晰的事件类型和生命周期，扩展可以**非侵入式**地监听和干预 Agent 的行为。

### 事件驱动 vs Hook 系统

| 特性 | Hook 系统（传统） | 事件驱动（Extension） |
|-----|-----------------|---------------------|
| 调用方式 | 同步函数调用 | 异步事件分发 |
| 拦截能力 | 需要返回值约定 | 明确的返回类型定义 |
| 类型安全 | 运行时检查 | 编译时类型检查 |
| 扩展组合 | 难以组合多个 Hook | 多个处理器链式调用 |
| 错误处理 | 需要手动传播 | 自动隔离，不影响其他扩展 |

## 核心概念

### 事件类型总览

Extension 系统定义了 **29 种事件类型**，按功能分为以下几类：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Extension 事件类型总览                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Session 事件 │  │ Agent 事件  │  │ Tool 事件   │             │
│  │ (11 种)     │  │ (10 种)     │  │ (5 种)      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Model 事件  │  │ Input 事件  │  │ Resource 事件│             │
│  │ (1 种)     │  │ (1 种)      │  │ (1 种)      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 事件分类详解

#### 1. Session 事件（会话生命周期）

Session 事件覆盖会话从创建到销毁的完整生命周期：

```typescript
// 会话事件类型定义（简化版）
type SessionEvent =
  | SessionDirectoryEvent    // 会话目录解析
  | SessionStartEvent        // 会话启动
  | SessionBeforeSwitchEvent // 会话切换前（可取消）
  | SessionSwitchEvent       // 会话切换后
  | SessionBeforeForkEvent   // 会话分叉前（可取消）
  | SessionForkEvent         // 会话分叉后
  | SessionBeforeCompactEvent// 上下文压缩前（可取消/自定义）
  | SessionCompactEvent      // 上下文压缩后
  | SessionBeforeTreeEvent   // 树导航前（可取消/自定义）
  | SessionTreeEvent         // 树导航后
  | SessionShutdownEvent;    // 会话关闭
```

**事件触发时序：**

```
pi 启动
    │
    ├──► session_directory  [仅 CLI 启动时]
    │
    └──► session_start
          │
          ▼
    用户操作 (/new, /resume, /fork, /tree)
          │
          ├──► session_before_switch / session_switch
          │
          ├──► session_before_fork / session_fork
          │
          └──► session_before_tree / session_tree
          │
    自动/手动压缩
          │
          └──► session_before_compact / session_compact
          │
    退出 (Ctrl+C, Ctrl+D)
          │
          └──► session_shutdown
```

#### 2. Agent 事件（Agent 执行周期）

Agent 事件覆盖从用户输入到 Agent 响应的完整流程：

```typescript
// Agent 相关事件
type AgentEvents =
  | BeforeAgentStartEvent     // Agent 启动前（可注入消息/修改系统提示）
  | AgentStartEvent           // Agent 启动
  | AgentEndEvent             // Agent 结束
  | TurnStartEvent            // Turn 开始
  | TurnEndEvent              // Turn 结束
  | ContextEvent              // 上下文构建（可修改消息）
  | BeforeProviderRequestEvent// Provider 请求前（可查看/替换载荷）
  | MessageStartEvent         // 消息开始
  | MessageUpdateEvent        // 消息更新（流式）
  | MessageEndEvent;          // 消息结束
```

**事件触发时序：**

```
用户发送消息
    │
    ├──► before_agent_start  [可注入消息/修改系统提示]
    │
    ├──► agent_start
    │
    │   ┌─── Turn 循环（LLM 可能多次调用工具）───┐
    │   │                                        │
    │   ├──► turn_start                         │
    │   ├──► context              [可修改消息]   │
    │   ├──► before_provider_request            │
    │   │                                        │
    │   │   LLM 响应：                          │
    │   │     ├──► message_start                │
    │   │     ├──► message_update (多次)        │
    │   │     └──► message_end                  │
    │   │                                        │
    │   └──► turn_end                           │
    │   │                                        │
    │   └────────────────────────────────────────┘
    │
    └──► agent_end
```

#### 3. Tool 事件（工具执行）

Tool 事件提供对工具执行的细粒度控制：

```typescript
// Tool 相关事件
type ToolEvents =
  | ToolExecutionStartEvent   // 工具开始执行
  | ToolCallEvent             // 工具调用前（可阻止）
  | ToolExecutionUpdateEvent  // 工具执行中（流式输出）
  | ToolResultEvent           // 工具结果（可修改）
  | ToolExecutionEndEvent;    // 工具执行结束
```

**事件触发时序：**

```
LLM 决定调用工具
    │
    ├──► tool_execution_start    [显示工具开始]
    │
    ├──► tool_call               [可阻止执行]
    │
    │   执行工具...
    │   │
    │   ├──► tool_execution_update (多次)  [流式输出]
    │   │
    └──► tool_result             [可修改结果]
    │
    └──► tool_execution_end      [显示工具结束]
```

#### 4. 其他事件

```typescript
// Model 事件
type ModelEvents = ModelSelectEvent;  // 模型切换

// Input 事件
type InputEvents = InputEvent;        // 用户输入（可拦截/转换/处理）

// Resource 事件
type ResourceEvents = ResourcesDiscoverEvent;  // 资源发现

// User Bash 事件
type UserBashEvents = UserBashEvent;  // 用户执行 bash 命令
```

### 事件结构

每个事件都有统一的结构模式：

```typescript
// 通用事件结构（概念模型）
interface Event {
  type: string;           // 事件类型标识
  // ...事件特有字段
}

// 示例：ToolCallEvent
interface BashToolCallEvent {
  type: "tool_call";
  toolName: "bash";
  toolCallId: string;     // 工具调用唯一标识
  input: {
    command: string;      // bash 命令
    timeout?: number;     // 超时时间
  };
}
```

### 事件处理器

事件处理器接收事件和上下文，可以返回结果来影响后续流程：

```typescript
// 处理器签名
type ExtensionHandler<E, R = undefined> = (
  event: E,               // 事件数据
  ctx: ExtensionContext   // 运行时上下文
) => Promise<R | void> | R | void;
```

## 实现详解

### 事件类型定义

pi 使用 TypeScript 的字面量联合类型来定义事件，确保编译时类型安全：

```typescript
// packages/coding-agent/src/core/extensions/types.ts

// 会话事件联合类型
export type SessionEvent =
  | SessionDirectoryEvent
  | SessionStartEvent
  | SessionBeforeSwitchEvent
  | SessionSwitchEvent
  | SessionBeforeForkEvent
  | SessionForkEvent
  | SessionBeforeCompactEvent
  | SessionCompactEvent
  | SessionShutdownEvent
  | SessionBeforeTreeEvent
  | SessionTreeEvent;

// 完整的 ExtensionEvent 联合类型
export type ExtensionEvent =
  | ResourcesDiscoverEvent
  | SessionEvent
  | ContextEvent
  | BeforeProviderRequestEvent
  | BeforeAgentStartEvent
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | ModelSelectEvent
  | UserBashEvent
  | InputEvent
  | ToolCallEvent
  | ToolResultEvent;
```

### 事件结果类型

不同事件可以返回不同类型的结果：

```typescript
// 可取消的事件结果
interface SessionBeforeSwitchResult {
  cancel?: boolean;  // 取消操作
}

// 可修改的事件结果
interface ToolResultEventResult {
  content?: (TextContent | ImageContent)[];  // 修改输出内容
  details?: unknown;                         // 修改详情
  isError?: boolean;                         // 修改错误状态
}

// 可阻止的事件结果
interface ToolCallEventResult {
  block?: boolean;    // 阻止工具执行
  reason?: string;    // 阻止原因
}

// 可转换的事件结果
type InputEventResult =
  | { action: "continue" }                                    // 继续正常流程
  | { action: "transform"; text: string; images?: ImageContent[] }  // 转换输入
  | { action: "handled" };                                    // 已处理，跳过 Agent
```

### 类型守卫

对于 Tool 事件，pi 提供了类型守卫函数来精确判断工具类型：

```typescript
// 类型守卫函数
export function isToolCallEventType(toolName: "bash", event: ToolCallEvent): event is BashToolCallEvent;
export function isToolCallEventType(toolName: "read", event: ToolCallEvent): event is ReadToolCallEvent;
export function isToolCallEventType(toolName: "edit", event: ToolCallEvent): event is EditToolCallEvent;
// ... 其他内置工具

// 使用示例
pi.on("tool_call", async (event, ctx) => {
  // 使用类型守卫获得精确类型
  if (isToolCallEventType("bash", event)) {
    // event.input.command 类型为 string
    console.log(`执行命令: ${event.input.command}`);
  }

  if (isToolCallEventType("read", event)) {
    // event.input.path 类型为 string
    console.log(`读取文件: ${event.input.path}`);
  }
});
```

### ExtensionContext 结构

所有事件处理器（除 `session_directory`）都接收 `ExtensionContext`：

```typescript
export interface ExtensionContext {
  // UI 交互（仅在交互模式可用）
  ui: ExtensionUIContext;

  // UI 是否可用（print/RPC 模式下为 false）
  hasUI: boolean;

  // 当前工作目录
  cwd: string;

  // 会话管理器（只读）
  sessionManager: ReadonlySessionManager;

  // 模型注册表
  modelRegistry: ModelRegistry;

  // 当前模型
  model: Model<any> | undefined;

  // Agent 状态检查
  isIdle(): boolean;

  // 中止当前操作
  abort(): void;

  // 是否有待处理消息
  hasPendingMessages(): boolean;

  // 优雅关闭
  shutdown(): void;

  // 获取上下文使用情况
  getContextUsage(): ContextUsage | undefined;

  // 触发压缩
  compact(options?: CompactOptions): void;

  // 获取当前系统提示
  getSystemPrompt(): string;
}
```

## 使用模式

### 模式 1：监听事件（只读观察）

最简单的用法是监听事件并观察：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 监听 Agent 启动
  pi.on("agent_start", async (_event, ctx) => {
    console.log(`[日志] Agent 启动，工作目录: ${ctx.cwd}`);
  });

  // 监听 Turn 结束，记录 token 使用
  pi.on("turn_end", async (event, _ctx) => {
    console.log(`[日志] Turn ${event.turnIndex} 完成`);
  });

  // 监听模型切换
  pi.on("model_select", async (event, _ctx) => {
    const prev = event.previousModel
      ? `${event.previousModel.provider}/${event.previousModel.id}`
      : "无";
    const next = `${event.model.provider}/${event.model.id}`;
    console.log(`[日志] 模型切换: ${prev} → ${next} (来源: ${event.source})`);
  });
}
```

### 模式 2：拦截事件（阻止操作）

某些事件支持返回结果来阻止操作：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 阻止危险的 bash 命令
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;

    // 检查危险命令
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,        // rm -rf /
      /rm\s+-rf\s+~/,         // rm -rf ~
      /:\(\)\{ :\|:& \};:/,   // fork bomb
      /mkfs/,                  // 格式化
      /dd\s+if=/,             // dd 命令
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        // 弹出确认框
        const ok = await ctx.ui.confirm(
          "危险操作",
          `即将执行: ${command}\n\n此命令可能造成不可逆的后果，是否继续？`
        );

        if (!ok) {
          return { block: true, reason: "用户取消危险操作" };
        }
      }
    }
  });

  // 阻止写入敏感文件
  pi.on("tool_call", async (event, _ctx) => {
    if (!isToolCallEventType("write", event)) return;

    const protectedFiles = [".env", ".env.local", "credentials.json"];
    const filePath = event.input.filePath;

    if (protectedFiles.some(f => filePath.endsWith(f))) {
      return {
        block: true,
        reason: `禁止写入敏感文件: ${filePath}`
      };
    }
  });
}
```

### 模式 3：修改事件结果

某些事件允许修改返回结果：

```typescript
import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 修改 bash 工具输出，添加时间戳
  pi.on("tool_result", async (event, _ctx) => {
    if (!isBashToolResult(event)) return;

    // 只修改成功的输出
    if (event.isError) return;

    const timestamp = new Date().toISOString();
    const content = event.content;

    // 找到文本内容并添加时间戳
    const modifiedContent = content.map(c => {
      if (c.type === "text") {
        return {
          ...c,
          text: `[${timestamp}]\n${c.text}`
        };
      }
      return c;
    });

    return { content: modifiedContent };
  });

  // 修改上下文，过滤敏感信息
  pi.on("context", async (event, _ctx) => {
    const messages = event.messages;

    // 过滤掉包含敏感信息的消息
    const filtered = messages.filter(msg => {
      if (msg.role === "user") {
        const text = JSON.stringify(msg.content);
        // 检查是否包含 API key 等敏感信息
        if (/sk-[a-zA-Z0-9]{20,}/.test(text)) {
          console.log("[安全] 已过滤包含 API key 的消息");
          return false;
        }
      }
      return true;
    });

    return { messages: filtered };
  });
}
```

### 模式 4：转换用户输入

`input` 事件支持转换用户输入：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    const text = event.text;

    // 快捷命令转换
    if (text === "??") {
      // 转换为代码审查提示
      return {
        action: "transform",
        text: `Review the code changes in the current directory for:
- Potential bugs and errors
- Security vulnerabilities
- Performance issues
- Code style and best practices

Provide actionable feedback with specific line references.`
      };
    }

    // 快捷提问
    if (text.startsWith("?q ")) {
      // 转换为简洁回答模式
      return {
        action: "transform",
        text: `Answer briefly (1-2 sentences): ${text.slice(3)}`
      };
    }

    // 拦截特定命令
    if (text === "/ping") {
      ctx.ui.notify("pong!", "info");
      return { action: "handled" };
    }

    // 继续正常处理
    return { action: "continue" };
  });
}
```

### 模式 5：自定义压缩

`session_before_compact` 事件允许自定义压缩逻辑：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    const { preparation, branchEntries, signal } = event;

    // 检查是否被取消
    if (signal?.aborted) {
      return { cancel: true };
    }

    // 自定义压缩策略：保留更多最近的消息
    const recentCount = 10;
    const recentEntries = branchEntries.slice(-recentCount);

    // 生成摘要
    const olderEntries = branchEntries.slice(0, -recentCount);
    const summary = await generateSummary(olderEntries, ctx);

    // 返回自定义压缩结果
    return {
      compaction: {
        summary,
        firstKeptEntryId: recentEntries[0]?.id,
        tokensBefore: preparation.tokensBefore,
      }
    };
  });
}

// 辅助函数：生成摘要
async function generateSummary(
  entries: any[],
  ctx: any
): Promise<string> {
  // 提取关键信息
  const topics = new Set<string>();
  const tools = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "message") {
      // 分析消息内容，提取主题
      // ...省略具体实现
    }
  }

  return `之前讨论的主题: ${[...topics].join(", ")}
使用的工具: ${[...tools].join(", ")}`;
}
```

### 模式 6：注入上下文

`before_agent_start` 事件允许注入消息和修改系统提示：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    // 获取 Git 状态
    const gitStatus = await getGitStatus(ctx.cwd);

    // 构建注入内容
    const injectedContext = `
## 当前项目状态

- 分支: ${gitStatus.branch}
- 未提交更改: ${gitStatus.changes} 个文件
- 最近提交: ${gitStatus.lastCommit}

## 重要提醒

- 请在修改代码前确保理解当前上下文
- 建议小步提交，避免大量代码变更
`;

    // 返回修改后的系统提示
    return {
      systemPrompt: event.systemPrompt + injectedContext
    };
  });
}

// 辅助函数
async function getGitStatus(cwd: string) {
  // 使用 pi.exec 执行 git 命令
  // ...省略具体实现
  return {
    branch: "main",
    changes: 3,
    lastCommit: "feat: add extension events docs"
  };
}
```

## 最佳实践

### 应该做的

1. **使用类型守卫判断事件类型**

```typescript
// 正确：使用类型守卫
if (isToolCallEventType("bash", event)) {
  // event.input 类型精确
}

// 错误：直接判断字符串
if (event.toolName === "bash") {
  // CustomToolCallEvent 的 toolName 是 string，会有类型问题
}
```

2. **处理事件处理器中的错误**

```typescript
pi.on("tool_call", async (event, ctx) => {
  try {
    // 可能失败的操作
    await riskyOperation();
  } catch (error) {
    // 记录错误，但不影响其他扩展
    console.error(`[扩展错误] ${error.message}`);
    // 可以选择通知用户
    ctx.ui.notify(`操作失败: ${error.message}`, "error");
    // 不要重新抛出，避免中断事件流
  }
});
```

3. **检查 hasUI 后再使用 UI 功能**

```typescript
pi.on("agent_start", async (_event, ctx) => {
  // 在 print/RPC 模式下，UI 不可用
  if (!ctx.hasUI) {
    console.log("Agent 启动");
    return;
  }

  // 安全使用 UI
  ctx.ui.notify("Agent 启动", "info");
});
```

4. **尊重 AbortSignal**

```typescript
pi.on("session_before_compact", async (event, _ctx) => {
  const { signal } = event;

  // 长时间操作前检查取消状态
  if (signal?.aborted) {
    return { cancel: true };
  }

  // 执行操作时传递 signal
  const result = await longRunningOperation(signal);

  // 再次检查
  if (signal?.aborted) {
    return { cancel: true };
  }

  return { compaction: result };
});
```

### 避免的错误

1. **不要在事件处理器中调用阻塞方法**

```typescript
// 错误：在事件处理器中等待空闲
pi.on("tool_call", async (event, ctx) => {
  // 这会导致死锁！
  await ctx.waitForIdle();  // ❌ ExtensionContext 没有 waitForIdle
});

// 正确：使用命令处理器
pi.registerCommand("my-cmd", {
  handler: async (args, ctx) => {
    await ctx.waitForIdle();  // ✅ ExtensionCommandContext 有这个方法
  }
});
```

2. **不要依赖处理器执行顺序**

```typescript
// 危险：假设其他扩展先处理
pi.on("tool_result", async (event, ctx) => {
  // 处理器执行顺序是扩展加载顺序
  // 不应该假设其他扩展已经处理过
});

// 正确：每个处理器独立处理
pi.on("tool_result", async (event, ctx) => {
  // 自己处理，不依赖其他扩展
});
```

3. **不要在 `session_directory` 中使用 ctx**

```typescript
// 错误：session_directory 没有 ctx
pi.on("session_directory", async (event, ctx) => {  // ❌ ctx 是 undefined
  ctx.ui.notify("...");
});

// 正确：session_directory 只接收 event
pi.on("session_directory", async (event) => {  // ✅ 没有 ctx 参数
  return { sessionDir: `/custom/path/${event.cwd}` };
});
```

4. **不要过度使用事件拦截**

```typescript
// 错误：拦截所有工具调用
pi.on("tool_call", async (event, ctx) => {
  // 这会弹出大量确认框，用户体验差
  const ok = await ctx.ui.confirm("确认", "执行此工具？");
  if (!ok) return { block: true };
});

// 正确：只拦截特定情况
pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    if (isDangerous(event.input.command)) {
      const ok = await ctx.ui.confirm("危险操作", "...");
      if (!ok) return { block: true };
    }
  }
});
```

## 总结

本章介绍了 pi Extension 系统的事件驱动架构：

1. **事件类型丰富** - 29 种事件类型覆盖 Agent 执行的各个方面，从会话生命周期到工具执行细节。

2. **类型安全** - TypeScript 联合类型和类型守卫确保编译时类型检查，减少运行时错误。

3. **可拦截可修改** - 部分事件支持返回结果来阻止操作或修改结果，提供强大的控制能力。

4. **非侵入式扩展** - 通过事件监听实现功能扩展，无需修改核心代码，升级友好。

5. **上下文隔离** - 每个事件处理器都有独立的上下文，错误不会传播到其他扩展。

## 下篇预告

下一章 **《02-extension-api.md》- Extension API 详解** 将深入讲解：

- `ExtensionAPI` 接口的完整定义
- 工具注册 (`registerTool`) 的高级用法
- 自定义 UI 组件和渲染
- Provider 注册和 OAuth 集成
- 完整的实战示例

---

> **相关资源**
> - 源码: `packages/coding-agent/src/core/extensions/types.ts`
> - 官方文档: `packages/coding-agent/docs/extensions.md`
> - 示例代码: `packages/coding-agent/examples/extensions/`