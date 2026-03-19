# Mom 架构与核心概念

> **难度：进阶** | **预计阅读时间：25 分钟**

## 问题引入

想象一下这个场景：你的团队使用 Slack 进行日常沟通，但经常需要让 AI 助手协助处理代码审查、文件分析、执行命令等任务。你希望有一个机器人能够：

- 在 Slack 频道中响应 @提及和私信
- 安全地执行 bash 命令（在 Docker 沙箱中）
- 读取和编辑项目文件
- 记住之前的对话上下文
- 支持文件附件处理

Mom 就是这样一个**面向 Slack 的 AI 助手**，它将 pi-coding-agent 的能力扩展到 Slack 平台。

---

## 核心概念

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        Slack 平台                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   @提及消息   │  │    私信      │  │   文件上传    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Slack API    │
                    │ (Socket Mode) │
                    └───────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
    ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐
    │  SlackBot │     │  Channel  │     │ Attachment│
    │   类      │     │   Queue   │     │  Handler  │
    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
                    ┌───────┴───────┐
                    │  AgentRunner  │
                    │  (pi-agent)   │
                    └───────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
    ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐
    │  Session  │     │   Tools   │     │  Events   │
    │  Manager  │     │ (bash等)  │     │  Watcher  │
    └───────────┘     └───────────┘     └───────────┘
```

### 核心组件

| 组件 | 文件 | 职责 |
|-----|------|------|
| **SlackBot** | `slack.ts` | Slack API 封装，消息接收与发送 |
| **AgentRunner** | `agent.ts` | Agent 生命周期管理，系统提示词构建 |
| **ChannelStore** | `store.ts` | 频道数据持久化，附件下载管理 |
| **Context** | `context.ts` | 会话上下文同步，Settings 管理 |
| **Sandbox** | `sandbox.ts` | 命令执行沙箱（Host/Docker）|
| **Events** | `events.ts` | 事件监听（定时任务/文件变化）|
| **Tools** | `tools/*.ts` | 工具实现（bash/read/write/edit）|

---

## 实现详解

### 1. SlackBot：Slack 集成层

SlackBot 是 Mom 与 Slack 平台交互的核心，使用 **Socket Mode** 实现实时消息接收：

```typescript
// slack.ts 核心设计
export class SlackBot {
  private socketModeClient: SocketModeClient;  // Socket Mode 客户端
  private webClient: WebClient;                // REST API 客户端
  private channelQueues = new Map<string, ChannelQueue>(); // 频道消息队列
  
  async start(): Promise<void> {
    // 连接 Slack，开始监听事件
    await this.socketModeClient.start();
  }
  
  // 处理消息事件
  private async handleMessageEvent(event: SlackMessageEvent): Promise<void> {
    // 1. 检查是否是 @提及或私信
    // 2. 加入频道消息队列（保证顺序处理）
    // 3. 触发回调函数
  }
}
```

**关键设计决策：**

1. **Socket Mode vs HTTP**：使用 Socket Mode 避免公网暴露，适合内部部署
2. **ChannelQueue**：每个频道独立队列，保证消息顺序处理，避免并发冲突
3. **消息回填**：启动时读取历史消息，补全错过的对话

### 2. AgentRunner：Agent 生命周期

AgentRunner 负责构建完整的 Agent 运行环境：

```typescript
// agent.ts 系统提示词构建
async function buildSystemPrompt(options: {
  workspaceDir: string;
  skills: Skill[];
  events: EventDefinition[];
  sandboxConfig: SandboxConfig;
}): Promise<string> {
  const sections: string[] = [];
  
  // 1. Slack 格式说明
  sections.push(`You are Mom, a Slack bot...`);
  
  // 2. 环境信息（Node.js版本、操作系统等）
  sections.push(formatEnvironmentInfo());
  
  // 3. Workspace 布局
  sections.push(formatWorkspaceLayout(options.workspaceDir));
  
  // 4. Skills（通过 XML 注入）
  sections.push(formatSkills(options.skills));
  
  // 5. Events（通过 XML 注入）
  sections.push(formatEvents(options.events));
  
  // 6. Memory（之前的对话摘要）
  sections.push(formatMemory());
  
  // 7. Tools（通过 XML 注入）
  sections.push(formatTools());
  
  return sections.join("\n\n");
}
```

**系统提示词结构：**

```
┌─────────────────────────────────────┐
│  1. 角色定义（Mom Slack Bot）        │
├─────────────────────────────────────┤
│  2. 环境信息（Node.js/OS/路径）       │
├─────────────────────────────────────┤
│  3. Workspace 目录结构               │
├─────────────────────────────────────┤
│  4. Skills（<skill name="...">）    │
├─────────────────────────────────────┤
│  5. Events（<event name="...">）    │
├─────────────────────────────────────┤
│  6. Memory（对话历史摘要）            │
├─────────────────────────────────────┤
│  7. Tools（<tool name="...">）      │
└─────────────────────────────────────┘
```

### 3. ChannelStore：数据持久化

每个 Slack 频道对应一个数据目录：

```
workspace/
├── C12345/                    # 频道目录（频道ID）
│   ├── log.jsonl             # 人类可读的消息日志
│   ├── context.jsonl         # LLM 上下文（与 coding-agent 格式相同）
│   └── attachments/          # 附件存储
│       ├── 1732531234567_file.png
│       └── 1732531234568_doc.pdf
└── settings.json             # 频道设置
```

**双日志设计：**

| 文件 | 格式 | 用途 |
|-----|------|------|
| `log.jsonl` | 结构化 JSON | 人类可读，支持 grep |
| `context.jsonl` | API 消息格式 | LLM 上下文，与 coding-agent 兼容 |

```typescript
// store.ts 核心功能
export class ChannelStore {
  async logMessage(channelId: string, message: LoggedMessage): Promise<boolean> {
    // 1. 去重检查（60秒窗口）
    // 2. 写入 log.jsonl
    // 3. 触发附件下载队列
  }
  
  private async processDownloadQueue(): Promise<void> {
    // 后台下载附件，使用 Bot Token 认证
  }
}
```

### 4. Sandbox：安全执行

支持两种执行模式：

```typescript
// sandbox.ts 执行器接口
export interface Executor {
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  getWorkspacePath(hostPath: string): string;
}

// Host 模式：直接在本机执行
class HostExecutor implements Executor {
  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    // 使用 child_process.spawn
    // 支持超时和信号取消
    // 限制输出大小（10MB）
  }
}

// Docker 模式：在容器内执行
class DockerExecutor implements Executor {
  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    // docker exec <container> sh -c <command>
    // 容器内路径映射为 /workspace
  }
}
```

**安全特性：**
- 超时控制（默认 60 秒）
- 输出大小限制（10MB）
- 信号支持（可取消执行）
- 进程树清理（防止僵尸进程）

### 5. Events：事件系统

支持三种事件类型：

```typescript
// events.ts 事件定义
export interface EventDefinition {
  name: string;
  description: string;
  type: "immediate" | "one-shot" | "periodic";
  pattern?: string;      // cron 表达式（periodic）
  path?: string;         // 文件路径（one-shot）
  debounceMs?: number;   // 去抖动时间
}

// 使用示例
const events: EventDefinition[] = [
  {
    name: "daily_report",
    description: "每天早上9点生成日报",
    type: "periodic",
    pattern: "0 9 * * *"  // cron 格式
  },
  {
    name: "config_changed",
    description: "配置文件变化时触发",
    type: "one-shot",
    path: "./config.json",
    debounceMs: 1000
  }
];
```

**实现原理：**
- **immediate**：立即触发，用于手动调用
- **one-shot**：使用 `fs.watch` 监听文件变化
- **periodic**：使用 `croner` 库处理定时任务

---

## 使用模式

### 模式 1：基础用法（Host 模式）

```bash
# 启动 Mom（Host 模式）
npx mom --workspace ./data --slack-token $SLACK_TOKEN
```

### 模式 2：Docker 沙箱模式

```bash
# 1. 创建沙箱容器
./docker.sh create ./data

# 2. 启动 Mom（Docker 模式）
npx mom --workspace ./data \
        --slack-token $SLACK_TOKEN \
        --sandbox docker:mom-sandbox
```

### 模式 3：带 Skills 和 Events

```bash
# 启动时加载技能和事件配置
npx mom --workspace ./data \
        --slack-token $SLACK_TOKEN \
        --sandbox docker:mom-sandbox \
        --skills ./skills \
        --events ./events.json
```

---

## 最佳实践

### ✅ 应该做的

1. **使用 Docker 沙箱**：生产环境务必使用 Docker 模式隔离命令执行
2. **定期清理附件**：附件会占用磁盘空间，设置自动清理策略
3. **监控日志大小**：`log.jsonl` 会持续增长，定期归档或清理
4. **配置事件去抖动**：文件变化事件设置合理的 debounceMs，避免频繁触发

### ❌ 避免的错误

1. **不要在 Host 模式执行不受信任的代码**：Host 模式有完整系统访问权限
2. **避免长时间运行的命令**：设置合理的超时时间，防止资源占用
3. **不要存储敏感信息在日志中**：日志文件可能包含对话内容

---

## 总结

1. **Mom 是 pi-coding-agent 的 Slack 封装**，将 AI 能力扩展到聊天平台
2. **双日志设计**（log.jsonl + context.jsonl）兼顾人类可读和 LLM 上下文
3. **灵活的沙箱机制**支持 Host 和 Docker 两种执行模式
4. **事件系统**支持定时任务和文件监听，扩展了自动化能力
5. **频道隔离**保证多频道并发安全，每个频道独立队列和存储

## 下篇预告

《02-skill-system.md - Skill 系统详解》

下一章将深入讲解 Mom 的 Skill 系统：
- 如何编写 SKILL.md 文件
- Skill 的 XML 注入机制
- 内置 Skills 解析（bash/read/write/edit）
- 自定义 Skill 开发指南
