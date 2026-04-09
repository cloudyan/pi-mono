# 架构设计与运行模式

> **难度：进阶** | **预计阅读时间：25 分钟**

> **注意**：本文档中的代码示例为概念性说明。实际 API 请参考对应源码路径。
> - CLI 参数解析：`packages/coding-agent/src/cli/args.ts`
> - 模式实现：`packages/coding-agent/src/modes/`
> - 会话管理：`packages/coding-agent/src/core/agent-session.ts`

上一章我们了解了 pi-coding-agent 的核心概念。本章将深入架构设计，理解各种运行模式的实现原理。

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    pi-coding-agent 架构                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      CLI 入口                            │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │  args   │  │  env    │  │  config │  │  parse  │  │   │
│  │  │ 解析    │  │ 变量    │  │ 文件    │  │ 执行    │  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  │       └────────────┴────────────┴────────────┘        │   │
│  │                          │                              │   │
│  └──────────────────────────┼──────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      运行模式层                          │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │   │
│  │  │interac- │  │ print   │  │   rpc   │                 │   │
│  │  │tive     │  │  mode   │  │  mode   │                 │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘                 │   │
│  │       └────────────┴────────────┘                        │   │
│  │                          │                              │   │
│  └──────────────────────────┼──────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      核心层                              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ Agent   │  │  Tools  │  │ Session │  │ System  │  │   │
│  │  │ Session │  │ 工具集  │  │ Manager │  │ Prompt  │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## CLI 入口

### 参数解析

CLI 参数定义在 `packages/coding-agent/src/cli/args.ts`：

```typescript
export type Mode = "text" | "json" | "rpc";

export interface Args {
  provider?: string;              // 模型提供商
  model?: string;                 // 模型 ID 或模式
  apiKey?: string;                // API 密钥
  systemPrompt?: string;          // 系统提示词
  appendSystemPrompt?: string;    // 追加的系统提示词
  thinking?: ThinkingLevel;       // 思考级别
  continue?: boolean;             // 继续上一个会话
  resume?: boolean;               // 选择会话恢复
  help?: boolean;                 // 显示帮助
  version?: boolean;              // 显示版本
  mode?: Mode;                    // 输出模式: text/json/rpc
  noSession?: boolean;            // 不保存会话
  session?: string;               // 指定会话文件
  fork?: string;                  // Fork 会话
  sessionDir?: string;            // 会话存储目录
  models?: string[];              // 模型列表（用于 Ctrl+P 循环）
  tools?: ToolName[];             // 启用的工具列表
  noTools?: boolean;              // 禁用所有工具
  extensions?: string[];          // 扩展路径
  noExtensions?: boolean;         // 禁用扩展
  print?: boolean;                // 非交互模式
  export?: string;                // 导出会话到 HTML
  noSkills?: boolean;             // 禁用 Skills
  skills?: string[];              // 加载的 Skills
  promptTemplates?: string[];     // 提示词模板
  noPromptTemplates?: boolean;    // 禁用提示词模板
  themes?: string[];              // 主题
  noThemes?: boolean;             // 禁用主题
  listModels?: string | true;     // 列出可用模型
  offline?: boolean;              // 离线模式
  verbose?: boolean;              // 详细输出
  messages: string[];             // 消息参数
  fileArgs: string[];             // 文件参数（@前缀）
  unknownFlags: Map<string, boolean | string>; // 扩展注册的未知参数
}
```

### 参数分类

| 分类 | 参数 | 说明 |
|------|------|------|
| **通用参数** | `--provider`, `--model`, `--api-key` | 模型和认证配置 |
| | `--system-prompt`, `--append-system-prompt` | 系统提示词 |
| | `--thinking` | 思考级别 (off/minimal/low/medium/high/xhigh) |
| | `--session`, `--session-dir`, `--no-session` | 会话管理 |
| | `--continue`, `--resume`, `--fork` | 会话恢复和分支 |
| **模式特定** | `--print`, `-p` | 打印模式（非交互） |
| | `--mode text/json/rpc` | 输出格式 |
| | `--models` | 限制模型循环范围 |
| **资源配置** | `--tools`, `--no-tools` | 工具控制 |
| | `--extension`, `--no-extensions` | 扩展管理 |
| | `--skill`, `--no-skills` | Skill 管理 |
| | `--prompt-template`, `--no-prompt-templates` | 提示词模板 |
| | `--theme`, `--no-themes` | 主题管理 |
| **其他** | `--export` | 导出会话 |
| | `--list-models` | 列出模型 |
| | `--offline`, `--verbose` | 运行选项 |

### 使用示例

```bash
# 交互模式（默认）
pi

# 打印模式 - 非交互执行
pi -p "List all .ts files in src/"

# JSON 模式输出
pi --mode json "What files are in the project?"

# RPC 模式
pi --mode rpc

# 继续上一个会话
pi --continue

# 指定模型
pi --model claude-sonnet "Help me refactor"

# 限制工具
pi --tools read,grep,find -p "Review the code"
```

## 会话管理架构

**对应源码**：`packages/coding-agent/src/core/session-manager.ts`

会话管理器负责持久化存储对话历史，支持树形结构和分支功能。

### 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                      会话管理架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SessionManager                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │ SessionHeader│  │ SessionEntry│  │   LeafId    │     │   │
│  │  │  (会话头)   │  │  (条目列表) │  │ (当前叶子)  │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  │                                                          │   │
│  │  功能：                                                   │   │
│  │  - 创建/恢复/分支会话                                      │   │
│  │  - 树形结构遍历 (getTree/getBranch)                       │   │
│  │  - 构建 LLM 上下文 (buildSessionContext)                  │   │
│  │  - 压缩和摘要 (compaction/branchSummary)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    AgentSession                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │    Agent    │  │SessionManager│  │ExtensionRunner│    │   │
│  │  │  (核心代理) │  │ (会话管理)  │  │  (扩展系统) │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  │                                                          │   │
│  │  功能：                                                   │   │
│  │  - 消息发送和接收 (prompt/sendUserMessage)                │   │
│  │  - 工具调用管理                                           │   │
│  │  - 模型切换 (cycleModel/setModel)                         │   │
│  │  - 自动压缩和重试                                         │   │
│  │  - 扩展事件订阅                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 会话条目类型

| 条目类型 | 说明 |
|----------|------|
| `message` | 用户/助手消息 |
| `thinking_level_change` | 思考级别变更 |
| `model_change` | 模型切换 |
| `compaction` | 会话压缩摘要 |
| `branch_summary` | 分支摘要 |
| `custom` | 扩展自定义数据 |
| `custom_message` | 扩展自定义消息（参与 LLM 上下文） |
| `label` | 用户定义标签 |
| `session_info` | 会话元数据（名称等） |

### 树形结构和分支

会话采用树形结构存储，支持分支：

```
Entry 1 (parentId: null)
  └── Entry 2 (parentId: Entry1)
        ├── Entry 3 (parentId: Entry2)  ← 分支 A
        │     └── Entry 4 (parentId: Entry3)
        └── Entry 5 (parentId: Entry2)  ← 分支 B
              └── Entry 6 (parentId: Entry5)
```

- **Leaf ID**：指向当前活动条目
- **Branch**：从当前叶子回溯到根的路径
- **Fork**：创建新的会话分支
- **Navigate**：在树中导航到指定条目

## 运行模式详解

### 1. Interactive Mode（交互模式）

**对应源码**：`packages/coding-agent/src/modes/interactive/interactive-mode.ts`

交互模式是默认模式，提供 TUI 界面进行交互式对话。

#### 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Interactive 模式架构                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      TUI 界面                            │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  消息列表                                        │   │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │   │
│  │  │  │ User    │  │ AI      │  │ Tool    │         │   │   │
│  │  │  │ Message │  │ Message │  │ Result  │         │   │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘         │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  输入框                                          │   │   │
│  │  │  > [输入...]                           [Send]   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      Agent Session                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ Agent   │  │  Tools  │  │ History │  │ Context │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 使用场景

```bash
# 启动交互模式（默认）
pi

# 带初始消息的交互模式
pi "List all .ts files"

# 包含文件的初始消息
pi @prompt.md @image.png "What color is the sky?"

# 多消息交互
pi "Read package.json" "What dependencies do we have?"
```

### 2. Print Mode（打印模式）

**对应源码**：`packages/coding-agent/src/modes/print-mode.ts`

Print 模式是非交互模式，处理提示后输出结果并退出。使用 `--print` 或 `-p` 标志启用。

#### 使用场景

```bash
# 代码审查
pi -p "审查 src/ 目录的代码质量"

# 自动修复
pi -p "修复所有 TypeScript 错误"

# 生成文档
pi -p "为 src/utils.ts 生成 JSDoc 注释"

# 文件处理
pi -p "Read package.json and list dependencies"
```

#### 模式选项

| 选项 | 说明 |
|------|------|
| `--mode text` | 仅输出最终响应文本（默认） |
| `--mode json` | 输出所有事件为 JSON 流 |

### 3. RPC Mode（RPC 模式）

**对应源码**：`packages/coding-agent/src/modes/rpc/rpc-mode.ts`

RPC 模式使用 `--rpc` 标志启用，通过 JSON-RPC 协议与外部应用通信。

#### 协议说明

- **输入**：stdin 接收 JSON 命令
- **输出**：stdout 输出 JSON 响应和事件
- **扩展 UI**：通过 `extension_ui_request` 请求客户端响应

#### 命令类型

| 命令 | 说明 |
|------|------|
| `prompt` | 发送消息 |
| `abort` | 中止当前操作 |
| `get_state` | 获取会话状态 |
| `get_tree` | 获取会话树 |
| `branch` | 创建分支 |
| `export` | 导出会话 |
| `shutdown` | 关闭 RPC 服务 |

#### 使用场景

```bash
# 启动 RPC 模式
pi --rpc

# RPC 客户端示例
# {"type": "prompt", "id": "1", "text": "Hello"}
# {"type": "response", "command": "prompt", "success": true}
```

## 模式选择指南

```
┌─────────────────────────────────────────────────────────────────┐
│                      模式选择决策树                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  需要交互式对话？                                                │
│       │                                                         │
│       ├── 是 → Interactive 模式                                  │
│       │   pi                                                    │
│       │                                                         │
│       └── 否 → 需要机器可读输出？                                │
│              │                                                  │
│              ├── 是 → 需要双向通信？                             │
│              │       │                                          │
│              │       ├── 是 → RPC 模式                           │
│              │       │   pi --rpc                                │
│              │       │                                          │
│              │       └── 否 → Print + JSON 模式                  │
│              │           pi -p --mode json "query"               │
│              │                                                  │
│              └── 否 → Print 模式                                 │
│                  pi -p "task"                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 资源加载架构

**对应源码**：`packages/coding-agent/src/core/resource-loader.ts`

ResourceLoader 负责统一加载 Skill、Extension、Theme 等资源。

### 加载优先级

资源按以下优先级加载（后加载的覆盖先加载的）：

```
1. 包目录默认资源
   └── <package>/skills, <package>/extensions, ...

2. 全局目录资源
   └── ~/.pi/agent/skills, ~/.pi/agent/extensions, ...

3. 项目目录资源
   └── <project>/.pi/skills, <project>/.pi/extensions, ...

4. CLI 参数指定
   └── --skill <path>, --extension <path>, ...
```

### 资源类型

| 资源类型 | 加载路径 | CLI 参数 |
|----------|----------|----------|
| **Extensions** | `extensions/` | `--extension`, `--no-extensions` |
| **Skills** | `skills/` | `--skill`, `--no-skills` |
| **Prompt Templates** | `prompts/` | `--prompt-template`, `--no-prompt-templates` |
| **Themes** | `themes/` | `--theme`, `--no-themes` |
| **Context Files** | `AGENTS.md`, `CLAUDE.md` | 自动发现 |
| **System Prompt** | `SYSTEM.md` | `--system-prompt` |

### ResourceLoader 接口

```typescript
export interface ResourceLoader {
  getExtensions(): LoadExtensionsResult;           // 获取扩展
  getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] };
  getPrompts(): { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] };
  getThemes(): { themes: Theme[]; diagnostics: ResourceDiagnostic[] };
  getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> };
  getSystemPrompt(): string | undefined;            // 系统提示词
  getAppendSystemPrompt(): string[];                // 追加的系统提示词
  getPathMetadata(): Map<string, PathMetadata>;     // 路径元数据
  extendResources(paths: ResourceExtensionPaths): void; // 动态扩展
  reload(): Promise<void>;                          // 热重载
}
```

### 热重载机制

- 调用 `reload()` 重新扫描所有资源路径
- 合并新的资源到当前加载器
- 保持已加载资源的引用完整性

## 扩展系统

**对应源码**：`packages/coding-agent/src/core/extensions/`

扩展系统允许第三方代码扩展 pi-coding-agent 的功能。

### 扩展能力

扩展可以提供以下资源类型：

| 能力 | 说明 |
|------|------|
| **Tools** | 注册 LLM 可调用的工具 |
| **Commands** | 注册 `/command` 斜杠命令 |
| **Shortcuts** | 注册键盘快捷键 |
| **Flags** | 注册 CLI 参数 |
| **Event Handlers** | 订阅生命周期事件 |
| **Session Store** | 自定义会话存储后端 |

### 事件类型

| 事件类别 | 事件 | 说明 |
|----------|------|------|
| **Agent** | `agent_start`, `agent_end` | 代理生命周期 |
| **Turn** | `turn_start`, `turn_end` | 对话轮次 |
| **Message** | `message_start`, `message_update`, `message_end` | 消息事件 |
| **Tool** | `tool_execution_start`, `tool_execution_update`, `tool_execution_end` | 工具执行 |
| **Session** | `session_before_switch`, `session_switch`, `session_before_fork`, `session_fork` | 会话操作 |
| **Input** | `input` | 用户输入拦截 |

### 扩展生命周期

```
1. 发现阶段
   └── 扫描 extensions/ 目录和 CLI 参数

2. 加载阶段
   └── 导入扩展模块，创建 Extension 实例

3. 初始化阶段
   └── 调用 extension.init(ctx)，注册工具/命令/事件

4. 运行阶段
   └── 触发事件，执行命令，调用工具

5. 卸载阶段
   └── 清理资源，移除监听器
```

## 运行流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      通用运行流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 解析参数                                                     │
│     └── cli/args.ts: parseArgs()                                │
│                                                                 │
│  2. 加载资源                                                     │
│     └── ResourceLoader.reload()                                 │
│         - 加载 Extensions, Skills, Prompts, Themes              │
│         - 加载 AGENTS.md/CLAUDE.md 上下文文件                    │
│                                                                 │
│  3. 确定运行模式                                                 │
│     └── --print → Print Mode                                    │
│     └── --rpc → RPC Mode                                        │
│     └── 默认 → Interactive Mode                                 │
│                                                                 │
│  4. 创建 AgentSession                                            │
│     └── core/agent-session.ts: AgentSession                     │
│         - 初始化 Agent 核心                                      │
│         - 绑定 SessionManager                                   │
│         - 加载工具集                                             │
│                                                                 │
│  5. 执行主逻辑                                                   │
│     └── 各模式特定的初始化                                       │
│     └── 启动事件循环                                             │
│                                                                 │
│  6. 清理资源                                                     │
│     └── 保存会话、关闭连接                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 最佳实践

### ✅ 应该做的

1. **选择合适的模式**
   ```bash
   # 日常开发 - 使用 interactive
   pi

   # CI/CD - 使用 print 模式
   pi -p "检查代码"

   # 脚本集成 - 使用 RPC 模式
   pi --rpc
   ```

2. **配置默认工具**
   ```bash
   # 只读模式（安全审查）
   pi --tools read,grep,find,ls -p "Review the code"
   ```

3. **使用会话管理**
   ```bash
   # 命名会话便于恢复
   pi --session feature-login

   # 继续上一个会话
   pi --continue

   # Fork 会话创建分支
   pi --fork <session-path>
   ```

### ❌ 避免的错误

1. **在 CI 中使用 interactive 模式**
   ```bash
   # ❌ 错误：CI 会卡住
   pi "检查代码"

   # ✅ 正确：使用 print 模式
   pi -p "检查代码"
   ```

2. **忘记保存重要会话**
   ```bash
   # ❌ 错误：不保存会话
   pi --no-session

   # ✅ 正确：使用有意义的会话名
   pi --session refactor-auth
   ```

3. **混淆 mode 参数**
   ```bash
   # ❌ 错误：mode 是输出格式，不是运行模式
   pi --mode headless

   # ✅ 正确：print 模式 + json 输出格式
   pi -p --mode json "query"
   ```

## 总结

架构设计与运行模式的核心要点：

1. **CLI 入口**：参数解析、资源加载、模式分发
2. **运行模式**：
   - **Interactive 模式**：TUI 界面，适合日常开发
   - **Print 模式**：非交互执行，适合脚本和 CI/CD
   - **RPC 模式**：JSON-RPC 协议，适合应用集成
3. **会话管理**：树形结构，支持分支和压缩
4. **资源加载**：统一加载 Skills、Extensions、Themes 等
5. **扩展系统**：事件驱动，支持工具、命令、快捷键扩展

---

**下篇预告**: [03-tools.md](03-tools.md) —— 深入工具系统，包括 read、write、edit、bash、grep、ast-grep、lsp 等工具的实现原理和最佳实践。
