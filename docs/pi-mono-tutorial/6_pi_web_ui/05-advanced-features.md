# 高级功能与最佳实践

> **难度：专家** | **预计阅读时间：25 分钟**

在前面的章节中，我们已经掌握了 pi-web-ui 的核心概念。本章将探讨一些高级功能和最佳实践。

## 1. 自定义组件

### 扩展现有组件

```typescript
// 扩展 pi-chat 组件
class MyChat extends PiChat {
  static get observedAttributes() {
    return [...super.observedAttributes, 'custom-feature'];
  }
  
  constructor() {
    super();
    this.customFeature = false;
  }
  
  connectedCallback() {
    super.connectedCallback();
    this.addCustomFeatures();
  }
  
  private addCustomFeatures() {
    // 添加自定义功能
    const toolbar = document.createElement('div');
    toolbar.className = 'custom-toolbar';
    toolbar.innerHTML = `
      <button class="export-btn">导出对话</button>
      <button class="share-btn">分享</button>
    `;
    
    this.shadowRoot!.querySelector('.chat-container')!.prepend(toolbar);
    
    // 绑定事件
    toolbar.querySelector('.export-btn')!.addEventListener('click', () => {
      this.exportConversation();
    });
  }
  
  private exportConversation() {
    const messages = this.getMessages();
    const json = JSON.stringify(messages, null, 2);
    
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
}

customElements.define('my-chat', MyChat);
```

### 创建新组件

```typescript
// 创建消息操作组件
class PiMessageActions extends HTMLElement {
  private messageId: string = '';
  
  static get observedAttributes() {
    return ['message-id'];
  }
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.render();
  }
  
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'message-id') {
      this.messageId = newValue;
    }
  }
  
  private render() {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: flex;
          gap: 8px;
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        :host(:hover) {
          opacity: 1;
        }
        
        button {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }
        
        button:hover {
          background: var(--pi-bg-secondary);
        }
      </style>
      
      <button class="copy" title="复制">📋</button>
      <button class="edit" title="编辑">✏️</button>
      <button class="delete" title="删除">🗑️</button>
    `;
    
    this.attachEventListeners();
  }
  
  private attachEventListeners() {
    this.shadowRoot!.querySelector('.copy')!.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('copy', {
        detail: { messageId: this.messageId },
        bubbles: true,
        composed: true,
      }));
    });
    
    this.shadowRoot!.querySelector('.edit')!.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('edit', {
        detail: { messageId: this.messageId },
        bubbles: true,
        composed: true,
      }));
    });
    
    this.shadowRoot!.querySelector('.delete')!.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('delete', {
        detail: { messageId: this.messageId },
        bubbles: true,
        composed: true,
      }));
    });
  }
}

customElements.define('pi-message-actions', PiMessageActions);
```

## 2. 性能优化

### 虚拟滚动

```typescript
// 大量消息时的虚拟滚动
class VirtualMessageList extends HTMLElement {
  private messages: Message[] = [];
  private visibleCount: number = 20;
  private scrollOffset: number = 0;
  private itemHeight: number = 80;
  
  render() {
    const totalHeight = this.messages.length * this.itemHeight;
    const visibleMessages = this.messages.slice(
      this.scrollOffset,
      this.scrollOffset + this.visibleCount
    );
    
    this.shadowRoot!.innerHTML = `
      <style>
        .container {
          height: 100%;
          overflow-y: auto;
        }
        
        .spacer {
          height: ${totalHeight}px;
        }
        
        .messages {
          position: relative;
          transform: translateY(${this.scrollOffset * this.itemHeight}px);
        }
        
        .message {
          height: ${this.itemHeight}px;
        }
      </style>
      
      <div class="container" @scroll="${this.handleScroll}">
        <div class="spacer">
          <div class="messages">
            ${visibleMessages.map(msg => `
              <div class="message">${this.renderMessage(msg)}</div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }
  
  private handleScroll = (e: Event) => {
    const container = e.target as HTMLElement;
    this.scrollOffset = Math.floor(container.scrollTop / this.itemHeight);
    this.render();
  };
}
```

### 防抖渲染

```typescript
class PiChat extends HTMLElement {
  private renderPending = false;
  
  requestRender() {
    if (this.renderPending) return;
    
    this.renderPending = true;
    requestAnimationFrame(() => {
      this.renderPending = false;
      this.render();
    });
  }
}
```

### 懒加载代码高亮

```typescript
// 只在需要时加载 Prism
private async highlightCode(code: string, language?: string) {
  if (!language) return code;
  
  // 动态加载 Prism
  if (!window.Prism) {
    await import('prismjs');
    await import(`prismjs/components/prism-${language}`);
  }
  
  return Prism.highlight(code, Prism.languages[language], language);
}
```

## 3. 无障碍访问

### ARIA 属性

```typescript
class PiChat extends HTMLElement {
  private render() {
    this.shadowRoot!.innerHTML = `
      <div 
        class="chat-container"
        role="region"
        aria-label="AI 聊天"
      >
        <div 
          class="messages"
          role="log"
          aria-live="polite"
          aria-atomic="false"
        ></div>
        
        <div class="input-container">
          <textarea
            role="textbox"
            aria-multiline="true"
            aria-label="输入消息"
            placeholder="输入消息..."
          ></textarea>
          
          <button
            type="button"
            aria-label="发送消息"
          >
            发送
          </button>
        </div>
      </div>
    `;
  }
  
  private announceMessage(message: string) {
    // 使用 aria-live 区域宣布新消息
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = `新消息: ${message.slice(0, 100)}`;
    
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
  }
}
```

### 键盘导航

```typescript
class PiChat extends HTMLElement {
  private attachEventListeners() {
    this.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'Tab':
          // Tab 导航
          this.handleTabNavigation(e);
          break;
          
        case 'Escape':
          // ESC 取消输入
          this.handleEscape(e);
          break;
          
        case 'ArrowUp':
        case 'ArrowDown':
          // 上下箭头浏览历史
          if (e.ctrlKey) {
            this.navigateHistory(e.key === 'ArrowUp' ? -1 : 1);
            e.preventDefault();
          }
          break;
      }
    });
  }
  
  private handleTabNavigation(e: KeyboardEvent) {
    const focusable = this.shadowRoot!.querySelectorAll(
      'button, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const currentIndex = Array.from(focusable).indexOf(
      this.shadowRoot!.activeElement as Element
    );
    
    if (e.shiftKey) {
      // Shift+Tab 上一个
      const prev = focusable[currentIndex - 1] || focusable[focusable.length - 1];
      (prev as HTMLElement).focus();
    } else {
      // Tab 下一个
      const next = focusable[currentIndex + 1] || focusable[0];
      (next as HTMLElement).focus();
    }
    
    e.preventDefault();
  }
}
```

## 4. 测试策略

### 单元测试

```typescript
// tests/pi-chat.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('PiChat', () => {
  let chat: PiChat;
  
  beforeEach(() => {
    chat = document.createElement('pi-chat');
    document.body.appendChild(chat);
  });
  
  afterEach(() => {
    chat.remove();
  });
  
  it('should render correctly', () => {
    expect(chat.shadowRoot).toBeTruthy();
    expect(chat.shadowRoot!.querySelector('.chat-container')).toBeTruthy();
  });
  
  it('should send message', async () => {
    const textarea = chat.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Hello';
    
    const button = chat.shadowRoot!.querySelector('button') as HTMLButtonElement;
    button.click();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const messages = chat.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello');
  });
  
  it('should emit custom events', () => {
    const listener = vi.fn();
    chat.addEventListener('message-sent', listener);
    
    chat.sendMessage('Test');
    
    expect(listener).toHaveBeenCalled();
  });
});
```

### E2E 测试

```typescript
// tests/e2e/chat.spec.ts
import { test, expect } from '@playwright/test';

test('user can send message', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // 输入消息
  await page.fill('pi-chat textarea', 'Hello AI');
  
  // 点击发送
  await page.click('pi-chat button');
  
  // 验证消息显示
  await expect(page.locator('pi-chat .message.user')).toContainText('Hello AI');
  
  // 等待 AI 响应
  await expect(page.locator('pi-chat .message.assistant')).toBeVisible();
});
```

## 5. 部署与发布

### 构建配置

```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'PiWebUI',
      fileName: 'pi-web-ui',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // 外部依赖
      external: ['@mariozechner/pi-ai'],
      output: {
        globals: {
          '@mariozechner/pi-ai': 'PiAI',
        },
      },
    },
  },
});
```

### CDN 发布

```bash
# 构建
npm run build

# 发布到 CDN
npm publish

# 使用
<script src="https://unpkg.com/@mariozechner/pi-web-ui@latest"></script>
```

### 版本管理

```json
{
  "name": "@mariozechner/pi-web-ui",
  "version": "1.0.0",
  "files": [
    "dist"
  ],
  "main": "dist/pi-web-ui.umd.js",
  "module": "dist/pi-web-ui.es.js",
  "types": "dist/index.d.ts"
}
```

## 6. 完整示例：生产级应用

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Chat</title>
  
  <!-- 加载 pi-web-ui -->
  <script type="module" src="https://unpkg.com/@mariozechner/pi-web-ui@latest"></script>
  
  <!-- 自定义主题 -->
  <style>
    :root {
      --pi-primary-color: #8b5cf6;
      --pi-font-family: 'Inter', sans-serif;
    }
    
    body {
      margin: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    header {
      padding: 16px;
      background: var(--pi-bg-secondary);
      border-bottom: 1px solid var(--pi-border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    main {
      flex: 1;
      overflow: hidden;
    }
    
    pi-chat {
      height: 100%;
    }
  </style>
</head>
<body>
  <header>
    <h1>AI 助手</h1>
    <div>
      <button onclick="toggleTheme()">切换主题</button>
      <button onclick="clearChat()">清空</button>
    </div>
  </header>
  
  <main>
    <pi-chat
      id="chat"
      api-url="/api"
      provider="anthropic"
      model="claude-sonnet-4-20250514"
      system-prompt="你是一个有帮助的 AI 助手。"
      theme="auto"
      enable-tools="true"
    ></pi-chat>
  </main>
  
  <script>
    const chat = document.getElementById('chat');
    
    // 监听事件
    chat.addEventListener('message-sent', (e) => {
      console.log('发送:', e.detail.text);
    });
    
    chat.addEventListener('message-received', (e) => {
      console.log('接收:', e.detail.message.content);
    });
    
    chat.addEventListener('error', (e) => {
      console.error('错误:', e.detail.error);
      alert('发生错误: ' + e.detail.error.message);
    });
    
    // 切换主题
    function toggleTheme() {
      const currentTheme = chat.getAttribute('theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      chat.setAttribute('theme', newTheme);
    }
    
    // 清空对话
    function clearChat() {
      if (confirm('确定要清空对话吗？')) {
        chat.clearMessages();
      }
    }
    
    // 自动保存对话
    setInterval(() => {
      const messages = chat.getMessages();
      localStorage.setItem('chat-messages', JSON.stringify(messages));
    }, 30000);
    
    // 恢复对话
    window.addEventListener('load', () => {
      const saved = localStorage.getItem('chat-messages');
      if (saved) {
        const messages = JSON.parse(saved);
        // 恢复消息...
      }
    });
  </script>
</body>
</html>
```

## 总结

高级功能与最佳实践的核心要点：

1. **自定义组件**：扩展和创建新组件
2. **性能优化**：虚拟滚动、防抖渲染、懒加载
3. **无障碍访问**：ARIA 属性、键盘导航
4. **测试策略**：单元测试、E2E 测试
5. **部署发布**：构建配置、CDN 发布、版本管理

---

**系列完成**：至此，你已经掌握了 pi-web-ui 的全部核心概念和高级用法。建议：
1. 从简单示例开始实践
2. 逐步添加自定义功能
3. 关注性能和无障碍访问
4. 建立完善的测试覆盖
