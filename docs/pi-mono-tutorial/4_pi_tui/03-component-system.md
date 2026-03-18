# 组件系统与内置组件

> **难度：进阶** | **预计阅读时间：30 分钟**

上一章我们了解了差分渲染原理。本章将深入组件系统，学习如何使用和扩展内置组件。

## 组件系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      组件系统架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Component 接口                       │   │
│  │  render(width: number): string[]                         │   │
│  │  handleInput?(data: string): void                        │   │
│  │  wantsKeyRelease?: boolean                               │   │
│  │  invalidate(): void                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Focusable 接口                        │   │
│  │  focused: boolean                                        │   │
│  │  (用于需要显示光标的组件)                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────┐ │
│  │  Text   │  │  Input  │  │ Editor  │  │Markdown │  │Select│ │
│  │ (文本)  │  │ (输入)  │  │ (编辑器)│  │(Markdown)│  │(选择)│ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └──────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 内置组件概览

| 组件 | 用途 | 特性 |
|------|------|------|
| `Text` | 显示文本 | 多行、自动换行、ANSI 颜色 |
| `Input` | 单行输入 | 光标移动、选择、提交 |
| `Editor` | 多行编辑器 | 类似 Vim 的编辑模式 |
| `Markdown` | 渲染 Markdown | 语法高亮、代码块、列表 |
| `SelectList` | 选择列表 | 单选、多选、搜索过滤 |
| `Image` | 显示图片 | Kitty/iTerm2 图形协议 |

## Text 组件

### 基础用法

```typescript
import { Text } from "@mariozechner/pi-tui";

// 单行文本
const text1 = new Text("Hello, World!");

// 多行文本
const text2 = new Text(`Line 1
Line 2
Line 3`);

// 带样式的文本（使用 ANSI 转义序列）
const text3 = new Text("\x1b[1m粗体\x1b[0m \x1b[31m红色\x1b[0m");
```

### 自动换行

```typescript
// 自动换行到指定宽度
const text = new Text(longParagraph, {
  wrap: true,
  wrapWidth: 80,
});

// 自定义换行处理
const text = new Text(content, {
  wrap: true,
  wrapWidth: 80,
  // 保留缩进
  preserveIndent: true,
});
```

### 动态更新

```typescript
const text = new Text("Initial text");
tui.addChild(text);

// 更新文本
text.setText("Updated text");
text.invalidate();  // 标记需要重新渲染
tui.requestRender();
```

## Input 组件

### 基础用法

```typescript
import { Input } from "@mariozechner/pi-tui";

const input = new Input();

// 设置占位符
input.setPlaceholder("请输入...");

// 设置初始值
input.setValue("initial value");

// 监听提交
input.onSubmit = (value) => {
  console.log("提交:", value);
};

// 监听变化
input.onChange = (value) => {
  console.log("变化:", value);
};

tui.addChild(input);
tui.setFocus(input);  // 设置焦点
```

### 输入处理

```typescript
// 处理特殊按键
input.handleInput = (data) => {
  // data 是解析后的按键
  if (data === "Enter") {
    input.submit();
  } else if (data === "Escape") {
    input.clear();
  } else {
    // 默认处理
    input.insert(data);
  }
};
```

### 光标操作

```typescript
// 移动光标
input.moveCursorLeft();
input.moveCursorRight();
input.moveCursorToStart();
input.moveCursorToEnd();

// 选择文本
input.selectAll();
input.selectRange(start, end);

// 获取选中文本
const selected = input.getSelectedText();

// 删除选中文本
input.deleteSelection();
```

## Editor 组件

Editor 是一个功能丰富的多行文本编辑器，支持类似 Vim 的编辑模式。

### 基础用法

```typescript
import { Editor } from "@mariozechner/pi-tui";

const editor = new Editor();

// 设置内容
editor.setText(`function hello() {
  console.log("Hello, World!");
}`);

// 监听变化
editor.onChange = (text) => {
  console.log("内容变化:", text);
};

// 监听保存
editor.onSave = (text) => {
  console.log("保存:", text);
};

tui.addChild(editor);
tui.setFocus(editor);
```

### 编辑模式

Editor 支持多种编辑模式：

```typescript
// 正常模式（默认）
// - 使用方向键移动光标
// - 使用 Home/End 移动到行首/行尾
// - 使用 PageUp/PageDown 翻页

// 插入模式
editor.enterInsertMode();
// - 直接输入字符
// - 按 Escape 返回正常模式

// 可视模式
editor.enterVisualMode();
// - 选择文本
// - 支持复制、剪切、粘贴
```

### 常用操作

```typescript
// 光标移动
editor.moveUp();
editor.moveDown();
editor.moveLeft();
editor.moveRight();
editor.moveToLineStart();
editor.moveToLineEnd();
editor.moveToFileStart();
editor.moveToFileEnd();

// 编辑操作
editor.insertText("text");
editor.deleteChar();
editor.deleteLine();
editor.duplicateLine();
editor.indent();
editor.dedent();

// 选择操作
editor.selectLine();
editor.selectAll();
editor.copy();
editor.cut();
editor.paste();

// 撤销/重做
editor.undo();
editor.redo();
```

### 配置

```typescript
const editor = new Editor({
  // 启用行号
  lineNumbers: true,
  
  // 启用语法高亮
  syntaxHighlighting: true,
  language: "typescript",
  
  // 缩进设置
  indentSize: 2,
  useSpaces: true,
  
  // 自动换行
  wordWrap: true,
  wrapWidth: 80,
  
  // 显示空白字符
  showWhitespace: false,
});
```

## Markdown 组件

Markdown 组件用于渲染 Markdown 格式的文本，支持语法高亮。

### 基础用法

```typescript
import { Markdown } from "@mariozechner/pi-tui";

const markdown = new Markdown(`
# 标题

这是一段 **粗体** 和 *斜体* 文本。

## 代码块

\`\`\`typescript
const x = 1;
console.log(x);
\`\`\`

## 列表

- 项目 1
- 项目 2
- 项目 3

## 引用

> 这是一段引用
`);

tui.addChild(markdown);
```

### 自定义渲染

```typescript
const markdown = new Markdown(content, {
  // 自定义主题
  theme: {
    heading: "\x1b[1;36m",  // 青色粗体
    code: "\x1b[90m",       // 灰色
    link: "\x1b[34m",       // 蓝色
    quote: "\x1b[3m",       // 斜体
    reset: "\x1b[0m",
  },
  
  // 代码高亮
  highlightCode: true,
  
  // 链接处理
  linkHandler: (url) => {
    console.log("点击链接:", url);
  },
});
```

### 流式更新

适合用于显示 AI 的流式输出：

```typescript
const markdown = new Markdown("");
tui.addChild(markdown);

// 模拟流式输出
const chunks = ["# Hello", ", ", "World", "!\n\n", "This ", "is ", "**bold**"];
for (const chunk of chunks) {
  markdown.append(chunk);
  await sleep(100);
}
```

## SelectList 组件

SelectList 用于显示可选择的列表项。

### 基础用法

```typescript
import { SelectList } from "@mariozechner/pi-tui";

const list = new SelectList([
  { id: "1", label: "选项 1" },
  { id: "2", label: "选项 2" },
  { id: "3", label: "选项 3" },
]);

// 监听选择
list.onSelect = (item) => {
  console.log("选中:", item.label);
};

// 监听确认
list.onConfirm = (item) => {
  console.log("确认:", item.label);
};

tui.addChild(list);
tui.setFocus(list);
```

### 多选模式

```typescript
const list = new SelectList(items, {
  multiSelect: true,
});

// 获取选中的项
const selected = list.getSelectedItems();

// 全选/取消全选
list.selectAll();
list.deselectAll();
```

### 搜索过滤

```typescript
const list = new SelectList(items, {
  searchable: true,
  searchPlaceholder: "搜索...",
});

// 设置搜索查询
list.setSearchQuery("keyword");

// 监听搜索
list.onSearch = (query) => {
  console.log("搜索:", query);
};
```

### 键盘导航

```typescript
// 默认按键
// ↑/k - 上移
// ↓/j - 下移
// Enter - 确认
// Space - 切换选择（多选模式）
// / - 开始搜索
// Escape - 取消搜索

// 自定义按键
list.handleInput = (data) => {
  if (data === "Ctrl+n") {
    list.moveDown();
  } else if (data === "Ctrl+p") {
    list.moveUp();
  } else {
    // 默认处理
    list.defaultHandleInput(data);
  }
};
```

## Image 组件

Image 组件使用 Kitty 或 iTerm2 图形协议在终端中显示图片。

### 基础用法

```typescript
import { Image } from "@mariozechner/pi-tui";

// 从文件加载
const image = await Image.fromFile("./photo.png");

// 从 URL 加载
const image = await Image.fromURL("https://example.com/image.png");

// 从 Buffer 加载
const image = Image.fromBuffer(buffer, "image/png");

tui.addChild(image);
```

### 调整大小

```typescript
// 设置最大尺寸
image.setMaxSize(800, 600);

// 设置固定尺寸
image.setSize(400, 300);

// 保持宽高比
image.setWidth(400);  // 高度自动计算
image.setHeight(300); // 宽度自动计算
```

### 注意事项

```typescript
// Image 组件需要 Kitty 或 iTerm2 终端
// 在其他终端中会显示占位符

// 检查是否支持图形协议
if (Image.isSupported()) {
  tui.addChild(image);
} else {
  // 显示文本替代
  tui.addChild(new Text("[Image: photo.png]"));
}
```

## 自定义组件

### 基础组件

```typescript
import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth } from "@mariozechner/pi-tui";

class MyComponent implements Component {
  private text: string = "";
  private cached?: string[];

  render(width: number): string[] {
    // 使用缓存
    if (this.cached) return this.cached;
    
    // 渲染逻辑
    const line = truncateToWidth(this.text, width);
    this.cached = [line];
    
    return this.cached;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  setText(text: string): void {
    this.text = text;
    this.invalidate();
  }
}
```

### 可聚焦组件

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@mariozechner/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;
  private cursorPosition: number = 0;
  private text: string = "";

  render(width: number): string[] {
    const beforeCursor = this.text.slice(0, this.cursorPosition);
    const atCursor = this.text.slice(this.cursorPosition, this.cursorPosition + 1) || " ";
    const afterCursor = this.text.slice(this.cursorPosition + 1);
    
    // 如果获得焦点，在光标位置插入标记
    const marker = this.focused ? CURSOR_MARKER : "";
    const cursorVisual = this.focused 
      ? `${marker}\x1b[7m${atCursor}\x1b[27m`  // 反色显示
      : atCursor;
    
    const line = `> ${beforeCursor}${cursorVisual}${afterCursor}`;
    return [truncateToWidth(line, width)];
  }

  handleInput(data: string): void {
    if (data === "ArrowLeft") {
      this.cursorPosition = Math.max(0, this.cursorPosition - 1);
    } else if (data === "ArrowRight") {
      this.cursorPosition = Math.min(this.text.length, this.cursorPosition + 1);
    } else if (data.length === 1) {
      // 插入字符
      this.text = this.text.slice(0, this.cursorPosition) + 
                  data + 
                  this.text.slice(this.cursorPosition);
      this.cursorPosition++;
    }
    this.invalidate();
  }

  invalidate(): void {
    // 标记需要重新渲染
  }
}
```

### 组合组件

```typescript
class ChatMessage implements Component {
  private user: string;
  private content: Component;

  constructor(user: string, text: string) {
    this.user = user;
    this.content = new Markdown(text);
  }

  render(width: number): string[] {
    const header = `\x1b[1m${this.user}:\x1b[0m`;
    const contentLines = this.content.render(width - 2);
    
    return [
      header,
      ...contentLines.map(line => "  " + line),
      "",  // 空行分隔
    ];
  }

  invalidate(): void {
    this.content.invalidate();
  }
}
```

## 组件通信

### 使用事件

```typescript
class ParentComponent implements Component {
  private child: ChildComponent;

  constructor() {
    this.child = new ChildComponent();
    
    // 监听子组件事件
    this.child.onEvent = (data) => {
      this.handleChildEvent(data);
    };
  }

  private handleChildEvent(data: any): void {
    // 处理子组件事件
  }
}

class ChildComponent implements Component {
  onEvent?: (data: any) => void;

  triggerEvent(data: any): void {
    this.onEvent?.(data);
  }
}
```

### 使用回调

```typescript
class Button implements Component {
  private label: string;
  onClick?: () => void;

  constructor(label: string) {
    this.label = label;
  }

  handleInput(data: string): void {
    if (data === "Enter" || data === " ") {
      this.onClick?.();
    }
  }

  render(width: number): string[] {
    return [`[ ${this.label} ]`];
  }

  invalidate(): void {}
}

// 使用
const button = new Button("确定");
button.onClick = () => {
  console.log("按钮被点击");
};
```

## 最佳实践

### ✅ 应该做的

1. **正确实现 invalidate**
   ```typescript
   invalidate(): void {
     this.cached = undefined;
   }
   ```

2. **使用工具函数处理宽度**
   ```typescript
   import { truncateToWidth } from "@mariozechner/pi-tui";
   
   render(width: number): string[] {
     return [truncateToWidth(this.text, width)];
   }
   ```

3. **分离渲染和状态**
   ```typescript
   // 状态更新
   setValue(value: string): void {
     this.value = value;
     this.invalidate();
   }
   
   // 纯渲染
   render(width: number): string[] {
     return [this.value];
   }
   ```

### ❌ 避免的错误

1. **在 render 中修改状态**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     this.lineCount = this.calculateLines();  // 副作用
     return [...];
   }
   ```

2. **返回超过宽度的行**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     return [this.text];  // 可能超过 width
   }
   ```

3. **忘记处理边界情况**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     return [this.lines[this.currentLine]];  // 可能越界
   }
   
   // ✅ 正确
   render(width: number): string[] {
     const line = this.lines[this.currentLine] ?? "";
     return [truncateToWidth(line, width)];
   }
   ```

## 总结

组件系统的核心要点：

1. **Component 接口**：所有组件的基础
2. **Focusable 接口**：需要光标的组件
3. **内置组件**：Text、Input、Editor、Markdown、SelectList、Image
4. **自定义组件**：实现 Component 接口即可
5. **组件通信**：使用事件或回调

---

**下篇预告**: [04-overlays-focus.md](04-overlays-focus.md) —— 覆盖层与焦点管理，包括模态对话框、菜单、光标定位等。
