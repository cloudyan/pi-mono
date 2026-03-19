# 架构与核心概念

> 难度：进阶 | 预计阅读时间：30 分钟

## 问题引入：为什么需要 Mom？

### Slack + AI Agent 的集成困境

在团队协作中，Slack 已成为沟通的核心枢纽。当团队成员需要 AI 辅助时，传统的做法是：

1. **复制粘贴**：把代码/错误信息复制到 ChatGPT/Claude，再把结果贴回 Slack
2. **独立工具**：每个开发者运行自己的本地 AI 助手，无法共享上下文
3. **API 封装**：简单的聊天机器人，只能回答问题，无法执行实际操作

这些方式存在明显缺陷：

```
传统模式的痛点
├── 上下文割裂：AI 看不到团队讨论的历史
├── 操作受限：AI 只能"说"，不能"做"
├── 信息孤岛：每个会话独立，无法积累知识
└── 效率低下：来回切换工具，打断工作流
```

**Mom 的设计理念**：让 AI Agent 成为 Slack 团队的"一员"，不仅能参与对话，还能执行命令、管理文件、创建工具。

### 设计目标

Mom 旨在解决以下核心问题：

| 问题 | Mom 的解决方案 |
|------|---------------|
| AI 无法访问团队历史 | `log.jsonl` 记录完整频道历史，支持无限回溯 |
| AI 只能建议，无法执行 | 提供完整工具链（bash/read/write/edit/attach） |
| 每次对话从零开始 | `MEMORY.md` + `context.jsonl` 持久化上下文 |
| 敏感操作风险 | Docker 沙箱隔离，保护主机安全 |
| 无法主动触发 | Events 系统支持定时任务和外部唤醒 |

---

## 核心概念：架构总览

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Slack Workspace                                 │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐                                   │
│   │ Channel │   │ Channel │   │   DM    │  ...                              │
│   └────┬────┘   └────┬────┘   └────┬────┘                                   │
└────────┼─────────────┼─────────────┼─────────────────────────────────────────┘
         │             │             │
         ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Mom (Host Process)                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          SlackBot (slack.ts)                          │  │
│  │  • Socket Mode 连接                                                    │  │
│  │  • 消息接收/发送                                                        │  │
│  │  • 频道/用户信息管理                                                     │  │
│  │  • 历史回填 (backfill)                                                  │  │
│  └──────────────────────────────┬────────────────────────────────────────┘  │
│                                 │                                            │
│                                 ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     ChannelQueue (per-channel)                        │  │
│  │  • 串行化消息处理                                                       │  │
│  │  • "正在工作"状态管理                                                    │  │
│  └──────────────────────────────┬────────────────────────────────────────┘  │
│                                 │                                            │
│                                 ▼                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        AgentRunner (agent.ts)                         │  │
│  │  • 会话管理 (SessionManager)                                           │  │
│  │  • 事件订阅 (AgentSession.subscribe)                                   │  │
│  │  • 系统提示构建                                                         │  │
│  │  • 技能加载                                                            │  │
│  └──────────────────────────────┬────────────────────────────────────────┘  │
│                                 │                                            │
│         ┌───────────────────────┼───────────────────────┐                   │
│         ▼                       ▼                       ▼                   │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────────┐            │
│  │  Context    │       │   Tools     │       │     Events      │            │
│  │ (context.ts)│       │ (tools/*)   │       │   (events.ts)   │            │
│  │             │       │             │       │                 │            │
│  │ • log→ctx   │       │ • bash      │       │ • immediate     │            │
│  │   同步      │       │ • read      │       │ • one-shot      │            │
│  │ • 压缩      │       │ • write     │       │ • periodic      │            │
│  │ • 管理      │       │ • edit      │       │ • cron 调度     │            │
│  │             │       │ • attach    │       │                 │            │
│  └──────┬──────┘       └──────┬──────┘       └────────┬────────┘            │
│         │                     │                       │                      │
│         └─────────────────────┼───────────────────────┘                      │
│                               ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Sandbox (sandbox.ts)                           │  │
│  │  ┌─────────────────────┐    ┌─────────────────────┐                   │  │
│  │  │    HostExecutor     │ OR │   DockerExecutor    │                   │  │
│  │  │  (直接在主机执行)    │    │  (容器内执行)        │                   │  │
│  │  └─────────────────────┘    └─────────────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Store (store.ts)                               │  │
│  │  • log.jsonl 写入                                                      │  │
│  │  • 附件下载管理                                                         │  │
│  │  • 去重检查                                                            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Workspace (Data Directory)                          │
│  ./data/                                                                     │
│  ├── MEMORY.md              # 全局记忆                                      │
│  ├── settings.json          # 全局设置                                      │
│  ├── skills/                # 全局技能                                      │
│  ├── events/                # 事件文件                                      │
│  └── C123ABC/               # 频道目录                                      │
│      ├── MEMORY.md          # 频道记忆                                      │
│      ├── log.jsonl          # 消息历史（真相源）                             │
│      ├── context.jsonl      # LLM 上下文                                    │
│      ├── attachments/       # 用户分享的文件                                │
│      ├── scratch/           # 工作目录                                      │
│      └── skills/            # 频道专属技能                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 核心组件详解

#### 1. SlackBot - Slack 集成层

`SlackBot` 是 Mom 与 Slack 的桥梁，负责：

```typescript
// src/slack.ts - 核心结构

export class SlackBot {
  // 连接管理
  private socketClient: SocketModeClient;  // Socket Mode 连接
  private webClient: WebClient;            // Web API 客户端
  
  // 状态管理
  private users: Map<string, SlackUser>;      // 用户信息缓存
  private channels: Map<string, SlackChannel>; // 频道信息缓存
  private queues: Map<string, ChannelQueue>;  // 每个频道的消息队列
  
  // 核心方法
  async start(): Promise<void>;                    // 启动连接
  async postMessage(channel, text): Promise<string>; // 发送消息
  enqueueEvent(event: SlackEvent): boolean;        // 入队事件
}
```

**消息流转**：

```
Slack 消息 → app_mention/message 事件
                │
                ▼
           logUserMessage()     ──→ 写入 log.jsonl
                │
                ▼
           检查 startupTs       ──→ 跳过启动前的历史消息
                │
                ▼
           检查 "stop" 命令     ──→ 特殊处理（立即中断）
                │
                ▼
           检查 isRunning()     ──→ 忙碌时拒绝新请求
                │
                ▼
           ChannelQueue.enqueue() ──→ 排队处理
```

#### 2. AgentRunner - Agent 执行引擎

`AgentRunner` 是 Mom 的"大脑"，管理整个对话流程：

```typescript
// src/agent.ts - 核心结构

export interface AgentRunner {
  // 运行一次对话
  run(ctx: SlackContext, store: ChannelStore): Promise<{
    stopReason: string;
    errorMessage?: string;
  }>;
  
  // 中止当前运行
  abort(): void;
}

// 每个频道一个 Runner，持久化在内存中
const channelRunners = new Map<string, AgentRunner>();

export function getOrCreateRunner(
  sandboxConfig: SandboxConfig,
  channelId: string,
  channelDir: string
): AgentRunner {
  // 复用已存在的 Runner
  const existing = channelRunners.get(channelId);
  if (existing) return existing;
  
  // 创建新 Runner
  const runner = createRunner(sandboxConfig, channelId, channelDir);
  channelRunners.set(channelId, runner);
  return runner;
}
```

**事件订阅机制**：

Agent 通过事件驱动的方式与 Slack 交互：

```typescript
// 订阅 Agent 事件
session.subscribe(async (event) => {
  switch (event.type) {
    case "tool_execution_start":
      // 显示工具调用标签
      await ctx.respond(`_→ ${label}_`);
      break;
      
    case "tool_execution_end":
      // 在线程中显示工具结果
      await ctx.respondInThread(`*✓ ${toolName}*\n\`\`\`${result}\`\`\``);
      break;
      
    case "message_end":
      // 处理 AI 回复
      if (text.trim()) {
        await ctx.respond(text);
      }
      break;
  }
});
```

#### 3. Context - 上下文管理

Mom 使用**双文件策略**管理对话历史：

```
┌─────────────────────────────────────────────────────────────────┐
│                        log.jsonl                                │
│  （真相源 - 永不压缩）                                           │
│                                                                 │
│  {"date":"2025-01-15T10:30:00Z","ts":"1736933400.123456",      │
│   "user":"U123ABC","userName":"alice","text":"@mom 帮我...",   │
│   "attachments":[],"isBot":false}                              │
│                                                                 │
│  {"date":"2025-01-15T10:30:15Z","ts":"1736933415.789012",      │
│   "user":"bot","text":"好的，我来处理...",                       │
│   "attachments":[],"isBot":true}                               │
│                                                                 │
│  特点：只记录用户消息和 AI 回复，不含工具调用细节                  │
│  用途：历史回溯、grep 搜索、同步到 context                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ syncLogToSessionManager()
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      context.jsonl                              │
│  （LLM 上下文 - 可能压缩）                                       │
│                                                                 │
│  {"type":"message","message":{"role":"user","content":"..."}}  │
│  {"type":"message","message":{"role":"assistant","content":[   │
│    {"type":"text","text":"好的..."},                            │
│    {"type":"tool_use","name":"bash","input":{...}}             │
│  ]}}                                                            │
│  {"type":"tool_result","toolCallId":"...","content":"..."}     │
│                                                                 │
│  特点：完整的 LLM 消息格式，包含工具调用和结果                    │
│  用途：发送给 LLM，支持压缩以适应上下文窗口                       │
└─────────────────────────────────────────────────────────────────┘
```

**同步逻辑**：

```typescript
// src/context.ts - 同步 log 到 context

export function syncLogToSessionManager(
  sessionManager: SessionManager,
  channelDir: string,
  excludeSlackTs?: string
): number {
  // 1. 读取现有的 context 中已有的消息
  const existingMessages = new Set<string>();
  for (const entry of sessionManager.getEntries()) {
    // 提取用户消息文本用于去重
  }
  
  // 2. 读取 log.jsonl
  const logLines = readFileSync(logFile, "utf-8").trim().split("\n");
  
  // 3. 找出不在 context 中的新消息
  for (const line of logLines) {
    const logMsg = JSON.parse(line);
    if (logMsg.isBot) continue;  // 跳过机器人消息
    if (existingMessages.has(messageText)) continue;  // 已存在
    
    // 添加到 context
    sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text: `[${userName}]: ${text}` }],
      timestamp: msgTime,
    });
  }
}
```

#### 4. Events - 事件调度系统

Events 系统让 Mom 能够"主动"行动，而不仅仅是被动响应：

```
┌─────────────────────────────────────────────────────────────────┐
│                    EventsWatcher                                │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐     │
│  │ immediate   │  │  one-shot   │  │     periodic        │     │
│  │             │  │             │  │                     │     │
│  │ 立即执行    │  │ setTimeout  │  │ Cron (croner)       │     │
│  │ 然后删除    │  │ 执行后删除   │  │ 按计划重复执行       │     │
│  └─────────────┘  └─────────────┘  └─────────────────────┘     │
│                                                                 │
│  文件监听：fs.watch() + 100ms debounce                          │
│  队列限制：每频道最多 5 个事件                                   │
└─────────────────────────────────────────────────────────────────┘
```

**事件类型详解**：

```json
// 立即触发 - 用于 webhook、外部信号
{
  "type": "immediate",
  "channelId": "C123ABC",
  "text": "收到新的 GitHub issue: #42"
}

// 一次性定时 - 用于提醒
{
  "type": "one-shot",
  "channelId": "C123ABC",
  "text": "下午3点有个会议",
  "at": "2025-01-15T15:00:00+08:00"
}

// 周期性 - 用于例行任务
{
  "type": "periodic",
  "channelId": "C123ABC",
  "text": "检查收件箱",
  "schedule": "0 9 * * 1-5",    // 工作日早9点
  "timezone": "Asia/Shanghai"
}
```

#### 5. Sandbox - 执行沙箱

Sandbox 决定了工具执行的隔离程度：

```typescript
// src/sandbox.ts

export type SandboxConfig = 
  | { type: "host" }
  | { type: "docker"; container: string };

// 两种执行器
class HostExecutor implements Executor {
  // 直接在主机 shell 执行
  async exec(command: string): Promise<ExecResult> {
    spawn("sh", ["-c", command]);
  }
  
  // 路径不变
  getWorkspacePath(hostPath: string): string {
    return hostPath;
  }
}

class DockerExecutor implements Executor {
  // 通过 docker exec 在容器内执行
  async exec(command: string): Promise<ExecResult> {
    spawn("sh", ["-c", `docker exec ${container} sh -c '${command}'`]);
  }
  
  // 路径映射到 /workspace
  getWorkspacePath(_hostPath: string): string {
    return "/workspace";
  }
}
```

---

## 实现详解：组件如何协作

### 完整的消息处理流程

```
用户发送: "@mom 帮我分析这个错误日志"
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. SlackBot 接收消息                                            │
│    • app_mention 事件触发                                        │
│    • 提取纯文本（去掉 @mention）                                  │
│    • 处理附件（下载到 attachments/）                             │
│    • 写入 log.jsonl                                             │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ChannelQueue 入队                                            │
│    • 检查 isRunning() → 拒绝或入队                               │
│    • 串行化处理，避免并发冲突                                     │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. AgentRunner.run() 开始执行                                   │
│    • syncLogToSessionManager() 同步新消息                        │
│    • 构建系统提示（memory + skills + channels + users）          │
│    • 设置上传函数                                                │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. AgentSession.prompt() 发送到 LLM                             │
│    • 组装 messages（历史 + 新消息）                              │
│    • 调用 Anthropic API                                          │
│    • 流式返回事件                                                │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. 事件处理（流式）                                              │
│    • tool_execution_start → 显示 "→ 分析日志"                   │
│    • tool_execution_end → 线程显示工具结果                       │
│    • message_end → 更新主消息                                    │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. 完成                                                          │
│    • 替换消息为最终文本                                           │
│    • 记录 token 使用量                                           │
│    • 清理运行状态                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 关键代码片段

#### 启动流程

```typescript
// src/main.ts - 启动序列

async function main() {
  // 1. 解析命令行参数
  const { workingDir, sandbox } = parseArgs();
  
  // 2. 验证沙箱环境
  await validateSandbox(sandbox);
  
  // 3. 创建 SlackBot
  const bot = new SlackBotClass(handler, {
    appToken: MOM_SLACK_APP_TOKEN,
    botToken: MOM_SLACK_BOT_TOKEN,
    workingDir,
    store: sharedStore,
  });
  
  // 4. 启动事件监听器
  const eventsWatcher = createEventsWatcher(workingDir, bot);
  eventsWatcher.start();
  
  // 5. 连接 Slack
  await bot.start();
}
```

#### 系统提示构建

```typescript
// src/agent.ts - 构建系统提示

function buildSystemPrompt(
  workspacePath: string,
  channelId: string,
  memory: string,        // 从 MEMORY.md 读取
  sandboxConfig: SandboxConfig,
  channels: ChannelInfo[],
  users: UserInfo[],
  skills: Skill[],
): string {
  return `You are mom, a Slack bot assistant. Be concise. No emojis.

## Context
- For current date/time, use: date
- You have access to previous conversation context including tool results.
- For older history beyond your context, search log.jsonl.

## Slack IDs
Channels: ${channels.map(c => `${c.id}\t#${c.name}`).join('\n')}
Users: ${users.map(u => `${u.id}\t@${u.userName}`).join('\n')}

## Environment
${sandboxConfig.type === 'docker' 
  ? 'Running in Docker container. Use apk add to install tools.'
  : 'Running on host. Be careful with system modifications.'}

## Memory
${memory}

## Skills
${formatSkillsForPrompt(skills)}
`;
}
```

#### 工具执行

```typescript
// src/tools/bash.ts - bash 工具实现

export function createBashTool(executor: Executor): Tool {
  return {
    name: "bash",
    description: "Execute shell commands",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
        timeout: { type: "number", description: "Timeout in seconds" },
      },
      required: ["command"],
    },
    execute: async (args, context) => {
      const { command, timeout } = args;
      
      // 通过沙箱执行
      const result = await executor.exec(command, { timeout });
      
      if (result.code !== 0) {
        return { error: result.stderr || `Exit code ${result.code}` };
      }
      
      return { output: result.stdout };
    },
  };
}
```

---

## 使用模式：从基础到高级

### 基础模式：问答与简单任务

```
用户: @mom 这个 JSON 文件有什么问题？
Mom:  [读取文件] → [分析结构] → 指出第 5 行缺少逗号

用户: @mom 帮我格式化这个 JSON
Mom:  [执行 jq] → 返回格式化结果
```

### 中级模式：多步骤工作流

```
用户: @mom 帮我检查这个仓库的测试覆盖率
Mom:  → 安装工具
      → 运行测试
      → 解析覆盖率报告
      → 生成摘要

      工作目录: /workspace/C123ABC/scratch/
      创建文件: coverage-report.md
```

### 高级模式：自定义技能

用户可以让 Mom 创建可复用的技能：

```
用户: @mom 创建一个技能，帮我管理每周会议纪要

Mom:  创建技能文件...

      /workspace/skills/meeting/SKILL.md
      /workspace/skills/meeting/notes.sh
      
      现在你可以：
      - "记录会议：产品评审，决定了X..."
      - "查看本周会议纪要"
```

### 事件驱动模式

```
用户: @mom 每天早上 9 点提醒我检查 Standup

Mom:  创建周期性事件...

      事件文件: /workspace/events/daily-standup.json
      下次触发: 明天 09:00 Asia/Shanghai
```

---

## 最佳实践

### Do's ✓

1. **始终使用 Docker 模式**
   ```bash
   # 正确
   mom --sandbox=docker:mom-sandbox ./data
   
   # 错误（除非在隔离环境）
   mom --sandbox=host ./data
   ```

2. **利用 MEMORY.md 积累知识**
   ```markdown
   # MEMORY.md
   
   ## 编码规范
   - 使用 TypeScript，禁用 any
   - 测试覆盖率 > 80%
   
   ## 常用工具
   - 部署脚本：./scripts/deploy.sh
   - 测试命令：npm run test:coverage
   ```

3. **定期备份 workspace**
   ```bash
   # log.jsonl 是不可替代的历史记录
   tar -czf mom-backup-$(date +%Y%m%d).tar.gz ./data/
   ```

4. **使用专用账号和受限 token**
   - 创建专用的 Slack Bot 用户
   - GitHub token 只授予必要仓库
   - 避免使用个人账号的敏感 token

### Don'ts ✗

1. **不要在公共频道暴露敏感信息**
   ```
   错误: @mom 这是我的 AWS 密钥 AKIA...
   正确: 在 DM 中分享，或使用环境变量
   ```

2. **不要信任外部内容**
   ```
   风险: @mom 克隆 https://unknown-repo.com 并执行 README 中的命令
   
   缓解: 先审查，再执行
   ```

3. **不要忽视上下文窗口限制**
   - 当 context 超过 200k tokens 时会自动压缩
   - 重要信息应写入 MEMORY.md 而非依赖对话历史
   - 使用 grep 搜索 log.jsonl 获取完整历史

4. **不要创建过多周期性事件**
   ```json
   // 错误 - 每分钟检查邮箱，会刷屏
   {"schedule": "* * * * *", "text": "检查新邮件"}
   
   // 正确 - 每 15 分钟检查一次
   {"schedule": "*/15 * * * *", "text": "检查新邮件"}
   ```

---

## 总结

### 核心设计要点

| 组件 | 职责 | 关键设计 |
|------|------|---------|
| SlackBot | Slack 集成 | Socket Mode + 消息队列 |
| AgentRunner | Agent 执行 | 事件驱动 + 会话持久化 |
| Context | 上下文管理 | 双文件策略 + 同步机制 |
| Events | 调度系统 | 文件监听 + Cron |
| Sandbox | 隔离执行 | Docker 容器封装 |
| Store | 数据持久化 | JSONL 格式 + 去重 |

### 关键洞见

1. **双文件策略** 分离了"记录"与"处理"两个关注点
   - `log.jsonl` 是真相源，永不压缩
   - `context.jsonl` 是 LLM 视角，可压缩适应窗口

2. **事件驱动架构** 让 Mom 能主动行动
   - 不只是被动响应，还能定时执行、监听外部信号
   - 通过简单的 JSON 文件实现灵活扩展

3. **Docker 隔离** 是安全基石
   - 保护主机，限制访问范围
   - 但仍需注意容器内的凭证安全

4. **技能系统** 提供可扩展性
   - 用户可以教 Mom 新能力
   - 能力在频道间共享或隔离

---

## 下篇预告

在下一章 **《消息流与状态管理》** 中，我们将深入探讨：

- 消息从 Slack 到 LLM 的完整生命周期
- `log.jsonl` 与 `context.jsonl` 的同步机制详解
- 上下文压缩算法的工作原理
- ChannelQueue 的并发控制策略
- 历史回填（backfill）的实现细节

通过深入理解消息流，你将能够：
- 调试复杂的状态问题
- 优化上下文使用效率
- 实现自定义的压缩策略
- 扩展消息处理流水线