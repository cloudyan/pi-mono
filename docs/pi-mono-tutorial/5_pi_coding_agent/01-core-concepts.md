# Coding Agent 核心概念

> **难度：入门** | **预计阅读时间：20 分钟**

想象一下，你正在开发一个大型项目，需要：
- 理解复杂的代码库结构
- 编写新功能并确保与现有代码兼容
- 调试难以定位的 Bug
- 优化性能瓶颈
- 编写测试用例

传统方式是手动完成这些任务，耗时且容易出错。而 pi-coding-agent 可以像一位资深开发者一样，通过对话帮你完成这些工作。

## 什么是 pi-coding-agent？

pi-coding-agent 是一个**AI 驱动的编码助手**，它在 pi-agent 和 pi-tui 的基础上构建，专为软件开发场景设计。

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
│    │  Agent  │  │  Tools  │  │  Modes  │  │ Session │          │
│    │ Session │  │ 工具集  │  │ 运行模式│  │ 管理    │          │
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
- **多种运行模式**：interactive、headless、oneshot、file、github-pr 等
- **会话管理**：自动保存、恢复、历史记录
- **系统提示词**：针对编码场景的优化提示

## 核心概念一：Agent Session

Agent Session 是 pi-coding-agent 的核心，管理一次完整的编码任务。

### Session 结构

```typescript
// packages/coding-agent/src/core/agent-session.ts

export interface AgentSession {
  // 唯一标识
  id: string;
  
  // 会话名称
  name: string;
  
  // 关联的 Agent 实例
  agent: Agent;
  
  // 会话状态
  state: SessionState;
  
  // 工具配置
  tools: ToolConfig;
  
  // 会话历史
  history: SessionHistory;
  
  // 持久化路径
  storagePath?: string;
}

export interface SessionState {
  // 当前阶段
  phase: "idle" | "thinking" | "acting" | "waiting";
  
  // 上下文信息
  context: {
    currentFile?: string;
    selectedFiles?: string[];
    gitBranch?: string;
  };
  
  // 统计信息
  stats: {
    messageCount: number;
    toolCallCount: number;
    tokenCount: number;
  };
}
```

### 创建 Session

```typescript
import { createAgentSession } from "@mariozechner/pi";

// 创建新会话
const session = await createAgentSession({
  name: "feature-login",
  systemPrompt: "你是一个全栈开发工程师...",
  model: getModel("anthropic", "claude-sonnet-4-20250514"),
  tools: {
    read: true,
    write: true,
    bash: true,
    edit: true,
  },
});

// 开始对话
await session.sendMessage("帮我实现用户登录功能");
```

## 核心概念二：工具系统

pi-coding-agent 提供了丰富的工具，让 AI 能够实际操作代码库。

### 工具分类

```
┌─────────────────────────────────────────────────────────────────┐
│                      工具系统分类                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📖 文件操作                      🔍 代码搜索                   │
│  ├── read                         ├── grep                      │
│  ├── write                        ├── ast-grep                  │
│  ├── edit                         └── glob                      │
│  └── bash                                                       │
│                                                                 │
│  🛠️ 开发工具                      📊 项目管理                   │
│  ├── lsp-diagnostics              ├── git                       │
│  ├── lsp-symbols                  └── github                    │
│  └── skill                                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 工具配置

```typescript
// 启用/禁用特定工具
const session = await createAgentSession({
  tools: {
    // 文件操作
    read: true,      // 读取文件
    write: true,     // 写入文件
    edit: true,      // 编辑文件
    bash: true,      // 执行命令
    
    // 代码搜索
    grep: true,      // 文本搜索
    "ast-grep": true, // AST 搜索
    glob: true,      // 文件匹配
    
    // 开发工具
    "lsp-diagnostics": true,  // LSP 诊断
    "lsp-symbols": true,      // LSP 符号
    skill: true,              // Skill 系统
    
    // 项目管理
    git: true,       // Git 操作
    github: true,    // GitHub API
  },
});
```

### 工具使用示例

```typescript
// AI 会自动调用工具
// 用户：读取 src/index.ts 的内容

// AI 调用 read 工具
const result = await readTool.execute("call_1", {
  filePath: "src/index.ts",
});

// 返回给 AI
// result.content = [{ type: "text", text: "文件内容..." }]
```

## 核心概念三：运行模式

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

## 核心概念四：系统提示词

系统提示词定义了 AI 的行为和能力。

### 默认系统提示词

```typescript
// packages/coding-agent/src/core/system-prompt.ts

export const DEFAULT_SYSTEM_PROMPT = `你是一个专业的软件开发工程师，擅长：

1. 代码理解与重构
   - 能够阅读并理解复杂的代码库
   - 识别代码中的问题和改进点
   - 进行安全的重构

2. 代码编写
   - 编写清晰、可维护的代码
   - 遵循项目已有的代码风格
   - 添加适当的注释和文档

3. 调试与测试
   - 分析错误信息定位问题
   - 编写单元测试和集成测试
   - 验证修复是否有效

4. 技术选型
   - 根据场景选择合适的技术方案
   - 评估不同方案的优缺点
   - 考虑长期维护成本

你可以使用以下工具：
- read: 读取文件内容
- write: 创建新文件
- edit: 编辑现有文件
- bash: 执行命令行
- grep: 搜索代码
- ast-grep: AST 搜索
- lsp-diagnostics: 获取类型错误
- git: Git 操作

重要规则：
1. 在修改代码前，先读取相关文件理解上下文
2. 使用 edit 工具进行精确修改，避免大面积重写
3. 修改后运行检查命令验证
4. 不确定时询问用户，不要猜测
`;
```

### 自定义系统提示词

```typescript
const session = await createAgentSession({
  systemPrompt: `
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
  `,
});
```

## 核心概念五：会话持久化

会话可以自动保存和恢复。

### 自动保存

```typescript
// 启用自动保存
const session = await createAgentSession({
  name: "feature-login",
  autoSave: true,
  saveInterval: 30000,  // 30 秒
});

// 会话会自动保存到 ~/.pi/sessions/feature-login.json
```

### 恢复会话

```bash
# 列出所有会话
pi --list-sessions

# 恢复会话
pi --session feature-login

# 删除会话
pi --delete-session feature-login
```

### 会话状态

```typescript
// 获取会话状态
const state = session.getState();
console.log(state.phase);        // "thinking"
console.log(state.context);      // { currentFile: "..." }
console.log(state.stats);        // { messageCount: 10, ... }

// 监听状态变化
session.onStateChange = (newState) => {
  console.log("状态变化:", newState.phase);
};
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

```typescript
import { createAgentSession } from "@mariozechner/pi";

async function main() {
  const session = await createAgentSession({
    name: "my-task",
  });

  // 发送消息
  const response = await session.sendMessage("帮我优化这段代码");
  console.log(response.text);

  // 查看工具调用
  console.log(response.toolCalls);

  // 保存会话
  await session.save();
}

main();
```

## 总结

pi-coding-agent 的核心概念：

1. **Agent Session**：管理一次完整的编码任务，包含状态、工具、历史
2. **工具系统**：丰富的工具让 AI 能够实际操作代码库
3. **运行模式**：interactive、headless、oneshot、file、github-pr 等多种模式
4. **系统提示词**：定义 AI 的行为和能力
5. **会话持久化**：自动保存和恢复会话状态

---

**下篇预告**: [02-architecture.md](02-architecture.md) —— 深入理解 pi-coding-agent 的架构设计，包括各运行模式的实现、工具系统的架构、会话管理的机制等。
