# 高级功能、定制与最佳实践

> **难度：专家** | **预计阅读时间：25 分钟**

在前面的章节中，我们已经掌握了 pi-coding-agent 的核心概念。本章聚焦那些“让 pi 变成你自己的 pi”的能力：定制提示词、主题、模型选择，以及进一步扩展工具、插件和运行时策略。

## 1. 自定义工具

### 创建自定义工具

```typescript
// my-tools/custom-tool.ts
import { AgentTool } from "@mariozechner/pi";
import { Type } from "@sinclair/typebox";

export const customTool: AgentTool = {
  name: "custom_operation",
  label: "自定义操作",
  description: "执行自定义的业务逻辑",
  parameters: Type.Object({
    param1: Type.String({ description: "参数1" }),
    param2: Type.Number({ description: "参数2" }),
  }),
  
  execute: async (toolCallId, params, context) => {
    const { param1, param2 } = params;
    
    // 执行自定义逻辑
    const result = await doSomething(param1, param2);
    
    return {
      content: [{ type: "text", text: result }],
      details: { param1, param2, result },
    };
  },
};

// 注册自定义工具
import { registerTool } from "@mariozechner/pi";

registerTool(customTool);
```

### 工具组合

```typescript
// 组合多个工具完成复杂任务
export const refactorTool: AgentTool = {
  name: "refactor_code",
  label: "重构代码",
  description: "安全地重构代码",
  parameters: Type.Object({
    filePath: Type.String(),
    oldPattern: Type.String(),
    newPattern: Type.String(),
  }),
  
  execute: async (toolCallId, params, context) => {
    const { filePath, oldPattern, newPattern } = params;
    
    // 1. 读取文件
    const content = await readFile(filePath);
    
    // 2. 检查类型错误
    const diagnostics = await getDiagnostics(filePath);
    if (diagnostics.errors.length > 0) {
      throw new Error(`文件有类型错误，无法重构`);
    }
    
    // 3. 执行重构
    const newContent = content.replace(oldPattern, newPattern);
    
    // 4. 写入文件
    await writeFile(filePath, newContent);
    
    // 5. 验证重构
    const newDiagnostics = await getDiagnostics(filePath);
    
    return {
      content: [{ type: "text", text: `重构完成: ${filePath}` }],
      details: {
        filePath,
        changes: countChanges(content, newContent),
        errors: newDiagnostics.errors.length,
      },
    };
  },
};
```

## 2. Prompt、主题与模型定制

主线前几章已经讲过系统提示词、交互模式和会话管理，但在真正长期使用时，用户通常最先想改的不是核心循环，而是“agent 的行为”和“界面的感觉”。

### 什么时候应该定制

| 诉求 | 更适合的定制点 |
|------|----------------|
| 想让 agent 更像代码审查者，而不是通用助手 | Prompt Template |
| 想让不同项目有不同默认行为 | 项目级 prompt / settings |
| 想切换不同模型或推理强度 | 模型与 thinking 配置 |
| 想让终端界面更符合自己的习惯 | Theme |

### Prompt Template

Prompt Template 适合封装“稳定的角色与工作方式”，而不是在每次对话里重复输入长提示。

```markdown
<!-- .pi/prompts/review.md -->
Review this change as a strict code reviewer.

Focus on:
- correctness
- regressions
- test coverage
- security
```

使用方式：

```text
/review
```

更进一步时，你可以把它做成“项目模板”：

- 后端仓库默认强调 schema 变更、事务边界、兼容性
- 前端仓库默认强调交互一致性、可访问性、性能
- 基础设施仓库默认强调回滚、幂等和可观测性

### 主题定制

Theme 解决的是可读性和工作负载下的视觉反馈问题。

你通常不需要一开始就写复杂主题，先定三类信息的区分就够了：

1. 用户消息和助手消息是否容易区分
2. 工具调用成功 / 失败是否足够醒目
3. 代码块、引用、系统提示是否不会混在一起

一个最小主题通常包含：

- 前景色 / 背景色
- 强调色
- 成功 / 警告 / 错误色
- 用户消息、助手消息、工具消息、代码块的样式

### 模型与思考级别

模型选择决定能力边界，thinking level 决定推理成本和响应速度。

一个实用的经验是：

- 日常编辑、小修小补：低 thinking 或关闭 thinking
- 重构、架构决策、复杂排障：中高 thinking
- 长上下文分析：优先看模型上下文窗口与工具支持，而不是只看“最强”

例如：

```bash
# 使用特定模型
pi --model openai/gpt-4o

# 提高推理强度
pi --model sonnet:high
```

### 配置落点

这类定制通常放在三层：

| 层级 | 适合放什么 |
|------|------------|
| 全局配置 | 你自己的默认主题、默认模型、通用 prompt |
| 项目配置 | 团队共享规范、项目专属 prompt、默认工具范围 |
| 临时会话 | 当前任务要临时切的模型、prompt 或思考级别 |

如果你想看 Prompt、Theme、模型切换 UI 的更展开版本，可以继续读补充专题 [03-prompts-theming.md](03-prompts-theming.md)。

## 3. 插件系统

### 插件接口

```typescript
// packages/coding-agent/src/plugins/plugin.ts

export interface Plugin {
  // 插件名称
  name: string;
  
  // 版本
  version: string;
  
  // 初始化
  initialize?: (context: PluginContext) => Promise<void>;
  
  // 注册工具
  registerTools?: () => AgentTool[];
  
  // 注册钩子
  registerHooks?: () => PluginHooks;
}

export interface PluginContext {
  // 配置
  config: Config;
  
  // 日志
  logger: Logger;
  
  // 事件总线
  events: EventEmitter;
}

export interface PluginHooks {
  // 会话创建前
  beforeSessionCreate?: (options: SessionOptions) => Promise<void>;
  
  // 消息发送前
  beforeMessageSend?: (message: string) => Promise<string>;
  
  // 消息接收后
  afterMessageReceive?: (response: AgentResponse) => Promise<void>;
  
  // 工具调用前
  beforeToolCall?: (toolCall: ToolCall) => Promise<void>;
  
  // 工具调用后
  afterToolCall?: (toolCall: ToolCall, result: ToolResult) => Promise<void>;
}
```

### 示例插件

```typescript
// plugins/metrics-plugin.ts

export const metricsPlugin: Plugin = {
  name: "metrics",
  version: "1.0.0",
  
  initialize: async (context) => {
    context.logger.info("Metrics plugin initialized");
  },
  
  registerHooks: () => ({
    beforeToolCall: async (toolCall) => {
      metrics.recordToolCallStart(toolCall.tool);
    },
    
    afterToolCall: async (toolCall, result) => {
      metrics.recordToolCallEnd(toolCall.tool, result.isError);
    },
  }),
};

// 使用插件
import { loadPlugin } from "@mariozechner/pi";

const session = await createSession({
  plugins: [metricsPlugin],
});
```

## 4. 性能优化

### 缓存策略

```typescript
// 文件内容缓存
class FileCache {
  private cache = new Map<string, { content: string; mtime: number }>();
  
  async read(filePath: string): Promise<string> {
    const stats = await fs.stat(filePath);
    const cached = this.cache.get(filePath);
    
    // 检查缓存是否有效
    if (cached && cached.mtime === stats.mtime.getTime()) {
      return cached.content;
    }
    
    // 读取并缓存
    const content = await fs.readFile(filePath, "utf-8");
    this.cache.set(filePath, {
      content,
      mtime: stats.mtime.getTime(),
    });
    
    return content;
  }
  
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }
}

// LSP 结果缓存
class LspCache {
  private cache = new Map<string, { diagnostics: Diagnostic[]; timestamp: number }>();
  private ttl = 5000;  // 5 秒
  
  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const cached = this.cache.get(filePath);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.diagnostics;
    }
    
    const diagnostics = await lsp.getDiagnostics(filePath);
    this.cache.set(filePath, {
      diagnostics,
      timestamp: Date.now(),
    });
    
    return diagnostics;
  }
}
```

### 并发控制

```typescript
// 限制并发工具调用
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  private maxConcurrency = 3;
  
  async acquire(): Promise<() => void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return () => this.release();
    }
    
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve(() => this.release());
      });
    });
  }
  
  private release(): void {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }
}

// 使用
const limiter = new ConcurrencyLimiter();

const tool: AgentTool = {
  execute: async (toolCallId, params) => {
    const release = await limiter.acquire();
    try {
      return await doWork(params);
    } finally {
      release();
    }
  },
};
```

## 5. 安全实践

### 路径限制

```typescript
// 安全配置
const securityConfig = {
  // 允许的路径
  allowedPaths: [
    "src/**",
    "tests/**",
    "docs/**",
  ],
  
  // 禁止的路径
  deniedPaths: [
    ".env",
    ".env.*",
    "**/node_modules/**",
    "/etc/**",
    "/usr/**",
    "**/.ssh/**",
    "**/.git/**",
  ],
  
  // 需要确认的操作
  requireConfirmation: [
    "write",
    "edit",
    "bash",
  ],
};

// 路径检查
function isPathAllowed(filePath: string, config: SecurityConfig): boolean {
  // 规范化路径
  const normalized = path.normalize(filePath);
  const absolute = path.resolve(normalized);
  
  // 检查禁止路径
  for (const denied of config.deniedPaths) {
    if (minimatch(absolute, denied)) {
      return false;
    }
  }
  
  // 检查允许路径
  for (const allowed of config.allowedPaths) {
    if (minimatch(absolute, allowed)) {
      return true;
    }
  }
  
  return false;
}
```

### 命令白名单

```typescript
// Bash 工具安全配置
const bashConfig = {
  // 允许的命令
  allowedCommands: [
    "ls", "cat", "grep", "find", "head", "tail",
    "npm", "yarn", "pnpm",
    "git", "git status", "git diff", "git log",
    "npx", "node", "python", "python3",
    "mkdir", "touch", "cp", "mv", "rm",
  ],
  
  // 禁止的参数
  deniedArgs: [
    "-rf /",
    "--delete",
    "--force",
  ],
  
  // 超时设置
  timeout: 30000,
  
  // 最大输出大小
  maxOutputSize: 1024 * 1024,  // 1MB
};

// 命令检查
function isCommandAllowed(command: string, config: BashConfig): boolean {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  
  // 检查命令
  if (!config.allowedCommands.includes(cmd)) {
    return false;
  }
  
  // 检查参数
  for (const arg of parts.slice(1)) {
    if (config.deniedArgs.some(denied => arg.includes(denied))) {
      return false;
    }
  }
  
  return true;
}
```

### 敏感信息过滤

```typescript
// 过滤敏感信息
function sanitizeOutput(output: string): string {
  const patterns = [
    // API Keys
    { pattern: /sk-[a-zA-Z0-9]{48}/g, replacement: "[API_KEY]" },
    // Passwords
    { pattern: /password[:\s=]+\S+/gi, replacement: "password: [REDACTED]" },
    // Tokens
    { pattern: /token[:\s=]+[a-zA-Z0-9_-]+/gi, replacement: "token: [REDACTED]" },
    // Secrets
    { pattern: /secret[:\s=]+\S+/gi, replacement: "secret: [REDACTED]" },
  ];
  
  let sanitized = output;
  for (const { pattern, replacement } of patterns) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  return sanitized;
}

// 在工具中使用
const tool: AgentTool = {
  execute: async (toolCallId, params) => {
    const result = await doWork(params);
    
    return {
      content: [{
        type: "text",
        text: sanitizeOutput(result.text),
      }],
    };
  },
};
```

## 6. 错误处理

### 全局错误处理

```typescript
// 错误处理器
class ErrorHandler {
  private session: Session;
  
  constructor(session: Session) {
    this.session = session;
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    // 未捕获的异常
    process.on("uncaughtException", (error) => {
      this.handleError(error);
    });
    
    // 未处理的 Promise 拒绝
    process.on("unhandledRejection", (reason) => {
      this.handleError(reason as Error);
    });
  }
  
  private handleError(error: Error): void {
    // 记录错误
    console.error("Error:", error);
    
    // 显示错误对话框
    this.showErrorDialog(error);
    
    // 保存会话状态
    this.session.save();
  }
  
  private showErrorDialog(error: Error): void {
    // 在 TUI 中显示错误
    const dialog = new ErrorDialog(error.message);
    this.session.tui.showOverlay(new Overlay({
      content: dialog,
      modal: true,
    }));
  }
}
```

### 工具错误恢复

```typescript
// 带重试的工具执行
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${i + 1} failed: ${lastError.message}`);
      
      if (i < maxRetries - 1) {
        await delay(1000 * (i + 1));  // 指数退避
      }
    }
  }
  
  throw lastError;
}

// 使用
const tool: AgentTool = {
  execute: async (toolCallId, params) => {
    return await executeWithRetry(async () => {
      return await doWork(params);
    });
  },
};
```

## 7. 测试策略

### 单元测试

```typescript
// tests/tools/read.test.ts
import { describe, it, expect } from "vitest";
import { readTool } from "@mariozechner/pi";

describe("read tool", () => {
  it("should read file content", async () => {
    const result = await readTool.execute("call_1", {
      filePath: "tests/fixtures/sample.txt",
    });
    
    expect(result.content[0].text).toContain("Hello, World!");
  });
  
  it("should throw error for non-existent file", async () => {
    await expect(
      readTool.execute("call_1", {
        filePath: "non-existent.txt",
      })
    ).rejects.toThrow("文件不存在");
  });
  
  it("should respect offset and limit", async () => {
    const result = await readTool.execute("call_1", {
      filePath: "tests/fixtures/multi-line.txt",
      offset: 2,
      limit: 3,
    });
    
    const lines = result.content[0].text.split("\n");
    expect(lines[0]).toContain("3:");  // 从第 3 行开始
    expect(lines).toHaveLength(3);
  });
});
```

### 集成测试

```typescript
// tests/session.test.ts
import { describe, it, expect } from "vitest";
import { createSession } from "@mariozechner/pi";

describe("Session", () => {
  it("should complete conversation flow", async () => {
    const session = await createSession({
      name: "test-session",
    });
    
    // 发送消息
    const response = await session.sendMessage("Hello");
    
    expect(response.text).toBeTruthy();
    expect(session.state.stats.messageCount).toBe(2);  // user + assistant
  });
  
  it("should save and restore session", async () => {
    const session = await createSession({
      name: "test-session",
    });
    
    await session.sendMessage("Hello");
    await session.save();
    
    // 恢复会话
    const restored = await loadSession(session.id);
    
    expect(restored.name).toBe(session.name);
    expect(restored.agent.messages).toHaveLength(2);
  });
});
```

### Mock 工具

```typescript
// tests/mocks/tools.ts
export const mockReadTool: AgentTool = {
  name: "read",
  label: "读取文件",
  description: "Mock read tool",
  parameters: Type.Object({ filePath: Type.String() }),
  
  execute: async (toolCallId, params) => {
    const { filePath } = params;
    
    // 返回 mock 内容
    const mockFiles: Record<string, string> = {
      "src/index.ts": "export function main() {}",
      "package.json": '{"name": "test"}',
    };
    
    const content = mockFiles[filePath] || "Mock content";
    
    return {
      content: [{ type: "text", text: content }],
      details: { filePath },
    };
  },
};

// 使用 mock
const session = await createSession({
  tools: [mockReadTool],  // 使用 mock
});
```

## 8. 部署与运维

### Docker 部署

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制代码
COPY . .

# 构建
RUN npm run build

# 运行
ENTRYPOINT ["node", "dist/cli.js"]
```

```yaml
# docker-compose.yml
version: "3"
services:
  pi:
    build: .
    volumes:
      - ./workspace:/workspace
      - ~/.pi:/root/.pi
    working_dir: /workspace
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    stdin_open: true
    tty: true
```

### 日志管理

```typescript
// 结构化日志
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// 使用
logger.info("Session created", { sessionId: session.id });
logger.error("Tool execution failed", { tool: toolName, error: error.message });
```

## 9. 完整示例：生产级配置

```typescript
// production-config.ts
import { Config } from "@mariozechner/pi";

export const productionConfig: Config = {
  // 模型配置
  model: "anthropic:claude-sonnet-4-20250514",
  
  // 工具配置
  tools: {
    read: true,
    write: { enabled: true, requireConfirmation: true },
    edit: { enabled: true, requireConfirmation: true },
    bash: {
      enabled: true,
      allowedCommands: ["ls", "cat", "grep", "npm", "git"],
      timeout: 30000,
    },
    grep: true,
    "ast-grep": true,
    "lsp-diagnostics": true,
  },
  
  // 安全配置
  security: {
    allowedPaths: ["src/**", "tests/**"],
    deniedPaths: [".env", "**/node_modules/**"],
  },
  
  // 会话配置
  session: {
    autoSave: true,
    saveInterval: 30000,
    maxSessions: 100,
  },
  
  // 性能配置
  performance: {
    cacheEnabled: true,
    maxCacheSize: 100 * 1024 * 1024,  // 100MB
    maxConcurrency: 3,
  },
  
  // 日志配置
  logging: {
    level: "info",
    file: "pi.log",
  },
};

// 使用
import { createSession } from "@mariozechner/pi";

const session = await createSession({
  ...productionConfig,
  name: "production-task",
});
```

## 总结

高级功能与最佳实践的核心要点：

1. **自定义工具**：扩展工具系统满足特定需求
2. **Prompt、主题与模型定制**：把 pi 调整到适合团队和项目的工作方式
3. **插件系统**：通过钩子扩展功能
4. **性能优化**：缓存、并发控制、节流
5. **安全实践**：路径限制、命令白名单、敏感信息过滤
6. **错误处理**：全局错误处理、重试机制
7. **测试策略**：单元测试、集成测试、Mock 工具
8. **部署运维**：Docker、日志管理、监控

---

**系列完成**：至此，你已经掌握了 pi-coding-agent 的全部核心概念和高级用法。建议：
1. 从简单示例开始实践
2. 逐步添加自定义工具
3. 关注安全性和性能
4. 建立完善的测试覆盖
