# 高级模式与最佳实践

> **难度：专家** | **预计阅读时间：25 分钟**

在前面的章节中，我们已经掌握了 pi-tui 的核心概念。本章将探讨一些高级模式和最佳实践，帮助你构建生产级的 TUI 应用。

## 1. 与 pi-agent 集成

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    聊天应用架构                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      pi-tui 层                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │  TUI    │  │  Chat   │  │  Input  │  │Markdown │  │   │
│  │  │ 容器    │  │ 组件    │  │ 组件    │  │ 组件    │  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  │       └────────────┴────────────┴────────────┘        │   │
│  │                        │                              │   │
│  └────────────────────────┼──────────────────────────────┘   │
│                           │                                   │
│                           ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      pi-agent 层                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │  Agent  │  │AgentLoop│  │AgentTool│  │ 事件系统 │  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  │       └────────────┴────────────┴────────────┘        │   │
│  │                        │                              │   │
│  └────────────────────────┼──────────────────────────────┘   │
│                           │                                   │
│                           ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      pi-ai 层                            │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ stream  │  │complete │  │ Message │  │  Event  │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 集成实现

```typescript
import { TUI, ProcessTerminal, Text, Input, Markdown } from "@mariozechner/pi-tui";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

class ChatApp {
  private tui: TUI;
  private agent: Agent;
  private messages: Markdown;
  private input: Input;
  private messageHistory: string[] = [];

  constructor() {
    // 初始化 TUI
    const terminal = new ProcessTerminal();
    this.tui = new TUI(terminal);

    // 初始化 Agent
    this.agent = new Agent({
      initialState: {
        systemPrompt: "你是一个有帮助的 AI 助手。",
        model: getModel("anthropic", "claude-sonnet-4-20250514"),
      },
    });

    // 设置消息显示区域
    this.messages = new Markdown("");
    this.tui.addChild(this.messages);

    // 设置输入框
    this.input = new Input();
    this.input.onSubmit = (text) => this.handleSubmit(text);
    this.tui.addChild(this.input);
    this.tui.setFocus(this.input);

    // 订阅 Agent 事件
    this.setupAgentEvents();
  }

  private setupAgentEvents(): void {
    let currentResponse = "";

    this.agent.subscribe((event) => {
      switch (event.type) {
        case "message_start":
          if (event.message.role === "assistant") {
            currentResponse = "";
            this.appendMessage("\n**AI:** ");
          }
          break;

        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            currentResponse += event.assistantMessageEvent.delta;
            // 实时更新显示
            this.updateLastMessage(currentResponse);
          }
          break;

        case "message_end":
          if (event.message.role === "assistant") {
            this.messageHistory.push(`AI: ${currentResponse}`);
            currentResponse = "";
          }
          break;

        case "tool_execution_start":
          this.appendMessage(`\n_正在使用 ${event.toolName}..._`);
          break;

        case "tool_execution_end":
          if (event.isError) {
            this.appendMessage(`\n_工具执行失败_`);
          } else {
            this.appendMessage(`\n_工具执行完成_`);
          }
          break;
      }
    });
  }

  private async handleSubmit(text: string): Promise<void> {
    // 显示用户消息
    this.appendMessage(`\n**You:** ${text}`);
    this.messageHistory.push(`You: ${text}`);

    // 清空输入框
    this.input.clear();

    // 发送给 Agent
    await this.agent.prompt(text);
  }

  private appendMessage(text: string): void {
    const current = this.messages.getText();
    this.messages.setText(current + text);
    this.tui.requestRender();
  }

  private updateLastMessage(text: string): void {
    // 更新最后一条消息（用于流式显示）
    const lines = this.messageHistory.join("\n");
    this.messages.setText(lines + "\n**AI:** " + text);
    this.tui.requestRender();
  }

  start(): void {
    this.tui.start();
  }
}

// 运行
const app = new ChatApp();
app.start();
```

## 2. 性能优化

### 2.1 渲染节流

```typescript
class ThrottledRenderer {
  private tui: TUI;
  private pendingRender = false;
  private renderFrame?: number;

  constructor(tui: TUI) {
    this.tui = tui;
  }

  requestRender(): void {
    if (this.pendingRender) return;
    
    this.pendingRender = true;
    this.renderFrame = requestAnimationFrame(() => {
      this.pendingRender = false;
      this.tui.render();
    });
  }

  dispose(): void {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
    }
  }
}
```

### 2.2 虚拟滚动

```typescript
class VirtualList implements Component {
  private items: string[];
  private visibleCount: number = 20;
  private scrollOffset: number = 0;

  constructor(items: string[]) {
    this.items = items;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const start = this.scrollOffset;
    const end = Math.min(start + this.visibleCount, this.items.length);
    
    for (let i = start; i < end; i++) {
      const line = truncateToWidth(this.items[i], width);
      lines.push(line);
    }
    
    return lines;
  }

  scrollUp(): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - 1);
    this.invalidate();
  }

  scrollDown(): void {
    this.scrollOffset = Math.min(
      this.items.length - this.visibleCount,
      this.scrollOffset + 1
    );
    this.invalidate();
  }

  invalidate(): void {
    // 清除缓存
  }
}
```

### 2.3 组件缓存

```typescript
class CachedComponent implements Component {
  private cache?: string[];
  private cacheWidth?: number;
  private dirty = true;

  render(width: number): string[] {
    // 如果宽度和内容都没变，返回缓存
    if (!this.dirty && this.cache && this.cacheWidth === width) {
      return this.cache;
    }
    
    // 重新渲染
    this.cache = this.doRender(width);
    this.cacheWidth = width;
    this.dirty = false;
    
    return this.cache;
  }

  protected abstract doRender(width: number): string[];

  invalidate(): void {
    this.dirty = true;
    this.cache = undefined;
  }
}
```

## 3. 测试策略

### 3.1 使用 VirtualTerminal

```typescript
import { VirtualTerminal, TUI } from "@mariozechner/pi-tui";
import { describe, it, expect } from "vitest";

describe("ChatApp", () => {
  it("should display user message", async () => {
    // 创建虚拟终端
    const terminal = new VirtualTerminal(80, 24);
    const tui = new TUI(terminal);
    
    // 添加组件
    const text = new Text("Hello");
    tui.addChild(text);
    
    // 渲染
    tui.render();
    
    // 检查输出
    const screen = terminal.getScreen();
    expect(screen).toContain("Hello");
  });

  it("should handle keyboard input", async () => {
    const terminal = new VirtualTerminal(80, 24);
    const tui = new TUI(terminal);
    const input = new Input();
    
    tui.addChild(input);
    tui.setFocus(input);
    
    // 模拟键盘输入
    terminal.simulateInput("H");
    terminal.simulateInput("i");
    
    // 检查状态
    expect(input.getValue()).toBe("Hi");
  });
});
```

### 3.2 快照测试

```typescript
import { describe, it, expect } from "vitest";

describe("Component Rendering", () => {
  it("should render dialog correctly", () => {
    const terminal = new VirtualTerminal(40, 10);
    const tui = new TUI(terminal);
    
    const dialog = new ConfirmDialog("确定要删除吗？");
    tui.showOverlay(new Overlay({ content: dialog }));
    
    tui.render();
    
    // 快照测试
    expect(terminal.getScreen()).toMatchSnapshot();
  });
});
```

### 3.3 集成测试

```typescript
describe("Chat Integration", () => {
  it("should complete chat flow", async () => {
    const app = new ChatApp();
    
    // 模拟用户输入
    await app.simulateInput("Hello");
    await app.simulateSubmit();
    
    // 等待 AI 响应
    await app.waitForResponse();
    
    // 验证消息历史
    expect(app.getMessages()).toContain("You: Hello");
    expect(app.getMessages()).toContain("AI:");
  });
});
```

## 4. 错误处理

### 4.1 全局错误处理

```typescript
class RobustTUI {
  private tui: TUI;

  constructor(terminal: Terminal) {
    this.tui = new TUI(terminal);
    
    // 全局错误处理
    process.on("uncaughtException", (error) => {
      this.handleError(error);
    });
    
    process.on("unhandledRejection", (reason) => {
      this.handleError(reason as Error);
    });
  }

  private handleError(error: Error): void {
    // 显示错误对话框
    const errorDialog = new ErrorDialog(error.message);
    this.tui.showOverlay(new Overlay({
      content: errorDialog,
      modal: true,
    }));
    
    // 记录日志
    console.error("Error:", error);
  }
}
```

### 4.2 组件错误边界

```typescript
class ErrorBoundary implements Component {
  private child: Component;
  private error?: Error;

  constructor(child: Component) {
    this.child = child;
  }

  render(width: number): string[] {
    if (this.error) {
      return [`Error: ${this.error.message}`];
    }
    
    try {
      return this.child.render(width);
    } catch (error) {
      this.error = error as Error;
      return [`Error: ${this.error.message}`];
    }
  }

  handleInput(data: string): void {
    if (this.error) {
      // 按任意键清除错误
      this.error = undefined;
      return;
    }
    
    try {
      this.child.handleInput?.(data);
    } catch (error) {
      this.error = error as Error;
    }
  }

  invalidate(): void {
    this.child.invalidate();
  }
}
```

## 5. 主题系统

### 5.1 主题定义

```typescript
interface Theme {
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    background: string;
    foreground: string;
    muted: string;
    border: string;
  };
  styles: {
    heading: string;
    code: string;
    link: string;
    quote: string;
  };
}

const defaultTheme: Theme = {
  colors: {
    primary: "\x1b[34m",     // 蓝色
    secondary: "\x1b[36m",  // 青色
    success: "\x1b[32m",    // 绿色
    warning: "\x1b[33m",    // 黄色
    error: "\x1b[31m",      // 红色
    background: "",         // 默认
    foreground: "",         // 默认
    muted: "\x1b[90m",      // 灰色
    border: "\x1b[37m",     // 白色
  },
  styles: {
    heading: "\x1b[1m",     // 粗体
    code: "\x1b[90m",       // 灰色
    link: "\x1b[34m\x1b[4m", // 蓝色下划线
    quote: "\x1b[3m",       // 斜体
  },
};
```

### 5.2 主题应用

```typescript
class ThemedText implements Component {
  private text: string;
  private style: keyof Theme["styles"];
  private theme: Theme;

  constructor(text: string, style: keyof Theme["styles"], theme: Theme = defaultTheme) {
    this.text = text;
    this.style = style;
    this.theme = theme;
  }

  render(width: number): string[] {
    const style = this.theme.styles[this.style];
    const reset = "\x1b[0m";
    const line = truncateToWidth(this.text, width);
    return [`${style}${line}${reset}`];
  }

  invalidate(): void {}
}

// 使用
const heading = new ThemedText("标题", "heading");
const code = new ThemedText("const x = 1;", "code");
```

## 6. 布局系统

### 6.1 Flex 布局

```typescript
interface FlexItem {
  component: Component;
  flex?: number;      // 弹性系数
  minWidth?: number;  // 最小宽度
  maxWidth?: number;  // 最大宽度
}

class FlexLayout implements Component {
  private items: FlexItem[];
  private direction: "row" | "column";

  constructor(items: FlexItem[], direction: "row" | "column" = "row") {
    this.items = items;
    this.direction = direction;
  }

  render(width: number): string[] {
    if (this.direction === "column") {
      return this.renderColumn(width);
    } else {
      return this.renderRow(width);
    }
  }

  private renderRow(width: number): string[] {
    const totalFlex = this.items.reduce((sum, item) => sum + (item.flex || 1), 0);
    const lines: string[][] = [];
    let currentX = 0;

    for (const item of this.items) {
      const itemWidth = Math.floor((width * (item.flex || 1)) / totalFlex);
      const clampedWidth = Math.max(
        item.minWidth || 0,
        Math.min(item.maxWidth || Infinity, itemWidth)
      );
      
      const itemLines = item.component.render(clampedWidth);
      lines.push(itemLines);
    }

    // 合并行
    const maxHeight = Math.max(...lines.map(l => l.length));
    const result: string[] = [];
    
    for (let i = 0; i < maxHeight; i++) {
      let line = "";
      for (const itemLines of lines) {
        line += itemLines[i] || " ".repeat(width / this.items.length);
      }
      result.push(line);
    }
    
    return result;
  }

  private renderColumn(width: number): string[] {
    const lines: string[] = [];
    
    for (const item of this.items) {
      const itemLines = item.component.render(width);
      lines.push(...itemLines);
    }
    
    return lines;
  }

  invalidate(): void {
    for (const item of this.items) {
      item.component.invalidate();
    }
  }
}
```

### 6.2 网格布局

```typescript
class GridLayout implements Component {
  private items: Component[];
  private columns: number;

  constructor(items: Component[], columns: number) {
    this.items = items;
    this.columns = columns;
  }

  render(width: number): string[] {
    const cellWidth = Math.floor(width / this.columns);
    const rows: Component[][] = [];
    
    // 分组
    for (let i = 0; i < this.items.length; i += this.columns) {
      rows.push(this.items.slice(i, i + this.columns));
    }
    
    const lines: string[] = [];
    
    for (const row of rows) {
      const cellLines: string[][] = [];
      let maxHeight = 0;
      
      for (const item of row) {
        const itemLines = item.render(cellWidth);
        cellLines.push(itemLines);
        maxHeight = Math.max(maxHeight, itemLines.length);
      }
      
      // 合并单元格
      for (let i = 0; i < maxHeight; i++) {
        let line = "";
        for (const itemLines of cellLines) {
          const cellLine = itemLines[i] || " ".repeat(cellWidth);
          line += cellLine.padEnd(cellWidth);
        }
        lines.push(line);
      }
    }
    
    return lines;
  }

  invalidate(): void {
    for (const item of this.items) {
      item.invalidate();
    }
  }
}
```

## 7. 动画效果

### 7.1 简单动画

```typescript
class AnimatedText implements Component {
  private text: string;
  private progress: number = 0;
  private animation?: NodeJS.Timeout;

  constructor(text: string) {
    this.text = text;
    this.startAnimation();
  }

  private startAnimation(): void {
    this.animation = setInterval(() => {
      this.progress += 0.1;
      if (this.progress >= 1) {
        this.progress = 1;
        clearInterval(this.animation);
      }
      this.invalidate();
    }, 50);
  }

  render(width: number): string[] {
    const visibleLength = Math.floor(this.text.length * this.progress);
    const visible = this.text.slice(0, visibleLength);
    return [visible];
  }

  invalidate(): void {
    // 触发重新渲染
  }

  dispose(): void {
    if (this.animation) {
      clearInterval(this.animation);
    }
  }
}
```

### 7.2 打字机效果

```typescript
class TypewriterText implements Component {
  private text: string;
  private displayedLength: number = 0;
  private typing?: NodeJS.Timeout;
  private onComplete?: () => void;

  constructor(text: string, onComplete?: () => void) {
    this.text = text;
    this.onComplete = onComplete;
    this.startTyping();
  }

  private startTyping(): void {
    this.typing = setInterval(() => {
      if (this.displayedLength < this.text.length) {
        this.displayedLength++;
        this.invalidate();
      } else {
        clearInterval(this.typing);
        this.onComplete?.();
      }
    }, 50);
  }

  render(width: number): string[] {
    const visible = this.text.slice(0, this.displayedLength);
    return [visible];
  }

  invalidate(): void {}

  dispose(): void {
    if (this.typing) {
      clearInterval(this.typing);
    }
  }
}
```

## 8. 完整示例：IDE 插件

```typescript
import { 
  TUI, ProcessTerminal, 
  Text, Input, Editor, Markdown, SelectList,
  Overlay, CURSOR_MARKER 
} from "@mariozechner/pi-tui";
import { Agent } from "@mariozechner/pi-agent-core";

class IDEPlugin {
  private tui: TUI;
  private agent: Agent;
  private editor: Editor;
  private sidebar: SelectList;
  private statusBar: Text;
  private output: Markdown;

  constructor() {
    const terminal = new ProcessTerminal();
    this.tui = new TUI(terminal);

    // 创建布局
    this.createLayout();
    
    // 初始化 Agent
    this.setupAgent();
    
    // 设置快捷键
    this.setupKeybindings();
  }

  private createLayout(): void {
    // 侧边栏 - 文件列表
    this.sidebar = new SelectList([
      { id: "1", label: "src/index.ts" },
      { id: "2", label: "src/utils.ts" },
      { id: "3", label: "package.json" },
    ]);
    this.sidebar.onSelect = (item) => this.openFile(item.label);
    this.tui.addChild(this.sidebar);

    // 编辑器
    this.editor = new Editor({
      lineNumbers: true,
      syntaxHighlighting: true,
      language: "typescript",
    });
    this.tui.addChild(this.editor);

    // 状态栏
    this.statusBar = new Text("Ready");
    this.tui.addChild(this.statusBar);

    // 输出面板
    this.output = new Markdown("");
    this.tui.addChild(this.output);
  }

  private setupAgent(): void {
    this.agent = new Agent({
      initialState: {
        systemPrompt: "你是一个 IDE 编程助手。",
        model: getModel("anthropic", "claude-sonnet-4-20250514"),
        tools: [this.createReadFileTool(), this.createWriteFileTool()],
      },
    });

    // 订阅 Agent 事件
    this.agent.subscribe((event) => {
      switch (event.type) {
        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            this.output.append(event.assistantMessageEvent.delta);
            this.tui.requestRender();
          }
          break;
        case "tool_execution_start":
          this.statusBar.setText(`Running ${event.toolName}...`);
          break;
        case "tool_execution_end":
          this.statusBar.setText("Ready");
          break;
      }
    });
  }

  private setupKeybindings(): void {
    // 全局快捷键
    this.tui.onKey = (key) => {
      switch (key) {
        case "Ctrl+P":
          this.showFilePicker();
          return true;  // 已处理
        case "Ctrl+Shift+P":
          this.showCommandPalette();
          return true;
        case "Ctrl+B":
          this.toggleSidebar();
          return true;
        case "Ctrl+`":
          this.toggleOutput();
          return true;
        case "Ctrl+S":
          this.saveFile();
          return true;
        case "Escape":
          this.hideOverlays();
          return true;
      }
      return false;  // 未处理
    };
  }

  private showFilePicker(): void {
    const files = this.getAllFiles();
    const picker = new SelectList(files.map(f => ({ id: f, label: f })));
    picker.onSelect = (item) => {
      this.openFile(item.label);
      this.tui.hideOverlay(overlay);
    };
    
    const overlay = new Overlay({
      content: picker,
      modal: true,
      dismissOnEscape: true,
    });
    
    this.tui.showOverlay(overlay);
    this.tui.setFocus(picker);
  }

  private showCommandPalette(): void {
    const commands = [
      { id: "ask", label: "Ask AI" },
      { id: "refactor", label: "Refactor Code" },
      { id: "explain", label: "Explain Code" },
      { id: "test", label: "Generate Tests" },
    ];
    
    const palette = new SelectList(commands);
    palette.onSelect = (item) => {
      this.executeCommand(item.id);
      this.tui.hideOverlay(overlay);
    };
    
    const overlay = new Overlay({
      content: palette,
      modal: true,
      dismissOnEscape: true,
    });
    
    this.tui.showOverlay(overlay);
    this.tui.setFocus(palette);
  }

  private async executeCommand(command: string): Promise<void> {
    const code = this.editor.getText();
    
    switch (command) {
      case "ask":
        await this.askAI();
        break;
      case "refactor":
        await this.agent.prompt(`Refactor this code:\n${code}`);
        break;
      case "explain":
        await this.agent.prompt(`Explain this code:\n${code}`);
        break;
      case "test":
        await this.agent.prompt(`Generate tests for this code:\n${code}`);
        break;
    }
  }

  start(): void {
    this.tui.start();
  }
}

// 运行
const ide = new IDEPlugin();
ide.start();
```

## 总结

高级模式与最佳实践的核心要点：

1. **与 pi-agent 集成**：TUI 负责界面，Agent 负责 AI 逻辑
2. **性能优化**：渲染节流、虚拟滚动、组件缓存
3. **测试策略**：VirtualTerminal、快照测试、集成测试
4. **错误处理**：全局错误处理、组件错误边界
5. **主题系统**：可配置的颜色和样式
6. **布局系统**：Flex、Grid 等现代布局
7. **动画效果**：简单动画、打字机效果

---

**系列完成**：至此，你已经掌握了 pi-tui 的全部核心概念和高级用法。建议：
1. 从简单示例开始实践
2. 逐步添加自定义组件
3. 与 pi-agent 集成构建智能应用
4. 关注性能优化和用户体验
