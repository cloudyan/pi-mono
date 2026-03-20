# Mom 重新设计：多平台聊天支持

## 目标

1. 支持多个聊天平台（Slack、Discord、WhatsApp、Telegram 等）
2. 所有平台的统一存储层
3. 不关心消息来源的平台无关 Agent
4. 可独立测试的适配器
5. 可独立测试的 Agent

## 当前架构问题

当前架构将 Slack 特定代码紧密耦合在整个系统中：

```
main.ts → SlackBot → handler.handleEvent() → agent.run(SlackContext)
                                                    ↓
                                              SlackContext.respond()
                                              SlackContext.replaceMessage()
                                              SlackContext.respondInThread()
                                              等等
```

问题：
- `SlackContext` 接口泄漏了 Slack 概念（线程、输入指示器）
- Agent 代码引用了 Slack 特定的格式（mrkdwn、`<@user>` 提及）
- 存储使用 Slack 时间戳（`ts`）作为消息 ID
- 消息日志假设了 Slack 的事件结构
- PR 中的 Discord 实现在单独的包中重复了大部分逻辑

## 提议的架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLI / 入口点                                │
│  mom ./data                                                             │
│  （读取 config.json，启动所有配置的适配器）                               │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           平台适配器                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ SlackAdapter │  │DiscordAdapter│  │  CLIAdapter  │  （用于测试）      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                 │                           │
│         └────────────────┬┴─────────────────┘                           │
│                          │                                              │
│                          ▼                                              │
│              ┌───────────────────────┐                                  │
│              │  PlatformAdapter      │  （通用接口）                     │
│              │  - onMessage()        │                                  │
│              │  - onStop()           │                                  │
│              │  - sendMessage()      │                                  │
│              │  - updateMessage()    │                                  │
│              │  - deleteMessage()    │                                  │
│              │  - uploadFile()       │                                  │
│              │  - getChannelInfo()   │                                  │
│              │  - getUserInfo()      │                                  │
│              └───────────┬───────────┘                                  │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              MomAgent                                   │
│  - 平台无关                                                               │
│  - 通过 handleMessage(message, context, onEvent) 接收消息               │
│  - 通过回调将 AgentSessionEvent 转发给适配器                              │
│  - 提供：abort()、isRunning()                                           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           ChannelStore                                  │
│  - 所有平台的统一存储模式                                                  │
│  - log.jsonl：频道历史（仅消息）                                          │
│  - context.jsonl：LLM 上下文（消息 + 工具结果）                           │
│  - attachments/：下载的文件                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## 关键接口

### 1. ChannelMessage（统一消息格式）

```typescript
interface ChannelMessage {
  /** 频道内的唯一 ID（保留平台特定格式） */
  id: string;
  
  /** 频道/对话 ID */
  channelId: string;
  
  /** 时间戳（ISO 8601） */
  timestamp: string;
  
  /** 发送者 ID（平台特定） */
  senderId: string;
  
  /** 发送者显示名称 */
  senderName: string;
  
  /** 消息内容（纯文本） */
  text: string;
  
  /** 消息类型 */
  type: "user" | "assistant" | "system";
  
  /** 附件列表 */
  attachments?: Attachment[];
  
  /** 父消息 ID（用于线程回复） */
  parentId?: string;
  
  /** 原始平台数据（用于调试） */
  raw?: unknown;
}

interface Attachment {
  /** 附件 ID */
  id: string;
  
  /** 文件名 */
  name: string;
  
  /** MIME 类型 */
  mimeType: string;
  
  /** 本地文件路径（下载后） */
  path: string;
  
  /** 文件大小（字节） */
  size: number;
}
```

### 2. PlatformAdapter（通用适配器接口）

```typescript
interface PlatformAdapter {
  /** 适配器名称（用于日志） */
  readonly name: string;
  
  /** 启动适配器，开始监听消息 */
  start(onMessage: (msg: ChannelMessage) => Promise<void>): Promise<void>;
  
  /** 优雅地停止适配器 */
  stop(): Promise<void>;
  
  /** 发送消息到频道 */
  sendMessage(
    channelId: string,
    text: string,
    options?: MessageOptions
  ): Promise<ChannelMessage>;
  
  /** 更新现有消息 */
  updateMessage(
    messageId: string,
    text: string
  ): Promise<ChannelMessage>;
  
  /** 删除消息 */
  deleteMessage(messageId: string): Promise<void>;
  
  /** 上传文件 */
  uploadFile(
    channelId: string,
    filePath: string,
    options?: UploadOptions
  ): Promise<Attachment>;
  
  /** 获取频道信息 */
  getChannelInfo(channelId: string): Promise<ChannelInfo>;
  
  /** 获取用户信息 */
  getUserInfo(userId: string): Promise<UserInfo>;
  
  /** 显示/隐藏输入指示器 */
  setTyping(channelId: string, isTyping: boolean): Promise<void>;
}

interface MessageOptions {
  /** 作为线程回复发送 */
  threadId?: string;
  
  /** 提及特定用户 */
  mentions?: string[];
}

interface UploadOptions {
  /** 上传消息 */
  message?: string;
  
  /** 作为线程回复上传 */
  threadId?: string;
}

interface ChannelInfo {
  id: string;
  name: string;
  type: "public" | "private" | "dm";
  memberCount?: number;
}

interface UserInfo {
  id: string;
  name: string;
  displayName?: string;
  isBot?: boolean;
}
```

### 3. MomAgent（平台无关 Agent）

```typescript
interface MomAgent {
  /** Agent 是否正在运行 */
  isRunning(): boolean;
  
  /** 中止当前运行（如果有） */
  abort(): void;
  
  /** 
   * 处理新消息
   * @param message 接收到的消息
   * @param context 对话上下文（来自 ChannelStore）
   * @param onEvent 将事件发送回适配器的回调
   */
  handleMessage(
    message: ChannelMessage,
    context: ConversationContext,
    onEvent: (event: AgentSessionEvent) => Promise<void>
  ): Promise<void>;
}

interface ConversationContext {
  /** 此频道的历史消息 */
  history: ChannelMessage[];
  
  /** 频道元数据 */
  channel: ChannelInfo;
  
  /** 用户提及此 Agent 的格式（例如 "@mom"） */
  mention: string;
}

type AgentSessionEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: unknown }
  | { type: "error"; message: string }
  | { type: "complete" }
  | { type: "abort" };
```

### 4. ChannelStore（统一存储）

```typescript
interface ChannelStore {
  /** 获取频道的历史消息 */
  getHistory(channelId: string, limit?: number): Promise<ChannelMessage[]>;
  
  /** 向频道历史追加消息 */
  appendMessage(channelId: string, message: ChannelMessage): Promise<void>;
  
  /** 更新历史中的消息（用于编辑） */
  updateMessage(channelId: string, message: ChannelMessage): Promise<void>;
  
  /** 获取 LLM 上下文的完整上下文（消息 + 工具结果） */
  getContext(channelId: string): Promise<ContextEntry[]>;
  
  /** 向上下文追加条目 */
  appendContext(channelId: string, entry: ContextEntry): Promise<void>;
  
  /** 存储下载的附件 */
  storeAttachment(channelId: string, attachment: Attachment): Promise<void>;
  
  /** 获取附件路径 */
  getAttachmentPath(attachmentId: string): string;
}

type ContextEntry =
  | { type: "message"; message: ChannelMessage }
  | { type: "tool_call"; name: string; input: unknown; timestamp: string }
  | { type: "tool_result"; name: string; output: unknown; timestamp: string };
```

## 数据目录结构

```
data/
├── config.json              # 适配器配置
├── channels/                # 每个频道的数据
│   ├── C12345/             # Slack 频道
│   │   ├── log.jsonl       # 消息历史（所有平台通用格式）
│   │   ├── context.jsonl   # LLM 上下文（消息 + 工具结果）
│   │   └── attachments/    # 下载的文件
│   ├── discord-67890/      # Discord 频道
│   │   ├── log.jsonl
│   │   ├── context.jsonl
│   │   └── attachments/
│   └── telegram-abc123/    # Telegram 聊天
│       ├── log.jsonl
│       ├── context.jsonl
│       └── attachments/
└── events/                  # 事件文件（保留）
```

## 配置格式

```json
{
  "adapters": [
    {
      "type": "slack",
      "name": "work-slack",
      "token": "xoxb-...",
      "appToken": "xapp-...",
      "defaultChannel": "C12345"
    },
    {
      "type": "discord",
      "name": "community-discord",
      "token": "...",
      "defaultChannel": "123456789"
    }
  ],
  "agent": {
    "model": "claude-sonnet-4-20250514",
    "systemPrompt": "...",
    "maxContextMessages": 50
  }
}
```

## 实现步骤

### 第 1 阶段：提取存储层

1. 创建 `ChannelStore` 接口和基于文件的实现
2. 将当前 Slack 存储转换为新格式
3. 更新 SlackBot 以使用 ChannelStore
4. 添加迁移脚本以转换现有数据

### 第 2 阶段：提取适配器接口

1. 创建 `PlatformAdapter` 接口
2. 重构 `SlackBot` 为 `SlackAdapter` 实现
3. 确保所有 Slack 特定代码都在适配器中
4. 添加适配器测试

### 第 3 阶段：重构 Agent

1. 创建 `MomAgent` 接口
2. 将当前 Agent 逻辑重构为平台无关
3. 移除所有 Slack 特定格式（mrkdwn、提及）
4. 使用 `onEvent` 回调而不是直接 Slack 调用
5. 添加 Agent 测试

### 第 4 阶段：添加 CLI 入口点

1. 创建主 `mom` CLI 命令
2. 从 `config.json` 加载适配器配置
3. 启动所有配置的适配器
4. 处理优雅关闭

### 第 5 阶段：添加新平台

1. 实现 `DiscordAdapter`
2. 实现 `TelegramAdapter`
3. 每个都遵循相同的 `PlatformAdapter` 接口
4. 每个都使用相同的 `ChannelStore`
5. 每个都使用相同的 `MomAgent`

## 测试策略

### 适配器测试

```typescript
// 使用内存存储测试 SlackAdapter
describe("SlackAdapter", () => {
  let adapter: SlackAdapter;
  let mockSlack: MockSlackClient;
  let store: InMemoryChannelStore;
  
  beforeEach(() => {
    store = new InMemoryChannelStore();
    mockSlack = new MockSlackClient();
    adapter = new SlackAdapter(mockSlack, store);
  });
  
  test("收到 Slack 消息时调用 onMessage", async () => {
    const onMessage = jest.fn();
    await adapter.start(onMessage);
    
    mockSlack.simulateMessage({
      text: "Hello",
      channel: "C123",
      user: "U456"
    });
    
    expect(onMessage).toHaveBeenCalledWith({
      id: "123.456",
      channelId: "C123",
      text: "Hello",
      senderId: "U456",
      // ...
    });
  });
  
  test("sendMessage 调用 Slack API", async () => {
    await adapter.sendMessage("C123", "Hello");
    expect(mockSlack.chat.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Hello"
    });
  });
});
```

### Agent 测试

```typescript
// 使用内存适配器测试 MomAgent
describe("MomAgent", () => {
  let agent: MomAgent;
  let mockAdapter: MockPlatformAdapter;
  
  beforeEach(() => {
    mockAdapter = new MockPlatformAdapter();
    agent = new MomAgent({
      model: "claude-sonnet-4-20250514",
      systemPrompt: "..."
    });
  });
  
  test("响应用户消息", async () => {
    const events: AgentSessionEvent[] = [];
    
    await agent.handleMessage(
      { id: "1", text: "Hello", /* ... */ },
      { history: [], channel: { id: "C1", name: "test" }, mention: "@mom" },
      async (event) => events.push(event)
    );
    
    expect(events).toContainEqual({
      type: "text",
      content: expect.stringContaining("Hello")
    });
  });
});
```

## 优势

1. **平台无关的 Agent** —— Agent 代码不引用任何平台特定概念
2. **可测试** —— 适配器和 Agent 可以用内存模拟独立测试
3. **可扩展** —— 添加新平台只需实现 `PlatformAdapter`
4. **统一存储** —— 所有平台使用相同的数据格式
5. **无数据锁定** —— 纯文本 JSONL 文件，易于检查和迁移
6. **清晰分离** —— 关注点分离：适配器处理平台，Agent 处理 AI

## 迁移

现有 Slack 数据将迁移：
- `messages.jsonl` → `log.jsonl`（格式转换）
- `context.jsonl` → `context.jsonl`（格式转换）
- `files/` → `attachments/`（移动文件）

迁移脚本将：
1. 读取现有 Slack 格式
2. 转换为新的统一格式
3. 写入新位置
4. 保留旧数据作为备份
