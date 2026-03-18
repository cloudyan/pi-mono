# 键盘输入与 Kitty 协议

> **难度：进阶** | **预计阅读时间：25 分钟**

上一章我们了解了覆盖层与焦点管理。本章将深入键盘输入处理——这是构建交互式 TUI 的核心。

## 键盘输入的挑战

传统终端键盘输入的问题：

```
问题 1: 无法区分 Ctrl+C 和 Ctrl+Shift+C
        两者都发送 \x03

问题 2: 无法区分 Tab 和 Ctrl+I
        两者都发送 \x09

问题 3: 无法检测按键释放
        只能检测按键按下

问题 4: 特殊按键（F1-F12、方向键）的转义序列不统一
        不同终端发送不同的序列
```

pi-tui 使用 **Kitty 键盘协议** 解决这些问题。

## Kitty 键盘协议

### 什么是 Kitty 键盘协议？

Kitty 键盘协议是终端的增强键盘协议，支持：

- ✅ 区分修饰键（Ctrl、Shift、Alt、Meta）
- ✅ 检测按键释放事件
- ✅ 统一特殊按键的编码
- ✅ 支持所有 Unicode 字符

### 启用协议

```typescript
// packages/tui/src/tui.ts

start() {
  // 查询 Kitty 键盘协议支持
  // CSI ? u 查询当前键盘模式
  this.terminal.write("\x1b[?u");
  
  // 如果支持，启用增强模式
  // CSI > 1 u 启用 Kitty 键盘协议
  this.terminal.write("\x1b[>1u");
}

stop() {
  // 禁用 Kitty 键盘协议
  // CSI < u 重置键盘模式
  this.terminal.write("\x1b[<u");
}
```

### 协议事件格式

```
按键按下:
ESC [ <keycode> ; <modifiers> : <event-type> u

按键释放:
ESC [ <keycode> ; <modifiers> : 3 u

示例:
ESC [ 99 ; 5 : 1 u    Ctrl+C 按下
ESC [ 99 ; 5 : 3 u    Ctrl+C 释放
ESC [ 99 ; 6 : 1 u    Ctrl+Shift+C 按下
```

## 按键解析

### 基础按键

```typescript
// packages/tui/src/keys.ts

// 解析 Kitty 协议事件
function parseKittyEvent(data: string): KeyEvent | null {
  const match = data.match(/^\x1b\[<(\d+);(\d+)(?::(\d+))?u$/);
  if (!match) return null;
  
  const keycode = parseInt(match[1]);
  const modifiers = parseInt(match[2]);
  const eventType = parseInt(match[3] || "1");
  
  return {
    key: keycodeToKey(keycode),
    modifiers: parseModifiers(modifiers),
    type: eventType === 3 ? "release" : "press",
  };
}

// 修饰键解析
function parseModifiers(modifiers: number): Modifiers {
  return {
    shift: !!(modifiers & 1),
    alt: !!(modifiers & 2),
    ctrl: !!(modifiers & 4),
    meta: !!(modifiers & 8),
  };
}
```

### 特殊按键

```typescript
// 特殊按键映射
const SPECIAL_KEYS: Record<number, string> = {
  1: "Home",
  2: "Insert",
  3: "Delete",
  4: "End",
  5: "PageUp",
  6: "PageDown",
  7: "Home",        // 另一种编码
  8: "End",         // 另一种编码
  9: "Tab",
  10: "Enter",
  11: "Escape",
  12: "Backspace",
  13: "Tab",         // Shift+Tab
  14: "Enter",      // Shift+Enter
  15: "Escape",     // Shift+Escape
  16: "Backspace",  // Shift+Backspace
  // F1-F12
  ...Array.from({ length: 12 }, (_, i) => ({
    [i + 57344]: `F${i + 1}`,
  })).reduce((a, b) => ({ ...a, ...b }), {}),
  // 方向键
  57350: "ArrowUp",
  57351: "ArrowDown",
  57352: "ArrowLeft",
  57353: "ArrowRight",
};
```

### 组合键示例

```typescript
// 解析组合键
const examples = [
  { data: "\x1b[<99;5:1u", result: "Ctrl+C" },
  { data: "\x1b[<99;6:1u", result: "Ctrl+Shift+C" },
  { data: "\x1b[<99;7:1u", result: "Ctrl+Alt+C" },
  { data: "\x1b[<99;8:1u", result: "Ctrl+Shift+Alt+C" },
  { data: "\x1b[<57350;1:1u", result: "ArrowUp" },
  { data: "\x1b[<57350;5:1u", result: "Ctrl+ArrowUp" },
];
```

## 处理键盘输入

### 基础输入处理

```typescript
class MyComponent implements Component {
  handleInput(data: string): void {
    // data 已经是解析后的按键名称
    switch (data) {
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
      case "Enter":
        this.submit();
        break;
      case "Escape":
        this.cancel();
        break;
      case "Backspace":
        this.deleteChar();
        break;
      case "Delete":
        this.deleteForward();
        break;
      case "Tab":
        this.nextField();
        break;
      case "Shift+Tab":
        this.prevField();
        break;
      case "Home":
        this.moveToStart();
        break;
      case "End":
        this.moveToEnd();
        break;
      case "Ctrl+C":
        this.copy();
        break;
      case "Ctrl+V":
        this.paste();
        break;
      case "Ctrl+Z":
        this.undo();
        break;
      case "Ctrl+Shift+Z":
      case "Ctrl+Y":
        this.redo();
        break;
      default:
        // 普通字符
        if (data.length === 1) {
          this.insert(data);
        }
    }
  }
}
```

### 组合键处理

```typescript
class EditorComponent implements Component {
  private keyBuffer: string = "";
  private keyTimeout?: NodeJS.Timeout;

  handleInput(data: string): void {
    // 处理多键序列（如 \x1b[ 开头的转义序列）
    if (data.startsWith("\x1b")) {
      this.keyBuffer += data;
      
      // 等待更多数据（转义序列可能分多次到达）
      clearTimeout(this.keyTimeout);
      this.keyTimeout = setTimeout(() => {
        this.processKeyBuffer();
      }, 10);
      
      return;
    }
    
    // 处理普通按键
    this.processKey(data);
  }

  private processKeyBuffer(): void {
    const data = this.keyBuffer;
    this.keyBuffer = "";
    
    // 尝试解析 Kitty 协议
    const event = parseKittyEvent(data);
    if (event) {
      this.handleKittyEvent(event);
      return;
    }
    
    // 尝试解析传统转义序列
    const key = parseEscapeSequence(data);
    if (key) {
      this.processKey(key);
      return;
    }
    
    // 无法解析，当作普通字符
    this.processKey(data);
  }

  private handleKittyEvent(event: KeyEvent): void {
    // 处理按键事件
    if (event.type === "release" && !this.wantsKeyRelease) {
      return;  // 不处理释放事件
    }
    
    const keyName = this.buildKeyName(event);
    this.processKey(keyName);
  }

  private buildKeyName(event: KeyEvent): string {
    const parts: string[] = [];
    
    if (event.modifiers.ctrl) parts.push("Ctrl");
    if (event.modifiers.alt) parts.push("Alt");
    if (event.modifiers.shift) parts.push("Shift");
    if (event.modifiers.meta) parts.push("Meta");
    
    parts.push(event.key);
    
    return parts.join("+");
  }
}
```

## IME 支持

### 什么是 IME？

IME（Input Method Editor）用于输入中文、日文、韩文等非拉丁文字。

```
输入过程:
1. 用户输入拼音 "zhongwen"
2. 显示候选词: "中文"、"种文"、"重文"...
3. 用户选择 "中文"
4. 最终输入: "中文"
```

### 硬件光标定位

pi-tui 使用硬件光标支持 IME：

```typescript
class InputComponent implements Component, Focusable {
  focused: boolean = false;

  render(width: number): string[] {
    const beforeCursor = this.text.slice(0, this.cursorPosition);
    const atCursor = this.text[this.cursorPosition] || " ";
    const afterCursor = this.text.slice(this.cursorPosition + 1);
    
    // 在光标位置插入标记
    const marker = this.focused ? CURSOR_MARKER : "";
    
    // 反色显示光标位置（硬件光标会覆盖这里）
    const cursorVisual = this.focused 
      ? `${marker}\x1b[7m${atCursor}\x1b[27m`
      : atCursor;
    
    return [`> ${beforeCursor}${cursorVisual}${afterCursor}`];
  }
}

// TUI 定位硬件光标
private positionCursor(): void {
  if (!this.focusedComponent) return;
  
  // 扫描渲染输出找到 CURSOR_MARKER
  const markerIndex = this.currentOutput.indexOf(CURSOR_MARKER);
  if (markerIndex === -1) return;
  
  // 计算光标位置（标记前的字符宽度）
  const beforeMarker = this.currentOutput.slice(0, markerIndex);
  const cursorColumn = this.calculateWidth(beforeMarker);
  
  // 从输出中移除标记
  this.currentOutput = this.currentOutput.replace(CURSOR_MARKER, "");
  
  // 移动硬件光标
  this.terminal.moveCursorTo(cursorColumn, cursorRow);
  this.terminal.showCursor();
}
```

### IME 事件处理

```typescript
class InputComponent implements Component {
  private composing: boolean = false;
  private compositionText: string = "";

  handleInput(data: string): void {
    // 检查是否是 IME 合成事件
    if (data.startsWith("\x1b[")) {
      const match = data.match(/\x1b\[(\d+)~$/);
      if (match) {
        const code = parseInt(match[1]);
        // 200 = 开始合成, 201 = 结束合成
        if (code === 200) {
          this.composing = true;
          return;
        } else if (code === 201) {
          this.composing = false;
          this.insert(this.compositionText);
          this.compositionText = "";
          return;
        }
      }
    }
    
    // 如果在合成中，累积文本
    if (this.composing) {
      this.compositionText += data;
      return;
    }
    
    // 普通输入
    this.insert(data);
  }
}
```

## 完整示例：编辑器快捷键

```typescript
class Editor implements Component {
  private cursor: { line: number; col: number } = { line: 0, col: 0 };
  private selection: { start: { line: number; col: number }; end: { line: number; col: number } } | null = null;
  private mode: "normal" | "insert" | "visual" = "normal";

  handleInput(data: string): void {
    // 正常模式
    if (this.mode === "normal") {
      this.handleNormalMode(data);
    }
    // 插入模式
    else if (this.mode === "insert") {
      this.handleInsertMode(data);
    }
    // 可视模式
    else if (this.mode === "visual") {
      this.handleVisualMode(data);
    }
  }

  private handleNormalMode(data: string): void {
    switch (data) {
      // 移动
      case "h":
      case "ArrowLeft":
        this.moveLeft();
        break;
      case "j":
      case "ArrowDown":
        this.moveDown();
        break;
      case "k":
      case "ArrowUp":
        this.moveUp();
        break;
      case "l":
      case "ArrowRight":
        this.moveRight();
        break;
      case "0":
      case "Home":
        this.moveToLineStart();
        break;
      case "$":
      case "End":
        this.moveToLineEnd();
        break;
      case "g":
      case "Ctrl+Home":
        this.moveToFileStart();
        break;
      case "G":
      case "Ctrl+End":
        this.moveToFileEnd();
        break;
      
      // 编辑
      case "i":
        this.enterInsertMode();
        break;
      case "a":
        this.moveRight();
        this.enterInsertMode();
        break;
      case "o":
        this.insertLineBelow();
        this.enterInsertMode();
        break;
      case "O":
        this.insertLineAbove();
        this.enterInsertMode();
        break;
      case "x":
      case "Delete":
        this.deleteChar();
        break;
      case "X":
      case "Backspace":
        this.deleteCharBackward();
        break;
      case "dd":
        this.deleteLine();
        break;
      case "yy":
        this.copyLine();
        break;
      case "p":
        this.paste();
        break;
      
      // 可视模式
      case "v":
        this.enterVisualMode();
        break;
      case "V":
        this.enterVisualLineMode();
        break;
      
      // 撤销/重做
      case "u":
      case "Ctrl+Z":
        this.undo();
        break;
      case "Ctrl+r":
      case "Ctrl+Shift+Z":
        this.redo();
        break;
      
      // 保存/退出
      case ":":
        this.showCommandLine();
        break;
      case "Ctrl+S":
        this.save();
        break;
      case "Escape":
        // 已经是正常模式
        break;
    }
  }

  private handleInsertMode(data: string): void {
    switch (data) {
      case "Escape":
        this.exitInsertMode();
        break;
      case "Backspace":
        this.deleteCharBackward();
        break;
      case "Delete":
        this.deleteChar();
        break;
      case "Enter":
        this.insertNewLine();
        break;
      case "Tab":
        this.insertTab();
        break;
      default:
        if (data.length === 1) {
          this.insert(data);
        }
    }
  }

  private handleVisualMode(data: string): void {
    switch (data) {
      case "Escape":
        this.exitVisualMode();
        break;
      case "y":
        this.copySelection();
        this.exitVisualMode();
        break;
      case "d":
        this.deleteSelection();
        this.exitVisualMode();
        break;
      case "x":
        this.deleteSelection();
        this.exitVisualMode();
        break;
      case ">":
        this.indentSelection();
        break;
      case "<":
        this.dedentSelection();
        break;
    }
  }

  // ... 其他方法
}
```

## 最佳实践

### ✅ 应该做的

1. **使用 Kitty 协议获取准确的按键信息**
   ```typescript
   // TUI 会自动启用 Kitty 协议
   const tui = new TUI(terminal);
   ```

2. **处理所有常用按键**
   ```typescript
   handleInput(data: string): void {
     switch (data) {
       case "Enter":
       case "Escape":
       case "Tab":
       case "Backspace":
       case "Delete":
       case "ArrowUp":
       case "ArrowDown":
       case "ArrowLeft":
       case "ArrowRight":
         // 处理这些按键
         break;
       default:
         if (data.length === 1) {
           this.insert(data);
         }
     }
   }
   ```

3. **支持组合键**
   ```typescript
   case "Ctrl+C":
     this.copy();
     break;
   case "Ctrl+V":
     this.paste();
     break;
   case "Ctrl+Z":
     this.undo();
     break;
   ```

4. **正确处理 IME**
   ```typescript
   // 使用硬件光标
   render(width: number): string[] {
     const marker = this.focused ? CURSOR_MARKER : "";
     return [`${before}${marker}\x1b[7m${cursor}\x1b[27m${after}`];
   }
   ```

### ❌ 避免的错误

1. **假设所有终端都支持 Kitty 协议**
   ```typescript
   // ❌ 错误：直接假设支持
   handleInput(data: string): void {
     const event = parseKittyEvent(data);  // 可能返回 null
   }
   
   // ✅ 正确：提供降级处理
   handleInput(data: string): void {
     const event = parseKittyEvent(data);
     if (event) {
       // 使用 Kitty 协议
     } else {
       // 使用传统转义序列
     }
   }
   ```

2. **忽略按键释放事件**
   ```typescript
   // ❌ 错误：不设置 wantsKeyRelease
   class MyComponent implements Component {
     // 默认不接收释放事件
   }
   
   // ✅ 正确：如果需要，明确设置
   class MyComponent implements Component {
     wantsKeyRelease = true;  // 接收释放事件
   }
   ```

3. **在 render 中处理输入**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     if (this.keyPressed) {  // 不要在 render 中处理输入
       this.processKey();
     }
     return [...];
   }
   
   // ✅ 正确
   handleInput(data: string): void {
     this.processKey(data);
   }
   ```

## 总结

键盘输入处理的核心要点：

1. **Kitty 协议**：启用增强键盘协议获取准确按键信息
2. **按键解析**：解析转义序列获取按键名称和修饰键
3. **组合键**：支持 Ctrl、Shift、Alt、Meta 组合
4. **IME 支持**：使用硬件光标定位支持中文输入
5. **事件类型**：区分按键按下和释放

---

**下篇预告**: [06-advanced-patterns.md](06-advanced-patterns.md) —— 高级模式与最佳实践，包括性能优化、测试策略、与 pi-agent 集成等。
