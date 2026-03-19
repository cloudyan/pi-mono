# 样式与主题系统

> **难度：进阶** | **预计阅读时间：20 分钟**

上一章我们了解了组件架构。本章将深入样式与主题系统，学习如何定制组件外观。

## CSS 变量系统

pi-web-ui 使用 CSS 变量（Custom Properties）实现主题定制。

### 变量命名规范

```css
/* 命名规范: --pi-{category}-{property} */

/* 颜色 */
--pi-primary-color
--pi-bg-color
--pi-text-color

/* 间距 */
--pi-spacing-xs
--pi-spacing-sm
--pi-spacing-md
--pi-spacing-lg

/* 字体 */
--pi-font-family
--pi-font-size
--pi-line-height

/* 边框 */
--pi-border-color
--pi-border-radius
```

### 完整变量列表

```css
/* 主题色 */
--pi-primary-color: #3b82f6;
--pi-primary-hover: #2563eb;
--pi-primary-active: #1d4ed8;

/* 背景色 */
--pi-bg-color: #ffffff;
--pi-bg-secondary: #f3f4f6;
--pi-bg-tertiary: #e5e7eb;
--pi-bg-hover: #f9fafb;
--pi-bg-active: #f3f4f6;

/* 文字色 */
--pi-text-color: #111827;
--pi-text-secondary: #6b7280;
--pi-text-tertiary: #9ca3af;
--pi-text-inverse: #ffffff;

/* 边框 */
--pi-border-color: #e5e7eb;
--pi-border-color-focus: #3b82f6;
--pi-border-radius: 8px;
--pi-border-radius-sm: 4px;
--pi-border-radius-lg: 12px;

/* 消息气泡 */
--pi-user-bg: #3b82f6;
--pi-user-text: #ffffff;
--pi-ai-bg: #f3f4f6;
--pi-ai-text: #111827;

/* 代码块 */
--pi-code-bg: #1f2937;
--pi-code-text: #e5e7eb;
--pi-code-border: #374151;

/* 字体 */
--pi-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--pi-font-family-mono: 'Fira Code', 'Monaco', 'Consolas', monospace;
--pi-font-size: 14px;
--pi-font-size-sm: 12px;
--pi-font-size-lg: 16px;
--pi-line-height: 1.5;

/* 间距 */
--pi-spacing-xs: 4px;
--pi-spacing-sm: 8px;
--pi-spacing-md: 16px;
--pi-spacing-lg: 24px;
--pi-spacing-xl: 32px;

/* 阴影 */
--pi-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--pi-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--pi-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

/* 过渡 */
--pi-transition-fast: 150ms ease;
--pi-transition-normal: 250ms ease;
--pi-transition-slow: 350ms ease;

/* Z-index */
--pi-z-dropdown: 1000;
--pi-z-modal: 1100;
--pi-z-tooltip: 1200;
```

## 主题切换

### 手动切换

```html
<pi-chat id="chat" theme="light"></pi-chat>

<button onclick="setTheme('light')">亮色</button>
<button onclick="setTheme('dark')">暗色</button>

<script>
  function setTheme(theme) {
    const chat = document.getElementById('chat');
    chat.setAttribute('theme', theme);
  }
</script>
```

### 自动跟随系统

```javascript
// 监听系统主题变化
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function handleThemeChange(e) {
  const chat = document.getElementById('chat');
  chat.setAttribute('theme', e.matches ? 'dark' : 'light');
}

mediaQuery.addEventListener('change', handleThemeChange);
handleThemeChange(mediaQuery);  // 初始设置
```

### 组件内实现

```typescript
class PiChat extends HTMLElement {
  private theme: 'light' | 'dark' = 'light';
  
  connectedCallback() {
    // 检查系统偏好
    if (this.getAttribute('theme') === 'auto') {
      this.detectSystemTheme();
    }
  }
  
  private detectSystemTheme() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.setTheme(mediaQuery.matches ? 'dark' : 'light');
    
    mediaQuery.addEventListener('change', (e) => {
      this.setTheme(e.matches ? 'dark' : 'light');
    });
  }
  
  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
    this.setAttribute('theme', theme);
    
    // 应用 CSS 变量
    const colors = theme === 'dark' ? darkTheme : lightTheme;
    Object.entries(colors).forEach(([key, value]) => {
      this.style.setProperty(`--pi-${key}`, value);
    });
  }
}
```

## 自定义主题

### 浅色主题

```css
/* light-theme.css */
pi-chat {
  --pi-primary-color: #3b82f6;
  --pi-primary-hover: #2563eb;
  
  --pi-bg-color: #ffffff;
  --pi-bg-secondary: #f3f4f6;
  --pi-bg-tertiary: #e5e7eb;
  
  --pi-text-color: #111827;
  --pi-text-secondary: #6b7280;
  --pi-text-tertiary: #9ca3af;
  
  --pi-border-color: #e5e7eb;
  
  --pi-user-bg: #3b82f6;
  --pi-user-text: #ffffff;
  --pi-ai-bg: #f3f4f6;
  --pi-ai-text: #111827;
  
  --pi-code-bg: #f9fafb;
  --pi-code-text: #111827;
  --pi-code-border: #e5e7eb;
}
```

### 暗色主题

```css
/* dark-theme.css */
pi-chat {
  --pi-primary-color: #60a5fa;
  --pi-primary-hover: #3b82f6;
  
  --pi-bg-color: #111827;
  --pi-bg-secondary: #1f2937;
  --pi-bg-tertiary: #374151;
  
  --pi-text-color: #f9fafb;
  --pi-text-secondary: #d1d5db;
  --pi-text-tertiary: #9ca3af;
  
  --pi-border-color: #374151;
  
  --pi-user-bg: #3b82f6;
  --pi-user-text: #ffffff;
  --pi-ai-bg: #1f2937;
  --pi-ai-text: #f9fafb;
  
  --pi-code-bg: #111827;
  --pi-code-text: #e5e7eb;
  --pi-code-border: #374151;
}
```

### 自定义主题示例

```css
/* 紫色主题 */
pi-chat[theme="purple"] {
  --pi-primary-color: #8b5cf6;
  --pi-primary-hover: #7c3aed;
  
  --pi-user-bg: #8b5cf6;
}

/* 绿色主题 */
pi-chat[theme="green"] {
  --pi-primary-color: #10b981;
  --pi-primary-hover: #059669;
  
  --pi-user-bg: #10b981;
}

/* 高对比度主题 */
pi-chat[theme="high-contrast"] {
  --pi-bg-color: #000000;
  --pi-text-color: #ffffff;
  --pi-border-color: #ffffff;
  
  --pi-user-bg: #ffffff;
  --pi-user-text: #000000;
  --pi-ai-bg: #000000;
  --pi-ai-text: #ffffff;
}
```

## 响应式设计

### 断点变量

```css
/* 定义断点 */
:root {
  --pi-breakpoint-sm: 640px;
  --pi-breakpoint-md: 768px;
  --pi-breakpoint-lg: 1024px;
  --pi-breakpoint-xl: 1280px;
}

/* 在组件中使用 */
<style>
  :host {
    --pi-sidebar-width: 280px;
  }
  
  @media (max-width: 768px) {
    :host {
      --pi-sidebar-width: 0px;
    }
    
    .sidebar {
      display: none;
    }
    
    .messages {
      padding: var(--pi-spacing-sm);
    }
  }
</style>
```

### 移动端适配

```css
<style>
  /* 默认桌面样式 */
  .chat-container {
    display: flex;
    flex-direction: row;
  }
  
  .sidebar {
    width: 280px;
    border-right: 1px solid var(--pi-border-color);
  }
  
  /* 移动端 */
  @media (max-width: 768px) {
    .chat-container {
      flex-direction: column;
    }
    
    .sidebar {
      width: 100%;
      height: 60px;
      border-right: none;
      border-bottom: 1px solid var(--pi-border-color);
    }
    
    .input-container {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--pi-bg-color);
    }
  }
</style>
```

## 动画与过渡

### 消息进入动画

```css
<style>
  @keyframes message-slide-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .message {
    animation: message-slide-in var(--pi-transition-normal);
  }
  
  /* 交错动画 */
  .message:nth-child(1) { animation-delay: 0ms; }
  .message:nth-child(2) { animation-delay: 50ms; }
  .message:nth-child(3) { animation-delay: 100ms; }
</style>
```

### 流式输出光标

```css
<style>
  .streaming-cursor {
    display: inline-block;
    width: 2px;
    height: 1.2em;
    background: var(--pi-primary-color);
    animation: blink 1s step-end infinite;
    vertical-align: text-bottom;
  }
  
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
```

### 加载动画

```css
<style>
  .loading-dots {
    display: inline-flex;
    gap: 4px;
  }
  
  .loading-dots span {
    width: 8px;
    height: 8px;
    background: var(--pi-primary-color);
    border-radius: 50%;
    animation: loading-bounce 1.4s ease-in-out infinite both;
  }
  
  .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
  .loading-dots span:nth-child(2) { animation-delay: -0.16s; }
  
  @keyframes loading-bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }
</style>
```

## 代码高亮主题

### 集成 Prism.js

```typescript
// 代码高亮
private highlightCode(code: string, language?: string): string {
  if (language && Prism.languages[language]) {
    return Prism.highlight(code, Prism.languages[language], language);
  }
  return code;
}
```

### 代码块样式

```css
<style>
  pre {
    background: var(--pi-code-bg);
    color: var(--pi-code-text);
    border: 1px solid var(--pi-code-border);
    border-radius: var(--pi-border-radius);
    padding: var(--pi-spacing-md);
    overflow-x: auto;
    font-family: var(--pi-font-family-mono);
    font-size: var(--pi-font-size-sm);
    line-height: 1.6;
  }
  
  code {
    font-family: var(--pi-font-family-mono);
  }
  
  /* 行内代码 */
  :not(pre) > code {
    background: var(--pi-bg-secondary);
    padding: 2px 6px;
    border-radius: var(--pi-border-radius-sm);
    font-size: 0.9em;
  }
  
  /* 语法高亮颜色 */
  .token-keyword { color: #c678dd; }
  .token-string { color: #98c379; }
  .token-number { color: #d19a66; }
  .token-comment { color: #5c6370; font-style: italic; }
  .token-function { color: #61afef; }
</style>
```

## 最佳实践

### ✅ 应该做的

1. **提供合理的默认值**
   ```css
   :host {
     --pi-primary-color: var(--user-primary-color, #3b82f6);
   }
   ```

2. **使用语义化变量名**
   ```css
   /* ✅ 正确 */
   --pi-bg-color
   --pi-text-secondary
   
   /* ❌ 避免 */
   --pi-color-1
   --pi-gray-text
   ```

3. **支持系统主题**
   ```typescript
   if (theme === 'auto') {
     this.detectSystemTheme();
   }
   ```

### ❌ 避免的错误

1. **硬编码颜色**
   ```css
   /* ❌ 错误 */
   color: #3b82f6;
   
   /* ✅ 正确 */
   color: var(--pi-primary-color);
   ```

2. **忽略移动端**
   ```css
   /* ❌ 错误 */
   width: 300px;
   
   /* ✅ 正确 */
   width: 100%;
   max-width: 300px;
   ```

## 总结

样式与主题系统的核心要点：

1. **CSS 变量**：使用 --pi-{category}-{property} 命名规范
2. **主题切换**：light、dark、auto 模式，支持系统偏好
3. **自定义主题**：通过 CSS 变量覆盖默认样式
4. **响应式设计**：使用媒体查询适配不同屏幕
5. **动画过渡**：消息动画、加载动画、光标闪烁

---

**下篇预告**: [04-integration-backend.md](04-integration-backend.md) —— 与后端集成，包括 API 设计、流式响应、错误处理、认证授权等。
