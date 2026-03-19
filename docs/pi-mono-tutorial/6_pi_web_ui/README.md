# pi-web-ui 系列教程

> 深入理解 @mariozechner/pi-web-ui —— 基于 Web Components 的 AI 聊天界面库

## 系列概览

本系列带你深入理解 pi-web-ui 的设计原理和最佳实践。pi-web-ui 是一个**基于 Web Components 的 AI 聊天界面库**，提供框架无关、即插即用的 AI 聊天界面。

### 核心特性

- ✅ **框架无关** —— 使用原生 Web Components，支持任何前端框架
- ✅ **即插即用** —— 无需构建工具，直接通过 CDN 使用
- ✅ **可定制主题** —— 支持 CSS 变量自定义样式
- ✅ **响应式设计** —— 适配桌面和移动设备
- ✅ **流式输出** —— 实时显示 AI 的流式响应
- ✅ **代码高亮** —— 自动高亮代码块
- ✅ **Markdown 支持** —— 渲染 Markdown 格式的消息

## 阅读路径

### 核心教程（必读）

| 章节 | 难度 | 预计时间 | 核心内容 |
|------|------|---------|---------|
| **[00-README-zh.md](00-README-zh.md)** | 入门 | 15 分钟 | 官方 README 中文翻译，快速了解 pi-web-ui |
| **[01-core-concepts.md](01-core-concepts.md)** | 入门 | 20 分钟 | Web Components、<pi-chat>、主题系统、消息渲染 |
| **[02-component-architecture.md](02-component-architecture.md)** | 进阶 | 25 分钟 | 生命周期、属性系统、事件系统、Shadow DOM 样式 |
| **[03-styling-theming.md](03-styling-theming.md)** | 进阶 | 20 分钟 | CSS 变量、主题切换、响应式设计、动画过渡 |
| **[04-integration-backend.md](04-integration-backend.md)** | 进阶 | 25 分钟 | API 设计、流式响应、错误处理、认证授权 |
| **[05-advanced-features.md](05-advanced-features.md)** | 专家 | 25 分钟 | 自定义组件、性能优化、无障碍访问、测试策略 |

### 阅读建议

**如果你是初学者**：
1. 按顺序阅读 01 → 02 → 03
2. 每章配合代码示例实践
3. 完成后再阅读 04、05

**如果你是进阶开发者**：
1. 快速浏览 01 了解基本概念
2. 重点阅读 02、03 理解核心机制
3. 04、05 按需查阅

**如果你是专家开发者**：
1. 直接阅读 02、05
2. 参考源码深入理解
3. 贡献最佳实践案例

## 核心概念速查

| 概念 | 说明 | 所在章节 |
|------|------|---------|
| Web Components | 原生组件标准 | 01 |
| Custom Elements | 自定义 HTML 元素 | 02 |
| Shadow DOM | 封装组件内部结构 | 02 |
| CSS 变量 | 主题定制系统 | 03 |
| 生命周期 | connectedCallback 等 | 02 |
| 属性系统 | observedAttributes | 02 |
| 事件系统 | 自定义事件 | 02 |
| SSE | 服务器发送事件 | 04 |

## 快速开始

### 通过 CDN 使用

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

### 通过 npm 使用

```bash
npm install @mariozechner/pi-web-ui
```

```javascript
import '@mariozechner/pi-web-ui';
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
│  │  │  └─────────┘  └─────────┘  └─────────┘         │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      后端服务层（可选）                   │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ Express │  │  API    │  │ pi-ai   │  │ pi-agent│  │   │
│  │  │ Server  │  │  路由   │  │ 流式API │  │ 工具执行│  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 源码位置

- **源码**: `packages/web-ui/src/` 目录
- **测试**: `packages/web-ui/test/` 目录
- **组件**: `packages/web-ui/src/components/` 目录

## 相关资源

- **pi-agent 系列**: [../3_pi_agent/README.md](../3_pi_agent/README.md)
- **pi-tui 系列**: [../4_pi_tui/README.md](../4_pi_tui/README.md)
- **pi-coding-agent 系列**: [../5_pi_coding_agent/README.md](../5_pi_coding_agent/README.md)
- **API 参考**: 查看源码中的 JSDoc 注释

## 术语统一表

| 英文术语 | 中文翻译 | 说明 |
|---------|---------|------|
| Web Components | Web 组件 | 原生组件标准 |
| Custom Elements | 自定义元素 | 定义新的 HTML 标签 |
| Shadow DOM | 影子 DOM | 封装组件内部结构 |
| CSS Variables | CSS 变量 | 自定义属性 |
| Lifecycle | 生命周期 | 组件的各个阶段 |
| Attribute | 属性 | HTML 属性 |
| Property | 特性 | JavaScript 属性 |
| Event | 事件 | 自定义事件 |
| SSE | 服务器发送事件 | Server-Sent Events |

## 学习建议

1. **先理解概念，再看代码**
   - 每章先通读理解概念
   - 再对照源码深入理解

2. **动手实践**
   - 每章都有代码示例
   - 建议自己运行一遍

3. **从简单到复杂**
   - 先使用 CDN 方式
   - 再使用 npm 方式
   - 最后自定义组件

## 常见问题

**Q: pi-web-ui 支持哪些浏览器？**

A: 支持所有现代浏览器：
- Chrome/Edge 88+
- Firefox 78+
- Safari 14+
- Chrome Android 88+
- Safari iOS 14+

**Q: 如何在 React/Vue/Angular 中使用？**

A: Web Components 是原生标准，可以在任何框架中使用：
```jsx
// React
function App() {
  return <pi-chat provider="anthropic" model="claude-sonnet-4-20250514" />;
}
```

**Q: 如何自定义样式？**

A: 使用 CSS 变量：
```css
pi-chat {
  --pi-primary-color: #8b5cf6;
  --pi-bg-color: #111827;
}
```

**Q: 如何连接自己的后端？**

A: 设置 api-url 属性：
```html
<pi-chat api-url="/api" api-key="your-key"></pi-chat>
```

**Q: 如何添加自定义功能？**

A: 扩展 PiChat 类：
```typescript
class MyChat extends PiChat {
  // 添加自定义功能
}
customElements.define('my-chat', MyChat);
```

## 最佳实践

### ✅ 应该做的

1. **使用代理模式**
   ```html
   <pi-chat api-url="/api"></pi-chat>
   ```

2. **自定义主题**
   ```css
   pi-chat {
     --pi-primary-color: #3b82f6;
   }
   ```

3. **处理错误事件**
   ```javascript
   chat.addEventListener('error', (e) => {
     console.error(e.detail.error);
   });
   ```

### ❌ 避免的错误

1. **前端暴露 API Key**
   ```html
   <!-- ❌ 错误 -->
   <pi-chat api-key="sk-xxx"></pi-chat>
   
   <!-- ✅ 正确 -->
   <pi-chat api-url="/api"></pi-chat>
   ```

2. **忽略无障碍访问**
   ```html
   <!-- ✅ 正确 -->
   <pi-chat aria-label="AI 聊天"></pi-chat>
   ```

---

**开始阅读**: [01-core-concepts.md](01-core-concepts.md)

**最后更新**: 2026-03-18
