# Extension 系统

> **难度：专家** | **预计阅读时间：30 分钟**

在前面的章节中，我们了解了 Prompt、工具、会话管理。本章将深入 Extension 系统——这是 pi-coding-agent 最强大的扩展机制，允许你通过 JavaScript/TypeScript 代码深度定制 Agent 的行为。

## 1. 概述

### 1.1 Extension 是什么

Extension 是一种**代码式扩展机制**，允许开发者使用 JavaScript/TypeScript 编写代码来扩展 pi-coding-agent 的功能。与 Skill（配置式扩展）不同，Extension 提供了程序级的控制能力。

### 1.2 Extension vs Skill

| 特性 | Extension | Skill |
|------|-----------|-------|
| 扩展方式 | 代码式（JavaScript/TypeScript） | 配置式（Markdown + YAML） |
| 控制能力 | 完全控制，可访问内部 API | 有限，遵循预定义模式 |
| 适用场景 | 复杂定制、自定义工具、UI 扩展 | 快速添加提示词模板 |
| 学习曲线 | 需要编程知识 | 低门槛，非技术用户可用 |
| 调试难度 | 需要代码调试 | 配置验证即可 |

### 1.3 Extension 可以做什么

```
┌─────────────────────────────────────────────────────────────────┐
│                     Extension 能力全景                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   自定义工具     │  │   斜杠命令      │  │   UI 定制       │ │
│  │  • 文件操作     │  │  • /stats       │  │  • 自定义主题   │ │
│  │  • 代码分析     │  │  • /export      │  │  • 自定义面板   │ │
│  │  • 外部 API    │  │  • /template    │  │  • 快捷键绑定   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   生命周期钩子   │  │   会话存储      │  │   CLI 扩展      │ │
│  │  • Agent 启动   │  │  • 持久化状态   │  │  • 自定义参数   │ │
│  │  • 消息拦截     │  │  • 跨消息通信   │  │  • 子命令      │ │
│  │  • 工具前后处理 │  │  • 统计信息     │  │  • 钩子        │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Extension 注册方式

### 2.1 全局 Extension

全局 Extension 存放在用户主目录下，对所有项目生效：

```
~/.pi/agent/extensions/          # pi 专用目录
~/.agents/extensions/            # 通用 agents 目录
```

**适用场景**：
- 跨项目通用的工具
- 个人偏好的主题和快捷键
- 常用第三方 API 集成

```typescript
// ~/.pi/agent/extensions/my-global-extension/index.ts
import { Extension, ExtensionContext } from "@mariozechner/pi";

export const extension: Extension = {
  name: "my-global-extension",
  version: "1.0.0",
  
  async activate(context: ExtensionContext) {
    console.log("全局 Extension 已激活");
    // 注册全局可用的工具
  },
  
  async deactivate() {
    console.log("全局 Extension 已停用");
  }
};
```

### 2.2 项目本地 Extension

项目本地 Extension 存放在项目目录下，仅对当前项目生效：

```
.pi/extensions/                  # pi 专用目录
.agents/extensions/              # 通用 agents 目录
```

**适用场景**：
- 项目特定的业务逻辑工具
- 团队共享的编码规范检查
- 项目专属的工作流自动化

```typescript
// .pi/extensions/project-tools/index.ts
import { Extension, ExtensionContext } from "@mariozechner/pi";

export const extension: Extension = {
  name: "project-tools",
  version: "1.0.0",
  
  async activate(context: ExtensionContext) {
    console.log("项目 Extension 已激活");
    // 注册项目特定的工具
  }
};
```

### 2.3 npm 包形式

Extension 也可以作为 npm 包发布和安装：

```json
// .pi/extensions/package.json
{
  "name": "project-extensions",
  "version": "1.0.0",
  "dependencies": {
    "@mycompany/pi-tools": "^1.2.0",
    "pi-mermaid-extension": "^0.5.0"
  }
}
```

安装命令：

```bash
# 在 .pi/extensions/ 目录下
pi install
```

**适用场景**：
- 使用第三方 Extension
- 团队共享的私有 Extension
- 版本管理和依赖管理

### 2.4 加载机制

```typescript
// packages/coding-agent/src/core/resource-loader.ts

export class ResourceLoader {
  private extensions: Map<string, Extension> = new Map();
  
  async loadExtensions(): Promise<void> {
    // 1. 搜索所有 Extension 目录
    const extensionDirs = [
      ...this.findGlobalExtensions(),
      ...this.findProjectExtensions(),
      ...this.findPackageExtensions(),
    ];
    
    // 2. 并行加载所有 Extension
    const results = await Promise.allSettled(
      extensionDirs.map(dir => this.loadExtension(dir))
    );
    
    // 3. 处理加载结果
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        console.log(`Extension ${extensionDirs[index]} 加载成功`);
      } else {
        console.error(`Extension ${extensionDirs[index]} 加载失败:`, result.reason);
        // 单个 Extension 失败不影响其他
      }
    });
  }
  
  private async loadExtension(dir: string): Promise<Extension> {
    // 查找入口文件
    const entryFiles = ["index.ts", "index.js", "extension.ts", "extension.js"];
    const entryFile = entryFiles.find(f => fs.existsSync(path.join(dir, f)));
    
    if (!entryFile) {
      throw new Error(`Extension ${dir} 缺少入口文件`);
    }
    
    // 动态导入
    const module = await import(path.join(dir, entryFile));
    const extension = module.extension || module.default;
    
    // 验证 Extension 接口
    this.validateExtension(extension);
    
    return extension;
  }
}
```

**加载顺序**：
1. 全局 Extension（`~/.pi/agent/extensions/`）
2. 项目本地 Extension（`.pi/extensions/`）
3. npm 包 Extension（按 package.json 依赖顺序）

**错误处理**：
- 单个 Extension 加载失败不会阻止其他 Extension 加载
- 失败的 Extension 会被记录但不会导致 Agent 启动失败
- Extension 中的运行时错误会被捕获并记录

## 3. Extension API 概览

### 3.1 Extension 接口

```typescript
// packages/coding-agent/src/core/extensions.ts

/**
 * Extension 接口定义
 */
export interface Extension {
  /** Extension 名称（唯一标识） */
  name: string;
  
  /** Extension 版本（遵循 semver） */
  version: string;
  
  /** 激活函数 */
  activate(context: ExtensionContext): void | Promise<void>;
  
  /** 停用函数（可选） */
  deactivate?(): void | Promise<void>;
  
  /** 依赖的其他 Extension（可选） */
  dependencies?: string[];
  
  /** 兼容的 pi 版本范围（可选） */
  piVersion?: string;
}
```

### 3.2 ExtensionContext

```typescript
// packages/coding-agent/src/core/extensions.ts

/**
 * Extension 上下文
 * 提供 Extension 与 Agent 交互的所有能力
 */
export interface ExtensionContext {
  /** 
   * 注册自定义工具
   * @param tool - 要注册的工具
   */
  registerTool<T>(tool: AgentTool<T>): void;
  
  /**
   * 注册斜杠命令
   * @param command - 要注册的命令
   */
  registerCommand(command: Command): void;
  
  /**
   * 注册快捷键
   * @param shortcut - 要注册的快捷键
   */
  registerShortcut(shortcut: Shortcut): void;
  
  /**
   * 注册 CLI 参数
   * @param flag - 要注册的参数
   */
  registerFlag(flag: Flag): void;
  
  /**
   * 订阅生命周期事件
   * @param event - 事件名称
   * @param handler - 事件处理器
   */
  on(event: string, handler: (...args: any[]) => void): void;
  
  /**
   * 订阅生命周期事件（只触发一次）
   * @param event - 事件名称
   * @param handler - 事件处理器
   */
  once(event: string, handler: (...args: any[]) => void): void;
  
  /**
   * 取消事件订阅
   * @param event - 事件名称
   * @param handler - 事件处理器
   */
  off(event: string, handler: (...args: any[]) => void): void;
  
  /**
   * 会话状态存储
   * 用于在 Extension 中持久化状态
   */
  sessionStore: SessionStore;
  
  /**
   * 全局配置
   */
  config: Config;
  
  /**
   * 日志记录器
   */
  logger: Logger;
}
```

### 3.3 API 方法详解

| 方法 | 用途 | 示例场景 |
|------|------|----------|
| `registerTool()` | 添加 Agent 可调用的自定义工具 | 集成外部 API、自定义代码分析 |
| `registerCommand()` | 添加用户可输入的斜杠命令 | /stats、/export、/template |
| `registerShortcut()` | 绑定键盘快捷键 | Ctrl+S 保存、Ctrl+E 导出 |
| `registerFlag()` | 添加 CLI 参数支持 | --verbose、--format json |
| `on()/once()/off()` | 订阅生命周期事件 | 拦截消息、监控工具调用 |
| `sessionStore` | 持久化 Extension 状态 | 跨会话保持用户偏好 |

## 4. 生命周期事件

### 4.1 Agent 生命周期

```
Agent 生命周期
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[启动] ──▶ agent:init ──▶ [初始化完成]
                              │
                              ▼
                    [等待用户输入]
                              │
                              ▼
              ┌─────────── agent:before_run
              │                    │
              │                    ▼
              │         [执行 Agent 循环]
              │                    │
              │         ┌──────────┴──────────┐
              │         ▼                     ▼
              │   session:before_message  tool:before_execute
              │         │                     │
              │         ▼                     ▼
              │   [处理消息/工具]       [执行工具]
              │         │                     │
              │         ▼                     ▼
              │   session:after_message   tool:after_execute
              │         │                     │
              │         └──────────┬──────────┘
              │                    │
              │                    ▼
              │          [响应生成完成]
              │                    │
              └──────────── agent:after_run
                                   │
                                   ▼
                              agent:error (如果出错)
                                   │
                                   ▼
                              [等待下一轮]

[关闭] ──▶ [执行所有 Extension 的 deactivate]
```

| 事件 | 触发时机 | 典型用途 |
|------|----------|----------|
| `agent:init` | Agent 初始化完成，所有 Extension 已加载 | 全局配置初始化、资源准备 |
| `agent:before_run` | 每次运行前 | 参数检查、环境验证、预处理 |
| `agent:after_run` | 每次运行后 | 清理资源、统计信息、后处理 |
| `agent:error` | Agent 执行过程中发生错误 | 错误处理、错误报告、恢复 |

```typescript
// 订阅 Agent 生命周期事件
context.on("agent:init", () => {
  console.log("Agent 已初始化完成");
  // 初始化全局资源
});

context.on("agent:before_run", (params) => {
  console.log("Agent 运行前:", params);
  // 检查参数有效性
  // 准备运行环境
});

context.on("agent:after_run", (result) => {
  console.log("Agent 运行完成:", result);
  // 记录运行统计
  // 清理临时资源
});

context.on("agent:error", (error) => {
  console.error("Agent 出错:", error);
  // 发送错误报告
  // 尝试恢复
});
```

### 4.2 会话生命周期

| 事件 | 触发时机 | 典型用途 |
|------|----------|----------|
| `session:create` | 新会话创建时 | 初始化会话状态、设置默认值 |
| `session:load` | 会话从存储加载时 | 恢复 Extension 状态、验证数据 |
| `session:before_message` | 发送消息给 AI 前 | 修改消息内容、添加元数据、过滤 |
| `session:after_message` | 收到 AI 回复后 | 处理响应、记录日志、触发动作 |
| `session:compact` | 会话需要压缩时 | 自定义压缩策略、保留关键信息 |
| `session:save` | 会话保存时 | 保存 Extension 状态、同步数据 |

```typescript
// 会话事件订阅示例
context.on("session:create", (session) => {
  // 为新会话初始化状态
  context.sessionStore.set(`session:${session.id}:startTime`, Date.now());
});

context.on("session:before_message", (message, session) => {
  // 在消息前添加时间戳
  if (message.role === "user") {
    message.metadata = message.metadata || {};
    message.metadata.timestamp = new Date().toISOString();
  }
});

context.on("session:after_message", (response, session) => {
  // 统计消息数量
  const count = context.sessionStore.get(`session:${session.id}:messageCount`) || 0;
  context.sessionStore.set(`session:${session.id}:messageCount`, count + 1);
});

context.on("session:save", async (session) => {
  // 保存 Extension 特定的数据
  const extensionData = await gatherExtensionData();
  await context.sessionStore.set(`session:${session.id}:extensionData`, extensionData);
});
```

### 4.3 工具生命周期

| 事件 | 触发时机 | 典型用途 |
|------|----------|----------|
| `tool:before_execute` | 工具执行前 | 参数验证、权限检查、日志记录 |
| `tool:after_execute` | 工具执行后 | 结果处理、错误处理、统计更新 |

```typescript
// 工具事件订阅示例
context.on("tool:before_execute", (toolCall) => {
  console.log(`工具 ${toolCall.name} 即将执行`);
  console.log(`参数:`, toolCall.arguments);
  
  // 权限检查
  if (toolCall.name === "write" && !isWriteAllowed(toolCall.arguments.filePath)) {
    throw new Error("写入操作被拒绝：路径不在允许范围内");
  }
});

context.on("tool:after_execute", (toolCall, result) => {
  console.log(`工具 ${toolCall.name} 执行完成`);
  console.log(`结果:`, result);
  
  // 记录工具调用统计
  const stats = context.sessionStore.get("toolStats") || {};
  stats[toolCall.name] = (stats[toolCall.name] || 0) + 1;
  context.sessionStore.set("toolStats", stats);
});
```

## 5. 自定义工具开发

### 5.1 AgentTool 接口

```typescript
// packages/coding-agent/src/core/tools/index.ts

import { z } from "zod";

/**
 * AgentTool 接口定义
 * 每个工具必须实现此接口
 */
export interface AgentTool<T = any> {
  /** 工具名称（唯一标识） */
  name: string;
  
  /** 工具显示标签 */
  label: string;
  
  /** 工具描述（用于 AI 理解） */
  description: string;
  
  /** 参数 Schema（Zod 验证） */
  parameters: z.ZodSchema<T>;
  
  /**
   * 执行工具
   * @param toolCallId - 工具调用唯一标识
   * @param params - 验证后的参数
   * @param signal - 中止信号
   * @returns 异步生成工具事件流
   */
  execute(
    toolCallId: string,
    params: T,
    signal?: AbortSignal
  ): AsyncIterable<ToolEvent>;
}

/**
 * 工具事件类型
 */
export type ToolEvent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "error"; error: string }
  | { type: "progress"; message: string; percent?: number };
```

### 5.2 工具事件类型详解

| 事件类型 | 用途 | 示例 |
|----------|------|------|
| `text` | 文本输出 | 文件内容、API 响应、处理结果 |
| `image` | 图片输出 | 截图、图表、生成的图像 |
| `error` | 错误信息 | 文件不存在、权限不足、API 错误 |
| `progress` | 进度更新 | 长时间任务的进度报告 |

### 5.3 完整示例：自定义日志工具

```typescript
// .pi/extensions/logging-tool/index.ts
import { Extension, ExtensionContext, AgentTool, ToolEvent } from "@mariozechner/pi";
import { z } from "zod";

/**
 * 日志级别定义
 */
const LogLevel = z.enum(["debug", "info", "warn", "error"]);
type LogLevel = z.infer<typeof LogLevel>;

/**
 * 自定义日志工具
 * 允许 Agent 记录结构化的日志信息
 */
const logTool: AgentTool<{ level: LogLevel; message: string; context?: string }> = {
  name: "log",
  label: "记录日志",
  description: "记录一条日志信息，支持不同级别（debug/info/warn/error）",
  
  parameters: z.object({
    level: LogLevel.describe("日志级别"),
    message: z.string().min(1).describe("日志内容"),
    context: z.string().optional().describe("可选的上下文信息")
  }),
  
  async *execute(toolCallId, params, signal): AsyncIterable<ToolEvent> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: params.level,
      message: params.message,
      context: params.context,
      toolCallId
    };
    
    // 输出到控制台（带颜色）
    const colors = {
      debug: "\x1b[90m",  // 灰色
      info: "\x1b[36m",   // 青色
      warn: "\x1b[33m",   // 黄色
      error: "\x1b[31m"   // 红色
    };
    
    const color = colors[params.level];
    const reset = "\x1b[0m";
    
    console.log(
      `${color}[${timestamp}] [${params.level.toUpperCase()}] ${params.message}${reset}`
    );
    
    if (params.context) {
      console.log(`${color}  Context: ${params.context}${reset}`);
    }
    
    // 也可以写入文件
    await appendToLogFile(logEntry);
    
    // 返回成功结果
    yield {
      type: "text",
      text: `日志已记录: [${params.level}] ${params.message}`
    };
  }
};

/**
 * 将日志追加到文件
 */
async function appendToLogFile(entry: any): Promise<void> {
  const logFile = ".pi/logs/agent.log";
  const line = JSON.stringify(entry) + "\n";
  await fs.promises.appendFile(logFile, line);
}

/**
 * Extension 定义
 */
export const extension: Extension = {
  name: "logging-tool",
  version: "1.0.0",
  
  async activate(context: ExtensionContext) {
    // 注册日志工具
    context.registerTool(logTool);
    
    // 确保日志目录存在
    await fs.promises.mkdir(".pi/logs", { recursive: true });
    
    console.log("日志工具 Extension 已激活");
  }
};
```

### 5.4 带进度报告的长时间任务

```typescript
/**
 * 代码分析工具（带进度报告）
 */
const analyzeTool: AgentTool<{ target: string; deep?: boolean }> = {
  name: "analyze_code",
  label: "分析代码",
  description: "分析代码库的复杂度和依赖关系",
  
  parameters: z.object({
    target: z.string().describe("要分析的目录或文件"),
    deep: z.boolean().optional().default(false).describe("是否进行深度分析")
  }),
  
  async *execute(toolCallId, params, signal): AsyncIterable<ToolEvent> {
    // 报告开始
    yield { type: "progress", message: "正在扫描文件...", percent: 0 };
    
    const files = await scanFiles(params.target);
    yield { 
      type: "progress", 
      message: `找到 ${files.length} 个文件`, 
      percent: 10 
    };
    
    // 检查中止信号
    if (signal?.aborted) {
      yield { type: "error", error: "操作已中止" };
      return;
    }
    
    // 分析依赖
    yield { type: "progress", message: "正在分析依赖关系...", percent: 30 };
    const dependencies = await analyzeDependencies(files);
    
    if (signal?.aborted) {
      yield { type: "error", error: "操作已中止" };
      return;
    }
    
    // 计算复杂度
    yield { type: "progress", message: "正在计算代码复杂度...", percent: 60 };
    const complexity = await calculateComplexity(files);
    
    if (params.deep) {
      yield { type: "progress", message: "正在进行深度分析...", percent: 80 };
      const deepAnalysis = await performDeepAnalysis(files);
      complexity.deep = deepAnalysis;
    }
    
    // 完成
    yield { type: "progress", message: "分析完成", percent: 100 };
    
    yield {
      type: "text",
      text: JSON.stringify({
        files: files.length,
        dependencies: dependencies.length,
        complexity
      }, null, 2)
    };
  }
};
```

## 6. 斜杠命令开发

### 6.1 Command 接口

```typescript
// packages/coding-agent/src/core/extensions.ts

/**
 * 斜杠命令接口
 * 用户可以通过 /command 方式调用
 */
export interface Command {
  /** 命令名称（不带 / 前缀） */
  name: string;
  
  /** 命令描述 */
  description: string;
  
  /**
   * 命令处理函数
   * @param args - 命令参数数组
   * @returns 可选的返回值
   */
  handler(args: string[]): void | Promise<void>;
  
  /** 是否需要在交互模式下显示 */
  hidden?: boolean;
  
  /** 命令别名 */
  aliases?: string[];
}
```

### 6.2 示例：自定义 /stats 命令

```typescript
// .pi/extensions/stats-command/index.ts
import { Extension, ExtensionContext, Command } from "@mariozechner/pi";

/**
 * 会话统计命令
 * 显示当前会话的详细统计信息
 */
const statsCommand: Command = {
  name: "stats",
  description: "显示当前会话的统计信息",
  aliases: ["stat", "s"],
  
  async handler(args: string[]): Promise<void> {
    // 获取会话统计
    const stats = await context.sessionStore.getStats();
    const toolStats = context.sessionStore.get("toolStats") || {};
    
    console.log("\n📊 会话统计信息\n");
    console.log("━".repeat(40));
    
    console.log(`\n📝 消息统计:`);
    console.log(`   用户消息: ${stats.userMessageCount}`);
    console.log(`   AI 消息: ${stats.assistantMessageCount}`);
    console.log(`   总计: ${stats.messageCount}`);
    
    console.log(`\n🔤 Token 使用:`);
    console.log(`   输入: ${formatNumber(stats.inputTokens)}`);
    console.log(`   输出: ${formatNumber(stats.outputTokens)}`);
    console.log(`   总计: ${formatNumber(stats.totalTokens)}`);
    
    if (Object.keys(toolStats).length > 0) {
      console.log(`\n🛠️  工具调用:`);
      for (const [tool, count] of Object.entries(toolStats)) {
        console.log(`   ${tool}: ${count} 次`);
      }
    }
    
    console.log(`\n⏱️  会话时长: ${formatDuration(stats.duration)}`);
    console.log("━".repeat(40));
    console.log();
  }
};

/**
 * 格式化数字
 */
function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

/**
 * 格式化时长
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}小时 ${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟 ${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
}

// Extension 注册
let context: ExtensionContext;

export const extension: Extension = {
  name: "stats-command",
  version: "1.0.0",
  
  async activate(ctx: ExtensionContext) {
    context = ctx;
    context.registerCommand(statsCommand);
    console.log("统计命令 Extension 已激活");
  }
};
```

### 6.3 带参数的复杂命令

```typescript
/**
 * 导出会话命令
 * 支持多种导出格式
 */
const exportCommand: Command = {
  name: "export",
  description: "导出当前会话为文件（支持 md/json/html）",
  
  async handler(args: string[]): Promise<void> {
    // 解析参数
    const format = args.find(a => a.startsWith("--format="))?.split("=")[1] || "md";
    const output = args.find(a => a.startsWith("--output="))?.split("=")[1];
    const includeSystem = args.includes("--include-system");
    
    // 验证格式
    if (!["md", "json", "html"].includes(format)) {
      console.error("❌ 不支持的格式。可用格式: md, json, html");
      return;
    }
    
    // 获取会话数据
    const session = await getCurrentSession();
    const messages = session.getMessages({ includeSystem });
    
    // 根据格式导出
    let content: string;
    switch (format) {
      case "json":
        content = JSON.stringify(messages, null, 2);
        break;
      case "html":
        content = exportToHtml(messages);
        break;
      case "md":
      default:
        content = exportToMarkdown(messages);
        break;
    }
    
    // 确定输出路径
    const outputPath = output || `session-${session.id}.${format}`;
    
    // 写入文件
    await fs.promises.writeFile(outputPath, content, "utf-8");
    console.log(`✅ 会话已导出到: ${outputPath}`);
  }
};

function exportToMarkdown(messages: any[]): string {
  const lines: string[] = ["# 会话记录\n"];
  
  for (const msg of messages) {
    const role = msg.role === "user" ? "👤 用户" : 
                 msg.role === "assistant" ? "🤖 助手" : "🛠️ 工具";
    lines.push(`## ${role}\n`);
    lines.push(msg.content.map((c: any) => c.text).join("\n"));
    lines.push("\n---\n");
  }
  
  return lines.join("\n");
}
```

## 7. UI 定制

### 7.1 主题定制

```typescript
// .pi/extensions/my-theme/index.ts
import { Extension, ExtensionContext } from "@mariozechner/pi";

/**
 * 自定义主题配置
 */
const myTheme = {
  name: "dark-pro",
  
  colors: {
    // 基础颜色
    background: "#0d1117",
    foreground: "#c9d1d9",
    
    // 强调色
    primary: "#58a6ff",
    secondary: "#8b949e",
    
    // 状态色
    success: "#238636",
    warning: "#f0883e",
    error: "#f85149",
    info: "#58a6ff",
    
    // 消息颜色
    userMessage: "#58a6ff",
    assistantMessage: "#c9d1d9",
    toolMessage: "#8b949e",
    
    // 代码块
    codeBackground: "#161b22",
    codeForeground: "#e6edf3",
    codeBorder: "#30363d",
  },
  
  styles: {
    // 用户消息样式
    userMessage: {
      prefix: "👤 ",
      suffix: "",
      bold: false,
      italic: false,
    },
    
    // AI 消息样式
    assistantMessage: {
      prefix: "🤖 ",
      suffix: "",
      bold: false,
      italic: false,
    },
    
    // 工具消息样式
    toolMessage: {
      prefix: "🛠️  ",
      suffix: "",
      bold: false,
      italic: true,
    },
    
    // 代码块样式
    codeBlock: {
      showLineNumbers: true,
      border: true,
      padding: 1,
    }
  }
};

export const extension: Extension = {
  name: "my-theme",
  version: "1.0.0",
  
  async activate(context: ExtensionContext) {
    // 注册主题
    context.registerTheme?.(myTheme);
    console.log("自定义主题已注册");
  }
};
```

### 7.2 自定义组件

```typescript
// 自定义状态面板组件
import { Component } from "@mariozechner/pi";

class CustomStatusPanel implements Component {
  private session: Session;
  
  constructor(session: Session) {
    this.session = session;
  }
  
  render(width: number): string[] {
    const state = this.session.getState();
    const lines: string[] = [];
    
    // 顶部边框
    lines.push("┌" + "─".repeat(width - 2) + "┐");
    
    // 标题
    const title = " 会话状态 ";
    const padding = Math.floor((width - title.length - 2) / 2);
    lines.push("│" + " ".repeat(padding) + title + " ".repeat(width - padding - title.length - 2) + "│");
    
    // 分隔线
    lines.push("├" + "─".repeat(width - 2) + "┤");
    
    // 状态信息
    const info = [
      `模型: ${state.model}`,
      `消息数: ${state.messageCount}`,
      `Token: ${state.tokenCount}`,
      `状态: ${state.phase}`,
    ];
    
    for (const line of info) {
      const padded = line.padEnd(width - 4);
      lines.push("│ " + padded + " │");
    }
    
    // 底部边框
    lines.push("└" + "─".repeat(width - 2) + "┘");
    
    return lines;
  }
}

// 在 Extension 中注册
export const extension: Extension = {
  name: "custom-ui",
  version: "1.0.0",
  
  async activate(context: ExtensionContext) {
    // 添加自定义组件到 TUI
    context.on("tui:init", (tui) => {
      const panel = new CustomStatusPanel(tui.session);
      tui.addSidebarComponent(panel);
    });
  }
};
```

## 8. 会话存储

### 8.1 SessionStore API

```typescript
// packages/coding-agent/src/core/extensions.ts

/**
 * 会话存储接口
 * 用于 Extension 在会话中持久化数据
 */
export interface SessionStore {
  /**
   * 获取存储的值
   * @param key - 键名
   * @returns 存储的值，不存在时返回 undefined
   */
  get<T = any>(key: string): Promise<T | undefined>;
  
  /**
   * 设置存储的值
   * @param key - 键名
   * @param value - 要存储的值
   */
  set<T = any>(key: string, value: T): Promise<void>;
  
  /**
   * 删除存储的值
   * @param key - 键名
   */
  delete(key: string): Promise<void>;
  
  /**
   * 检查键是否存在
   * @param key - 键名
   */
  has(key: string): Promise<boolean>;
  
  /**
   * 获取所有键
   */
  keys(): Promise<string[]>;
  
  /**
   * 清空所有存储
   */
  clear(): Promise<void>;
  
  /**
   * 获取会话统计信息
   */
  getStats(): Promise<SessionStats>;
}

/**
 * 会话统计信息
 */
export interface SessionStats {
  /** 用户消息数量 */
  userMessageCount: number;
  
  /** AI 消息数量 */
  assistantMessageCount: number;
  
  /** 总消息数量 */
  messageCount: number;
  
  /** 输入 Token 数量 */
  inputTokens: number;
  
  /** 输出 Token 数量 */
  outputTokens: number;
  
  /** 总 Token 数量 */
  totalTokens: number;
  
  /** 会话持续时间（毫秒） */
  duration: number;
  
  /** 工具调用次数 */
  toolCallCount: number;
}
```

### 8.2 使用场景

```typescript
// 场景 1: 跨消息保持状态
context.on("session:before_message", async (message) => {
  // 检查是否有之前保存的上下文
  const savedContext = await context.sessionStore.get("myExtension:context");
  if (savedContext) {
    // 将上下文附加到消息
    message.metadata = message.metadata || {};
    message.metadata.savedContext = savedContext;
  }
});

context.on("session:after_message", async (response) => {
  // 从响应中提取需要保存的状态
  if (response.metadata?.newContext) {
    await context.sessionStore.set("myExtension:context", response.metadata.newContext);
  }
});

// 场景 2: 自定义统计数据
const incrementCounter = async (name: string) => {
  const key = `stats:${name}`;
  const current = await context.sessionStore.get(key) || 0;
  await context.sessionStore.set(key, current + 1);
};

context.on("tool:after_execute", async (toolCall) => {
  if (toolCall.name === "myCustomTool") {
    await incrementCounter("myToolUsage");
  }
});

// 场景 3: 缓存计算结果
const getCachedResult = async <T>(cacheKey: string, compute: () => Promise<T>): Promise<T> => {
  const cached = await context.sessionStore.get<T>(`cache:${cacheKey}`);
  if (cached) {
    return cached;
  }
  
  const result = await compute();
  await context.sessionStore.set(`cache:${cacheKey}`, result);
  return result;
};

// 在工具中使用缓存
const myTool: AgentTool = {
  name: "expensive_operation",
  // ...
  async *execute(toolCallId, params) {
    const result = await getCachedResult(
      JSON.stringify(params),
      async () => {
        // 执行昂贵的计算
        return await performExpensiveOperation(params);
      }
    );
    
    yield { type: "text", text: result };
  }
};
```

## 9. 完整 Extension 示例

```typescript
// .pi/extensions/full-example/index.ts
/**
 * 完整 Extension 示例
 * 展示 Extension 的所有核心功能
 */

import { 
  Extension, 
  ExtensionContext, 
  AgentTool, 
  ToolEvent,
  Command,
  SessionStore
} from "@mariozechner/pi";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// 1. 自定义工具
// ═══════════════════════════════════════════════════════════════

/**
 * 代码统计工具
 * 统计项目代码行数、文件数量等信息
 */
const codeStatsTool: AgentTool<{ directory?: string; includeTests?: boolean }> = {
  name: "code_stats",
  label: "代码统计",
  description: "统计项目代码的详细信息，包括文件数、代码行数、注释行数等",
  
  parameters: z.object({
    directory: z.string().optional().default(".").describe("要统计的目录"),
    includeTests: z.boolean().optional().default(true).describe("是否包含测试文件")
  }),
  
  async *execute(toolCallId, params, signal): AsyncIterable<ToolEvent> {
    yield { type: "progress", message: "正在扫描文件...", percent: 0 };
    
    const stats = {
      files: 0,
      lines: 0,
      codeLines: 0,
      commentLines: 0,
      blankLines: 0,
      byExtension: {} as Record<string, number>
    };
    
    // 模拟扫描过程
    await delay(500);
    yield { type: "progress", message: "正在分析代码...", percent: 50 };
    
    // 这里应该是实际的文件扫描逻辑
    // 为示例简化处理
    stats.files = 42;
    stats.lines = 5000;
    stats.codeLines = 3500;
    stats.commentLines = 800;
    stats.blankLines = 700;
    
    await delay(500);
    yield { type: "progress", message: "统计完成", percent: 100 };
    
    yield {
      type: "text",
      text: `
📊 代码统计结果
━━━━━━━━━━━━━━━━━━━━
文件数: ${stats.files}
总行数: ${stats.lines}
代码行: ${stats.codeLines}
注释行: ${stats.commentLines}
空行: ${stats.blankLines}
代码率: ${((stats.codeLines / stats.lines) * 100).toFixed(1)}%
      `.trim()
    };
  }
};

/**
 * 项目信息工具
 * 读取 package.json 等项目信息
 */
const projectInfoTool: AgentTool<{}> = {
  name: "project_info",
  label: "项目信息",
  description: "获取当前项目的详细信息",
  
  parameters: z.object({}),
  
  async *execute(toolCallId): AsyncIterable<ToolEvent> {
    try {
      const packageJson = JSON.parse(
        await fs.promises.readFile("package.json", "utf-8")
      );
      
      yield {
        type: "text",
        text: `
📦 项目信息
━━━━━━━━━━━━━━━━━━━━
名称: ${packageJson.name || "N/A"}
版本: ${packageJson.version || "N/A"}
描述: ${packageJson.description || "N/A"}
作者: ${packageJson.author || "N/A"}
主入口: ${packageJson.main || "N/A"}
脚本: ${Object.keys(packageJson.scripts || {}).join(", ")}
依赖: ${Object.keys(packageJson.dependencies || {}).length} 个
开发依赖: ${Object.keys(packageJson.devDependencies || {}).length} 个
        `.trim()
      };
    } catch (error) {
      yield { type: "error", error: "无法读取 package.json" };
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// 2. 斜杠命令
// ═══════════════════════════════════════════════════════════════

/**
 * /hello 命令
 * 简单的问候命令
 */
const helloCommand: Command = {
  name: "hello",
  description: "显示欢迎信息",
  aliases: ["hi", "hey"],
  
  async handler(args: string[]): Promise<void> {
    const name = args[0] || "开发者";
    const greetings = [
      `👋 你好，${name}！有什么可以帮助你的吗？`,
      `🌟 欢迎回来，${name}！`,
      `🚀 准备好开始编码了吗，${name}？`,
    ];
    
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    console.log(randomGreeting);
    
    // 记录使用统计
    const count = await store.get("helloCommandCount") || 0;
    await store.set("helloCommandCount", count + 1);
  }
};

/**
 * /clear-cache 命令
 * 清除 Extension 缓存
 */
const clearCacheCommand: Command = {
  name: "clear-cache",
  description: "清除 Extension 缓存数据",
  
  async handler(args: string[]): Promise<void> {
    const keys = await store.keys();
    let cleared = 0;
    
    for (const key of keys) {
      if (key.startsWith("cache:")) {
        await store.delete(key);
        cleared++;
      }
    }
    
    console.log(`✅ 已清除 ${cleared} 个缓存项`);
  }
};

// ═══════════════════════════════════════════════════════════════
// 3. 全局存储引用
// ═══════════════════════════════════════════════════════════════

let store: SessionStore;
let ctx: ExtensionContext;

// ═══════════════════════════════════════════════════════════════
// 4. Extension 定义
// ═══════════════════════════════════════════════════════════════

export const extension: Extension = {
  name: "full-example",
  version: "1.0.0",
  dependencies: [], // 依赖的其他 Extension
  piVersion: ">=0.1.0", // 兼容的 pi 版本
  
  async activate(context: ExtensionContext) {
    console.log("🚀 full-example Extension 正在激活...");
    
    // 保存上下文引用
    ctx = context;
    store = context.sessionStore;
    
    // ═══════════════════════════════════════════════════════════
    // 4.1 注册工具
    // ═══════════════════════════════════════════════════════════
    context.registerTool(codeStatsTool);
    context.registerTool(projectInfoTool);
    console.log("✅ 工具已注册");
    
    // ═══════════════════════════════════════════════════════════
    // 4.2 注册命令
    // ═══════════════════════════════════════════════════════════
    context.registerCommand(helloCommand);
    context.registerCommand(clearCacheCommand);
    console.log("✅ 命令已注册");
    
    // ═══════════════════════════════════════════════════════════
    // 4.3 订阅生命周期事件
    // ═══════════════════════════════════════════════════════════
    
    // Agent 初始化完成
    context.on("agent:init", () => {
      console.log("🎉 Agent 已就绪");
    });
    
    // Agent 运行前
    context.on("agent:before_run", async (params) => {
      // 记录运行次数
      const runCount = await store.get("runCount") || 0;
      await store.set("runCount", runCount + 1);
    });
    
    // 会话创建
    context.on("session:create", async (session) => {
      await store.set(`session:${session.id}:createdAt`, Date.now());
      console.log(`📁 新会话已创建: ${session.id}`);
    });
    
    // 消息发送前
    context.on("session:before_message", async (message) => {
      // 添加时间戳
      if (message.role === "user") {
        message.metadata = message.metadata || {};
        message.metadata.processedAt = Date.now();
      }
    });
    
    // 收到回复后
    context.on("session:after_message", async (response, session) => {
      // 更新消息计数
      const count = await store.get(`session:${session.id}:messageCount`) || 0;
      await store.set(`session:${session.id}:messageCount`, count + 1);
    });
    
    // 工具执行前
    context.on("tool:before_execute", (toolCall) => {
      console.log(`🔧 工具调用: ${toolCall.name}`);
    });
    
    // 工具执行后
    context.on("tool:after_execute", async (toolCall, result) => {
      // 记录工具调用统计
      const stats = await store.get("toolStats") || {};
      stats[toolCall.name] = (stats[toolCall.name] || 0) + 1;
      await store.set("toolStats", stats);
    });
    
    console.log("✅ 事件处理器已注册");
    console.log("✨ full-example Extension 激活完成！");
    
    // 显示使用提示
    console.log("\n可用命令:");
    console.log("  /hello [name]     - 显示欢迎信息");
    console.log("  /clear-cache      - 清除缓存");
    console.log("\n可用工具:");
    console.log("  code_stats        - 代码统计");
    console.log("  project_info      - 项目信息\n");
  },
  
  async deactivate() {
    console.log("👋 full-example Extension 正在停用...");
    
    // 清理资源
    // 保存最终状态
    await store.set("lastDeactivated", Date.now());
    
    console.log("✅ Extension 已安全停用");
  }
};

// ═══════════════════════════════════════════════════════════════
// 5. 工具函数
// ═══════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 导入 Node.js 模块
import * as fs from "fs";
```

## 10. 最佳实践

### 10.1 错误处理

```typescript
// ✅ 正确使用 try/catch
const myTool: AgentTool = {
  name: "safe_operation",
  // ...
  async *execute(toolCallId, params, signal) {
    try {
      yield { type: "progress", message: "开始执行..." };
      
      const result = await performOperation(params);
      
      yield { type: "text", text: result };
    } catch (error) {
      // 友好的错误信息
      const message = error instanceof Error ? error.message : String(error);
      yield { type: "error", error: `操作失败: ${message}` };
    }
  }
};

// ✅ 异步操作的错误处理
async function fetchData(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    // 重新抛出时添加上下文
    throw new Error(`获取数据失败: ${error.message}`);
  }
}

// ✅ 在 Extension 中集中处理错误
export const extension: Extension = {
  name: "error-handling-example",
  version: "1.0.0",
  
  async activate(context) {
    // 全局错误监听
    context.on("agent:error", (error) => {
      console.error("全局错误捕获:", error);
      // 发送错误报告、记录日志等
    });
  }
};
```

### 10.2 资源清理

```typescript
// ✅ 在 deactivate 中清理资源
export const extension: Extension = {
  name: "resource-example",
  version: "1.0.0",
  
  // 保存需要清理的资源
  private cleanupTasks: Array<() => void> = [],
  private fileWatchers: Array<FSWatcher> = [],
  private intervals: Array<NodeJS.Timeout> = [],
  
  async activate(context) {
    // 1. 创建文件监听器
    const watcher = fs.watch("src", (event, filename) => {
      console.log(`${filename} changed`);
    });
    this.fileWatchers.push(watcher);
    
    // 2. 创建定时器
    const interval = setInterval(() => {
      this.checkStatus();
    }, 60000);
    this.intervals.push(interval);
    
    // 3. 创建临时文件
    const tempFile = `/tmp/pi-extension-${Date.now()}.tmp`;
    await fs.promises.writeFile(tempFile, "");
    this.cleanupTasks.push(() => {
      fs.unlinkSync(tempFile);
    });
  },
  
  async deactivate() {
    // 清理所有资源
    console.log("正在清理资源...");
    
    // 停止文件监听器
    for (const watcher of this.fileWatchers) {
      watcher.close();
    }
    
    // 清除定时器
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    
    // 执行清理任务
    for (const task of this.cleanupTasks) {
      try {
        task();
      } catch (error) {
        console.error("清理任务失败:", error);
      }
    }
    
    console.log("资源清理完成");
  }
};
```

### 10.3 版本兼容

```typescript
// ✅ 声明兼容的 pi 版本
export const extension: Extension = {
  name: "version-aware",
  version: "2.0.0",
  piVersion: ">=0.5.0 <1.0.0", // 支持 0.5.0 到 1.0.0 之前
  
  async activate(context) {
    // 检查 API 可用性
    if (!context.registerShortcut) {
      console.warn("当前 pi 版本不支持快捷键功能");
    }
    
    // 条件性使用功能
    if (context.logger?.debug) {
      context.logger.debug("Extension 已激活");
    } else {
      console.log("Extension 已激活");
    }
  }
};

// ✅ 处理依赖版本
export const extension: Extension = {
  name: "dependency-example",
  version: "1.0.0",
  dependencies: ["other-extension@^1.0.0"], // 语义化版本依赖
  
  async activate(context) {
    // 检查依赖是否已加载
    const otherExtension = context.getExtension?.("other-extension");
    if (!otherExtension) {
      throw new Error("需要 other-extension@^1.0.0");
    }
  }
};
```

### 10.4 文档完善

```typescript
/**
 * @fileoverview 代码质量检查 Extension
 * 
 * 提供代码复杂度分析、重复代码检测等功能。
 * 
 * ## 安装
 * 
 * 将本目录复制到 `.pi/extensions/code-quality/`
 * 
 * ## 配置
 * 
 * 在 `.pi/config.json` 中添加：
 * ```json
 * {
 *   "extensions": {
 *     "code-quality": {
 *       "maxComplexity": 10,
 *       "minSimilarity": 0.8
 *     }
 *   }
 * }
 * ```
 * 
 * ## 使用
 * 
 * 命令:
 * - `/analyze [file]` - 分析指定文件
 * - `/duplicates` - 查找重复代码
 * 
 * 工具:
 * - `check_complexity` - 检查代码复杂度
 * - `find_duplicates` - 查找重复代码
 * 
 * ## 示例
 * 
 * ```typescript
 * // 分析当前文件
 * /analyze src/utils.ts
 * 
 * // 检查复杂度
 * check_complexity({ file: "src/index.ts" })
 * ```
 * 
 * @author Your Name
 * @license MIT
 * @version 1.0.0
 */

// 详细的 JSDoc 注释
/**
 * 计算代码圈复杂度
 * 
 * 圈复杂度（Cyclomatic Complexity）是一种软件度量，
 * 用于表示程序中独立路径的数量。
 * 
 * - 1-10: 简单，低风险
 * - 11-20: 较复杂，中等风险
 * - 21-50: 复杂，高风险
 * - >50: 非常复杂，极高风险
 * 
 * @param code - 要分析的源代码
 * @param options - 分析选项
 * @returns 复杂度分析报告
 * 
 * @example
 * ```typescript
 * const result = calculateComplexity(
 *   "function test(x) { if (x) return 1; else return 0; }",
 *   { includeComments: false }
 * );
 * console.log(result.score); // 2
 * ```
 */
function calculateComplexity(
  code: string,
  options: ComplexityOptions = {}
): ComplexityReport {
  // 实现...
}
```

### 10.5 测试覆盖

```typescript
// tests/tools/analyze.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { analyzeTool } from "../../src/tools/analyze";

describe("analyze tool", () => {
  it("should analyze a single file", async () => {
    const events = [];
    for await (const event of analyzeTool.execute("call_1", {
      filePath: "tests/fixtures/simple.ts"
    })) {
      events.push(event);
    }
    
    const finalEvent = events.find(e => e.type === "text");
    expect(finalEvent).toBeDefined();
    expect(finalEvent.text).toContain("complexity");
  });
  
  it("should handle non-existent files", async () => {
    const events = [];
    for await (const event of analyzeTool.execute("call_1", {
      filePath: "non-existent.ts"
    })) {
      events.push(event);
    }
    
    const errorEvent = events.find(e => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error).toContain("不存在");
  });
  
  it("should report progress for directory analysis", async () => {
    const progressEvents = [];
    for await (const event of analyzeTool.execute("call_1", {
      directory: "tests/fixtures/"
    })) {
      if (event.type === "progress") {
        progressEvents.push(event);
      }
    }
    
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0].percent).toBe(0);
    expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
  });
  
  it("should respect abort signal", async () => {
    const controller = new AbortController();
    
    // 立即中止
    controller.abort();
    
    const events = [];
    for await (const event of analyzeTool.execute("call_1", {
      directory: "tests/fixtures/"
    }, controller.signal)) {
      events.push(event);
    }
    
    const errorEvent = events.find(e => e.type === "error");
    expect(errorEvent?.error).toContain("中止");
  });
});
```

## 11. 调试与发布

### 11.1 本地调试

```typescript
// 启用调试模式
export const extension: Extension = {
  name: "debug-example",
  version: "1.0.0",
  
  async activate(context) {
    // 1. 使用 logger 记录调试信息
    context.logger.debug("Extension 正在初始化");
    context.logger.debug("配置:", context.config);
    
    // 2. 条件性启用详细日志
    const isDebugMode = process.env.PI_DEBUG === "true";
    
    if (isDebugMode) {
      // 记录所有事件
      const events = [
        "agent:init", "agent:before_run", "agent:after_run",
        "session:create", "session:before_message", "session:after_message",
        "tool:before_execute", "tool:after_execute"
      ];
      
      for (const event of events) {
        context.on(event, (...args) => {
          console.log(`[DEBUG] Event: ${event}`, args);
        });
      }
    }
    
    // 3. 添加调试命令
    context.registerCommand({
      name: "debug-info",
      description: "显示 Extension 调试信息",
      handler: async () => {
        console.log("\n🔍 调试信息");
        console.log("━".repeat(40));
        
        const stats = await context.sessionStore.getStats();
        console.log("会话统计:", stats);
        
        const keys = await context.sessionStore.keys();
        console.log("存储键:", keys);
        
        console.log("━".repeat(40));
      }
    });
  }
};

// 在 package.json 中添加调试脚本
{
  "scripts": {
    "debug": "PI_DEBUG=true pi",
    "test": "vitest",
    "test:watch": "vitest --watch"
  }
}
```

### 11.2 日志输出

```typescript
// 结构化日志记录
import { createLogger, format, transports } from "winston";

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { extension: "my-extension" },
  transports: [
    new transports.File({ filename: ".pi/logs/extension-error.log", level: "error" }),
    new transports.File({ filename: ".pi/logs/extension.log" }),
  ]
});

// 开发环境也输出到控制台
if (process.env.NODE_ENV !== "production") {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    )
  }));
}

// 在 Extension 中使用
export const extension: Extension = {
  name: "logging-example",
  version: "1.0.0",
  
  async activate(context) {
    logger.info("Extension 已激活");
    
    try {
      await doSomething();
      logger.info("操作成功");
    } catch (error) {
      logger.error("操作失败:", error);
    }
  }
};
```

### 11.3 打包发布

```bash
# Extension 目录结构
my-extension/
├── package.json          # 包配置
├── tsconfig.json         # TypeScript 配置
├── README.md             # 文档
├── LICENSE               # 许可证
├── src/
│   ├── index.ts          # 入口文件
│   ├── tools/            # 工具定义
│   │   ├── index.ts
│   │   └── my-tool.ts
│   ├── commands/         # 命令定义
│   │   ├── index.ts
│   │   └── my-command.ts
│   └── utils/            # 工具函数
│       └── index.ts
└── test/                 # 测试文件
    └── index.test.ts
```

```json
// package.json
{
  "name": "pi-extension-my-tool",
  "version": "1.0.0",
  "description": "pi-coding-agent Extension 示例",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "prepublishOnly": "npm run build && npm test"
  },
  "keywords": [
    "pi",
    "pi-coding-agent",
    "extension"
  ],
  "peerDependencies": {
    "@mariozechner/pi": ">=0.1.0"
  },
  "devDependencies": {
    "@mariozechner/pi": "^0.1.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### 11.4 Pi Packages 集成

```typescript
// 在 Extension 中使用 Pi Packages
export const extension: Extension = {
  name: "package-integration",
  version: "1.0.0",
  
  async activate(context) {
    // 访问 Pi Packages 的 API
    const packages = context.packages;
    
    // 列出已安装的包
    const installedPackages = await packages.list();
    console.log("已安装的包:", installedPackages);
    
    // 注册包命令
    context.registerCommand({
      name: "list-packages",
      description: "列出所有已安装的 Pi Packages",
      handler: async () => {
        const list = await packages.list();
        for (const pkg of list) {
          console.log(`- ${pkg.name}@${pkg.version}`);
        }
      }
    });
  }
};
```

## 12. 对应源码

### 12.1 核心文件

| 文件路径 | 说明 |
|----------|------|
| `packages/coding-agent/src/core/extensions.ts` | Extension 类型定义和上下文接口 |
| `packages/coding-agent/src/core/resource-loader.ts` | Extension 加载和初始化 |
| `packages/coding-agent/src/core/tools/index.ts` | 工具注册机制和 AgentTool 接口 |

### 12.2 关键类型定义

```typescript
// packages/coding-agent/src/core/extensions.ts

/**
 * Extension 接口
 * 所有 Extension 必须实现此接口
 */
export interface Extension {
  name: string;
  version: string;
  activate(context: ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
  dependencies?: string[];
  piVersion?: string;
}

/**
 * ExtensionContext 接口
 * Extension 与 Agent 交互的上下文
 */
export interface ExtensionContext {
  registerTool<T>(tool: AgentTool<T>): void;
  registerCommand(command: Command): void;
  registerShortcut?(shortcut: Shortcut): void;
  registerFlag?(flag: Flag): void;
  on(event: string, handler: (...args: any[]) => void): void;
  once(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  sessionStore: SessionStore;
  config: Config;
  logger: Logger;
}
```

### 12.3 加载流程

```typescript
// packages/coding-agent/src/core/resource-loader.ts

export async function loadExtensions(): Promise<Extension[]> {
  const extensions: Extension[] = [];
  const contexts: ExtensionContext[] = [];
  
  // 1. 发现所有 Extension
  const extensionPaths = await discoverExtensions();
  
  // 2. 按依赖顺序排序
  const sortedPaths = topologicalSort(extensionPaths);
  
  // 3. 加载并激活每个 Extension
  for (const extPath of sortedPaths) {
    try {
      // 导入 Extension 模块
      const module = await import(extPath);
      const extension: Extension = module.extension || module.default;
      
      // 验证版本兼容性
      if (extension.piVersion && !satisfies(PI_VERSION, extension.piVersion)) {
        console.warn(`Extension ${extension.name} 需要 pi 版本 ${extension.piVersion}`);
        continue;
      }
      
      // 创建上下文
      const context = createExtensionContext(extension);
      contexts.push(context);
      
      // 激活 Extension
      await extension.activate(context);
      
      extensions.push(extension);
      console.log(`Extension ${extension.name}@${extension.version} 已激活`);
    } catch (error) {
      console.error(`加载 Extension ${extPath} 失败:`, error);
      // 继续加载其他 Extension
    }
  }
  
  return extensions;
}
```

## 总结

Extension 系统的核心要点：

1. **Extension 是什么**：代码式扩展机制，提供程序级控制能力
2. **注册方式**：全局、项目本地、npm 包三种方式
3. **核心能力**：自定义工具、斜杠命令、生命周期钩子、会话存储
4. **生命周期**：Agent、会话、工具三个层面的完整事件系统
5. **开发流程**：定义接口 → 实现逻辑 → 注册到上下文 → 处理事件
6. **最佳实践**：错误处理、资源清理、版本兼容、文档完善、测试覆盖

---

**下篇预告**: 如需了解更深入的插件系统和扩展机制，可参考 `06-advanced-features.md` —— 高级功能与最佳实践。
