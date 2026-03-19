# 交互模式与 TUI

> **难度：进阶** | **预计阅读时间：25 分钟**

上一章我们了解了会话管理。本章将深入交互模式与 TUI 实现——这是 pi-coding-agent 提供用户体验的核心。

## TUI 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Interactive 模式 TUI 架构                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      TUI 容器                            │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  消息列表组件                                    │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │   │
│  │  │  │ UserMsg │  │ AIMsg   │  │ ToolMsg │         │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘         │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  输入框组件                                      │   │   │
│  │  │  > [输入...]                           [Send]   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  状态栏                                          │   │   │
│  │  │  Model: claude-sonnet | Tokens: 5k | Tools: 4   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      Agent Session                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ Agent   │  │  Tools  │  │ History │  │ Context │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 消息列表组件

### 消息渲染

```typescript
// packages/coding-agent/src/modes/interactive/components/message-list.ts

export class MessageList implements Component {
  private messages: MessageItem[] = [];
  private scrollOffset: number = 0;

  render(width: number): string[] {
    const lines: string[] = [];
    
    // 渲染每条消息
    for (const message of this.messages) {
      const messageLines = this.renderMessage(message, width);
      lines.push(...messageLines);
      lines.push("");  // 空行分隔
    }
    
    // 应用滚动
    return lines.slice(this.scrollOffset, this.scrollOffset + this.getHeight());
  }

  private renderMessage(message: MessageItem, width: number): string[] {
    switch (message.role) {
      case "user":
        return this.renderUserMessage(message, width);
      case "assistant":
        return this.renderAssistantMessage(message, width);
      case "tool":
        return this.renderToolMessage(message, width);
      default:
        return [];
    }
  }

  private renderUserMessage(message: MessageItem, width: number): string[] {
    const lines: string[] = [];
    const content = message.content[0]?.text || "";
    
    // 用户消息样式：右对齐，蓝色
    const wrapped = wrapText(content, width - 4);
    for (const line of wrapped) {
      lines.push(`  \x1b[34m${line.padEnd(width - 4)}\x1b[0m`);
    }
    
    return lines;
  }

  private renderAssistantMessage(message: MessageItem, width: number): string[] {
    const lines: string[] = [];
    const content = message.content[0]?.text || "";
    
    // AI 消息样式：左对齐，渲染 Markdown
    const markdown = new Markdown(content);
    const rendered = markdown.render(width - 4);
    
    for (const line of rendered) {
      lines.push(`\x1b[37m${line}\x1b[0m`);
    }
    
    return lines;
  }

  private renderToolMessage(message: MessageItem, width: number): string[] {
    const lines: string[] = [];
    const toolCall = message.toolCall!;
    
    // 工具消息样式：灰色，带图标
    const icon = toolCall.status === "running" ? "⏳" :
                 toolCall.status === "success" ? "✓" :
                 toolCall.status === "error" ? "✗" : "•";
    
    lines.push(`  \x1b[90m${icon} ${toolCall.tool}\x1b[0m`);
    
    if (toolCall.result) {
      const resultLines = wrapText(toolCall.result, width - 6);
      for (const line of resultLines.slice(0, 3)) {  // 最多显示 3 行
        lines.push(`    \x1b[90m${line}\x1b[0m`);
      }
      if (resultLines.length > 3) {
        lines.push(`    \x1b[90m... (${resultLines.length - 3} more lines)\x1b[0m`);
      }
    }
    
    return lines;
  }
}
```

### 流式消息显示

```typescript
// 处理流式响应
export class MessageList {
  private currentStreamingMessage?: MessageItem;

  startStreaming(): void {
    this.currentStreamingMessage = {
      role: "assistant",
      content: [{ type: "text", text: "" }],
      timestamp: Date.now(),
    };
    this.messages.push(this.currentStreamingMessage);
  }

  appendStreaming(text: string): void {
    if (this.currentStreamingMessage) {
      this.currentStreamingMessage.content[0].text += text;
      this.invalidate();
      this.tui.requestRender();
    }
  }

  endStreaming(): void {
    this.currentStreamingMessage = undefined;
  }
}
```

## 输入框组件

### 多行输入

```typescript
// packages/coding-agent/src/modes/interactive/components/chat-input.ts

export class ChatInput implements Component, Focusable {
  focused: boolean = false;
  private lines: string[] = [""];
  private cursorLine: number = 0;
  private cursorCol: number = 0;

  render(width: number): string[] {
    const lines: string[] = [];
    
    // 渲染输入提示符
    for (let i = 0; i < this.lines.length; i++) {
      const prefix = i === 0 ? "> " : "  ";
      const line = this.lines[i];
      
      // 如果获得焦点，渲染光标
      if (this.focused && i === this.cursorLine) {
        const before = line.slice(0, this.cursorCol);
        const at = line[this.cursorCol] || " ";
        const after = line.slice(this.cursorCol + 1);
        lines.push(`${prefix}${before}${CURSOR_MARKER}\x1b[7m${at}\x1b[27m${after}`);
      } else {
        lines.push(`${prefix}${line}`);
      }
    }
    
    return lines;
  }

  handleInput(data: string): void {
    switch (data) {
      case "Enter":
        // Shift+Enter 换行，Enter 提交
        if (this.isShiftPressed) {
          this.insertNewLine();
        } else {
          this.submit();
        }
        break;
        
      case "Backspace":
        this.deleteChar();
        break;
        
      case "ArrowUp":
        this.moveUp();
        break;
        
      case "ArrowDown":
        this.moveDown();
        break;
        
      case "ArrowLeft":
        this.moveLeft();
        break;
        
      case "ArrowRight":
        this.moveRight();
        break;
        
      default:
        if (data.length === 1) {
          this.insertChar(data);
        }
    }
  }

  private submit(): void {
    const text = this.lines.join("\n");
    if (text.trim()) {
      this.onSubmit?.(text);
      this.clear();
    }
  }

  private clear(): void {
    this.lines = [""];
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.invalidate();
  }
}
```

## 状态栏组件

```typescript
// packages/coding-agent/src/modes/interactive/components/status-bar.ts

export class StatusBar implements Component {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  render(width: number): string[] {
    const state = this.session.getState();
    const agent = this.session.getAgent();
    
    // 构建状态信息
    const parts: string[] = [];
    
    // 模型信息
    parts.push(`Model: ${agent.model.modelId}`);
    
    // Token 统计
    parts.push(`Tokens: ${formatNumber(state.stats.tokenCount)}`);
    
    // 消息数
    parts.push(`Messages: ${state.stats.messageCount}`);
    
    // 当前阶段
    parts.push(`Phase: ${state.phase}`);
    
    // Git 分支
    if (state.context.gitBranch) {
      parts.push(`Branch: ${state.context.gitBranch}`);
    }
    
    // 组合状态栏
    const status = parts.join(" | ");
    const padded = status.padEnd(width, " ");
    
    // 反色显示
    return [`\x1b[7m${padded}\x1b[0m`];
  }
}
```

## 工具调用显示

### 实时显示工具调用

```typescript
// packages/coding-agent/src/modes/interactive/interactive.ts

export async function runInteractiveMode(args: CliArgs): Promise<void> {
  const session = await createOrLoadSession(args);
  
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  
  // 消息列表
  const messageList = new MessageList();
  tui.addChild(messageList);
  
  // 输入框
  const input = new ChatInput();
  input.onSubmit = async (text) => {
    // 显示用户消息
    messageList.addUserMessage(text);
    
    // 发送给 Agent
    await session.sendMessage(text);
  };
  tui.addChild(input);
  tui.setFocus(input);
  
  // 状态栏
  const statusBar = new StatusBar(session);
  tui.addChild(statusBar);
  
  // 订阅 Agent 事件
  session.agent.subscribe((event) => {
    switch (event.type) {
      case "message_start":
        if (event.message.role === "assistant") {
          messageList.startStreaming();
        }
        break;
        
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          messageList.appendStreaming(event.assistantMessageEvent.delta);
        }
        break;
        
      case "message_end":
        messageList.endStreaming();
        break;
        
      case "tool_execution_start":
        messageList.addToolCall({
          tool: event.toolName,
          status: "running",
          args: event.args,
        });
        break;
        
      case "tool_execution_end":
        messageList.updateToolCall({
          tool: event.toolName,
          status: event.isError ? "error" : "success",
          result: event.result,
        });
        break;
        
      case "agent_start":
        statusBar.setPhase("thinking");
        break;
        
      case "agent_end":
        statusBar.setPhase("idle");
        break;
    }
    
    tui.requestRender();
  });
  
  // 启动
  tui.start();
}
```

## 快捷键支持

```typescript
// packages/coding-agent/src/modes/interactive/keybindings.ts

export const defaultKeybindings: Keybinding[] = [
  {
    key: "Ctrl+C",
    action: () => {
      // 复制选中内容
    },
  },
  {
    key: "Ctrl+V",
    action: () => {
      // 粘贴
    },
  },
  {
    key: "Ctrl+S",
    action: (session) => {
      session.save();
      showNotification("Session saved");
    },
  },
  {
    key: "Ctrl+Q",
    action: (session, tui) => {
      tui.stop();
    },
  },
  {
    key: "Ctrl+L",
    action: (session, tui, messageList) => {
      messageList.clear();
    },
  },
  {
    key: "Ctrl+ArrowUp",
    action: (session, tui, messageList) => {
      messageList.scrollUp();
    },
  },
  {
    key: "Ctrl+ArrowDown",
    action: (session, tui, messageList) => {
      messageList.scrollDown();
    },
  },
];

// 处理快捷键
export function handleKeybinding(
  key: string,
  session: Session,
  tui: TUI,
  messageList: MessageList
): boolean {
  const binding = defaultKeybindings.find(b => b.key === key);
  if (binding) {
    binding.action(session, tui, messageList);
    return true;
  }
  return false;
}
```

## 完整示例

```typescript
// packages/coding-agent/src/modes/interactive/interactive.ts

export async function runInteractiveMode(args: CliArgs): Promise<void> {
  // 1. 创建或加载会话
  const session = args.session
    ? await loadSession(args.session)
    : await createSession({
        name: args.session || generateSessionName(),
        model: args.model,
      });

  // 2. 创建 TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // 3. 创建组件
  const messageList = new MessageList();
  const input = new ChatInput();
  const statusBar = new StatusBar(session);

  // 4. 配置组件
  input.onSubmit = async (text) => {
    messageList.addUserMessage(text);
    await session.sendMessage(text);
  };

  // 5. 添加到 TUI
  tui.addChild(messageList);
  tui.addChild(input);
  tui.addChild(statusBar);
  tui.setFocus(input);

  // 6. 订阅事件
  setupEventHandlers(session, tui, messageList, statusBar);

  // 7. 启动
  console.log("Starting interactive mode...");
  console.log(`Session: ${session.name}`);
  console.log(`Model: ${session.agent.model.modelId}`);
  console.log("Press Ctrl+Q to quit\n");
  
  tui.start();
}

function setupEventHandlers(
  session: Session,
  tui: TUI,
  messageList: MessageList,
  statusBar: StatusBar
): void {
  session.agent.subscribe((event) => {
    switch (event.type) {
      case "message_start":
        if (event.message.role === "assistant") {
          messageList.startStreaming();
          statusBar.setPhase("thinking");
        }
        break;
        
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          messageList.appendStreaming(event.assistantMessageEvent.delta);
        }
        break;
        
      case "message_end":
        messageList.endStreaming();
        statusBar.setPhase("idle");
        break;
        
      case "tool_execution_start":
        messageList.addToolCall({
          tool: event.toolName,
          status: "running",
        });
        break;
        
      case "tool_execution_end":
        messageList.updateToolCall({
          tool: event.toolName,
          status: event.isError ? "error" : "success",
        });
        break;
    }
    
    tui.requestRender();
  });
}
```

## 最佳实践

### ✅ 应该做的

1. **实时显示流式输出**
   ```typescript
   session.agent.subscribe((event) => {
     if (event.type === "message_update") {
       messageList.appendStreaming(event.assistantMessageEvent.delta);
       tui.requestRender();
     }
   });
   ```

2. **显示工具调用状态**
   ```typescript
   // 显示工具开始
   messageList.addToolCall({ tool: event.toolName, status: "running" });
   
   // 更新工具完成
   messageList.updateToolCall({ tool: event.toolName, status: "success" });
   ```

3. **支持多行输入**
   ```typescript
   // Shift+Enter 换行
   // Enter 提交
   ```

### ❌ 避免的错误

1. **阻塞渲染线程**
   ```typescript
   // ❌ 错误：同步等待
   const response = await session.sendMessage(text);
   messageList.addMessage(response);  // 阻塞直到完成
   
   // ✅ 正确：流式更新
   await session.sendMessage(text);  // 非阻塞，通过事件更新
   ```

2. **忽略 IME 输入**
   ```typescript
   // ✅ 正确：使用硬件光标
   render(width: number): string[] {
     const marker = this.focused ? CURSOR_MARKER : "";
     return [`${before}${marker}\x1b[7m${cursor}\x1b[27m${after}`];
   }
   ```

## 总结

交互模式与 TUI 的核心要点：

1. **消息列表**：渲染不同类型的消息（用户、AI、工具）
2. **流式显示**：实时显示 AI 的流式输出
3. **输入框**：多行输入，支持快捷键
4. **状态栏**：显示会话状态和统计信息
5. **工具调用显示**：实时显示工具执行状态
6. **快捷键**：支持常用操作的快捷键

---

**下篇预告**: [06-advanced-features.md](06-advanced-features.md) —— 高级功能与最佳实践，包括自定义工具、插件系统、性能优化、安全实践等。
