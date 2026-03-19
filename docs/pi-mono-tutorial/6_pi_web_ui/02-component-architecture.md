# 组件架构

> **难度：进阶** | **预计阅读时间：25 分钟**

上一章我们了解了核心概念。本章将深入组件架构，理解 Web Components 的实现原理。

## Web Components 基础

### 三大核心技术

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web Components 核心技术                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Custom Elements（自定义元素）                        │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  定义新的 HTML 标签，扩展 HTML 元素                      │   │
│  │                                                         │   │
│  │  class PiChat extends HTMLElement {                     │   │
│  │    constructor() {                                      │   │
│  │      super();                                           │   │
│  │      // ...                                             │   │
│  │    }                                                    │   │
│  │  }                                                      │   │
│  │                                                         │   │
│  │  customElements.define('pi-chat', PiChat);              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  2. Shadow DOM（影子 DOM）                               │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  封装组件内部结构，与外部隔离                            │   │
│  │                                                         │   │
│  │  const shadow = this.attachShadow({mode: 'open'});      │   │
│  │  shadow.innerHTML = `                                   │   │
│  │    <style>                                              │   │
│  │      /* 样式只影响组件内部 */                            │   │
│  │    </style>                                             │   │
│  │    <div class="chat">...</div>                          │   │
│  │  `;                                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  3. HTML Templates（HTML 模板）                          │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  定义可复用的 HTML 结构                                  │   │
│  │                                                         │   │
│  │  <template id="chat-template">                          │   │
│  │    <div class="chat-container">                         │   │
│  │      <div class="messages"></div>                       │   │
│  │      <div class="input"></div>                          │   │
│  │    </div>                                               │   │
│  │  </template>                                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## <pi-chat> 组件实现

### 完整实现示例

```typescript
// packages/web-ui/src/components/pi-chat.ts

export class PiChat extends HTMLElement {
  // 观察的属性
  static observedAttributes = [
    'provider',
    'model',
    'api-key',
    'system-prompt',
    'theme',
  ];
  
  // 内部状态
  private messages: Message[] = [];
  private streamController?: AbortController;
  private theme: 'light' | 'dark' = 'light';
  
  constructor() {
    super();
    
    // 创建 Shadow DOM
    this.attachShadow({ mode: 'open' });
    
    // 初始化
    this.render();
    this.attachEventListeners();
  }
  
  // 生命周期：元素被添加到 DOM
  connectedCallback() {
    this.loadTheme();
    this.loadMessages();
  }
  
  // 生命周期：元素从 DOM 移除
  disconnectedCallback() {
    this.streamController?.abort();
    this.saveMessages();
  }
  
  // 生命周期：属性变化
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    
    switch (name) {
      case 'theme':
        this.setTheme(newValue as 'light' | 'dark');
        break;
      case 'system-prompt':
        this.updateSystemPrompt(newValue);
        break;
    }
  }
  
  // 渲染组件
  private render() {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          font-family: var(--pi-font-family, sans-serif);
          background: var(--pi-bg-color, #fff);
          color: var(--pi-text-color, #000);
        }
        
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        
        .messages {
          flex: 1;
          overflow-y: auto;
          padding: var(--pi-spacing-md, 16px);
        }
        
        .input-container {
          border-top: 1px solid var(--pi-border-color, #e5e7eb);
          padding: var(--pi-spacing-md, 16px);
        }
        
        textarea {
          width: 100%;
          min-height: 60px;
          padding: var(--pi-spacing-sm, 8px);
          border: 1px solid var(--pi-border-color, #e5e7eb);
          border-radius: var(--pi-border-radius, 8px);
          resize: vertical;
          font-family: inherit;
        }
        
        button {
          margin-top: var(--pi-spacing-sm, 8px);
          padding: var(--pi-spacing-sm, 8px) var(--pi-spacing-md, 16px);
          background: var(--pi-primary-color, #3b82f6);
          color: white;
          border: none;
          border-radius: var(--pi-border-radius, 8px);
          cursor: pointer;
        }
        
        button:hover {
          background: var(--pi-primary-hover, #2563eb);
        }
      </style>
      
      <div class="chat-container">
        <div class="messages" part="messages"></div>
        <div class="input-container" part="input">
          <textarea part="textarea" placeholder="输入消息..."></textarea>
          <button part="send-button">发送</button>
        </div>
      </div>
    `;
  }
  
  // 附加事件监听
  private attachEventListeners() {
    const textarea = this.shadowRoot!.querySelector('textarea')!;
    const button = this.shadowRoot!.querySelector('button')!;
    
    // 发送按钮
    button.addEventListener('click', () => this.sendMessage());
    
    // Enter 发送（Shift+Enter 换行）
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }
  
  // 发送消息
  async sendMessage(text?: string) {
    const textarea = this.shadowRoot!.querySelector('textarea')!;
    const messageText = text || textarea.value.trim();
    
    if (!messageText) return;
    
    // 添加用户消息
    this.addMessage({
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    });
    
    textarea.value = '';
    
    // 触发事件
    this.dispatchEvent(new CustomEvent('message-sent', {
      detail: { text: messageText },
      bubbles: true,
      composed: true,
    }));
    
    // 获取 AI 响应
    await this.streamResponse(messageText);
  }
  
  // 流式响应
  private async streamResponse(userMessage: string) {
    this.streamController = new AbortController();
    
    const aiMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    
    this.addMessage(aiMessage);
    
    try {
      const stream = await this.callAPI(userMessage, this.streamController.signal);
      
      for await (const chunk of stream) {
        aiMessage.content += chunk;
        this.updateMessage(aiMessage);
        
        // 触发流式更新事件
        this.dispatchEvent(new CustomEvent('stream-update', {
          detail: { chunk, message: aiMessage },
          bubbles: true,
          composed: true,
        }));
      }
      
      // 完成
      this.dispatchEvent(new CustomEvent('message-received', {
        detail: { message: aiMessage },
        bubbles: true,
        composed: true,
      }));
      
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', {
        detail: { error },
        bubbles: true,
        composed: true,
      }));
    }
  }
  
  // 调用 API
  private async callAPI(message: string, signal: AbortSignal) {
    const provider = this.getAttribute('provider') || 'anthropic';
    const model = this.getAttribute('model') || 'claude-sonnet-4-20250514';
    const apiKey = this.getAttribute('api-key');
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model,
        message,
        apiKey,
      }),
      signal,
    });
    
    // 返回流式迭代器
    return this.parseStream(response.body!);
  }
  
  // 解析流
  private async *parseStream(stream: ReadableStream): AsyncGenerator<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        // 解析 SSE 格式
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            
            const event = JSON.parse(data);
            if (event.choices?.[0]?.delta?.content) {
              yield event.choices[0].delta.content;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  // 添加消息到 UI
  private addMessage(message: Message) {
    this.messages.push(message);
    this.renderMessages();
  }
  
  // 更新消息
  private updateMessage(message: Message) {
    const index = this.messages.findIndex(m => m === message);
    if (index !== -1) {
      this.renderMessages();
    }
  }
  
  // 渲染消息列表
  private renderMessages() {
    const container = this.shadowRoot!.querySelector('.messages')!;
    
    container.innerHTML = this.messages.map(msg => `
      <div class="message ${msg.role}" part="message ${msg.role}">
        <div class="avatar" part="avatar"></div>
        <div class="content" part="content">
          ${this.renderContent(msg.content)}
        </div>
      </div>
    `).join('');
    
    // 滚动到底部
    container.scrollTop = container.scrollHeight;
  }
  
  // 渲染内容
  private renderContent(content: string): string {
    // 简单的 Markdown 渲染
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }
  
  // 设置主题
  private setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
    this.setAttribute('theme', theme);
    
    // 应用 CSS 变量
    const colors = theme === 'dark' ? darkTheme : lightTheme;
    Object.entries(colors).forEach(([key, value]) => {
      this.style.setProperty(`--pi-${key}`, value);
    });
  }
  
  // 公共 API
  getMessages(): Message[] {
    return [...this.messages];
  }
  
  clearMessages() {
    this.messages = [];
    this.renderMessages();
  }
  
  destroy() {
    this.streamController?.abort();
    this.remove();
  }
}

// 注册组件
customElements.define('pi-chat', PiChat);
```

## 生命周期详解

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web Component 生命周期                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 创建                                                         │
│     constructor()                                               │
│     ├── 调用 super()                                            │
│     ├── 创建 Shadow DOM                                         │
│     └── 初始化状态                                              │
│                                                                 │
│  2. 连接                                                         │
│     connectedCallback()                                         │
│     ├── 元素被添加到 DOM                                        │
│     ├── 可以访问 DOM                                            │
│     └── 启动异步操作（如加载数据）                               │
│                                                                 │
│  3. 属性变化                                                     │
│     attributeChangedCallback(name, oldValue, newValue)          │
│     ├── 观察的属性发生变化                                      │
│     └── 响应属性变化更新组件                                     │
│                                                                 │
│  4. 断开                                                         │
│     disconnectedCallback()                                      │
│     ├── 元素从 DOM 移除                                         │
│     └── 清理资源（如取消请求、移除监听）                         │
│                                                                 │
│  5. 移动                                                         │
│     adoptedCallback()                                           │
│     ├── 元素被移动到新的 document                               │
│     └── 很少使用                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 属性系统

### 声明观察属性

```typescript
class PiChat extends HTMLElement {
  // 声明需要观察的属性
  static observedAttributes = [
    'provider',
    'model',
    'api-key',
    'system-prompt',
    'theme',
  ];
  
  // 属性变化回调
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    console.log(`${name} changed from "${oldValue}" to "${newValue}"`);
    
    // 属性映射
    const propertyMap: Record<string, string> = {
      'api-key': 'apiKey',
      'system-prompt': 'systemPrompt',
    };
    
    const propertyName = propertyMap[name] || name;
    (this as any)[propertyName] = newValue;
  }
}
```

### 属性与 Property 同步

```typescript
class PiChat extends HTMLElement {
  // 内部 property
  private _apiKey: string = '';
  
  // getter/setter 同步 attribute
  get apiKey(): string {
    return this._apiKey;
  }
  
  set apiKey(value: string) {
    this._apiKey = value;
    this.setAttribute('api-key', value);
  }
  
  // 从 attribute 获取初始值
  connectedCallback() {
    this._apiKey = this.getAttribute('api-key') || '';
  }
}
```

## 事件系统

### 自定义事件

```typescript
// 触发自定义事件
this.dispatchEvent(new CustomEvent('message-sent', {
  detail: { text: messageText },
  bubbles: true,      // 冒泡到父元素
  composed: true,     // 穿透 Shadow DOM
  cancelable: true,   // 可以被取消
}));

// 监听事件
const chat = document.querySelector('pi-chat');
chat.addEventListener('message-sent', (e) => {
  console.log('消息已发送:', e.detail.text);
});
```

### 事件委托

```typescript
// 在 Shadow DOM 中使用事件委托
this.shadowRoot!.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  
  if (target.matches('.send-button')) {
    this.sendMessage();
  } else if (target.matches('.delete-button')) {
    const messageId = target.dataset.messageId;
    this.deleteMessage(messageId);
  }
});
```

## Shadow DOM 样式

### :host 选择器

```css
<style>
  /* 组件根元素 */
  :host {
    display: flex;
    flex-direction: column;
  }
  
  /* 特定属性 */
  :host([theme="dark"]) {
    background: #111827;
    color: #f9fafb;
  }
  
  /* 特定类 */
  :host(.loading) {
    opacity: 0.5;
  }
</style>
```

### ::slotted 选择器

```html
<!-- 使用 slot -->
<pi-chat>
  <div slot="header">自定义头部</div>
  <div slot="footer">自定义底部</div>
</pi-chat>
```

```css
<style>
  ::slotted([slot="header"]) {
    font-weight: bold;
  }
  
  ::slotted([slot="footer"]) {
    font-size: 12px;
    color: #666;
  }
</style>
```

### CSS 变量

```css
<style>
  :host {
    /* 定义 CSS 变量 */
    --pi-primary-color: #3b82f6;
    --pi-bg-color: #ffffff;
    --pi-text-color: #111827;
    --pi-spacing-md: 16px;
    
    /* 使用 CSS 变量 */
    background: var(--pi-bg-color);
    color: var(--pi-text-color);
  }
  
  button {
    background: var(--pi-primary-color);
    padding: var(--pi-spacing-md);
  }
</style>
```

## 最佳实践

### ✅ 应该做的

1. **使用 Shadow DOM 封装**
   ```typescript
   constructor() {
     super();
     this.attachShadow({ mode: 'open' });
   }
   ```

2. **清理资源**
   ```typescript
   disconnectedCallback() {
     this.streamController?.abort();
     this.observer?.disconnect();
   }
   ```

3. **使用 CSS 变量主题**
   ```css
   :host {
     background: var(--pi-bg-color, #fff);
   }
   ```

### ❌ 避免的错误

1. **在 constructor 中访问 DOM**
   ```typescript
   // ❌ 错误
   constructor() {
     this.querySelector('.button');  // 还不能访问
   }
   
   // ✅ 正确
   connectedCallback() {
     this.querySelector('.button');
   }
   ```

2. **忘记调用 super()**
   ```typescript
   // ❌ 错误
   constructor() {
     // 忘记调用 super()
   }
   
   // ✅ 正确
   constructor() {
     super();
   }
   ```

## 总结

组件架构的核心要点：

1. **Web Components 基础**：Custom Elements、Shadow DOM、Templates
2. **生命周期**：constructor、connectedCallback、attributeChangedCallback、disconnectedCallback
3. **属性系统**：observedAttributes、attributeChangedCallback
4. **事件系统**：自定义事件、bubbles、composed
5. **Shadow DOM 样式**：:host、::slotted、CSS 变量

---

**下篇预告**: [03-styling-theming.md](03-styling-theming.md) —— 深入样式与主题系统，包括 CSS 变量、主题切换、响应式设计等。
