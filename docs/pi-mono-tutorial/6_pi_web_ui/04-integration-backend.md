# 与后端集成

> **难度：进阶** | **预计阅读时间：25 分钟**

上一章我们了解了样式与主题系统。本章将深入后端集成，学习如何连接 AI 服务。

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web UI 与后端集成架构                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐         ┌─────────────────────────────┐   │
│  │   浏览器        │         │         后端服务             │   │
│  │                 │         │                             │   │
│  │  ┌───────────┐  │  HTTP   │  ┌─────────┐  ┌─────────┐  │   │
│  │  │ pi-chat   │  │◄───────►│  │  API    │  │ pi-ai   │  │   │
│  │  │ 组件      │  │  SSE    │  │  路由   │  │ 流式API │  │   │
│  │  └───────────┘  │         │  └────┬────┘  └────┬────┘  │   │
│  │                 │         │       └────────────┘       │   │
│  └─────────────────┘         │                             │   │
│                              └─────────────────────────────┘   │
│                                                                 │
│  直接连接模式（不推荐）                                         │
│  ┌─────────────────┐                                            │
│  │   浏览器        │                                            │
│  │                 │                                            │
│  │  ┌───────────┐  │  HTTP                                      │
│  │  │ pi-chat   │  │◄───────────────────►  Anthropic API       │
│  │  │ 组件      │  │                                            │
│  │  └───────────┘  │                                            │
│  │                 │                                            │
│  └─────────────────┘                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## API 设计

### REST API

```typescript
// 标准 REST API 设计

// POST /api/chat - 发送消息
interface ChatRequest {
  provider: string;      // "anthropic" | "openai"
  model: string;         // "claude-sonnet-4-20250514"
  messages: Message[];
  systemPrompt?: string;
  tools?: string[];
}

interface ChatResponse {
  id: string;
  message: Message;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// POST /api/chat/stream - 流式响应
// 返回 SSE (Server-Sent Events)
```

### SSE 流式响应

```typescript
// 服务端实现（Node.js + Express）
import express from 'express';
import { streamSimple, getModel } from '@mariozechner/pi-ai';

const app = express();

app.post('/api/chat/stream', async (req, res) => {
  const { provider, model, messages, systemPrompt } = req.body;
  
  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const modelObj = getModel(provider, model);
    
    const stream = streamSimple(modelObj, {
      systemPrompt,
      messages,
    });
    
    for await (const event of stream) {
      // 发送 SSE 事件
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    
    // 结束标记
    res.write('data: [DONE]\n\n');
    res.end();
    
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
```

## 前端实现

### 基础请求

```typescript
// packages/web-ui/src/api/client.ts

export class ApiClient {
  private baseUrl: string;
  private apiKey?: string;
  
  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }
  
  // 发送普通请求
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return response.json();
  }
  
  // 流式请求
  async *streamMessage(request: ChatRequest): AsyncGenerator<StreamEvent> {
    const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // 解析 SSE
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') return;
            
            try {
              yield JSON.parse(data);
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

### 在组件中使用

```typescript
// packages/web-ui/src/components/pi-chat.ts

import { ApiClient } from '../api/client';

class PiChat extends HTMLElement {
  private apiClient: ApiClient;
  
  connectedCallback() {
    const apiUrl = this.getAttribute('api-url') || '/api';
    const apiKey = this.getAttribute('api-key') || '';
    
    this.apiClient = new ApiClient(apiUrl, apiKey);
  }
  
  async sendMessage(text: string) {
    const request: ChatRequest = {
      provider: this.getAttribute('provider') || 'anthropic',
      model: this.getAttribute('model') || 'claude-sonnet-4-20250514',
      messages: [
        ...this.messages,
        { role: 'user', content: text },
      ],
      systemPrompt: this.getAttribute('system-prompt'),
    };
    
    // 流式响应
    const stream = this.apiClient.streamMessage(request);
    
    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'text_delta') {
        fullText += event.delta;
        this.updateStreamingMessage(fullText);
      } else if (event.type === 'tool_call') {
        this.showToolCall(event.tool_call);
      }
    }
    
    return fullText;
  }
}
```

## 错误处理

### 错误类型

```typescript
// 定义错误类型
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor() {
    super('网络连接失败');
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('请求超时');
    this.name = 'TimeoutError';
  }
}

// 错误处理
async function handleRequest<T>(
  request: () => Promise<T>
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError) {
      // API 错误
      console.error('API Error:', error.code, error.message);
      throw error;
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      // 网络错误
      throw new NetworkError();
    } else {
      // 未知错误
      console.error('Unknown Error:', error);
      throw new ApiError('未知错误', 'UNKNOWN_ERROR', 500);
    }
  }
}
```

### 重试机制

```typescript
// 带重试的请求
async function requestWithRetry<T>(
  request: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await request();
    } catch (error) {
      lastError = error as Error;
      
      // 不重试客户端错误
      if (error instanceof ApiError && error.statusCode < 500) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        await sleep(delay * (i + 1));
      }
    }
  }
  
  throw lastError;
}
```

## 认证授权

### API Key 认证

```typescript
// 客户端
const chat = document.querySelector('pi-chat');
chat.setAttribute('api-key', 'sk-xxx');

// 请求头
headers: {
  'Authorization': `Bearer ${apiKey}`,
}
```

### JWT 认证

```typescript
// 登录获取 token
async function login(username: string, password: string): Promise<string> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  
  const { token } = await response.json();
  return token;
}

// 使用 token
const token = await login('user', 'pass');
chat.setAttribute('api-key', token);
```

### Cookie 认证

```typescript
// 服务端设置 HttpOnly cookie
app.post('/api/auth/login', (req, res) => {
  const token = generateToken(req.body.username);
  
  res.cookie('session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,  // 24 小时
  });
  
  res.json({ success: true });
});

// 客户端自动携带 cookie
fetch('/api/chat', {
  credentials: 'same-origin',  // 自动携带 cookie
});
```

## 完整后端示例

```typescript
// server.ts
import express from 'express';
import cors from 'cors';
import { streamSimple, getModel } from '@mariozechner/pi-ai';

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 认证中间件
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // 验证 token
  try {
    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// 流式聊天 API
app.post('/api/chat/stream', authMiddleware, async (req, res) => {
  const { provider, model, messages, systemPrompt, tools } = req.body;
  
  // 设置 SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const modelObj = getModel(provider, model);
    
    const stream = streamSimple(modelObj, {
      systemPrompt,
      messages,
      tools: tools?.map(getTool),
    });
    
    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
    
  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// 非流式 API
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { provider, model, messages, systemPrompt } = req.body;
  
  try {
    const modelObj = getModel(provider, model);
    
    const response = await complete(modelObj, {
      systemPrompt,
      messages,
    });
    
    res.json({
      message: response,
      usage: response.usage,
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## 最佳实践

### ✅ 应该做的

1. **使用代理模式**
   ```typescript
   // 前端 -> 后端 -> AI API
   // 不要直接暴露 API Key
   ```

2. **实现重试机制**
   ```typescript
   const response = await requestWithRetry(() => fetch(url));
   ```

3. **处理取消请求**
   ```typescript
   const controller = new AbortController();
   fetch(url, { signal: controller.signal });
   controller.abort();  // 取消请求
   ```

### ❌ 避免的错误

1. **前端暴露 API Key**
   ```html
   <!-- ❌ 错误 -->
   <pi-chat api-key="sk-xxx"></pi-chat>
   
   <!-- ✅ 正确 -->
   <pi-chat api-url="/api"></pi-chat>
   ```

2. **不处理流式错误**
   ```typescript
   // ❌ 错误
   for await (const event of stream) {
     // 不处理错误
   }
   
   // ✅ 正确
   try {
     for await (const event of stream) {
       // 处理事件
     }
   } catch (error) {
     // 处理错误
   }
   ```

## 总结

与后端集成的核心要点：

1. **API 设计**：REST API + SSE 流式响应
2. **前端实现**：ApiClient 类封装请求逻辑
3. **错误处理**：分类错误、重试机制
4. **认证授权**：API Key、JWT、Cookie
5. **安全实践**：使用代理、不暴露密钥

---

**下篇预告**: [05-advanced-features.md](05-advanced-features.md) —— 高级功能与最佳实践，包括自定义组件、性能优化、无障碍访问、测试策略等。
