# Web UI 核心概念

> **难度：入门** | **预计阅读时间：20 分钟**

想象一下，你正在构建一个 AI 聊天应用。传统的 Web 开发需要：
- 选择前端框架（React、Vue、Angular）
- 配置构建工具（Webpack、Vite）
- 处理状态管理（Redux、Vuex）
- 设计组件 API
- 处理样式和主题

而 pi-web-ui 提供了一种更简单的方式：

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="https://unpkg.com/@mariozechner/pi-web-ui"></script>
</head>
<body>
  <pi-chat
    provider="anthropic"
    model="claude-sonnet-4-20250514"
    api-key="your-api-key">
  </pi-chat>
</body>
</html>
```

只需要几行代码，就能拥有一个功能完整的 AI 聊天界面。

## 什么是 pi-web-ui？

pi-web-ui 是一个**基于 Web Components 的 AI 聊天界面库**，它提供了：

- ✅ **框架无关** —— 使用原生 Web Components，支持任何前端框架
- ✅ **即插即用** —— 无需构建工具，直接通过 CDN 使用
- ✅ **可定制主题** —— 支持 CSS 变量自定义样式
- ✅ **响应式设计** —— 适配桌面和移动设备
- ✅ **流式输出** —— 实时显示 AI 的流式响应
- ✅ **代码高亮** —— 自动高亮代码块
- ✅ **Markdown 支持** —— 渲染 Markdown 格式的消息

### 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                    pi-web-ui 组件体系                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      <pi-chat>                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ Header  │  │Messages │  │ Input   │  │ Status  │  │   │
│  │  │ 头部    │  │ 消息列表│  │ 输入框  │  │ 状态栏  │  │   │
│  │  └─────────┘  └────┬────┘  └─────────┘  └─────────┘  │   │
│  │                    │                                    │   │
│  │                    ▼                                    │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              <pi-message> × N                    │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │   │
│  │  │  │ Avatar  │  │ Content │  │ Actions │         │   │   │
│  │  │  │ 头像    │  │ 内容    │  │ 操作    │         │   │   │
│  │  │  └─────────┘  └────┬────┘  └─────────┘         │   │   │
│  │  │                    │                            │   │   │
│  │  │                    ▼                            │   │   │
│  │  │  ┌─────────────────────────────────────────┐   │   │   │
│  │  │  │  Text / Markdown / Code / ToolCall      │   │   │   │
│  │  │  └─────────────────────────────────────────┘   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 核心概念一：Web Components

pi-web-ui 基于 Web Components 标准构建，这意味着：

### 什么是 Web Components？

Web Components 是一组 Web 平台 API，允许你创建可重用的自定义元素：

- **Custom Elements** —— 定义新的 HTML 标签
- **Shadow DOM** —— 封装组件的内部结构
- **HTML Templates** —— 定义可复用的 HTML 模板
- **ES Modules** —— 模块化加载组件

### 优势

```
┌─────────────────────────────────────────────────────────────────┐
│              Web Components vs 传统框架组件                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Web Components              │  React/Vue 组件                  │
│  ────────────────────────────┼────────────────────────────────  │
│  原生浏览器支持              │  需要框架运行时                   │
│  框架无关                    │  依赖特定框架                     │
│  真正的封装                  │  运行时封装                       │
│  标准 API                    │  框架特定 API                     │
│  长期稳定                    │  可能随框架变化                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 使用示例

```html
<!-- 在任何框架中使用 -->
<!DOCTYPE html>
<html>
<head>
  <!-- React 应用 -->
  <script type="module" src="@mariozechner/pi-web-ui"></script>
</head>
<body>
  <div id="root"></div>
  
  <script type="module">
    // 在 React 中使用
    function App() {
      return (
        <div>
          <h1>My React App</h1>
          {/* Web Component 作为 React 组件使用 */}
          <pi-chat provider="anthropic" model="claude-sonnet-4-20250514">
          </pi-chat>
        </div>
      );
    }
  </script>
</body>
</html>
```

## 核心概念二：<pi-chat> 组件

`<pi-chat>` 是 pi-web-ui 的核心组件，提供完整的聊天界面。

### 基础用法

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="https://unpkg.com/@mariozechner/pi-web-ui"></script>
  <style>
    body {
      margin: 0;
      height: 100vh;
    }
    pi-chat {
      height: 100%;
    }
  </style>
</head>
<body>
  <pi-chat
    provider="anthropic"
    model="claude-sonnet-4-20250514"
    api-key="sk-ant-api03-...">
  </pi-chat>
</body>
</html>
```

### 属性配置

```html
<pi-chat
  <!-- AI 提供商 -->
  provider="anthropic"
  
  <!-- 模型 ID -->
  model="claude-sonnet-4-20250514"
  
  <!-- API Key -->
  api-key="your-api-key"
  
  <!-- 系统提示词 -->
  system-prompt="你是一个有帮助的助手。"
  
  <!-- 主题 -->
  theme="light"
  
  <!-- 语言 -->
  language="zh-CN"
  
  <!-- 是否显示头像 -->
  show-avatars="true"
  
  <!-- 是否显示时间戳 -->
  show-timestamps="true"
  
  <!-- 最大消息数 -->
  max-messages="100"
  
  <!-- 是否启用工具 -->
  enable-tools="true"
  
  <!-- 工具列表 -->
  tools='["read", "write", "bash"]'
>
</pi-chat>
```

### 事件监听

```html
<script>
  const chat = document.querySelector('pi-chat');
  
  // 消息发送
  chat.addEventListener('message-sent', (e) => {
    console.log('用户消息:', e.detail.text);
  });
  
  // 消息接收
  chat.addEventListener('message-received', (e) => {
    console.log('AI 消息:', e.detail.text);
  });
  
  // 流式更新
  chat.addEventListener('stream-update', (e) => {
    console.log('流式内容:', e.detail.chunk);
  });
  
  // 工具调用
  chat.addEventListener('tool-call', (e) => {
    console.log('工具调用:', e.detail.tool, e.detail.args);
  });
  
  // 错误
  chat.addEventListener('error', (e) => {
    console.error('错误:', e.detail.error);
  });
</script>
```

### JavaScript API

```javascript
const chat = document.querySelector('pi-chat');

// 发送消息
await chat.sendMessage('你好，请介绍一下自己');

// 获取消息历史
const messages = chat.getMessages();

// 清空消息
chat.clearMessages();

// 设置系统提示词
chat.setSystemPrompt('你是一个编程专家。');

// 切换模型
chat.setModel('gpt-4o');

// 销毁组件
chat.destroy();
```

## 核心概念三：主题系统

pi-web-ui 提供灵活的主题系统，支持 CSS 变量自定义。

### 预定义主题

```html
<!-- 亮色主题 -->
<pi-chat theme="light"></pi-chat>

<!-- 暗色主题 -->
<pi-chat theme="dark"></pi-chat>

<!-- 自动（根据系统偏好） -->
<pi-chat theme="auto"></pi-chat>
```

### CSS 变量定制

```html
<style>
  pi-chat {
    /* 主色调 */
    --pi-primary-color: #3b82f6;
    --pi-primary-hover: #2563eb;
    
    /* 背景色 */
    --pi-bg-color: #ffffff;
    --pi-bg-secondary: #f3f4f6;
    --pi-bg-tertiary: #e5e7eb;
    
    /* 文字色 */
    --pi-text-color: #111827;
    --pi-text-secondary: #6b7280;
    --pi-text-tertiary: #9ca3af;
    
    /* 边框 */
    --pi-border-color: #e5e7eb;
    --pi-border-radius: 8px;
    
    /* 消息气泡 */
    --pi-user-bg: #3b82f6;
    --pi-user-text: #ffffff;
    --pi-ai-bg: #f3f4f6;
    --pi-ai-text: #111827;
    
    /* 字体 */
    --pi-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --pi-font-size: 14px;
    --pi-line-height: 1.5;
    
    /* 间距 */
    --pi-spacing-xs: 4px;
    --pi-spacing-sm: 8px;
    --pi-spacing-md: 16px;
    --pi-spacing-lg: 24px;
    
    /* 阴影 */
    --pi-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --pi-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
</style>
```

### 暗色主题示例

```html
<style>
  pi-chat[theme="dark"] {
    --pi-bg-color: #111827;
    --pi-bg-secondary: #1f2937;
    --pi-bg-tertiary: #374151;
    
    --pi-text-color: #f9fafb;
    --pi-text-secondary: #d1d5db;
    --pi-text-tertiary: #9ca3af;
    
    --pi-border-color: #374151;
    
    --pi-ai-bg: #1f2937;
    --pi-ai-text: #f9fafb;
  }
</style>
```

## 核心概念四：消息渲染

pi-web-ui 支持多种消息内容类型。

### 文本消息

```javascript
// 纯文本
chat.sendMessage('你好');
```

### Markdown 消息

```javascript
// Markdown 格式
chat.sendMessage(`
# 标题

这是 **粗体** 和 *斜体* 文本。

- 列表项 1
- 列表项 2

\`\`\`javascript
const x = 1;
console.log(x);
\`\`\`
`);
```

### 代码块

代码块会自动高亮：

````markdown
```typescript
interface User {
  id: string;
  name: string;
}

const user: User = {
  id: "1",
  name: "Alice"
};
```
````

### 工具调用显示

```javascript
// 工具调用会自动渲染为可交互组件
chat.addEventListener('tool-call', (e) => {
  const { tool, args, result } = e.detail;
  
  // UI 会显示：
  // ┌─────────────────────────────┐
  // │ 🔧 read                     │
  // │ src/index.ts                │
  // │ ✓ 成功                      │
  // └─────────────────────────────┘
});
```

## 核心概念五：与后端集成

pi-web-ui 可以连接不同的 AI 后端。

### 直接连接（浏览器端）

```html
<pi-chat
  provider="anthropic"
  model="claude-sonnet-4-20250514"
  api-key="sk-ant-api03-...">
</pi-chat>
```

### 通过后端代理（推荐）

```html
<pi-chat
  api-url="/api/chat"
  api-key="your-backend-api-key">
</pi-chat>
```

后端示例（Node.js）：

```javascript
// server.js
import express from 'express';
import { streamSimple } from '@mariozechner/pi-ai';
import { getModel } from '@mariozechner/pi-ai';

const app = express();
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;
  
  const modelObj = getModel('anthropic', model);
  
  const stream = streamSimple(modelObj, {
    messages,
  });
  
  res.setHeader('Content-Type', 'text/event-stream');
  
  for await (const event of stream) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  
  res.end();
});

app.listen(3000);
```

## 快速开始

### 通过 CDN 使用

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Chat</title>
  <script type="module" src="https://unpkg.com/@mariozechner/pi-web-ui"></script>
  <style>
    body {
      margin: 0;
      height: 100vh;
    }
    pi-chat {
      height: 100%;
    }
  </style>
</head>
<body>
  <pi-chat
    provider="anthropic"
    model="claude-sonnet-4-20250514"
    api-key="your-api-key">
  </pi-chat>
</body>
</html>
```

### 通过 npm 使用

```bash
npm install @mariozechner/pi-web-ui
```

```javascript
// main.js
import '@mariozechner/pi-web-ui';

// 组件会自动注册，直接在 HTML 中使用
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="./main.js"></script>
</head>
<body>
  <pi-chat
    provider="anthropic"
    model="claude-sonnet-4-20250514"
    api-key="your-api-key">
  </pi-chat>
</body>
</html>
```

## 与 pi-agent 的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web 应用架构                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      浏览器层                            │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │              pi-web-ui (<pi-chat>)               │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │   │
│  │  │  │  UI     │  │ Events  │  │ Theme   │         │   │   │
│  │  │  │ 组件    │  │ 事件    │  │ 主题    │         │   │   │
│  │  │  └────┬────┘  └────┬────┘  └────┬────┘         │   │   │
│  │  │       └────────────┴────────────┘               │   │   │
│  │  │                    │                            │   │   │
│  │  └────────────────────┼────────────────────────────┘   │   │
│  │                       │                                │   │
│  │  ┌────────────────────┼────────────────────────────┐   │   │
│  │  │         Web Components (Shadow DOM)            │   │   │
│  │  └────────────────────┼────────────────────────────┘   │   │
│  └───────────────────────┼────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      后端服务层（可选）                   │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ Express │  │  API    │  │ pi-ai   │  │ pi-agent│  │   │
│  │  │ Server  │  │ Routes  │  │ 流式API │  │ 工具执行│  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 总结

pi-web-ui 的核心概念：

1. **Web Components**：框架无关的原生组件
2. **<pi-chat>**：核心聊天组件，提供完整界面
3. **主题系统**：CSS 变量自定义样式
4. **消息渲染**：支持文本、Markdown、代码块、工具调用
5. **后端集成**：可直接连接或通过后端的代理

---

**下篇预告**: [02-component-architecture.md](02-component-architecture.md) —— 深入理解组件架构，包括 Shadow DOM、生命周期、属性系统、事件系统等。
