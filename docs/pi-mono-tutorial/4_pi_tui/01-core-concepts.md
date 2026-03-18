# TUI 核心概念与架构

> **难度：入门** | **预计阅读时间：20 分钟**

想象一下，你正在构建一个命令行聊天应用。传统的终端输出是这样的：

```
> 你好
AI: 你好！有什么我可以帮助你的吗？
> 帮我写一个快速排序
AI: 好的，这是快速排序的实现...
[输出 50 行代码]
> 
```

每次输出都会把之前的对话推上去，用户体验很差。而现代终端应用应该像 GUI 一样：

```
┌─────────────────────────────────────────┐
│  💬 Chat with AI                        │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐                       │
│  │ 你好！       │                       │
│  └──────────────┘                       │
│                                         │
│       ┌──────────────────────────────┐  │
│       │ 你好！有什么我可以帮你的吗？ │  │
│       └──────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ 帮我写一个快速排序               │   │
│  └──────────────────────────────────┘   │
│                                         │
│  [正在输入...]                          │
│                                         │
├─────────────────────────────────────────┤
│  > [输入框]                    [发送]   │
└─────────────────────────────────────────┘
```

pi-tui 就是为实现这种体验而生的。

## 什么是 pi-tui？

pi-tui 是一个**极简终端 UI 框架**，专为构建高性能、无闪烁的交互式 CLI 应用而设计。

### 核心特性

| 特性 | 说明 | 优势 |
|------|------|------|
| **差分渲染** | 只更新变化的部分 | 高性能、低带宽 |
| **同步输出** | 使用 CSI 2026 原子更新 | 无闪烁、无撕裂 |
| **组件化** | 简单的 Component 接口 | 易于扩展和维护 |
| **Kitty 键盘协议** | 支持完整的键盘输入 | 区分 Ctrl+C 和 Ctrl+Shift+C |
| **IME 支持** | 硬件光标定位 | 支持中文、日文、韩文输入 |
| **内联图片** | Kitty/iTerm2 图形协议 | 在终端中显示图片 |

### 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         应用层                                   │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│    │  Chat   │  │  IDE    │  │  File   │  │ Custom  │          │
│    │  App    │  │  Plugin │  │ Manager │  │  App    │          │
│    └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘          │
└─────────┼────────────┼────────────┼────────────┼───────────────┘
          │            │            │            │
          └────────────┴────────────┴────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      pi-tui 框架层                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                         TUI                              │   │
│  │    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │    │Container│  │ Overlay │  │  Focus  │  │ Differential│   │
│  │    │ Manager │  │  Stack  │  │ Manager │  │  Renderer  │   │
│  │    └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Components                           │   │
│  │  Text │ Input │ Editor │ Markdown │ SelectList │ Image   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      终端抽象层                                  │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │  ProcessTerminal│  │ VirtualTerminal │                      │
│  │  (真实终端)      │  │   (测试用)       │                      │
│  └─────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

## 核心概念一：Component 接口

所有 UI 元素都实现 `Component` 接口：

```typescript
// packages/tui/src/tui.ts

export interface Component {
  /**
   * 渲染组件到给定宽度的行数组
   * @param width - 当前视口宽度
   * @returns 字符串数组，每行一个字符串
   */
  render(width: number): string[];

  /**
   * 可选的键盘输入处理器（当组件获得焦点时调用）
   */
  handleInput?(data: string): void;

  /**
   * 如果为 true，组件接收按键释放事件（Kitty 协议）
   */
  wantsKeyRelease?: boolean;

  /**
   * 使缓存的渲染状态失效
   * 在主题变化或需要重新渲染时调用
   */
  invalidate(): void;
}
```

### 最简单的组件

```typescript
import type { Component } from "@mariozechner/pi-tui";

class HelloComponent implements Component {
  render(width: number): string[] {
    return ["Hello, World!"];
  }

  invalidate(): void {
    // 无缓存，无需操作
  }
}
```

### 关键约束

**每行不能超过 `width` 参数**：

```typescript
// ❌ 错误：可能超出宽度
render(width: number): string[] {
  return [this.text];  // text 可能比 width 长！
}

// ✅ 正确：使用工具函数截断
import { truncateToWidth } from "@mariozechner/pi-tui";

render(width: number): string[] {
  return [truncateToWidth(this.text, width)];
}
```

## 核心概念二：TUI 容器

`TUI` 是主容器，管理所有组件和渲染：

```typescript
import { TUI, ProcessTerminal } from "@mariozechner/pi-tui";

// 1. 创建终端
const terminal = new ProcessTerminal();

// 2. 创建 TUI
const tui = new TUI(terminal);

// 3. 添加组件
const text = new Text("Hello, World!");
tui.addChild(text);

// 4. 启动
tui.start();
```

### 生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                      TUI 生命周期                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 创建 TUI                                                    │
│     const tui = new TUI(terminal);                              │
│                                                                 │
│  2. 添加组件                                                    │
│     tui.addChild(component);                                    │
│     tui.removeChild(component);                                 │
│                                                                 │
│  3. 启动                                                        │
│     tui.start();                                                │
│     ├── 启用原始模式                                            │
│     ├── 启用 bracketed paste                                    │
│     ├── 查询 Kitty 键盘协议                                     │
│     └── 开始渲染循环                                            │
│                                                                 │
│  4. 运行中                                                      │
│     ├── 处理输入                                                │
│     ├── 更新组件                                                │
│     └── 差分渲染                                                │
│                                                                 │
│  5. 停止                                                        │
│     tui.stop();                                                 │
│     ├── 禁用 Kitty 协议                                         │
│     ├── 禁用 bracketed paste                                    │
│     └── 恢复终端状态                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心概念三：差分渲染

pi-tui 使用三种渲染策略：

```
策略 1: 首次渲染
─────────────────────────────────────────
输出所有行，不清除滚动历史
适用于：应用启动时

策略 2: 宽度变化或视口上方变化
─────────────────────────────────────────
清除屏幕并完全重新渲染
适用于：终端大小改变、内容大幅变化

策略 3: 正常更新（差分渲染）
─────────────────────────────────────────
移动光标到第一行变化处
清除到末尾
只渲染变化的行
适用于：大多数更新（输入、状态变化）
```

### 同步输出

所有更新都包裹在 **CSI 2026** 序列中，确保原子更新：

```typescript
// 开始同步输出
terminal.write("\x1b[?2026h");

// 所有渲染操作
terminal.write("...");

// 结束同步输出
terminal.write("\x1b[?2026l");
```

这确保了：
- 无闪烁：所有更新同时显示
- 无撕裂：不会出现部分更新的画面

## 核心概念四：焦点管理

### Focusable 接口

需要显示光标的组件实现 `Focusable`：

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@mariozechner/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;  // TUI 在焦点变化时设置

  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    // 在假光标前发射标记
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }

  handleInput(data: string): void {
    // 处理输入...
  }
}
```

### 焦点切换

```typescript
// 设置焦点组件
tui.setFocus(inputComponent);

// 焦点组件会收到所有键盘输入
// 非焦点组件不会收到输入
```

### 光标定位流程

```
1. Focusable 组件设置 focused = true
2. 在 render() 中输出 CURSOR_MARKER 在光标位置
3. TUI 扫描渲染输出找到 CURSOR_MARKER
4. 计算光标位置（标记前的文本宽度）
5. 从输出中剥离标记
6. 移动硬件光标到该位置
7. 显示硬件光标
```

## 核心概念五：Terminal 接口

TUI 与终端通过 `Terminal` 接口交互：

```typescript
interface Terminal {
  // 启动终端
  start(onInput: (data: string) => void, onResize: () => void): void;

  // 停止终端
  stop(): void;

  // 排空输入（退出前使用）
  drainInput(maxMs?: number, idleMs?: number): Promise<void>;

  // 写入输出
  write(data: string): void;

  // 终端尺寸
  get columns(): number;
  get rows(): number;

  // 光标操作
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;

  // 清除操作
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;

  // 设置标题
  setTitle(title: string): void;
}
```

### 内置实现

| 实现 | 用途 |
|------|------|
| `ProcessTerminal` | 真实终端，使用 `process.stdin/stdout` |
| `VirtualTerminal` | 测试用，使用 `@xterm/headless` |

## 快速开始

### 基础示例

```typescript
import { TUI, ProcessTerminal, Text, Input } from "@mariozechner/pi-tui";

async function main() {
  // 创建终端和 TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // 添加标题
  tui.addChild(new Text("=== 简单聊天 ===", 2, 1));

  // 添加输入框
  const input = new Input();
  input.onSubmit = (value) => {
    console.log("提交:", value);
    tui.stop();
  };
  tui.addChild(input);

  // 启动
  tui.start();
}

main();
```

### 运行

```bash
npx tsx chat-simple.ts
```

## 与 pi-agent 的关系

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (你的代码)                      │
│              使用 pi-tui 构建终端界面                      │
│              使用 pi-agent 处理 AI 对话                    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              pi-tui (@mariozechner/pi-tui)               │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│    │   TUI   │  │Component│  │ Terminal│  │  Keys   │  │
│    │ 容器    │  │ 组件    │  │ 终端    │  │ 键盘    │  │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              pi-agent (@mariozechner/pi-agent-core)      │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│    │ Agent   │  │AgentLoop│  │AgentTool│  │ 事件系统 │  │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
```

典型集成：
- **pi-tui** 负责：渲染界面、处理键盘输入、显示流式输出
- **pi-agent** 负责：管理对话状态、调用 LLM、执行工具

## 总结

pi-tui 的核心概念：

1. **Component 接口**：所有 UI 元素的基础，必须实现 `render(width)` 和 `invalidate()`
2. **TUI 容器**：管理组件树、处理输入、协调渲染
3. **差分渲染**：三种策略确保高性能和无闪烁
4. **焦点管理**：Focusable 接口 + CURSOR_MARKER 实现 IME 支持
5. **Terminal 接口**：抽象终端操作，支持真实和虚拟终端

---

**下篇预告**: [02-differential-rendering.md](02-differential-rendering.md) —— 深入理解差分渲染原理，包括同步输出、渲染策略、性能优化等。
