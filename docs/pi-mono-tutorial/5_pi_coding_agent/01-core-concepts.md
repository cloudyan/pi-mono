# Coding Agent 核心概念

> **难度：入门** | **预计阅读时间：20 分钟**

> **注意**：本文档中的代码示例为概念性说明。实际 API 请参考对应源码路径。
> - 核心实现：`packages/coding-agent/src/core/`
> - 工具实现：`packages/coding-agent/src/core/tools/`
> - SDK 入口：`packages/coding-agent/src/core/sdk.ts`
> - Skill 系统：`packages/coding-agent/src/core/skills.ts`
> - 扩展系统：`packages/coding-agent/src/core/extensions/`
> - 系统提示词：`packages/coding-agent/src/core/system-prompt.ts`
> - AgentSession：`packages/coding-agent/src/core/agent-session.ts`

想象一下，你正在开发一个大型项目，需要：
- 理解复杂的代码库结构
- 编写新功能并确保与现有代码兼容
- 调试难以定位的 Bug
- 优化性能瓶颈
- 编写测试用例

传统方式是手动完成这些任务，耗时且容易出错。而 pi-coding-agent 可以像一位资深开发者一样，通过对话帮你完成这些工作。

## 什么是 pi-coding-agent？

pi-coding-agent 是一个**AI 驱动的编码助手**，它在 pi-agent 和 pi-tui 的基础上构建，专为软件开发场景设计。

### 架构依赖

pi-coding-agent 不是从零构建的，它站在 pi-mono 生态的肩膀上：

```
pi-coding-agent (@mariozechner/pi)
    ├── pi-tui (@mariozechner/pi-tui)
    │   ├── pi-agent (@mariozechner/pi-agent-core)
    │   │   └── pi-ai (@mariozechner/pi-ai)
    │   └── pi-ai
    └── 自身核心功能
        ├── 代码工具集 (read/write/edit/bash/grep/find/ls)
        ├── 会话管理 (JSONL 树形结构)
        ├── Skill 系统 (Markdown 技能文件)
        ├── 扩展系统 (Extensions)
        └── 多种运行模式 (interactive/print/JSON/RPC)
```

**分层设计的优势**：

1. **代码复用**：pi-agent 的改进自动惠及 pi-coding-agent
2. **专注单一职责**：pi-agent 专注运行时，pi-coding-agent 专注编码场景
3. **可替换性**：理论上可以替换 pi-tui 为其他 UI 层（如 Web UI）
4. **独立演进**：各层可以独立发展，不影响其他层

### 核心能力

```
┌─────────────────────────────────────────────────────────────────┐
│                    pi-coding-agent 能力矩阵                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔍 代码理解          💻 代码编写          🐛 调试修复          │
│  ├── 读取文件         ├── 创建文件         ├── 分析错误         │
│  ├── 搜索代码         ├── 修改代码         ├── 定位问题         │
│  ├── 分析结构         ├── 重构代码         └── 修复 Bug         │
│  └── 理解依赖         └── 编写测试                              │
│                                                                 │
│  🎨 架构设计          📊 性能优化          📝 文档编写          │
│  ├── 设计方案         ├── 分析性能         ├── 代码注释         │
│  ├── 技术选型         ├── 优化算法         ├── API 文档         │
│  └── 模式应用         └── 内存管理         └── 使用指南         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 与 pi-agent 的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                    应用层 (你的代码)                              │
│              使用 pi-coding-agent 构建 AI IDE、CLI 工具等         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              pi-coding-agent (@mariozechner/pi)                  │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│    │  Agent  │  │  Tools  │  │ Skill/  │  │ Session │          │
│    │ Session │  │ 工具集  │  │ Extension│  │ 管理    │          │
│    └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘          │
└─────────┼────────────┼────────────┼────────────┼───────────────┘
          │            │            │            │
          └────────────┴────────────┴────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              pi-agent (@mariozechner/pi-agent-core)              │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│    │ Agent   │  │AgentLoop│  │AgentTool│  │ 事件系统 │          │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              pi-tui (@mariozechner/pi-tui)                       │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│    │   TUI   │  │Component│  │ Terminal│  │  Keys   │          │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

pi-coding-agent 在 pi-agent 的基础上增加了：
- **丰富的工具集**：read、write、bash、edit、grep、ast-grep 等
- **Skill 系统**：基于 Markdown 的技能文件，用于特定任务的专业指导
- **扩展系统**：JavaScript/TypeScript 扩展，可注册自定义工具和命令
- **多种运行模式**：interactive、headless、oneshot、file、github-pr 等
- **会话管理**：自动保存、恢复、历史记录、分支与压缩
- **系统提示词**：针对编码场景的优化提示

## 核心概念一：Agent Session

Agent Session 是 pi-coding-agent 的核心，管理一次完整的编码任务。

### Session 结构

> [概念性示例] 以下接口展示了 AgentSession 的核心结构，对应真实实现见 `packages/coding-agent/src/core/agent-session.ts`

```typescript
// packages/coding-agent/src/core/agent-session.ts

export class AgentSession {
  // 关联的 Agent 实例
  readonly agent: Agent;
  
  // 会话管理器
  readonly sessionManager: SessionManager;
  
  // 设置管理器
  readonly settingsManager: SettingsManager;
  
  // 当前 Agent 状态
  get state(): AgentState;
  
  // 当前模型
  get model(): Model<any> | undefined;
  
  // 当前思考级别
  get thinkingLevel(): ThinkingLevel;
  
  // 是否正在流式输出
  get isStreaming(): boolean;
  
  // 当前系统提示词
  get systemPrompt(): string;
  
  // 会话 ID
  get sessionId(): string;
  
  // 会话文件名
  get sessionFile(): string | undefined;
  
  // 获取活跃工具名称列表
  getActiveToolNames(): string[];
  
  // 设置活跃工具
  setActiveToolsByName(toolNames: string[]): void;
  
  // 发送提示词给 Agent
  prompt(text: string, options?: PromptOptions): Promise<void>;
  
  // 订阅事件
  subscribe(listener: AgentSessionEventListener): () => void;
  
  // ... 更多方法
}
```

### 创建 Session

> [真实 API] 基于 `packages/coding-agent/src/core/sdk.ts` 中的 `createAgentSession` 函数

```typescript
import { createAgentSession } from "@mariozechner/pi";

// 创建新会话 - 最小化配置
const { session, extensionsResult } = await createAgentSession();

// 使用特定模型
import { getModel } from '@mariozechner/pi-ai';
const { session } = await createAgentSession({
  model: getModel('anthropic', 'claude-opus-4-5'),
  thinkingLevel: 'high',
});

// 指定初始活跃工具
const { session } = await createAgentSession({
  tools: [readTool, bashTool, editTool, writeTool],
});

// 开始对话 - 使用 prompt() 方法
await session.prompt("帮我实现用户登录功能");
```

#### 对应源码

```typescript
// packages/coding-agent/src/core/sdk.ts

export interface CreateAgentSessionOptions {
  /** 工作目录。默认: process.cwd() */
  cwd?: string;
  /** 全局配置目录。默认: ~/.pi/agent */
  agentDir?: string;
  /** 认证存储 */
  authStorage?: AuthStorage;
  /** 模型注册表 */
  modelRegistry?: ModelRegistry;
  /** 使用的模型 */
  model?: Model<any>;
  /** 思考级别 */
  thinkingLevel?: ThinkingLevel;
  /** 可用于切换的模型列表 */
  scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;
  /** 内置工具列表。默认: codingTools [read, bash, edit, write] */
  tools?: Tool[];
  /** 自定义工具 */
  customTools?: ToolDefinition[];
  /** 资源加载器 */
  resourceLoader?: ResourceLoader;
  /** 会话管理器 */
  sessionManager?: SessionManager;
  /** 设置管理器 */
  settingsManager?: SettingsManager;
}

export async function createAgentSession(
  options: CreateAgentSessionOptions = {}
): Promise<CreateAgentSessionResult>
```

## 核心概念二：会话与消息

pi-coding-agent 使用树形结构管理会话历史，支持分支和压缩。

### 会话树结构

```
┌─────────────────────────────────────────────────────────────────┐
│                      会话树 (Conversation Tree)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐                                               │
│   │   根节点     │                                               │
│   │  (System)   │                                               │
│   └──────┬──────┘                                               │
│          │                                                      │
│          ▼                                                      │
│   ┌─────────────┐     ┌─────────────┐                          │
│   │  用户消息 1  │────▶│  用户消息 2  │                          │
│   │  "实现登录"  │     │  "添加验证"  │                          │
│   └──────┬──────┘     └──────┬──────┘                          │
│          │                   │                                  │
│          ▼                   ▼                                  │
│   ┌─────────────┐     ┌─────────────┐                          │
│   │ AI 回复 1   │     │ AI 回复 2   │                          │
│   │  [代码...]  │     │  [代码...]  │                          │
│   └──────┬──────┘     └──────┬──────┘                          │
│          │                   │                                  │
│          │              ┌────┴────┐                             │
│          │              │         │                             │
│          │              ▼         ▼                             │
│          │        ┌────────┐  ┌────────┐                       │
│          │        │分支 2.1│  │分支 2.2│                       │
│          │        │(新方案)│  │(优化版)│                       │
│          │        └────────┘  └────────┘                       │
│          │                                                      │
│          ▼                                                      │
│   ┌─────────────┐                                               │
│   │   压缩节点   │◄──── 自动或手动压缩历史                       │
│   │  (Summary)  │      保留关键信息，释放上下文                  │
│   └─────────────┘                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 消息类型

> [简化示意] AgentSession 支持多种消息类型

```typescript
// 用户消息
interface UserMessage {
  role: "user";
  content: TextContent[] | ImageContent[];
  timestamp: number;
}

// AI 助手消息
interface AssistantMessage {
  role: "assistant";
  content: Array<TextContent | ToolCallContent>;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: { total: number };
  };
  stopReason: "complete" | "tool_calls" | "aborted" | "error";
  timestamp: number;
}

// 工具结果
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  content: TextContent[];
  isError: boolean;
  timestamp: number;
}

// Bash 执行消息 (pi-coding-agent 特有)
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number;
  cancelled: boolean;
  truncated: boolean;
  timestamp: number;
}

// 自定义消息 (扩展使用)
interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;
  content: T;
  display?: unknown;
  details?: unknown;
  timestamp: number;
}
```

### 会话压缩

当上下文窗口接近上限时，pi-coding-agent 可以自动或手动压缩历史消息：

> [真实 API] 基于 `packages/coding-agent/src/core/agent-session.ts`

```typescript
// 手动压缩会话
const result = await session.compact("请重点保留关于数据库设计的讨论");

// result 包含：
// - summary: 压缩后的摘要
// - firstKeptEntryId: 保留的第一个条目的 ID
// - tokensBefore: 压缩前的 token 数量

// 取消正在进行的压缩
session.abortCompaction();

// 是否正在压缩
session.isCompacting; // boolean

// 自动压缩设置
session.setAutoCompactionEnabled(true);
session.autoCompactionEnabled; // boolean
```

### 会话分支与导航

```typescript
// Fork：从指定消息创建新分支
const { selectedText, cancelled } = await session.fork(entryId);

// NavigateTree：导航到会话树的不同节点
const { editorText, cancelled, summaryEntry } = await session.navigateTree(
  targetEntryId,
  {
    summarize: true,      // 是否生成摘要
    customInstructions: "保留 API 设计相关的讨论",
    label: "v2-redesign", // 分支标签
  }
);

// 获取可 fork 的用户消息列表
const userMessages = session.getUserMessagesForForking();
// [{ entryId: "...", text: "实现用户登录功能" }, ...]
```

#### 对应源码

```typescript
// packages/coding-agent/src/core/agent-session.ts

export class AgentSession {
  async compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;
  get isCompacting(): boolean;
  setAutoCompactionEnabled(enabled: boolean): void;
  get autoCompactionEnabled(): boolean;
  
  async fork(entryId: string): Promise<{ selectedText: string; cancelled: boolean }>;
  async navigateTree(
    targetId: string,
    options?: {
      summarize?: boolean;
      customInstructions?: string;
      replaceInstructions?: boolean;
      label?: string;
    }
  ): Promise<{ editorText?: string; cancelled: boolean; aborted?: boolean; summaryEntry?: BranchSummaryEntry }>;
  getUserMessagesForForking(): Array<{ entryId: string; text: string }>;
}
```

### 5.5 分支的典型使用场景

理解何时以及如何使用分支，可以帮助你更高效地利用 pi 的会话管理能力。

#### 场景 1：方案对比（A/B Testing）

**问题**：AI 建议了两个方案（A 和 B），你想分别尝试后再决定。

**解决方案**：
1. 在 AI 给出建议后，创建分支 A
2. 在分支 A 中实施方案 A
3. 回到原会话，创建分支 B
4. 在分支 B 中实施方案 B
5. 对比两个分支的结果，选择最佳方案

```typescript
// [概念性示例]
// 当前在 Entry 5（AI 给出两个方案）
const branchA = await session.fork({ name: "方案 A: 使用 Redux" });
// 在分支 A 中实现 Redux 方案...

// 回到主分支
await session.navigateTree({ entryId: 5 });
const branchB = await session.fork({ name: "方案 B: 使用 Zustand" });
// 在分支 B 中实现 Zustand 方案...
```

#### 场景 2：探索性修改（Safe Experiment）

**问题**：你想尝试一个不确定的修改，担心破坏当前进度。

**解决方案**：
1. 在修改前创建一个分支
2. 在分支中进行实验性修改
3. 如果成功，可以继续在该分支工作；如果失败，丢弃分支即可

```typescript
// [概念性示例]
// 在准备重构前创建检查点分支
const experimentBranch = await session.fork({ name: "重构实验" });

// 放心地进行大幅度重构...
// 如果重构失败，直接切换回原分支，实验分支可以保留或删除
```

#### 场景 3：保存检查点（Checkpoint）

**问题**：在关键决策点前，你想保存当前完整状态。

**解决方案**：
1. 在重要节点创建分支作为检查点
2. 继续在主分支工作
3. 如果需要回滚，可以切换到检查点分支

```typescript
// [概念性示例]
// 在发布前创建发布分支作为检查点
const releaseBranch = await session.fork({ name: "v1.0 发布版本" });

// 继续在主分支开发 v1.1 功能
// 如果 v1.0 有问题，可以随时回到 releaseBranch 查看当时的完整上下文
```

#### 场景 4：多人协作（Collaboration）

**问题**：多人共享一个 pi 会话，每个人需要独立的工作空间。

**解决方案**：
1. 每个人从共享会话创建自己的分支
2. 各自在分支上工作
3. 定期将进展同步到主分支

```typescript
// [概念性示例]
// 团队成员从共享会话创建个人分支
const myBranch = await session.fork({ name: "张三的工作分支" });

// 在分支上独立工作，不影响其他成员
// 完成后将关键信息同步到主分支
```

#### 场景 5：长对话的归档（Archiving）

**问题**：对话太长，想保留历史但减少当前上下文的 Token 使用。

**解决方案**：
1. 在关键点创建分支
2. 在原会话中压缩或清除旧消息
3. 需要时通过导航回到历史分支查看完整记录

```typescript
// [概念性示例]
// 第一阶段完成后创建归档分支
const phase1Branch = await session.fork({ name: "第一阶段完成" });

// 在主会话中压缩第一阶段的历史
await session.compact({ preserveRecent: 3 });

// 继续在轻量化的会话中工作
// 如需查看第一阶段的完整上下文，导航到 phase1Branch
```

#### 最佳实践

1. **有意义的命名**：分支名称要清晰描述分支目的
2. **定期清理**：废弃的分支及时删除，避免混乱
3. **关键节点**：在重要决策点、发布前、重大修改前创建分支
4. **文档化**：复杂项目可以在 AGENTS.md 中记录分支结构

## 核心概念三：Skill 系统

Skill 是 pi-coding-agent 的核心扩展能力之一，遵循 [agentskills.io](https://agentskills.io) 标准。

### 什么是 Skill？

Skill 是一个**Markdown 文件**，包含特定任务的专业指导。与扩展（Extension）不同，Skill 不需要编写代码，只需要编写 Markdown。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Skill 文件结构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Frontmatter (YAML)                                      │   │
│  │  ─────────────────                                       │   │
│  │  name: setup-node-project                                │   │
│  │  description: Initialize a new Node.js project with      │   │
│  │               TypeScript, ESLint, and Prettier           │   │
│  │  disable-model-invocation: false                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Content (Markdown)                                      │   │
│  │  ─────────────────                                       │   │
│  │  当用户要求设置 Node.js 项目时，执行以下步骤：             │   │
│  │                                                          │   │
│  │  1. 检查是否已存在 package.json                          │   │
│  │  2. 运行 `npm init -y` 初始化项目                        │   │
│  │  3. 安装 TypeScript: `npm install -D typescript`         │   │
│  │  4. 创建 tsconfig.json 配置文件                          │   │
│  │  5. 安装 ESLint 和 Prettier                              │   │
│  │                                                          │   │
│  │  注意：如果用户已使用 pnpm 或 yarn，请使用相应命令。       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Skill 发现路径

pi-coding-agent 按以下顺序从多个位置加载 Skill：

```
1. 全局 Skill 目录
   ~/.pi/agent/skills/
   └── SKILL.md                    # 全局 Skill

2. 项目本地 Skill 目录
   <project-root>/.pi/skills/
   ├── setup-node-project/
   │   └── SKILL.md               # setup-node-project Skill
   ├── database-migration/
   │   └── SKILL.md               # database-migration Skill
   └── my-custom/
       └── SKILL.md               # my-custom Skill

3. 命令行指定的 Skill
   pi --skill /path/to/custom-skill.md
```

### Skill 的两种使用方式

#### 1. 自动触发（描述常驻上下文）

默认情况下，所有可见 Skill 的描述会包含在系统提示词中。当用户的任务描述与某个 Skill 匹配时，AI 会自动加载并使用该 Skill。

> [真实 API] Skill 格式化输出，来自 `packages/coding-agent/src/core/skills.ts`

```xml
<!-- 系统提示词中自动包含的 Skill 列表 -->

The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.

<available_skills>
  <skill>
    <name>setup-node-project</name>
    <description>Initialize a new Node.js project with TypeScript, ESLint, and Prettier</description>
    <location>/home/user/.pi/agent/skills/setup-node-project/SKILL.md</location>
  </skill>
  <skill>
    <name>database-migration</name>
    <description>Create and run database migrations using Prisma or TypeORM</description>
    <location>/home/user/project/.pi/skills/database-migration/SKILL.md</location>
  </skill>
</available_skills>
```

#### 2. 手动触发（完整指令按需加载）

用户可以通过 `/skill:name` 命令手动触发 Skill：

```bash
# 手动触发 setup-node-project Skill
/skill:setup-node-project

# 触发时附带额外参数
/skill:setup-node-project --framework=express
```

手动触发时，整个 Skill 文件内容会被加载到上下文中，而不仅仅是描述。

### Skill 规范要求

> [真实 API] 基于 `packages/coding-agent/src/core/skills.ts`

```typescript
export interface Skill {
  /** Skill 名称 (必须符合规范) */
  name: string;
  /** Skill 描述 (必须提供) */
  description: string;
  /** Skill 文件完整路径 */
  filePath: string;
  /** Skill 所在基础目录 */
  baseDir: string;
  /** 来源: "user" | "project" | "path" */
  source: string;
  /** 是否禁用模型自动调用 */
  disableModelInvocation: boolean;
}
```

#### 命名规范

- 最大 64 个字符
- 只能包含小写字母、数字和连字符 `[a-z0-9-]+`
- 不能以连字符开头或结尾
- 不能包含连续连字符 `--`
- 必须与父目录名称匹配

#### 文件结构

```markdown
---
name: my-skill-name              # 可选，默认使用父目录名
description: Skill description   # 必需，最大 1024 字符
disable-model-invocation: false  # 可选，设为 true 则只能通过 /skill:name 手动触发
---

# Skill 内容

这里是详细的 Skill 说明...
```

### Skill 的渐进式披露设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     渐进式披露设计                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐         ┌─────────────────────────┐   │
│  │   常驻上下文         │         │      按需加载            │   │
│  │   (描述信息)         │────────▶│      (完整内容)          │   │
│  ├─────────────────────┤         ├─────────────────────────┤   │
│  │ - name             │         │ - 完整指令              │   │
│  │ - description      │         │ - 详细步骤              │   │
│  │ - filePath         │         │ - 示例代码              │   │
│  │ - location         │         │ - 最佳实践              │   │
│  └─────────────────────┘         └─────────────────────────┘   │
│                                                                 │
│  优势：                                                          │
│  1. 常驻上下文保持精简，不占用 token                            │
│  2. 只有当需要时才加载完整内容                                  │
│  3. AI 可以根据描述判断是否加载特定 Skill                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 对应源码

```typescript
// packages/coding-agent/src/core/skills.ts

export interface LoadSkillsOptions {
  /** 工作目录。默认: process.cwd() */
  cwd?: string;
  /** Agent 配置目录。默认: ~/.pi/agent */
  agentDir?: string;
  /** 显式指定的 Skill 路径 */
  skillPaths?: string[];
  /** 包含默认 Skill 目录。默认: true */
  includeDefaults?: boolean;
}

export interface LoadSkillsResult {
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
}

/** 从所有配置位置加载 Skill */
export function loadSkills(options?: LoadSkillsOptions): LoadSkillsResult;

/** 从单个目录加载 Skill */
export function loadSkillsFromDir(options: LoadSkillsFromDirOptions): LoadSkillsResult;

/** 将 Skill 格式化为提示词内容 (XML 格式) */
export function formatSkillsForPrompt(skills: Skill[]): string;
```

## 核心概念四：工具系统

pi-coding-agent 提供了丰富的工具，让 AI 能够实际操作代码库。

### 工具分类

```
┌─────────────────────────────────────────────────────────────────┐
│                      工具系统分类                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📖 文件操作                      🔍 代码搜索                   │
│  ├── read                         ├── grep                      │
│  ├── write                        ├── find                      │
│  ├── edit                         └── ls                        │
│  └── bash                                                       │
│                                                                 │
│  🛠️ 开发工具                      📊 项目管理                   │
│  ├── git                          └── (扩展可添加更多)          │
│  └── github                                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 工具配置

> [真实 API] 工具通过 `tools` 参数传入，值为 Tool 数组

```typescript
import { createAgentSession, readTool, bashTool, editTool, writeTool, grepTool, findTool, lsTool } from "@mariozechner/pi";

// 配置特定工具
const { session } = await createAgentSession({
  // 使用预定义工具集
  tools: [readTool, bashTool, editTool, writeTool], // codingTools
  
  // 或使用只读工具集
  // tools: [readTool, bashTool, grepTool, findTool, lsTool], // readOnlyTools
  
  // 或使用所有工具
  // tools: allBuiltInTools,
});

// 动态切换活跃工具
session.setActiveToolsByName(["read", "bash", "grep"]);

// 获取当前活跃工具
const activeTools = session.getActiveToolNames();
// ["read", "bash", "grep", "find", "ls"]
```

#### 对应源码

```typescript
// packages/coding-agent/src/core/tools/index.ts

export interface Tool {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (toolCallId: string, args: Static<TSchema>) => Promise<AgentToolResult>;
  onUpdate?: AgentToolUpdateCallback;
}

// 预定义工具
export const readTool: Tool;
export const bashTool: Tool;
export const editTool: Tool;
export const writeTool: Tool;
export const grepTool: Tool;
export const findTool: Tool;
export const lsTool: Tool;

// 预定义工具集
export const codingTools: Tool[];      // [read, bash, edit, write]
export const readOnlyTools: Tool[];    // [read, bash, grep, find, ls]
export const allTools: Record<ToolName, Tool>;
```

### 系统提示词中的工具说明

> [真实 API] 系统提示词自动根据活跃工具生成，来自 `packages/coding-agent/src/core/system-prompt.ts`

```typescript
// packages/coding-agent/src/core/system-prompt.ts

const toolDescriptions: Record<string, string> = {
  read: "Read file contents",
  bash: "Execute bash commands (ls, grep, find, etc.)",
  edit: "Make surgical edits to files (find exact text and replace)",
  write: "Create or overwrite files",
  grep: "Search file contents for patterns (respects .gitignore)",
  find: "Find files by glob pattern (respects .gitignore)",
  ls: "List directory contents",
};

export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  // 根据 selectedTools 构建工具列表
  const tools = selectedTools || ["read", "bash", "edit", "write"];
  // ...
}
```

## 核心概念五：扩展系统

Extension 是 pi-coding-agent 的代码级扩展机制，使用 JavaScript/TypeScript 编写。

### 什么是 Extension？

Extension 是可以注册生命周期事件处理器、自定义工具、斜杠命令等的代码模块。

```
┌─────────────────────────────────────────────────────────────────┐
│                     Extension 能力                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  生命周期事件 │  │  自定义工具  │  │  斜杠命令   │             │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤             │
│  │ session_start│  │ 注册工具    │  │ /mycommand  │             │
│  │ session_end  │  │ 自定义逻辑  │  │             │             │
│  │ agent_start  │  │             │  │             │             │
│  │ agent_end    │  └─────────────┘  └─────────────┘             │
│  │ tool_call    │                                                │
│  │ tool_result  │  ┌─────────────┐  ┌─────────────┐             │
│  │ message_*    │  │  UI 扩展    │  │ 快捷键绑定  │             │
│  │ input        │  ├─────────────┤  ├─────────────┤             │
│  │ context      │  │ 自定义组件  │  │ 键盘快捷键  │             │
│  │ ...          │  │ 主题修改    │  │             │             │
│  └─────────────┘  │ 对话框      │  └─────────────┘             │
│                   └─────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Extension 的注册方式

Extension 通过以下方式注册：

1. **全局 Extension 目录**：`~/.pi/agent/extensions/`
2. **项目本地 Extension**：`<project>/.pi/extensions/`
3. **npm 包**：以 `@pi-agent/extension-` 或 `pi-agent-extension-` 前缀命名的包

### Extension 基本结构

> [概念性示例] Extension 文件结构

```typescript
// my-extension.ts
import type { Extension, ExtensionContext, ExtensionFactory } from "@mariozechner/pi";

const myExtension: ExtensionFactory = (ctx: ExtensionContext): Extension => {
  return {
    // Extension 名称
    name: "my-extension",
    
    // 注册事件处理器
    handlers: {
      // 会话开始
      async session_start() {
        ctx.ui.notify("Extension loaded!", "info");
      },
      
      // Agent 开始思考
      async agent_start() {
        console.log("Agent started");
      },
      
      // Agent 结束思考
      async agent_end({ messages }) {
        console.log("Agent finished", messages.length);
      },
      
      // 工具调用前
      async tool_call({ toolName, toolCallId, input }) {
        console.log(`Tool called: ${toolName}`, input);
      },
      
      // 工具调用后
      async tool_result({ toolName, toolCallId, content, isError }) {
        if (isError) {
          ctx.ui.notify(`Tool ${toolName} failed`, "error");
        }
      },
    },
    
    // 注册自定义工具
    tools: [
      {
        name: "my_custom_tool",
        description: "Execute custom logic",
        parameters: {
          type: "object",
          properties: {
            arg1: { type: "string" },
          },
          required: ["arg1"],
        },
        async execute(toolCallId, args) {
          // 自定义工具逻辑
          return {
            content: [{ type: "text", text: `Processed: ${args.arg1}` }],
            details: { processed: true },
          };
        },
      },
    ],
    
    // 注册斜杠命令
    commands: [
      {
        name: "mycommand",
        description: "Execute my custom command",
        async handler(args, commandCtx) {
          // 可以发送消息到会话
          await commandCtx.sendUserMessage("Hello from my extension!");
        },
      },
    ],
    
    // 注册键盘快捷键 (仅交互模式)
    shortcuts: [
      {
        key: "ctrl+m",
        description: "Toggle my feature",
        handler: () => {
          // 快捷键处理逻辑
        },
      },
    ],
  };
};

export default myExtension;
```

### Extension Context

> [真实 API] 基于 `packages/coding-agent/src/core/extensions/types.ts`

```typescript
export interface ExtensionContext {
  /** UI 方法，用于用户交互 */
  ui: ExtensionUIContext;
  /** UI 是否可用 (print/RPC 模式下为 false) */
  hasUI: boolean;
  /** 当前工作目录 */
  cwd: string;
  /** 会话管理器 (只读) */
  sessionManager: ReadonlySessionManager;
  /** 模型注册表，用于 API 密钥解析 */
  modelRegistry: ModelRegistry;
  /** 当前模型 (可能未定义) */
  model: Model<any> | undefined;
  /** Agent 是否空闲 (非流式) */
  isIdle(): boolean;
  /** 中止当前 Agent 操作 */
  abort(): void;
  /** 是否有排队的消息 */
  hasPendingMessages(): boolean;
  /** 优雅关闭 pi 并退出 */
  shutdown(): void;
  /** 获取当前上下文的 token 使用情况 */
  getContextUsage(): ContextUsage | undefined;
  /** 触发压缩 */
  compact(options?: CompactOptions): void;
  /** 获取当前有效的系统提示词 */
  getSystemPrompt(): string;
}

export interface ExtensionCommandContext extends ExtensionContext {
  /** 等待 Agent 完成流式输出 */
  waitForIdle(): Promise<void>;
  /** 开始新会话 */
  newSession(options?: { parentSession?: string; setup?: Function }): Promise<boolean>;
  /** 切换到其他会话 */
  switchSession(sessionPath: string): Promise<boolean>;
  /** 发送消息 */
  sendMessage<T>(message: CustomMessage<T>, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }): Promise<void>;
  /** 发送用户消息 */
  sendUserMessage(content: string | ContentArray, options?: { deliverAs?: "steer" | "followUp" }): Promise<void>;
  /** 获取活跃工具 */
  getActiveTools(): string[];
  /** 获取所有工具 */
  getAllTools(): ToolInfo[];
  /** 设置活跃工具 */
  setActiveTools(toolNames: string[]): void;
  /** 刷新工具 */
  refreshTools(): void;
  /** 获取所有命令 */
  getCommands(): SlashCommandInfo[];
  /** 设置模型 */
  setModel(model: Model<any>): Promise<boolean>;
  /** 获取思考级别 */
  getThinkingLevel(): ThinkingLevel;
  /** 设置思考级别 */
  setThinkingLevel(level: ThinkingLevel): void;
  /** 获取系统提示词 */
  getSystemPrompt(): string;
}
```

### Extension 生命周期事件

> [真实 API] 可用的事件类型

```typescript
// Session 事件
session_start       // 会话开始
session_end         // 会话结束
session_shutdown    // 会话关闭
session_switch      // 切换会话
session_fork        // Fork 会话
session_tree        // 导航会话树
session_compact     // 压缩会话
session_before_switch // 切换前 (可取消)
session_before_fork   // Fork 前 (可取消)
session_before_tree   // 导航前 (可取消)
session_before_compact // 压缩前 (可取消)

// Agent 事件
agent_start         // Agent 开始
agent_end           // Agent 结束
before_agent_start  // Agent 开始前

// Turn 事件
turn_start          // 一轮开始
turn_end            // 一轮结束

// 消息事件
message_start       // 消息开始
message_end         // 消息结束
message_update      // 消息更新

// 工具事件
tool_call           // 工具调用前
tool_result         // 工具结果后
tool_execution_start  // 工具执行开始
tool_execution_end    // 工具执行结束
tool_execution_update // 工具执行更新

// 输入事件
input               // 用户输入

// 上下文事件
context             // 上下文转换
before_provider_request // 请求提供商前

// Bash 事件
user_bash           // 用户执行 bash
```

#### 对应源码

```typescript
// packages/coding-agent/src/core/extensions/index.ts

export { createExtensionRuntime, discoverAndLoadExtensions, loadExtensionFromFactory, loadExtensions } from "./loader.js";
export { ExtensionRunner } from "./runner.js";
export type {
  Extension,
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  ExtensionCommandContext,
  ExtensionUIContext,
  ToolDefinition,
  // ... 更多类型
} from "./types.js";
```

## 核心概念六：运行模式

pi-coding-agent 支持多种运行模式，适应不同场景。

### 模式对比

| 模式 | 用途 | 交互方式 | 适用场景 |
|------|------|---------|---------|
| **interactive** | 交互式对话 | TUI 界面 | 日常开发、探索性任务 |
| **headless** | 无头模式 | API/CLI | 自动化脚本、CI/CD |
| **oneshot** | 单次任务 | 命令行参数 | 快速执行单个任务 |
| **file** | 文件模式 | 读取文件输入 | 批量处理、脚本执行 |
| **github-pr** | PR 模式 | GitHub API | 代码审查、PR 评论 |

### Interactive 模式

```bash
# 启动交互式会话
pi

# 或指定会话名称
pi --session feature-login
```

交互式界面：

```
┌─────────────────────────────────────────────────────────────────┐
│  pi-coding-agent  v1.0.0                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  You: 帮我实现用户登录功能                                      │
│                                                                 │
│  AI: 我来帮你实现用户登录功能。首先让我了解一下项目结构。       │
│                                                                 │
│      [read] packages/web-ui/src                                │
│      [read] packages/web-ui/src/pages                          │
│                                                                 │
│      我看到这是一个 Next.js 项目。我建议在                          │
│      packages/web-ui/src/app/login 目录下创建登录页面。          │
│                                                                 │
│      [write] packages/web-ui/src/app/login/page.tsx            │
│                                                                 │
│      已创建登录页面，包含：                                      │
│      - 邮箱/密码表单                                           │
│      - 表单验证                                                │
│      - 错误处理                                                │
│      - 登录状态管理                                            │
│                                                                 │
│  > [输入框]                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Headless 模式

```bash
# 无头模式执行命令
pi --mode headless --prompt "修复所有 TypeScript 错误"

# 输出 JSON 结果
pi --mode headless --prompt "分析代码质量" --output json
```

### Oneshot 模式

```bash
# 单次任务
pi --mode oneshot --prompt "生成 CHANGELOG.md"

# 从文件读取
pi --mode file --input task.md
```

## 核心概念七：系统提示词

系统提示词定义了 AI 的行为和能力。

### 默认系统提示词

> [真实 API] 基于 `packages/coding-agent/src/core/system-prompt.ts` 中的 `buildSystemPrompt()`

```typescript
// packages/coding-agent/src/core/system-prompt.ts

export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const {
    customPrompt,      // 自定义系统提示词 (替换默认)
    selectedTools,     // 要包含的工具，默认: [read, bash, edit, write]
    toolSnippets,      // 工具单行说明
    promptGuidelines,  // 额外指导原则
    appendSystemPrompt,// 追加到系统提示词的文本
    cwd,               // 工作目录
    contextFiles,      // 预加载的上下文文件
    skills,            // 预加载的 Skills
  } = options;
  
  // 返回构建的系统提示词字符串
}
```

默认系统提示词包含：
1. **角色定义**：专业的软件开发工程师
2. **可用工具列表**：read, bash, edit, write, grep, find, ls
3. **指导原则**：根据可用工具动态生成
4. **Skill 列表**：如果配置了 Skill
5. **项目上下文**：如果配置了上下文文件
6. **当前日期和工作目录**

### 指导原则生成

> [真实 API] 基于 `packages/coding-agent/src/core/system-prompt.ts`

```typescript
// 根据可用工具动态生成的指导原则

const guidelines: string[] = [];

// 文件探索指导
if (hasBash && !hasGrep && !hasFind && !hasLs) {
  guidelines.push("Use bash for file operations like ls, rg, find");
} else if (hasBash && (hasGrep || hasFind || hasLs)) {
  guidelines.push("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
}

// 编辑前读取指导
if (hasRead && hasEdit) {
  guidelines.push("Use read to examine files before editing. You must use this tool instead of cat or sed.");
}

// 精确编辑指导
if (hasEdit) {
  guidelines.push("Use edit for precise changes (old text must match exactly)");
}

// 写入指导
if (hasWrite) {
  guidelines.push("Use write only for new files or complete rewrites");
}

// 输出指导
if (hasEdit || hasWrite) {
  guidelines.push("When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did");
}

// 始终包含
 guidelines.push("Be concise in your responses");
guidelines.push("Show file paths clearly when working with files");
```

### 自定义系统提示词

> [简化示意] 通过资源加载器配置自定义提示词

```typescript
// 在项目根目录创建 .pi/system-prompt.md
// 内容将自动加载并作为自定义系统提示词

---
你是一个前端开发专家，专注于 React 和 TypeScript。

你的职责：
1. 编写类型安全的 React 组件
2. 优化组件性能
3. 确保可访问性
4. 编写 Storybook 文档

代码风格：
- 使用函数组件和 Hooks
- Props 使用解构赋值
- 事件处理函数使用 useCallback
- 复杂逻辑提取为自定义 Hook
---
```

## 核心概念八：会话持久化

会话可以自动保存和恢复。

### 自动保存

> [推荐实践] 会话自动保存是 pi-coding-agent 的内置功能

```typescript
// packages/coding-agent/src/core/session-manager.ts

// SessionManager 自动将会话保存到 JSONL 文件
// 位置: ~/.pi/agent/sessions/<session-id>.jsonl

// 会话文件格式 (JSONL - 每行一个 JSON 对象)
// {"type": "header", "version": "2.0", "sessionId": "...", "createdAt": "..."}
// {"type": "message", "message": {...}, "id": "...", "parentId": null}
// {"type": "message", "message": {...}, "id": "...", "parentId": "..."}
// {"type": "compaction", "summary": "...", "id": "...", "parentId": "..."}
// ...
```

### 会话管理

```bash
# 列出所有会话
pi --list-sessions

# 恢复会话
pi --session feature-login

# 删除会话
pi --delete-session feature-login
```

### 会话状态访问

> [真实 API] 基于 `packages/coding-agent/src/core/agent-session.ts`

```typescript
// 访问会话状态属性
const currentModel = session.model;
const currentState = session.state;
const isStreaming = session.isStreaming;
const thinkingLevel = session.thinkingLevel;
const systemPrompt = session.systemPrompt;
const sessionId = session.sessionId;
const sessionFile = session.sessionFile;

// 获取会话统计
const stats = session.getSessionStats();
// {
//   sessionFile: string | undefined,
//   sessionId: string,
//   userMessages: number,
//   assistantMessages: number,
//   toolCalls: number,
//   toolResults: number,
//   totalMessages: number,
//   tokens: { input, output, cacheRead, cacheWrite, total },
//   cost: number
// }

// 订阅状态变化
const unsubscribe = session.subscribe((event) => {
  switch (event.type) {
    case "message_start":
      console.log("消息开始:", event.message.role);
      break;
    case "message_end":
      console.log("消息结束");
      break;
    case "agent_start":
      console.log("Agent 开始");
      break;
    case "agent_end":
      console.log("Agent 结束");
      break;
    case "tool_execution_start":
      console.log("工具执行开始:", event.toolName);
      break;
    case "tool_execution_end":
      console.log("工具执行结束:", event.toolName, "错误?", event.isError);
      break;
    case "auto_compaction_start":
      console.log("自动压缩开始:", event.reason);
      break;
    case "auto_compaction_end":
      console.log("自动压缩结束:", event.result);
      break;
    // ... 更多事件类型
  }
});

// 取消订阅
unsubscribe();
```

#### 对应源码

```typescript
// packages/coding-agent/src/core/agent-session.ts

export class AgentSession {
  // 属性访问
  get state(): AgentState;
  get model(): Model<any> | undefined;
  get thinkingLevel(): ThinkingLevel;
  get isStreaming(): boolean;
  get systemPrompt(): string;
  get sessionId(): string;
  get sessionFile(): string | undefined;
  get sessionName(): string | undefined;
  get messages(): AgentMessage[];
  
  // 统计和状态
  getSessionStats(): SessionStats;
  getContextUsage(): ContextUsage | undefined;
  get isCompacting(): boolean;
  get isRetrying(): boolean;
  
  // 事件订阅
  subscribe(listener: AgentSessionEventListener): () => void;
}
```

## 快速开始

### 安装

```bash
npm install -g @mariozechner/pi
```

### 基础使用

```bash
# 启动交互式会话
pi

# 执行单次任务
pi --prompt "修复所有 ESLint 错误"

# 从文件读取任务
pi --file task.md

# 使用特定模型
pi --model anthropic:claude-sonnet-4-20250514
```

### 编程使用

> [真实 API] 基于 `packages/coding-agent/src/core/sdk.ts`

```typescript
import { createAgentSession } from "@mariozechner/pi";

async function main() {
  const { session, extensionsResult } = await createAgentSession({
    // 可选配置
  });

  // 订阅事件
  session.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "assistant") {
      console.log("AI 回复:", event.message);
    }
  });

  // 发送提示
  await session.prompt("帮我优化这段代码");
  
  // 获取会话统计
  const stats = session.getSessionStats();
  console.log(`使用了 ${stats.tokens.total} tokens, 花费 $${stats.cost.toFixed(4)}`);
}

main();
```

## 总结

pi-coding-agent 的核心概念：

1. **Agent Session**：管理一次完整的编码任务，包含状态、工具、历史、分支和压缩
2. **会话与消息**：树形结构管理会话，支持分支、导航和压缩
3. **Skill 系统**：基于 Markdown 的技能文件，用于特定任务的专业指导，支持自动触发和手动触发
4. **工具系统**：丰富的工具让 AI 能够实际操作代码库，动态配置活跃工具
5. **扩展系统**：JavaScript/TypeScript 代码扩展，可注册事件处理器、自定义工具、命令和 UI
6. **运行模式**：interactive、headless、oneshot、file、github-pr 等多种模式
7. **系统提示词**：动态构建，根据活跃工具和 Skill 生成指导原则
8. **会话持久化**：自动保存和恢复会话状态，支持事件订阅

---

**下篇预告**: [02-architecture.md](02-architecture.md) —— 深入理解 pi-coding-agent 的架构设计，包括各运行模式的实现、工具系统的架构、会话管理的机制等。
