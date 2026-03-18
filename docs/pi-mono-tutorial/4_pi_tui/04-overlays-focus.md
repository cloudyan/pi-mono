# 覆盖层与焦点管理

> **难度：进阶** | **预计阅读时间：25 分钟**

上一章我们了解了组件系统。本章将深入覆盖层（Overlay）和焦点管理——这是构建复杂交互界面的关键。

## 为什么需要覆盖层？

想象一个聊天应用：

```
┌─────────────────────────────────────────┐
│  💬 Chat with AI                        │
├─────────────────────────────────────────┤
│                                         │
│  [对话内容...]                          │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  ⚠️ 确认删除                      │  │  ← 覆盖层
│  │                                   │  │
│  │  确定要删除这条消息吗？           │  │
│  │                                   │  │
│  │  [取消]        [确定]             │  │
│  └───────────────────────────────────┘  │
│                                         │
├─────────────────────────────────────────┤
│  > [输入框]                    [发送]   │
└─────────────────────────────────────────┘
```

覆盖层允许你在不破坏底层界面的情况下：
- 显示模态对话框
- 显示下拉菜单
- 显示提示信息
- 实现右键菜单

## 覆盖层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      覆盖层架构                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                       TUI                                │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              主组件（Main Component）            │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐          │   │   │
│  │  │  │  Chat   │  │ Input   │  │ Button  │          │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘          │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                          │                              │   │
│  │                          ▼                              │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              覆盖层（Overlay）                   │   │   │
│  │  │  ┌─────────────────────────────────────────┐   │   │   │
│  │  │  │           模态对话框                     │   │   │   │
│  │  │  │  ┌─────────────────────────────────┐   │   │   │   │
│  │  │  │  │  标题                           │   │   │   │   │
│  │  │  │  │  内容...                        │   │   │   │   │
│  │  │  │  │  [按钮1]  [按钮2]               │   │   │   │   │
│  │  │  │  └─────────────────────────────────┘   │   │   │   │
│  │  │  └─────────────────────────────────────────┘   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 覆盖层的工作原理

### 创建覆盖层

```typescript
import { TUI, Overlay } from "@mariozechner/pi-tui";

// 创建覆盖层
const overlay = new Overlay({
  // 覆盖层内容
  content: new ConfirmDialog("确定要删除吗？"),
  
  // 是否模态（阻止底层交互）
  modal: true,
  
  // 点击背景关闭
  dismissOnBackgroundClick: true,
  
  // 按 Escape 关闭
  dismissOnEscape: true,
});

// 显示覆盖层
tui.showOverlay(overlay);

// 关闭覆盖层
tui.hideOverlay(overlay);
```

### 覆盖层生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                     覆盖层生命周期                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 创建覆盖层                                                  │
│     const overlay = new Overlay({ content: dialog });           │
│                                                                 │
│  2. 显示覆盖层                                                  │
│     tui.showOverlay(overlay);                                   │
│     ├── 保存当前焦点                                            │
│     ├── 设置覆盖层焦点                                          │
│     ├── 渲染覆盖层内容                                          │
│     └── 阻止事件传递到主组件（如果 modal）                       │
│                                                                 │
│  3. 交互（用户操作）                                             │
│     ├── 键盘输入 → 覆盖层组件                                   │
│     ├── 鼠标点击 → 覆盖层组件或背景                             │
│     └── 事件不传递到主组件（如果 modal）                         │
│                                                                 │
│  4. 关闭覆盖层                                                  │
│     tui.hideOverlay(overlay);                                   │
│     ├── 恢复之前的焦点                                          │
│     ├── 重新渲染主组件                                          │
│     └── 恢复事件传递到主组件                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 焦点管理

### 焦点栈

TUI 使用**焦点栈**管理焦点：

```typescript
// 初始状态
const tui = new TUI(terminal);
const input = new Input();
tui.addChild(input);
tui.setFocus(input);  // 焦点栈: [input]

// 显示覆盖层
const dialog = new Dialog();
const overlay = new Overlay({ content: dialog });
tui.showOverlay(overlay);
tui.setFocus(dialog.getInput());  // 焦点栈: [input, dialogInput]

// 关闭覆盖层
tui.hideOverlay(overlay);
// 焦点自动恢复: [input]
```

### Focusable 接口

需要接收键盘输入的组件实现 `Focusable`：

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@mariozechner/pi-tui";

class MyInput implements Component, Focusable {
  // TUI 在焦点变化时自动设置
  focused: boolean = false;
  
  private cursorPosition: number = 0;
  private text: string = "";

  render(width: number): string[] {
    const beforeCursor = this.text.slice(0, this.cursorPosition);
    const atCursor = this.text[this.cursorPosition] || " ";
    const afterCursor = this.text.slice(this.cursorPosition + 1);
    
    // 如果获得焦点，在光标位置插入标记
    const marker = this.focused ? CURSOR_MARKER : "";
    
    // 反色显示光标位置字符
    const cursorVisual = this.focused 
      ? `${marker}\x1b[7m${atCursor}\x1b[27m`
      : atCursor;
    
    const line = `> ${beforeCursor}${cursorVisual}${afterCursor}`;
    return [line];
  }

  handleInput(data: string): void {
    // 处理键盘输入...
  }

  invalidate(): void {
    // 清除缓存
  }
}
```

### 光标定位流程

```
1. Focusable 组件设置 focused = true
   ↓
2. 在 render() 中输出 CURSOR_MARKER 在光标位置
   ↓
3. TUI 扫描渲染输出找到 CURSOR_MARKER
   ↓
4. 计算光标位置（标记前的文本宽度）
   ↓
5. 从输出中剥离标记
   ↓
6. 移动硬件光标到该位置
   ↓
7. 显示硬件光标
```

## 模态对话框示例

### 确认对话框

```typescript
class ConfirmDialog implements Component {
  private message: string;
  private onConfirm?: () => void;
  private onCancel?: () => void;
  private selectedButton: number = 0;  // 0 = 取消, 1 = 确定

  constructor(message: string, options?: {
    onConfirm?: () => void;
    onCancel?: () => void;
  }) {
    this.message = message;
    this.onConfirm = options?.onConfirm;
    this.onCancel = options?.onCancel;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    
    // 上边框
    lines.push("┌" + "─".repeat(width - 2) + "┐");
    
    // 标题
    lines.push("│ ⚠️  确认" + " ".repeat(width - 12) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");
    
    // 消息内容
    const msgLines = this.wrapText(this.message, width - 4);
    for (const line of msgLines) {
      lines.push("│ " + line.padEnd(width - 4) + " │");
    }
    
    // 空行
    lines.push("│" + " ".repeat(width - 2) + "│");
    
    // 按钮
    const cancelBtn = this.selectedButton === 0 
      ? "\x1b[7m[ 取消 ]\x1b[0m" 
      : "[ 取消 ]";
    const confirmBtn = this.selectedButton === 1 
      ? "\x1b[7m[ 确定 ]\x1b[0m" 
      : "[ 确定 ]";
    
    const buttonRow = `│  ${cancelBtn}    ${confirmBtn}`;
    lines.push(buttonRow.padEnd(width - 1) + "│");
    
    // 下边框
    lines.push("└" + "─".repeat(width - 2) + "┘");
    
    return lines;
  }

  handleInput(data: string): void {
    switch (data) {
      case "ArrowLeft":
      case "ArrowRight":
        this.selectedButton = 1 - this.selectedButton;
        this.invalidate();
        break;
      case "Enter":
        if (this.selectedButton === 0) {
          this.onCancel?.();
        } else {
          this.onConfirm?.();
        }
        break;
      case "Escape":
        this.onCancel?.();
        break;
    }
  }

  invalidate(): void {
    // 清除缓存
  }

  private wrapText(text: string, width: number): string[] {
    // 文本换行逻辑
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 > width) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine += (currentLine ? " " : "") + word;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    return lines;
  }
}
```

### 使用对话框

```typescript
function showConfirmDialog(tui: TUI, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = new ConfirmDialog(message, {
      onConfirm: () => {
        tui.hideOverlay(overlay);
        resolve(true);
      },
      onCancel: () => {
        tui.hideOverlay(overlay);
        resolve(false);
      },
    });
    
    const overlay = new Overlay({
      content: dialog,
      modal: true,
      dismissOnEscape: true,
    });
    
    tui.showOverlay(overlay);
    tui.setFocus(dialog);
  });
}

// 使用
const confirmed = await showConfirmDialog(tui, "确定要删除吗？");
if (confirmed) {
  // 执行删除
}
```

## 下拉菜单示例

```typescript
class DropdownMenu implements Component {
  private items: string[];
  private selectedIndex: number = 0;
  private onSelect?: (item: string, index: number) => void;

  constructor(items: string[], onSelect?: (item: string, index: number) => void) {
    this.items = items;
    this.onSelect = onSelect;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const itemWidth = Math.max(...this.items.map(i => i.length)) + 4;
    
    // 上边框
    lines.push("┌" + "─".repeat(itemWidth) + "┐");
    
    // 菜单项
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const isSelected = i === this.selectedIndex;
      
      // 选中项高亮
      const display = isSelected
        ? `│ \x1b[7m ${item.padEnd(itemWidth - 4)} \x1b[0m │`
        : `│  ${item.padEnd(itemWidth - 4)}  │`;
      
      lines.push(display);
    }
    
    // 下边框
    lines.push("└" + "─".repeat(itemWidth) + "┘");
    
    return lines;
  }

  handleInput(data: string): void {
    switch (data) {
      case "ArrowUp":
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.invalidate();
        break;
      case "ArrowDown":
        this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
        this.invalidate();
        break;
      case "Enter":
        this.onSelect?.(this.items[this.selectedIndex], this.selectedIndex);
        break;
      case "Escape":
        // 关闭菜单
        break;
    }
  }

  invalidate(): void {}
}
```

## 工具提示示例

```typescript
class Tooltip implements Component {
  private text: string;
  private position: { x: number; y: number };

  constructor(text: string, position: { x: number; y: number }) {
    this.text = text;
    this.position = position;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const maxWidth = Math.min(40, width - this.position.x - 2);
    const wrapped = this.wrapText(this.text, maxWidth);
    
    // 背景色
    const bg = "\x1b[48;5;240m";  // 灰色背景
    const reset = "\x1b[0m";
    
    for (const line of wrapped) {
      lines.push(bg + " " + line.padEnd(maxWidth) + " " + reset);
    }
    
    return lines;
  }

  invalidate(): void {}

  private wrapText(text: string, width: number): string[] {
    // 文本换行
    const lines: string[] = [];
    let currentLine = "";
    
    for (const char of text) {
      if (currentLine.length >= width) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine += char;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    return lines;
  }
}

// 显示工具提示
function showTooltip(tui: TUI, text: string, x: number, y: number) {
  const tooltip = new Tooltip(text, { x, y });
  const overlay = new Overlay({
    content: tooltip,
    modal: false,  // 非模态，不阻止底层交互
    dismissOnBackgroundClick: true,
  });
  
  tui.showOverlay(overlay);
  
  // 3 秒后自动关闭
  setTimeout(() => {
    tui.hideOverlay(overlay);
  }, 3000);
}
```

## 焦点管理最佳实践

### ✅ 应该做的

1. **正确设置 focused 属性**
   ```typescript
   class MyComponent implements Focusable {
     focused: boolean = false;  // TUI 会自动设置
     
     render(width: number): string[] {
       if (this.focused) {
         // 显示焦点状态
       }
     }
   }
   ```

2. **使用 CURSOR_MARKER 标记光标位置**
   ```typescript
   render(width: number): string[] {
     const marker = this.focused ? CURSOR_MARKER : "";
     return [`${before}${marker}\x1b[7m${cursor}\x1b[27m${after}`];
   }
   ```

3. **处理 Escape 键关闭覆盖层**
   ```typescript
   handleInput(data: string): void {
     if (data === "Escape") {
       // 关闭覆盖层或取消操作
       this.onCancel?.();
     }
   }
   ```

4. **恢复焦点时重新渲染**
   ```typescript
   set focused(value: boolean) {
     if (this._focused !== value) {
       this._focused = value;
       this.invalidate();  // 焦点变化时重新渲染
     }
   }
   ```

### ❌ 避免的错误

1. **手动管理光标位置**
   ```typescript
   // ❌ 错误：不要手动输出光标转义序列
   render(width: number): string[] {
     return ["\x1b[?25h" + text];  // 不要这样做！
   }
   
   // ✅ 正确：使用 CURSOR_MARKER
   render(width: number): string[] {
     return [text + CURSOR_MARKER];
   }
   ```

2. **在覆盖层中忘记处理背景点击**
   ```typescript
   // ❌ 错误：模态覆盖层不处理背景点击
   const overlay = new Overlay({
     content: dialog,
     modal: true,
     // 没有设置 dismissOnBackgroundClick
   });
   
   // ✅ 正确：明确设置背景点击行为
   const overlay = new Overlay({
     content: dialog,
     modal: true,
     dismissOnBackgroundClick: false,  // 或 true
   });
   ```

3. **覆盖层关闭后忘记恢复状态**
   ```typescript
   // ❌ 错误：直接关闭，不恢复状态
   tui.hideOverlay(overlay);
   
   // ✅ 正确：恢复之前的焦点和状态
   tui.hideOverlay(overlay);
   tui.setFocus(previousComponent);
   ```

## 完整示例：聊天应用

```typescript
import { TUI, ProcessTerminal, Text, Input, Overlay, CURSOR_MARKER } from "@mariozechner/pi-tui";

class ChatApp {
  private tui: TUI;
  private messages: Text;
  private input: Input;

  constructor() {
    const terminal = new ProcessTerminal();
    this.tui = new TUI(terminal);

    // 消息区域
    this.messages = new Text("");
    this.tui.addChild(this.messages);

    // 输入框
    this.input = new Input();
    this.input.onSubmit = (text) => this.handleSubmit(text);
    this.tui.addChild(this.input);
    this.tui.setFocus(this.input);
  }

  private handleSubmit(text: string): void {
    // 显示确认对话框
    this.showConfirmDialog(text);
  }

  private showConfirmDialog(text: string): void {
    const dialog = new ConfirmDialog(`发送消息: "${text}"?`, {
      onConfirm: () => {
        this.tui.hideOverlay(overlay);
        this.sendMessage(text);
      },
      onCancel: () => {
        this.tui.hideOverlay(overlay);
        this.tui.setFocus(this.input);
      },
    });

    const overlay = new Overlay({
      content: dialog,
      modal: true,
      dismissOnEscape: true,
    });

    this.tui.showOverlay(overlay);
    this.tui.setFocus(dialog);
  }

  private sendMessage(text: string): void {
    // 添加消息到显示
    const current = this.messages.getText();
    this.messages.setText(current + `\nYou: ${text}`);
    this.input.clear();
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

## 总结

覆盖层与焦点管理的核心要点：

1. **覆盖层**：使用 Overlay 显示模态/非模态内容
2. **焦点栈**：TUI 自动管理焦点历史
3. **Focusable 接口**：实现 focused 属性和 handleInput
4. **光标定位**：使用 CURSOR_MARKER 标记光标位置
5. **生命周期**：显示时保存焦点，关闭时恢复焦点

---

**下篇预告**: [05-keyboard-input.md](05-keyboard-input.md) —— 键盘输入与 Kitty 协议，包括按键解析、组合键、IME 支持等。
