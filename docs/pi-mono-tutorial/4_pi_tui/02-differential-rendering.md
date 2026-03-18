# 差分渲染原理

> **难度：进阶** | **预计阅读时间：25 分钟**

上一章我们了解了 TUI 的核心概念。本章将深入差分渲染的原理——这是 pi-tui 高性能的关键所在。

## 为什么需要差分渲染？

传统终端 UI 的渲染方式：

```typescript
// ❌ 传统方式：全量渲染
function render() {
  terminal.clearScreen();  // 清除整个屏幕
  for (const line of allLines) {
    terminal.write(line + "\n");  // 重新输出所有行
  }
}
```

**问题**：
- 闪烁：清除和重绘之间有明显的空白
- 性能差：即使只改变一个字符，也要重绘整个屏幕
- 带宽高：大量重复的输出数据

pi-tui 的差分渲染：

```typescript
// ✅ 差分渲染：只更新变化的部分
function renderDiff(previous: string[], current: string[]) {
  const firstChangedLine = findFirstDifference(previous, current);
  terminal.moveBy(firstChangedLine);  // 移动到第一行变化处
  terminal.clearFromCursor();          // 只清除变化部分
  for (let i = firstChangedLine; i < current.length; i++) {
    terminal.write(current[i] + "\n"); // 只输出变化的行
  }
}
```

**优势**：
- 无闪烁：使用 CSI 2026 同步输出
- 高性能：只传输变化的数据
- 低带宽：减少终端通信量

## 渲染策略

pi-tui 使用三种渲染策略，根据情况自动选择：

### 策略 1：首次渲染

**场景**：应用启动时

```typescript
// packages/tui/src/tui.ts

private renderInitial(): void {
  // 不执行清除操作
  // 直接输出所有行
  for (const line of this.currentLines) {
    this.terminal.write(line + "\n");
  }
}
```

**为什么不清除？**
- 保留之前的终端输出（如启动日志）
- 允许在现有内容上叠加 UI
- 符合 Unix 哲学：不破坏用户的历史

### 策略 2：宽度变化或大幅变化

**场景**：
- 终端窗口大小改变
- 组件数量大幅变化
- 需要完全重新布局

```typescript
private renderFull(): void {
  // 1. 清除屏幕
  this.terminal.clearScreen();
  
  // 2. 渲染所有组件
  this.currentLines = this.renderComponents();
  
  // 3. 输出所有行
  for (const line of this.currentLines) {
    this.terminal.write(line + "\n");
  }
  
  // 4. 更新光标
  this.positionCursor();
}
```

**触发条件**：

```typescript
// 宽度变化
if (this.currentWidth !== this.terminal.columns) {
  this.currentWidth = this.terminal.columns;
  this.fullRedraw = true;
}

// 行数变化（可能是组件增删）
if (this.previousLines.length !== this.currentLines.length) {
  this.fullRedraw = true;
}
```

### 策略 3：差分渲染（正常更新）

**场景**：大多数更新（输入、状态变化）

```typescript
private renderDiff(): void {
  // 1. 找到第一行变化的索引
  const firstChangedLine = this.findFirstDifference(
    this.previousLines, 
    this.currentLines
  );
  
  // 2. 如果没有变化，直接返回
  if (firstChangedLine === -1) return;
  
  // 3. 移动光标到第一行变化处
  const linesToMove = firstChangedLine - (this.previousLines.length - 1);
  this.terminal.moveBy(linesToMove);
  
  // 4. 清除从光标到末尾的内容
  this.terminal.clearFromCursor();
  
  // 5. 输出变化的行
  for (let i = firstChangedLine; i < this.currentLines.length; i++) {
    this.terminal.write(this.currentLines[i] + "\n");
  }
}
```

## 同步输出（CSI 2026）

### 什么是 CSI 2026？

CSI 2026 是终端的**同步更新**协议：

```
ESC [ ? 2026 h   - 开始同步更新
ESC [ ? 2026 l   - 结束同步更新
```

### 为什么重要？

没有同步输出：

```
时间线 ─────────────────────────────────────────►

帧 1:  [清除屏幕]                    ← 用户看到空白
帧 2:  [输出第 1 行]                 ← 用户看到部分画面
帧 3:  [输出第 2 行]                 ← 用户看到更多
帧 4:  [输出第 3 行]                 ← 完整画面

结果：闪烁、撕裂感
```

有同步输出：

```
时间线 ─────────────────────────────────────────►

帧 1-4: [开始同步] [渲染所有] [结束同步]  ← 用户什么都看不到

帧 5:   [完整画面显示]                    ← 用户只看到最终结果

结果：无闪烁、无撕裂
```

### 实现

```typescript
// packages/tui/src/tui.ts

private render(): void {
  // 开始同步更新
  this.terminal.write("\x1b[?2026h");
  
  try {
    // 执行渲染
    if (this.fullRedraw) {
      this.renderFull();
    } else {
      this.renderDiff();
    }
    
    // 定位光标
    this.positionCursor();
  } finally {
    // 结束同步更新
    this.terminal.write("\x1b[?2026l");
  }
}
```

## 差分算法详解

### 找到第一行变化

```typescript
private findFirstDifference(
  previous: string[], 
  current: string[]
): number {
  const minLength = Math.min(previous.length, current.length);
  
  for (let i = 0; i < minLength; i++) {
    if (previous[i] !== current[i]) {
      return i;
    }
  }
  
  // 如果前面都相同，但长度不同
  if (previous.length !== current.length) {
    return minLength;
  }
  
  // 完全相同
  return -1;
}
```

### 示例

```
上一帧:
┌─────────────────┐
│ Line 1: Hello   │
│ Line 2: World   │ ← 变化
│ Line 3: !       │ ← 变化
└─────────────────┘

当前帧:
┌─────────────────┐
│ Line 1: Hello   │
│ Line 2: World!  │ ← 变化
│ Line 3: (empty) │ ← 变化
└─────────────────┘

差分渲染:
1. 找到第一行变化: index 1 (Line 2)
2. 移动到第 1 行
3. 清除从第 1 行到末尾
4. 输出 Line 2 和 Line 3
```

## 性能优化

### 1. 缓存渲染结果

```typescript
class Text implements Component {
  private cachedLines?: string[];
  private cachedWidth?: number;

  render(width: number): string[] {
    // 如果宽度和内容都没变，返回缓存
    if (this.cachedLines && 
        this.cachedWidth === width && 
        !this.dirty) {
      return this.cachedLines;
    }
    
    // 重新渲染
    const lines = this.doRender(width);
    
    // 更新缓存
    this.cachedLines = lines;
    this.cachedWidth = width;
    this.dirty = false;
    
    return lines;
  }
  
  invalidate(): void {
    this.dirty = true;
  }
}
```

### 2. 批量更新

```typescript
// ❌ 低效：每次变化都触发渲染
component1.update();
tui.render();
component2.update();
tui.render();
component3.update();
tui.render();

// ✅ 高效：批量更新，只渲染一次
component1.update();
component2.update();
component3.update();
tui.render();
```

### 3. 使用 requestAnimationFrame 模式

```typescript
class TUI {
  private renderPending = false;

  requestRender(): void {
    if (this.renderPending) return;
    
    this.renderPending = true;
    setImmediate(() => {
      this.renderPending = false;
      this.render();
    });
  }
}
```

### 4. 避免不必要的重绘

```typescript
// ❌ 低效：每次都重新渲染
class Counter implements Component {
  render(width: number): string[] {
    return [`Count: ${this.count}`];
  }
}

// ✅ 高效：只在变化时重新渲染
class Counter implements Component {
  private lastCount?: number;
  private cached?: string[];

  render(width: number): string[] {
    if (this.lastCount === this.count && this.cached) {
      return this.cached;
    }
    
    this.lastCount = this.count;
    this.cached = [`Count: ${this.count}`];
    return this.cached;
  }
}
```

## 渲染调试

### 启用调试输出

```typescript
const tui = new TUI(terminal, { debug: true });
```

### 查看渲染统计

```typescript
tui.onRender = (stats) => {
  console.log(`渲染: ${stats.linesChanged}/${stats.totalLines} 行变化`);
};
```

### 使用 VirtualTerminal 测试

```typescript
import { VirtualTerminal } from "@mariozechner/pi-tui";

// 创建虚拟终端
const terminal = new VirtualTerminal(80, 24);
const tui = new TUI(terminal);

// 渲染
tui.render();

// 检查输出
console.log(terminal.getScreen());
```

## 完整示例：性能对比

```typescript
import { TUI, ProcessTerminal, Text } from "@mariozechner/pi-tui";

// 性能测试
async function benchmark() {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  
  // 添加 100 个文本组件
  const texts: Text[] = [];
  for (let i = 0; i < 100; i++) {
    const text = new Text(`Line ${i}`);
    texts.push(text);
    tui.addChild(text);
  }
  
  tui.start();
  
  // 测试 1：全量渲染（模拟宽度变化）
  console.time("Full render");
  tui.forceFullRender();
  console.timeEnd("Full render");
  
  // 测试 2：差分渲染（只改变一行）
  console.time("Diff render");
  texts[50].setText("Line 50 - Updated!");
  tui.requestRender();
  console.timeEnd("Diff render");
  
  // 结果：
  // Full render: ~50ms
  // Diff render: ~1ms
}
```

## 最佳实践

### ✅ 应该做的

1. **使用缓存**
   ```typescript
   private cached?: string[];
   render(width: number): string[] {
     if (this.cached) return this.cached;
     this.cached = this.doRender(width);
     return this.cached;
   }
   ```

2. **正确实现 invalidate**
   ```typescript
   invalidate(): void {
     this.cached = undefined;  // 清除缓存
   }
   ```

3. **批量更新后统一渲染**
   ```typescript
   // 更新多个组件
   component1.update();
   component2.update();
   component3.update();
   
   // 只渲染一次
   tui.requestRender();
   ```

### ❌ 避免的错误

1. **在 render 中执行副作用**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     console.log("Rendering...");  // 副作用
     fetchData();                   // 副作用
     return ["..."];
   }
   ```

2. **返回超过宽度的行**
   ```typescript
   // ❌ 错误
   render(width: number): string[] {
     return [this.text];  // text 可能比 width 长
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

## 总结

差分渲染的核心要点：

1. **三种策略**：首次渲染、全量渲染、差分渲染
2. **同步输出**：CSI 2026 确保无闪烁
3. **差分算法**：找到第一行变化，只更新后续内容
4. **性能优化**：缓存、批量更新、避免不必要重绘
5. **调试工具**：VirtualTerminal 用于测试

---

**下篇预告**: [03-component-system.md](03-component-system.md) —— 组件系统与内置组件，包括 Text、Input、Editor、Markdown、SelectList 等。
