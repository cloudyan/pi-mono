# pi-web-ui 中文文档

> 原文：[packages/web-ui/README.md](../../packages/web-ui/README.md)

@mariozechner/pi-web-ui

用于构建 AI 聊天界面的可重用 Web UI 组件，由 [@mariozechner/pi-ai](../ai) 和 [@mariozechner/pi-agent-core](../agent) 提供支持。

使用 [mini-lit](https://github.com/badlogic/mini-lit) Web 组件和 Tailwind CSS v4 构建。

## 特性

- **聊天 UI**：带有消息历史、流式输出和工具执行的完整界面
- **工具**：JavaScript REPL、文档提取和工件（HTML、SVG、Markdown 等）
- **附件**：PDF、DOCX、XLSX、PPTX、图片，支持预览和文本提取
- **工件**：交互式 HTML、SVG、Markdown，带沙箱执行
- **存储**：基于 IndexedDB 的会话、API 密钥和设置存储
- **CORS 代理**：浏览器环境的自动代理处理
- **自定义提供商**：支持 Ollama、LM Studio、vLLM 和 OpenAI 兼容 API

## 安装

```bash
npm install @mariozechner/pi-web-ui @mariozechner/pi-agent-core @mariozechner/pi-ai
```

## 快速开始

查看 [example](./example) 目录获取完整的工作应用程序示例。

```typescript
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import {
  ChatPanel,
  AppStorage,
  IndexedDBStorageBackend,
  ProviderKeysStore,
  SessionsStore,
  SettingsStore,
  setAppStorage,
  defaultConvertToLlm,
  ApiKeyPromptDialog,
} from '@mariozechner/pi-web-ui';
import '@mariozechner/pi-web-ui/app.css';

// 设置存储
const settings = new SettingsStore();
const providerKeys = new ProviderKeysStore();
const sessions = new SessionsStore();

const backend = new IndexedDBStorageBackend({
  dbName: 'my-app',
  version: 1,
  stores: [
    settings.getConfig(),
    providerKeys.getConfig(),
    sessions.getConfig(),
    SessionsStore.getMetadataConfig(),
  ],
});

settings.setBackend(backend);
providerKeys.setBackend(backend);
sessions.setBackend(backend);

const storage = new AppStorage(settings, providerKeys, sessions, undefined, backend);
setAppStorage(storage);

// 创建代理
const agent = new Agent({
  initialState: {
    systemPrompt: '你是一个有帮助的助手。',
    model: getModel('anthropic', 'claude-sonnet-4-5-20250929'),
    thinkingLevel: 'off',
    messages: [],
    tools: [],
  },
  convertToLlm: defaultConvertToLlm,
});

// 创建聊天面板
const chatPanel = new ChatPanel();
await chatPanel.setAgent(agent, {
  onApiKeyRequired: (provider) => ApiKeyPromptDialog.prompt(provider),
});

document.body.appendChild(chatPanel);
```

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    ChatPanel                         │
│  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │   AgentInterface    │  │   ArtifactsPanel    │   │
│  │  (消息, 输入)        │  │  (HTML, SVG, MD)    │   │
│  └─────────────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│              Agent (来自 pi-agent-core)              │
│  - 状态管理 (消息, 模型, 工具)                        │
│  - 事件发射 (agent_start, message_update, ...)       │
│  - 工具执行                                          │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│                   AppStorage                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Settings │ │ Provider │ │ Sessions │            │
│  │  Store   │ │Keys Store│ │  Store   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                     │                               │
│              IndexedDBStorageBackend                │
└─────────────────────────────────────────────────────┘
```

## 组件

### ChatPanel

带有内置工件面板的高级聊天界面。

```typescript
const chatPanel = new ChatPanel();
await chatPanel.setAgent(agent, {
  // 需要时提示输入 API 密钥
  onApiKeyRequired: async (provider) => ApiKeyPromptDialog.prompt(provider),

  // 发送消息前的钩子
  onBeforeSend: async () => { /* 保存草稿等 */ },

  // 处理成本显示点击
  onCostClick: () => { /* 显示成本明细 */ },

  // 浏览器扩展的自定义沙箱 URL
  sandboxUrlProvider: () => chrome.runtime.getURL('sandbox.html'),

  // 添加自定义工具
  toolsFactory: (agent, agentInterface, artifactsPanel, runtimeProvidersFactory) => {
    const replTool = createJavaScriptReplTool();
    replTool.runtimeProvidersFactory = runtimeProvidersFactory;
    return [replTool];
  },
});
```

### AgentInterface

用于自定义布局的低级聊天界面。

```typescript
const chat = document.createElement('agent-interface') as AgentInterface;
chat.session = agent;
chat.enableAttachments = true;
chat.enableModelSelector = true;
chat.enableThinkingSelector = true;
chat.onApiKeyRequired = async (provider) => { /* ... */ };
chat.onBeforeSend = async () => { /* ... */ };
```

属性：
- `session`：Agent 实例
- `enableAttachments`：显示附件按钮（默认：true）
- `enableModelSelector`：显示模型选择器（默认：true）
- `enableThinkingSelector`：显示思考级别选择器（默认：true）
- `showThemeToggle`：显示主题切换（默认：false）

### Agent（来自 pi-agent-core）

```typescript
import { Agent } from '@mariozechner/pi-agent-core';

const agent = new Agent({
  initialState: {
    model: getModel('anthropic', 'claude-sonnet-4-5-20250929'),
    systemPrompt: 'You are helpful.',
    thinkingLevel: 'off',
    messages: [],
    tools: [],
  },
  convertToLlm: defaultConvertToLlm,
});

// 事件
agent.subscribe((event) => {
  switch (event.type) {
    case 'agent_start': // 代理循环开始
    case 'agent_end':   // 代理循环结束
    case 'turn_start':  // LLM 调用开始
    case 'turn_end':    // LLM 调用结束
    case 'message_start':
    case 'message_update': // 流式更新
    case 'message_end':
      break;
  }
});

// 发送消息
await agent.prompt('Hello!');
await agent.prompt({ role: 'user-with-attachments', content: 'Check this', attachments, timestamp: Date.now() });

// 控制
agent.abort();
agent.setModel(newModel);
agent.setThinkingLevel('medium');
agent.setTools([...]);
agent.queueMessage(customMessage);
```

## 消息类型

### UserMessageWithAttachments

带文件附件的用户消息：

```typescript
const message: UserMessageWithAttachments = {
  role: 'user-with-attachments',
  content: '分析这个文档',
  attachments: [pdfAttachment],
  timestamp: Date.now(),
};

// 类型守卫
if (isUserMessageWithAttachments(msg)) {
  console.log(msg.attachments);
}
```

### ArtifactMessage

用于工件的会话持久化：

```typescript
const artifact: ArtifactMessage = {
  role: 'artifact',
  action: 'create', // 或 'update', 'delete'
  filename: 'chart.html',
  content: '<div>...</div>',
  timestamp: new Date().toISOString(),
};

// 类型守卫
if (isArtifactMessage(msg)) {
  console.log(msg.filename);
}
```

### 自定义消息类型

通过声明合并扩展：

```typescript
interface SystemNotification {
  role: 'system-notification';
  message: string;
  level: 'info' | 'warning' | 'error';
  timestamp: string;
}

declare module '@mariozechner/pi-agent-core' {
  interface CustomAgentMessages {
    'system-notification': SystemNotification;
  }
}

// 注册渲染器
registerMessageRenderer('system-notification', {
  render: (msg) => html`<div class="alert">${msg.message}</div>`,
});

// 扩展 convertToLlm
function myConvertToLlm(messages: AgentMessage[]): Message[] {
  const processed = messages.map((m) => {
    if (m.role === 'system-notification') {
      return { role: 'user', content: `<system>${m.message}</system>`, timestamp: Date.now() };
    }
    return m;
  });
  return defaultConvertToLlm(processed);
}
```

## 消息转换器

`convertToLlm` 将应用消息转换为 LLM 兼容格式：

```typescript
import { defaultConvertToLlm, convertAttachments } from '@mariozechner/pi-web-ui';

// defaultConvertToLlm 处理：
// - UserMessageWithAttachments → 带图片/文本内容块的用户消息
// - ArtifactMessage → 过滤掉（仅 UI）
// - 标准消息 (user, assistant, toolResult) → 直接传递
```

## 工具

### JavaScript REPL

在沙箱浏览器环境中执行 JavaScript：

```typescript
import { createJavaScriptReplTool } from '@mariozechner/pi-web-ui';

const replTool = createJavaScriptReplTool();

// 为工件/附件访问配置运行时提供程序
replTool.runtimeProvidersFactory = () => [
  new AttachmentsRuntimeProvider(attachments),
  new ArtifactsRuntimeProvider(artifactsPanel, agent, true), // 读写
];

agent.setTools([replTool]);
```

### Extract Document

从 URL 提取文档中的文本：

```typescript
import { createExtractDocumentTool } from '@mariozechner/pi-web-ui';

const extractTool = createExtractDocumentTool();
extractTool.corsProxyUrl = 'https://corsproxy.io/?';

agent.setTools([extractTool]);
```

### Artifacts Tool

内置于 ArtifactsPanel，支持：HTML、SVG、Markdown、文本、JSON、图片、PDF、DOCX、XLSX。

```typescript
const artifactsPanel = new ArtifactsPanel();
artifactsPanel.agent = agent;

// 工具可作为 artifactsPanel.tool 使用
agent.setTools([artifactsPanel.tool]);
```

### 自定义工具渲染器

```typescript
import { registerToolRenderer, type ToolRenderer } from '@mariozechner/pi-web-ui';

const myRenderer: ToolRenderer = {
  render(params, result, isStreaming) {
    return {
      content: html`<div>...</div>`,
      isCustom: false, // true = 无卡片包装器
    };
  },
};

registerToolRenderer('my_tool', myRenderer);
```

## 存储

### 设置

```typescript
import {
  AppStorage,
  IndexedDBStorageBackend,
  SettingsStore,
  ProviderKeysStore,
  SessionsStore,
  CustomProvidersStore,
  setAppStorage,
  getAppStorage,
} from '@mariozechner/pi-web-ui';

// 创建存储
const settings = new SettingsStore();
const providerKeys = new ProviderKeysStore();
const sessions = new SessionsStore();
const customProviders = new CustomProvidersStore();

// 使用所有存储配置创建后端
const backend = new IndexedDBStorageBackend({
  dbName: 'my-app',
  version: 1,
  stores: [
    settings.getConfig(),
    providerKeys.getConfig(),
    sessions.getConfig(),
    SessionsStore.getMetadataConfig(),
    customProviders.getConfig(),
  ],
});

// 将存储连接到后端
settings.setBackend(backend);
providerKeys.setBackend(backend);
sessions.setBackend(backend);
customProviders.setBackend(backend);

// 创建并设置全局存储
const storage = new AppStorage(settings, providerKeys, sessions, customProviders, backend);
setAppStorage(storage);
```

### SettingsStore

键值设置：

```typescript
await storage.settings.set('proxy.enabled', true);
await storage.settings.set('proxy.url', 'https://proxy.example.com');
const enabled = await storage.settings.get<boolean>('proxy.enabled');
```

### ProviderKeysStore

按提供商的 API 密钥：

```typescript
await storage.providerKeys.set('anthropic', 'sk-ant-...');
const key = await storage.providerKeys.get('anthropic');
const providers = await storage.providerKeys.list();
```

### SessionsStore

带元数据的聊天会话：

```typescript
// 保存会话
await storage.sessions.save(sessionData, metadata);

// 加载会话
const data = await storage.sessions.get(sessionId);
const metadata = await storage.sessions.getMetadata(sessionId);

// 列出的会话（按 lastModified 排序）
const allMetadata = await storage.sessions.getAllMetadata();

// 更新标题
await storage.sessions.updateTitle(sessionId, '新标题');

// 删除
await storage.sessions.delete(sessionId);
```

### CustomProvidersStore

自定义 LLM 提供商：

```typescript
const provider: CustomProvider = {
  id: crypto.randomUUID(),
  name: 'My Ollama',
  type: 'ollama',
  baseUrl: 'http://localhost:11434',
};

await storage.customProviders.set(provider);
const all = await storage.customProviders.getAll();
```

## 附件

加载和处理文件：

```typescript
import { loadAttachment, type Attachment } from '@mariozechner/pi-web-ui';

// 从文件输入
const file = inputElement.files[0];
const attachment = await loadAttachment(file);

// 从 URL
const attachment = await loadAttachment('https://example.com/doc.pdf');

// 从 ArrayBuffer
const attachment = await loadAttachment(arrayBuffer, 'document.pdf');

// 附件结构
interface Attachment {
  id: string;
  type: 'image' | 'document';
  fileName: string;
  mimeType: string;
  size: number;
  content: string;        // base64 编码
  extractedText?: string; // 用于文档
  preview?: string;       // base64 预览图片
}
```

支持格式：PDF、DOCX、XLSX、PPTX、图片、文本文件。

## CORS 代理

用于有 CORS 限制的浏览器环境：

```typescript
import { createStreamFn, shouldUseProxyForProvider, isCorsError } from '@mariozechner/pi-web-ui';

// AgentInterface 从设置自动配置代理
// 手动设置：
agent.streamFn = createStreamFn(async () => {
  const enabled = await storage.settings.get<boolean>('proxy.enabled');
  return enabled ? await storage.settings.get<string>('proxy.url') : undefined;
});

// 需要代理的提供商：
// - zai: 总是
// - anthropic: 仅 OAuth 令牌 (sk-ant-oat-*)
```

## 对话框

### SettingsDialog

```typescript
import { SettingsDialog, ProvidersModelsTab, ProxyTab, ApiKeysTab } from '@mariozechner/pi-web-ui';

SettingsDialog.open([
  new ProvidersModelsTab(), // 自定义提供商 + 模型列表
  new ProxyTab(),           // CORS 代理设置
  new ApiKeysTab(),         // 每个提供商的 API 密钥
]);
```

### SessionListDialog

```typescript
import { SessionListDialog } from '@mariozechner/pi-web-ui';

SessionListDialog.open(
  async (sessionId) => { /* 加载会话 */ },
  (deletedId) => { /* 处理删除 */ },
);
```

### ApiKeyPromptDialog

```typescript
import { ApiKeyPromptDialog } from '@mariozechner/pi-web-ui';

const success = await ApiKeyPromptDialog.prompt('anthropic');
```

### ModelSelector

```typescript
import { ModelSelector } from '@mariozechner/pi-web-ui';

ModelSelector.open(currentModel, (selectedModel) => {
  agent.setModel(selectedModel);
});
```

## 样式

导入预构建的 CSS：

```typescript
import '@mariozechner/pi-web-ui/app.css';
```

或使用带自定义配置的 Tailwind：

```css
@import '@mariozechner/mini-lit/themes/claude.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## 国际化

```typescript
import { i18n, setLanguage, translations } from '@mariozechner/pi-web-ui';

// 添加翻译
translations.de = {
  'Loading...': 'Laden...',
  'No sessions yet': 'Noch keine Sitzungen',
};

setLanguage('de');
console.log(i18n('Loading...')); // "Laden..."
```

## 示例

- [example/](./example) - 带有会话、工件、自定义消息的完整 Web 应用
- [sitegeist](https://sitegeist.ai) - 使用 pi-web-ui 的浏览器扩展

## 已知问题

- **PersistentStorageDialog**：当前损坏

## 许可证

MIT
