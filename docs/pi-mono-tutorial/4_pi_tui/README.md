# pi-tui 系列教程

> 深入理解 @mariozechner/pi-tui —— 极简终端 UI 框架

## 系列概览

本系列带你深入理解 pi-tui 的设计原理和最佳实践。pi-tui 是一个**极简终端 UI 框架**，专为构建高性能、无闪烁的交互式 CLI 应用而设计。

### 核心特性

- ✅ **差分渲染** —— 只更新变化的部分，高性能、低带宽
- ✅ **同步输出** —— 使用 CSI 2026 原子更新，无闪烁、无撕裂
- ✅ **组件化** —— 简单的 Component 接口，易于扩展
- ✅ **Kitty 键盘协议** —— 支持完整的键盘输入，区分 Ctrl+C 和 Ctrl+Shift+C
- ✅ **IME 支持** —— 硬件光标定位，支持中文、日文、韩文输入
- ✅ **内联图片** —— Kitty/iTerm2 图形协议，在终端中显示图片

## 阅读路径

### 核心教程（必读）

| 章节 | 难度 | 预计时间 | 核心内容 |
|------|------|---------|---------|
| **[01-core-concepts.md](01-core-concepts.md)** | 入门 | 20 分钟 | Component 接口、TUI 容器、差分渲染、焦点管理 |
| **[02-differential-rendering.md](02-differential-rendering.md)** | 进阶 | 25 分钟 | 三种渲染策略、同步输出、差分算法、性能优化 |
| **[03-component-system.md](03-component-system.md)** | 进阶 | 30 分钟 | 内置组件（Text、Input、Editor、Markdown、SelectList、Image）、自定义组件 |
| **[04-overlays-focus.md](04-overlays-focus.md)** | 进阶 | 25 分钟 | 覆盖层、模态对话框、焦点栈、光标定位 |
| **[05-keyboard-input.md](05-keyboard-input.md)** | 进阶 | 25 分钟 | Kitty 键盘协议、按键解析、组合键、IME 支持 |
| **[06-advanced-patterns.md](06-advanced-patterns.md)** | 专家 | 25 分钟 | 与 pi-agent 集成、性能优化、测试策略、错误处理、主题系统、布局系统 |

### 阅读建议

**如果你是初学者**：
1. 按顺序阅读 01 → 02 → 03
2. 每章配合代码示例实践
3. 完成后再阅读 04、05、06

**如果你是进阶开发者**：
1. 快速浏览 01 了解基本概念
2. 重点阅读 02、03 理解核心机制
3. 04、05、06 按需查阅

**如果你是专家开发者**：
1. 直接阅读 02、06
2. 参考源码深入理解
3. 贡献最佳实践案例

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|------|------|---------|
| Component | 组件接口，所有 UI 元素的基础 | 01 |
| Focusable | 可聚焦组件接口 | 01 |
| TUI | 主容器，管理组件和渲染 | 01 |
| 差分渲染 | 只更新变化的部分 | 02 |
| CSI 2026 | 同步输出协议 | 02 |
| Overlay | 覆盖层，用于模态对话框 | 04 |
| CURSOR_MARKER | 光标位置标记 | 04 |
| Kitty 协议 | 增强键盘协议 | 05 |

## 快速开始

### 安装

```bash
npm install @mariozechner/pi-tui
```

### 基础示例

```typescript
import { TUI, ProcessTerminal, Text, Input } from "@mariozechner/pi-tui";

async function main() {
  // 创建终端和 TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // 添加标题
  tui.addChild(new Text("=== Hello TUI ===", 2, 1));

  // 添加输入框
  const input = new Input();
  input.onSubmit = (value) => {
    console.log("提交:", value);
    tui.stop();
  };
  tui.addChild(input);
  tui.setFocus(input);

  // 启动
  tui.start();
}

main();
```

### 运行

```bash
npx tsx hello-tui.ts
```

## 内置组件

| 组件 | 用途 | 示例 |
|------|------|------|
| `Text` | 显示文本 | `new Text("Hello")` |
| `Input` | 单行输入 | `new Input()` |
| `Editor` | 多行编辑器 | `new Editor()` |
| `Markdown` | 渲染 Markdown | `new Markdown("# Title")` |
| `SelectList` | 选择列表 | `new SelectList(items)` |
| `Image` | 显示图片 | `Image.fromFile("photo.png")` |

## 与 pi-agent 集成

```typescript
import { TUI, ProcessTerminal, Markdown, Input } from "@mariozechner/pi-tui";
import { Agent } from "@mariozechner/pi-agent-core";

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

const messages = new Markdown("");
const input = new Input();

const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有帮助的助手。",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

// 订阅 Agent 事件
agent.subscribe((event) => {
  if (event.type === "message_update" && 
      event.assistantMessageEvent.type === "text_delta") {
    messages.append(event.assistantMessageEvent.delta);
    tui.requestRender();
  }
});

input.onSubmit = (text) => {
  messages.append(`\n**You:** ${text}`);
  agent.prompt(text);
  input.clear();
};

tui.addChild(messages);
tui.addChild(input);
tui.setFocus(input);
tui.start();
```

## 源码位置

- **源码**: `packages/tui/src/` 目录
- **测试**: `packages/tui/test/` 目录
- **核心**: `packages/tui/src/tui.ts`, `packages/tui/src/terminal.ts`
- **组件**: `packages/tui/src/components/` 目录

## 相关资源

- **pi-agent 系列**: [../3_pi_agent/README.md](../3_pi_agent/README.md)
- **pi-ai 系列**: [../2_pi_ai/README.md](../2_pi_ai/README.md)
- **API 参考**: 查看源码中的 JSDoc 注释
- **示例项目**: 参考 `packages/tui/test/` 中的测试用例

## 术语统一表

| 英文术语 | 中文翻译 | 说明 |
|---------|---------|------|
| TUI | TUI/终端 UI | 终端用户界面 |
| Component | 组件 | UI 元素 |
| Focusable | 可聚焦 | 可以接收键盘输入 |
| Overlay | 覆盖层 | 模态对话框等 |
| Differential Rendering | 差分渲染 | 只更新变化的部分 |
| CSI 2026 | CSI 2026 | 同步输出协议 |
| Kitty Protocol | Kitty 协议 | 增强键盘协议 |
| IME | 输入法 | 中文/日文/韩文输入 |
| CURSOR_MARKER | 光标标记 | 硬件光标定位标记 |

## 学习建议

1. **先理解概念，再看代码**
   - 每章先通读理解概念
   - 再对照源码深入理解

2. **动手实践**
   - 每章都有代码示例
   - 建议自己运行一遍

3. **从简单到复杂**
   - 先实现基础界面
   - 再添加交互和动画

4. **参考测试用例**
   - `packages/tui/test/` 中有丰富的测试用例
   - 是学习 API 用法的最佳参考

## 常见问题

**Q: pi-tui 支持哪些终端？**

A: 支持所有现代终端，包括：
- Kitty（推荐，完整支持所有特性）
- iTerm2（macOS，支持图形协议）
- Windows Terminal
- Alacritty
- GNOME Terminal、Konsole 等

**Q: 如何在普通终端中使用？**

A: pi-tui 会自动检测终端能力并降级：
- 不支持 Kitty 协议的终端使用传统转义序列
- 不支持图形协议的终端显示文本替代

**Q: 如何处理中文输入？**

A: pi-tui 使用硬件光标定位支持 IME：
```typescript
// Focusable 组件在光标位置输出 CURSOR_MARKER
render(width: number): string[] {
  const marker = this.focused ? CURSOR_MARKER : "";
  return [`${before}${marker}\x1b[7m${cursor}\x1b[27m${after}`];
}
```

**Q: 如何调试渲染问题？**

A: 使用 VirtualTerminal 进行测试：
```typescript
import { VirtualTerminal } from "@mariozechner/pi-tui";

const terminal = new VirtualTerminal(80, 24);
const tui = new TUI(terminal);

// 渲染后检查输出
console.log(terminal.getScreen());
```

**Q: 如何与 pi-agent 集成？**

A: 参考 [06-advanced-patterns.md](06-advanced-patterns.md) 中的"与 pi-agent 集成"章节，或查看 `packages/coding-agent/` 中的实际实现。

## 最佳实践

### ✅ 应该做的

1. **正确实现 Component 接口**
   ```typescript
   class MyComponent implements Component {
     render(width: number): string[] {
       // 返回不超过 width 的行数组
     }
     invalidate(): void {
       // 清除缓存
     }
   }
   ```

2. **使用工具函数处理宽度**
   ```typescript
   import { truncateToWidth } from "@mariozechner/pi-tui";
   render(width: number): string[] {
     return [truncateToWidth(this.text, width)];
   }
   ```

3. **批量更新后统一渲染**
   ```typescript
   component1.update();
   component2.update();
   tui.requestRender();  // 只渲染一次
   ```

### ❌ 避免的错误

1. **在 render 中执行副作用**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     console.log("Rendering...");  // 副作用
     return ["..."];
   }
   ```

2. **返回超过宽度的行**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     return [this.text];  // 可能超过 width
   }
   ```

3. **忘记调用 invalidate**
   ```typescript
   // ❌ 错误
   setText(text: string): void {
     this.text = text;
     // 忘记调用 invalidate！
   }
   ```

---

**开始阅读**: [01-core-concepts.md](01-core-concepts.md)

**最后更新**: 2026-03-18
