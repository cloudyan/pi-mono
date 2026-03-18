# 13. pi-tui 终端交互与输入处理

问下大家，你有没有想过，终端程序是怎么接收键盘输入的？

OpenClaw 刚开始以为就是简单的 `process.stdin`，但深入了解后发现，终端输入处理可复杂了：
- 特殊按键（方向键、功能键）需要解析转义序列
- 组合键（Ctrl、Alt、Shift）需要特殊处理
- 鼠标事件、窗口大小变化也需要处理

pi-tui 的输入系统非常完善，今天我们就来深入理解。

## 终端输入基础

### 原始模式 vs 规范模式

```
规范模式（Canonical Mode）：
用户输入 -> 行缓冲 -> 按 Enter -> 程序接收整行

原始模式（Raw Mode）：
用户按键 -> 立即传递给程序
```

pi-tui 使用**原始模式**来实现实时交互。

### 启用原始模式

```typescript
// packages/tui/src/terminal.ts

import { ReadStream } from "tty";

export class Terminal {
  private stdin: ReadStream;
  private originalMode: Buffer | null = null;
  
  constructor() {
    this.stdin = process.stdin;
  }
  
  /**
   * 启用原始模式
   */
  enableRawMode(): void {
    if (!this.stdin.isTTY) {
      throw new Error("Not a TTY");
    }
    
    // 保存原始设置
    this.originalMode = Buffer.alloc(256);
    // tcgetattr 获取当前设置
    
    // 设置原始模式
    this.stdin.setRawMode(true);
    
    // 设置编码
    this.stdin.setEncoding("utf8");
    
    // 恢复时
    // this.stdin.setRawMode(false);
  }
  
  /**
   * 恢复原始设置
   */
  disableRawMode(): void {
    if (this.originalMode) {
      this.stdin.setRawMode(false);
    }
  }
}
```

## 键盘事件解析

### ANSI 转义序列

特殊按键通过 ANSI 转义序列传输：

```
方向键：
- 上：ESC [ A    (\x1b[A)
- 下：ESC [ B    (\x1b[B)
- 右：ESC [ C    (\x1b[C)
- 左：ESC [ D    (\x1b[D)

功能键：
- F1：ESC [ P    (\x1b[P)
- F2：ESC [ Q    (\x1b[Q)
- ...

Home/End：
- Home：ESC [ H   (\x1b[H)
- End：ESC [ F    (\x1b[F)
```

### KeyData 类型

```typescript
// packages/tui/src/keys.ts

export interface KeyData {
  /** 按键名称 */
  key: string;
  
  /** 是否按下 Ctrl */
  ctrl: boolean;
  
  /** 是否按下 Alt */
  alt: boolean;
  
  /** 是否按下 Shift */
  shift: boolean;
  
  /** 原始序列 */
  sequence: string;
}
```

### 按键解析器

```typescript
// packages/tui/src/keys.ts

/**
 * 解析输入序列为 KeyData
 */
export function parseKeypress(sequence: string): KeyData | null {
  // 处理 Ctrl 组合键
  if (sequence.length === 1) {
    const code = sequence.charCodeAt(0);
    
    // Ctrl+A 到 Ctrl+Z (1-26)
    if (code >= 1 && code <= 26) {
      return {
        key: String.fromCharCode(code + 96),  // 转换为小写字母
        ctrl: true,
        alt: false,
        shift: false,
        sequence,
      };
    }
    
    // 普通字符
    return {
      key: sequence,
      ctrl: false,
      alt: false,
      shift: false,
      sequence,
    };
  }
  
  // 处理转义序列
  if (sequence.startsWith("\x1b")) {
    return parseEscapeSequence(sequence);
  }
  
  // UTF-8 多字节字符
  return {
    key: sequence,
    ctrl: false,
    alt: false,
    shift: false,
    sequence,
  };
}

/**
 * 解析转义序列
 */
function parseEscapeSequence(sequence: string): KeyData | null {
  // ESC [ ... 序列
  if (sequence.startsWith("\x1b[")) {
    const code = sequence.slice(2);  // 去掉 ESC [
    
    switch (code) {
      case "A":
        return { key: "ArrowUp", ctrl: false, alt: false, shift: false, sequence };
      case "B":
        return { key: "ArrowDown", ctrl: false, alt: false, shift: false, sequence };
      case "C":
        return { key: "ArrowRight", ctrl: false, alt: false, shift: false, sequence };
      case "D":
        return { key: "ArrowLeft", ctrl: false, alt: false, shift: false, sequence };
      case "H":
        return { key: "Home", ctrl: false, alt: false, shift: false, sequence };
      case "F":
        return { key: "End", ctrl: false, alt: false, shift: false, sequence };
      case "3~":
        return { key: "Delete", ctrl: false, alt: false, shift: false, sequence };
      case "5~":
        return { key: "PageUp", ctrl: false, alt: false, shift: false, sequence };
      case "6~":
        return { key: "PageDown", ctrl: false, alt: false, shift: false, sequence };
    }
    
    // 带修饰符的按键 (ESC [ 1 ; modifier code)
    const match = code.match(/(\d+);(\d+)([~A-Za-z])/);
    if (match) {
      const [, , modifier, keyCode] = match;
      const mod = parseInt(modifier);
      
      return {
        key: mapKeyCode(keyCode),
        ctrl: !!(mod & 4),
        alt: !!(mod & 2),
        shift: !!(mod & 1),
        sequence,
      };
    }
  }
  
  // ESC 字母 (Alt+字母)
  if (sequence.length === 2 && sequence[0] === "\x1b") {
    return {
      key: sequence[1],
      ctrl: false,
      alt: true,
      shift: false,
      sequence,
    };
  }
  
  return null;
}

/**
 * 映射按键代码
 */
function mapKeyCode(code: string): string {
  const map: Record<string, string> = {
    "A": "ArrowUp",
    "B": "ArrowDown",
    "C": "ArrowRight",
    "D": "ArrowLeft",
    "H": "Home",
    "F": "End",
    "~": "Delete",
  };
  return map[code] || code;
}
```

## 输入事件处理

### TUI 输入处理

```typescript
// packages/tui/src/tui.ts

export class TUI {
  private keyListeners: Set<(key: KeyData) => void> = new Set();
  private focusedComponent: Focusable | null = null;
  
  /**
   * 启动输入监听
   */
  start(): void {
    // 启用原始模式
    this.terminal.enableRawMode();
    
    // 监听输入
    process.stdin.on("data", (data: Buffer) => {
      const sequence = data.toString("utf8");
      const key = parseKeypress(sequence);
      
      if (key) {
        this.handleInput(key);
      }
    });
    
    // 监听窗口大小变化
    process.stdout.on("resize", () => {
      this.handleResize();
    });
  }
  
  /**
   * 处理输入
   */
  private handleInput(key: KeyData): void {
    // 1. 首先尝试分发给焦点的组件
    if (this.focusedComponent?.handleKey(key)) {
      // 组件处理了输入
      this.render();
      return;
    }
    
    // 2. 全局快捷键
    if (this.handleGlobalShortcut(key)) {
      return;
    }
    
    // 3. 通知监听器
    for (const listener of this.keyListeners) {
      listener(key);
    }
  }
  
  /**
   * 处理全局快捷键
   */
  private handleGlobalShortcut(key: KeyData): boolean {
    switch (key.key) {
      case "Tab":
        if (key.shift) {
          this.focusPrevious();
        } else {
          this.focusNext();
        }
        return true;
        
      case "q":
        if (key.ctrl) {
          this.quit();
          return true;
        }
        break;
    }
    
    return false;
  }
  
  /**
   * 订阅输入事件
   */
  onInput(listener: (key: KeyData) => void): () => void {
    this.keyListeners.add(listener);
    return () => this.keyListeners.delete(listener);
  }
}
```

## 焦点管理

### 焦点切换

```typescript
// packages/tui/src/tui.ts

export class TUI {
  private focusableComponents: Focusable[] = [];
  private focusedIndex: number = -1;
  
  /**
   * 注册可获得焦点的组件
   */
  registerFocusable(component: Focusable): void {
    this.focusableComponents.push(component);
    
    // 自动聚焦第一个
    if (this.focusedIndex < 0) {
      this.setFocus(0);
    }
  }
  
  /**
   * 设置焦点
   */
  setFocus(index: number): void {
    // 边界检查
    if (index < 0 || index >= this.focusableComponents.length) {
      return;
    }
    
    // 失去旧焦点
    if (this.focusedIndex >= 0) {
      const oldComponent = this.focusableComponents[this.focusedIndex];
      oldComponent.onBlur?.();
    }
    
    // 获得新焦点
    this.focusedIndex = index;
    const newComponent = this.focusableComponents[index];
    newComponent.onFocus?.();
    this.focusedComponent = newComponent;
    
    // 重新渲染以显示焦点状态
    this.render();
  }
  
  /**
   * 聚焦下一个
   */
  focusNext(): void {
    const next = (this.focusedIndex + 1) % this.focusableComponents.length;
    this.setFocus(next);
  }
  
  /**
   * 聚焦上一个
   */
  focusPrevious(): void {
    const prev = (this.focusedIndex - 1 + this.focusableComponents.length) 
                  % this.focusableComponents.length;
    this.setFocus(prev);
  }
}
```

## 窗口大小处理

### 监听窗口变化

```typescript
// packages/tui/src/tui.ts

export class TUI {
  private sizeListeners: Set<(size: Size) => void> = new Set();
  private currentSize: Size = { width: 80, height: 24 };
  
  /**
   * 处理窗口大小变化
   */
  private handleResize(): void {
    this.currentSize = {
      width: process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    };
    
    // 通知所有监听器
    for (const listener of this.sizeListeners) {
      listener(this.currentSize);
    }
    
    // 重新渲染
    this.render();
  }
  
  /**
   * 订阅窗口大小变化
   */
  onResize(listener: (size: Size) => void): () => void {
    this.sizeListeners.add(listener);
    return () => this.sizeListeners.delete(listener);
  }
  
  /**
   * 获取当前尺寸
   */
  getSize(): Size {
    return this.currentSize;
  }
}
```

## 鼠标事件（可选）

### 启用鼠标支持

```typescript
// packages/tui/src/tui.ts

export class TUI {
  /**
   * 启用鼠标事件
   */
  enableMouse(): void {
    // 启用鼠标报告
    // ESC [ ? 1000 h  - 启用鼠标点击
    // ESC [ ? 1002 h  - 启用鼠标移动
    // ESC [ ? 1015 h  - 启用 UTF-8 坐标
    // ESC [ ? 1006 h  - 启用 SGR 坐标
    this.write("\x1b[?1000h\x1b[?1002h\x1b[?1015h\x1b[?1006h");
  }
  
  /**
   * 禁用鼠标事件
   */
  disableMouse(): void {
    this.write("\x1b[?1000l\x1b[?1002l\x1b[?1015l\x1b[?1006l");
  }
  
  /**
   * 解析鼠标事件
   */
  private parseMouseEvent(sequence: string): MouseEvent | null {
    // SGR 格式: ESC [ < button ; x ; y M/m
    const match = sequence.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (match) {
      const [, button, x, y, action] = match;
      return {
        type: action === "M" ? "mousedown" : "mouseup",
        button: parseInt(button),
        x: parseInt(x) - 1,  // 转换为 0-based
        y: parseInt(y) - 1,
      };
    }
    return null;
  }
}
```

## 完整示例

### 创建一个交互式表单

```typescript
import { TUI, Box, Text, Input, SelectList, KeyData } from "@mariozechner/pi-tui";

// 创建 TUI
const tui = new TUI();

// 创建表单容器
const form = new Box({ paddingX: 2, paddingY: 1 });

// 添加标题
form.addChild(new Text("User Registration", { style: { bold: true, fg: "blue" } }));
form.addChild(new Text(""));  // 空行

// 用户名输入
const usernameLabel = new Text("Username:");
form.addChild(usernameLabel);

const usernameInput = new Input({
  maxWidth: 30,
  onSubmit: (value) => {
    console.log("Username submitted:", value);
  },
});
form.addChild(usernameInput);
tui.registerFocusable(usernameInput);

form.addChild(new Text(""));  // 空行

// 角色选择
const roleLabel = new Text("Role:");
form.addChild(roleLabel);

const roleSelect = new SelectList({
  items: [
    { label: "Admin", value: "admin", description: "Full access" },
    { label: "User", value: "user", description: "Standard access" },
    { label: "Guest", value: "guest", description: "Limited access" },
  ],
  maxHeight: 5,
  onSelect: (item) => {
    console.log("Role selected:", item.value);
  },
});
form.addChild(roleSelect);
tui.registerFocusable(roleSelect);

// 设置主组件
tui.setMainComponent(form);

// 处理全局快捷键
tui.onInput((key: KeyData) => {
  // Ctrl+C 退出
  if (key.key === "c" && key.ctrl) {
    console.log("\nExiting...");
    process.exit(0);
  }
  
  // F1 显示帮助
  if (key.key === "F1") {
    showHelp();
  }
});

// 处理窗口大小变化
tui.onResize((size) => {
  console.log(`Window resized: ${size.width}x${size.height}`);
});

// 启动
tui.start();

function showHelp() {
  const helpOverlay = new Box({ paddingX: 2, paddingY: 1 });
  helpOverlay.addChild(new Text("Help", { style: { bold: true } }));
  helpOverlay.addChild(new Text(""));
  helpOverlay.addChild(new Text("Tab - Next field"));
  helpOverlay.addChild(new Text("Shift+Tab - Previous field"));
  helpOverlay.addChild(new Text("Enter - Submit/Select"));
  helpOverlay.addChild(new Text("Ctrl+C - Exit"));
  helpOverlay.addChild(new Text(""));
  helpOverlay.addChild(new Text("Press any key to close..."));
  
  const overlay = tui.showOverlay(helpOverlay, { modal: true });
  
  // 按任意键关闭
  const closeOnKey = tui.onInput(() => {
    overlay.close();
    closeOnKey();  // 取消监听
  });
}
```

## 最佳实践

### 1. 始终处理 Ctrl+C

```typescript
tui.onInput((key) => {
  if (key.key === "c" && key.ctrl) {
    tui.cleanup();  // 恢复终端设置
    process.exit(0);
  }
});
```

### 2. 优雅退出

```typescript
process.on("exit", () => {
  tui.cleanup();
});

process.on("SIGINT", () => {
  tui.cleanup();
  process.exit(0);
});
```

### 3. 处理异常

```typescript
try {
  tui.start();
} catch (error) {
  console.error("TUI error:", error);
  tui.cleanup();
  process.exit(1);
}
```

## 总结

pi-tui 的输入处理系统非常完善：

1. **原始模式** - 实时接收按键输入
2. **按键解析** - 解析 ANSI 转义序列
3. **焦点管理** - Tab 切换焦点
4. **事件分发** - 组件优先处理，然后是全局快捷键
5. **窗口处理** - 监听大小变化，自动重绘

这些设计让终端交互变得简单直观。

---

**至此，pi-tui 篇章完成！** 接下来进入 pi-coding-agent 应用层的教程。
