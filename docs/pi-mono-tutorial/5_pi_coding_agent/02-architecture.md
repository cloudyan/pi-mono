# 架构设计与运行模式

> **难度：进阶** | **预计阅读时间：25 分钟**

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
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │interac- │  │headless │  │oneshot  │  │github-  │  │   │
│  │  │tive     │  │         │  │         │  │pr       │  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  │       └────────────┴────────────┴────────────┘        │   │
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

```typescript
// packages/coding-agent/src/cli/args.ts

export interface CliArgs {
  // 运行模式
  mode: "interactive" | "headless" | "oneshot" | "file" | "github-pr";
  
  // 模型配置
  model?: string;
  provider?: string;
  
  // 输入
  prompt?: string;
  file?: string;
  
  // 会话
  session?: string;
  "list-sessions"?: boolean;
  "delete-session"?: string;
  
  // 工具配置
  tools?: string[];
  "disable-tools"?: string[];
  
  // 输出
  output?: "text" | "json" | "markdown";
  verbose?: boolean;
}

// 解析参数
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    mode: "interactive",
  };
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    switch (arg) {
      case "--mode":
      case "-m":
        args.mode = argv[++i] as CliArgs["mode"];
        break;
        
      case "--model":
        args.model = argv[++i];
        break;
        
      case "--prompt":
      case "-p":
        args.prompt = argv[++i];
        break;
        
      case "--file":
      case "-f":
        args.file = argv[++i];
        break;
        
      case "--session":
      case "-s":
        args.session = argv[++i];
        break;
        
      case "--list-sessions":
        args["list-sessions"] = true;
        break;
        
      case "--output":
      case "-o":
        args.output = argv[++i] as CliArgs["output"];
        break;
        
      case "--verbose":
      case "-v":
        args.verbose = true;
        break;
    }
  }
  
  return args;
}
```

### 配置加载

```typescript
// 加载配置文件
export async function loadConfig(): Promise<Config> {
  const configPaths = [
    ".pi.config.json",
    ".pi.config.js",
    ".config/pi/config.json",
  ];
  
  for (const configPath of configPaths) {
    if (await fileExists(configPath)) {
      const content = await fs.readFile(configPath, "utf-8");
      return JSON.parse(content);
    }
  }
  
  // 默认配置
  return {
    model: "anthropic:claude-sonnet-4-20250514",
    tools: ["read", "write", "edit", "bash", "grep"],
    autoSave: true,
  };
}
```

## 运行模式详解

### 1. Interactive 模式

Interactive 模式是最常用的模式，提供 TUI 界面进行交互式对话。

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

#### 实现

```typescript
// packages/coding-agent/src/modes/interactive/interactive.ts

export async function runInteractiveMode(args: CliArgs): Promise<void> {
  // 1. 创建或恢复会话
  const session = args.session
    ? await loadSession(args.session)
    : await createAgentSession({
        name: args.session || generateSessionName(),
        model: args.model,
        tools: loadTools(args.tools),
      });

  // 2. 创建 TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // 3. 创建消息列表组件
  const messageList = new MessageList();
  tui.addChild(messageList);

  // 4. 创建输入框组件
  const input = new ChatInput();
  input.onSubmit = async (text) => {
    // 显示用户消息
    messageList.addMessage({ role: "user", content: text });
    
    // 发送给 Agent
    const response = await session.sendMessage(text);
    
    // 显示 AI 响应
    messageList.addMessage({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });
  };
  tui.addChild(input);
  tui.setFocus(input);

  // 5. 订阅 Agent 事件
  session.agent.subscribe((event) => {
    switch (event.type) {
      case "tool_execution_start":
        messageList.addToolCall({
          tool: event.toolName,
          status: "running",
        });
        break;
        
      case "tool_execution_end":
        messageList.updateToolCall({
          tool: event.toolName,
          status: event.isError ? "error" : "success",
          result: event.result,
        });
        break;
    }
  });

  // 6. 启动 TUI
  tui.start();
}
```

### 2. Headless 模式

Headless 模式用于自动化脚本和 CI/CD 场景，无 TUI 界面。

#### 使用场景

```bash
# 代码审查
pi --mode headless --prompt "审查 src/ 目录的代码质量"

# 自动修复
pi --mode headless --prompt "修复所有 TypeScript 错误"

# 生成文档
pi --mode headless --prompt "为 src/utils.ts 生成 JSDoc 注释"
```

#### 实现

```typescript
// packages/coding-agent/src/modes/headless/headless.ts

export async function runHeadlessMode(args: CliArgs): Promise<void> {
  // 1. 创建会话
  const session = await createAgentSession({
    model: args.model,
    tools: loadTools(args.tools),
  });

  // 2. 准备输入
  const prompt = args.prompt || await readStdin();
  
  if (!prompt) {
    console.error("Error: No prompt provided");
    process.exit(1);
  }

  // 3. 发送消息
  const response = await session.sendMessage(prompt);

  // 4. 输出结果
  switch (args.output) {
    case "json":
      console.log(JSON.stringify(response, null, 2));
      break;
      
    case "markdown":
      console.log(response.text);
      break;
      
    default:
      console.log(response.text);
      if (response.toolCalls.length > 0) {
        console.log("\n工具调用:");
        for (const call of response.toolCalls) {
          console.log(`  - ${call.tool}: ${JSON.stringify(call.args)}`);
        }
      }
  }
}
```

### 3. Oneshot 模式

Oneshot 模式执行单个任务后退出，适合快速执行特定任务。

#### 使用场景

```bash
# 快速生成文件
pi --mode oneshot --prompt "生成 README.md" --output file:README.md

# 代码转换
pi --mode oneshot --prompt "将 src/index.js 转换为 TypeScript"

# 批量处理
for file in src/*.js; do
  pi --mode oneshot --prompt "为 $file 添加类型注释" --file "$file"
done
```

#### 实现

```typescript
// packages/coding-agent/src/modes/oneshot/oneshot.ts

export async function runOneshotMode(args: CliArgs): Promise<void> {
  // 1. 创建临时会话
  const session = await createAgentSession({
    model: args.model,
    tools: loadTools(args.tools),
    // Oneshot 模式不保存会话
    saveSession: false,
  });

  // 2. 执行提示
  const prompt = args.prompt || await readFile(args.file!);
  const response = await session.sendMessage(prompt);

  // 3. 处理输出
  if (args.output?.startsWith("file:")) {
    const outputFile = args.output.slice(5);
    await fs.writeFile(outputFile, response.text);
    console.log(`Output written to ${outputFile}`);
  } else {
    console.log(response.text);
  }
}
```

### 4. File 模式

File 模式从文件读取任务列表并批量执行。

#### 任务文件格式

```markdown
<!-- tasks.md -->
# 任务列表

## 任务 1: 重构 utils.ts
读取 src/utils.ts，将函数提取到单独的文件中。

## 任务 2: 添加测试
为 src/utils.ts 中的每个函数添加单元测试。

## 任务 3: 更新文档
更新 README.md，添加新功能的说明。
```

#### 实现

```typescript
// packages/coding-agent/src/modes/file/file.ts

export async function runFileMode(args: CliArgs): Promise<void> {
  // 1. 读取任务文件
  const content = await fs.readFile(args.file!, "utf-8");
  const tasks = parseTasks(content);

  // 2. 创建会话
  const session = await createAgentSession({
    model: args.model,
    tools: loadTools(args.tools),
  });

  // 3. 批量执行任务
  for (const task of tasks) {
    console.log(`\n执行: ${task.title}`);
    console.log("-".repeat(40));
    
    const response = await session.sendMessage(task.description);
    console.log(response.text);
    
    // 等待用户确认（可选）
    if (task.requiresConfirmation) {
      const confirmed = await confirm("继续下一个任务?");
      if (!confirmed) break;
    }
  }
}

// 解析任务
function parseTasks(content: string): Task[] {
  const tasks: Task[] = [];
  const sections = content.split(/^## /m);
  
  for (const section of sections.slice(1)) {
    const lines = section.split("\n");
    const title = lines[0].trim();
    const description = lines.slice(1).join("\n").trim();
    
    tasks.push({ title, description });
  }
  
  return tasks;
}
```

### 5. GitHub PR 模式

GitHub PR 模式用于代码审查和 PR 评论。

#### 使用场景

```bash
# 审查 PR
pi --mode github-pr --pr 123 --repo owner/repo

# 自动评论
pi --mode github-pr --pr 123 --comment "请修复以下问题..."
```

#### 实现

```typescript
// packages/coding-agent/src/modes/github-pr/github-pr.ts

export async function runGithubPrMode(args: CliArgs): Promise<void> {
  // 1. 获取 PR 信息
  const pr = await github.getPullRequest(args.repo!, args.pr!);
  
  // 2. 获取 diff
  const diff = await github.getPullRequestDiff(args.repo!, args.pr!);
  
  // 3. 创建会话
  const session = await createAgentSession({
    model: args.model,
    tools: loadTools(args.tools),
    systemPrompt: `你是一个代码审查专家。审查以下 PR 并提供建设性反馈。

PR 信息:
标题: ${pr.title}
作者: ${pr.user.login}
描述: ${pr.body}

请检查:
1. 代码质量和可读性
2. 潜在的错误和边界情况
3. 测试覆盖率
4. 性能影响
5. 安全漏洞
`,
  });

  // 4. 分析 PR
  const response = await session.sendMessage(`审查以下代码变更:\n\n${diff}`);
  
  // 5. 输出或提交评论
  if (args.comment) {
    await github.createPullRequestComment(
      args.repo!,
      args.pr!,
      response.text
    );
    console.log("评论已提交");
  } else {
    console.log(response.text);
  }
}
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
│       │                                                         │
│       └── 否 → 需要自动化/脚本？                                 │
│              │                                                  │
│              ├── 是 → 需要批量处理？                             │
│              │       │                                          │
│              │       ├── 是 → File 模式                          │
│              │       │                                          │
│              │       └── 否 → 需要 CI/CD 集成？                  │
│              │               │                                  │
│              │               ├── 是 → Headless 模式              │
│              │               │                                  │
│              │               └── 否 → Oneshot 模式               │
│              │                                                  │
│              └── 否 → 需要审查 GitHub PR？                       │
│                     │                                           │
│                     └── 是 → GitHub PR 模式                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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
│  2. 加载配置                                                     │
│     └── 合并默认配置、配置文件、环境变量、命令行参数               │
│                                                                 │
│  3. 确定运行模式                                                 │
│     └── 根据 args.mode 选择对应模式                              │
│                                                                 │
│  4. 初始化模式                                                   │
│     └── 调用 run{Mode}Mode() 函数                               │
│                                                                 │
│  5. 创建/恢复会话                                                │
│     └── core/agent-session.ts: createAgentSession()             │
│                                                                 │
│  6. 执行主逻辑                                                   │
│     └── 各模式特定的逻辑                                         │
│                                                                 │
│  7. 清理资源                                                     │
│     └── 保存会话、关闭连接等                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 最佳实践

### ✅ 应该做的

1. **选择合适的模式**
   ```bash
   # 日常开发 - 使用 interactive
   pi
   
   # CI/CD - 使用 headless
   pi --mode headless --prompt "检查代码"
   
   # 批量任务 - 使用 file
   pi --mode file --file tasks.md
   ```

2. **配置默认工具**
   ```json
   // .pi.config.json
   {
     "tools": ["read", "write", "edit", "bash", "grep"],
     "disableTools": ["github"]
   }
   ```

3. **使用会话管理**
   ```bash
   # 命名会话便于恢复
   pi --session feature-login
   
   # 列出会话
   pi --list-sessions
   
   # 删除旧会话
   pi --delete-session old-session
   ```

### ❌ 避免的错误

1. **在 CI 中使用 interactive 模式**
   ```bash
   # ❌ 错误：CI 会卡住
   pi --prompt "检查代码"
   
   # ✅ 正确：使用 headless 模式
   pi --mode headless --prompt "检查代码"
   ```

2. **忘记保存重要会话**
   ```bash
   # ❌ 错误：默认会话名可能重复
   pi
   
   # ✅ 正确：使用有意义的会话名
   pi --session refactor-auth
   ```

3. **在 oneshot 模式中期望持久化**
   ```bash
   # ❌ 错误：oneshot 不保存会话
   pi --mode oneshot --prompt "任务1"
   pi --mode oneshot --prompt "任务2"  # 没有上下文
   
   # ✅ 正确：使用 interactive 或 file 模式
   pi --session my-task
   ```

## 总结

架构设计与运行模式的核心要点：

1. **CLI 入口**：参数解析、配置加载、模式分发
2. **Interactive 模式**：TUI 界面，适合日常开发
3. **Headless 模式**：无界面，适合自动化
4. **Oneshot 模式**：单次任务，快速执行
5. **File 模式**：批量处理任务列表
6. **GitHub PR 模式**：代码审查和 PR 评论

---

**下篇预告**: [03-tools.md](03-tools.md) —— 深入工具系统，包括 read、write、edit、bash、grep、ast-grep、lsp 等工具的实现原理和最佳实践。
