# 高级模式与最佳实践

> **难度：专家** | **预计阅读时间：25 分钟**

在前面的章节中，我们已经掌握了 pi-agent 的核心概念。本章将探讨一些高级模式和最佳实践，帮助你构建生产级的 Agent 应用。

## 1. 状态持久化

### 为什么需要持久化？

想象一下场景：
- 用户关闭了 IDE，第二天重新打开，对话历史丢失
- 服务器重启，所有用户的 Agent 状态消失
- 需要支持"撤销"操作，回退到之前的状态

状态持久化解决这些问题。

### 实现状态序列化

```typescript
interface SerializedAgentState {
  version: number;
  systemPrompt: string;
  model: string;  // modelId
  thinkingLevel: ThinkingLevel;
  tools: string[];  // tool names
  messages: AgentMessage[];
  timestamp: number;
}

function serializeState(state: AgentState): SerializedAgentState {
  return {
    version: 1,
    systemPrompt: state.systemPrompt,
    model: state.model.modelId,
    thinkingLevel: state.thinkingLevel,
    tools: state.tools.map(t => t.name),
    messages: state.messages,
    timestamp: Date.now(),
  };
}

function deserializeState(
  serialized: SerializedAgentState,
  availableTools: AgentTool[]
): Partial<AgentState> {
  return {
    systemPrompt: serialized.systemPrompt,
    // 需要通过 modelId 重新获取 Model 对象
    model: getModelById(serialized.model),
    thinkingLevel: serialized.thinkingLevel,
    // 通过 name 重新匹配工具
    tools: serialized.tools
      .map(name => availableTools.find(t => t.name === name))
      .filter(Boolean) as AgentTool[],
    messages: serialized.messages,
  };
}
```

### 自动保存实现

```typescript
class PersistentAgent {
  private agent: Agent;
  private saveInterval: number = 30000;  // 30 秒
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private storageKey: string,
    initialState: Partial<AgentState>
  ) {
    // 尝试恢复状态
    const saved = this.loadState();
    this.agent = new Agent({
      initialState: saved || initialState,
    });

    // 订阅事件以触发保存
    this.agent.subscribe(() => this.scheduleSave());
    
    // 开始自动保存
    this.startAutoSave();
  }

  private scheduleSave() {
    if (this.timer) return;
    
    this.timer = setTimeout(() => {
      this.saveState();
      this.timer = null;
    }, this.saveInterval);
  }

  private saveState() {
    const state = serializeState(this.agent.state);
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  private loadState(): Partial<AgentState> | null {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return null;
    
    try {
      const parsed = JSON.parse(saved);
      return deserializeState(parsed, this.availableTools);
    } catch (e) {
      console.error("Failed to load state:", e);
      return null;
    }
  }

  private startAutoSave() {
    // 页面关闭前保存
    window.addEventListener("beforeunload", () => this.saveState());
  }

  // 代理 Agent 的方法
  prompt(text: string) {
    return this.agent.prompt(text);
  }

  subscribe(callback: (event: AgentEvent) => void) {
    return this.agent.subscribe(callback);
  }

  // ... 其他方法
}
```

### 使用示例

```typescript
const agent = new PersistentAgent("my-ide-session", {
  systemPrompt: "你是一个 IDE 助手。",
  model: getModel("anthropic", "claude-sonnet-4-20250514"),
  tools: [readFileTool, writeFileTool],
});

// 自动保存和恢复
await agent.prompt("帮我优化这段代码");
// 关闭浏览器...
// 重新打开...
// 对话历史仍然存在！
```

## 2. 多 Agent 协作

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     多 Agent 协作架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │  Planner     │────→│  Coder       │────→│  Reviewer    │   │
│  │  (规划 Agent) │     │  (编码 Agent) │     │  (审查 Agent) │   │
│  └──────────────┘     └──────────────┘     └──────────────┘   │
│         │                    │                    │            │
│         └────────────────────┴────────────────────┘            │
│                              │                                 │
│                              ▼                                 │
│                    ┌──────────────────┐                       │
│                    │  Shared Context  │                       │
│                    │  (共享上下文)     │                       │
│                    └──────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 实现示例

```typescript
// 定义共享上下文
interface SharedContext {
  requirements: string;
  designDoc: string;
  code: Map<string, string>;
  reviewComments: string[];
}

// 规划 Agent
const plannerAgent = new Agent({
  initialState: {
    systemPrompt: `你是一个软件架构师。根据需求制定实现计划。
输出格式：
1. 模块划分
2. 接口定义
3. 实现步骤`,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

// 编码 Agent
const coderAgent = new Agent({
  initialState: {
    systemPrompt: `你是一个资深开发者。根据设计文档编写代码。
要求：
- 代码清晰、有注释
- 包含错误处理
- 遵循最佳实践`,
    model: getModel("openai", "gpt-4o"),
    tools: [writeFileTool, readFileTool],
  },
});

// 审查 Agent
const reviewerAgent = new Agent({
  initialState: {
    systemPrompt: `你是一个代码审查专家。审查代码并提供改进建议。
检查项：
- 代码质量
- 潜在 bug
- 性能问题
- 安全漏洞`,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

// 协作流程
async function collaborativeCoding(requirements: string) {
  const shared: SharedContext = { requirements, designDoc: "", code: new Map(), reviewComments: [] };

  // 步骤 1：规划
  console.log("=== 步骤 1：制定计划 ===");
  await plannerAgent.prompt(`需求：${requirements}`);
  shared.designDoc = extractLastAssistantMessage(plannerAgent.state.messages);

  // 步骤 2：编码
  console.log("=== 步骤 2：编写代码 ===");
  await coderAgent.prompt(`根据以下设计文档编写代码：\n${shared.designDoc}`);
  
  // 提取生成的代码
  const codeFiles = extractCodeBlocks(coderAgent.state.messages);
  for (const [filename, content] of codeFiles) {
    shared.code.set(filename, content);
  }

  // 步骤 3：审查
  console.log("=== 步骤 3：代码审查 ===");
  for (const [filename, content] of shared.code) {
    await reviewerAgent.prompt(`审查文件 ${filename}：\n\`\`\`\n${content}\n\`\`\``);
    const comments = extractReviewComments(reviewerAgent.state.messages);
    shared.reviewComments.push(...comments);
  }

  // 步骤 4：根据审查意见修改（可选迭代）
  if (shared.reviewComments.length > 0) {
    console.log("=== 步骤 4：修复问题 ===");
    await coderAgent.prompt(`根据审查意见修改代码：\n${shared.reviewComments.join("\n")}`);
  }

  return shared;
}
```

## 3. 错误恢复策略

### 策略一：自动重试

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${i + 1} failed: ${lastError.message}`);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

// 使用
const agent = new Agent({
  streamFn: async (model, context, options) => {
    return withRetry(() => streamSimple(model, context, options), 3);
  },
});
```

### 策略二：降级处理

```typescript
class ResilientAgent {
  private primaryModel: Model<any>;
  private fallbackModels: Model<any>[];

  constructor(primary: Model<any>, fallbacks: Model<any>[]) {
    this.primaryModel = primary;
    this.fallbackModels = fallbacks;
  }

  async prompt(text: string): Promise<void> {
    const models = [this.primaryModel, ...this.fallbackModels];
    
    for (const model of models) {
      try {
        const agent = new Agent({
          initialState: { model, /* ... */ },
        });
        await agent.prompt(text);
        return;
      } catch (error) {
        console.warn(`Model ${model.modelId} failed, trying fallback...`);
      }
    }
    
    throw new Error("All models failed");
  }
}

// 使用
const resilientAgent = new ResilientAgent(
  getModel("anthropic", "claude-sonnet-4-20250514"),
  [
    getModel("openai", "gpt-4o"),
    getModel("openai", "gpt-4o-mini"),
  ]
);
```

### 策略三：检查点恢复

```typescript
class CheckpointAgent {
  private checkpoints: Map<number, SerializedAgentState> = new Map();
  private checkpointId = 0;

  constructor(private agent: Agent) {}

  // 创建检查点
  createCheckpoint(): number {
    const id = ++this.checkpointId;
    this.checkpoints.set(id, serializeState(this.agent.state));
    return id;
  }

  // 恢复到检查点
  restoreCheckpoint(id: number): boolean {
    const state = this.checkpoints.get(id);
    if (!state) return false;
    
    this.agent.replaceMessages(deserializeState(state).messages || []);
    return true;
  }

  // 撤销（回到上一个检查点）
  undo(): boolean {
    if (this.checkpointId <= 1) return false;
    return this.restoreCheckpoint(this.checkpointId - 1);
  }

  // 清理旧检查点
  cleanup(maxCheckpoints: number = 10) {
    const ids = Array.from(this.checkpoints.keys()).sort((a, b) => a - b);
    while (ids.length > maxCheckpoints) {
      this.checkpoints.delete(ids.shift()!);
    }
  }
}

// 使用
const checkpointAgent = new CheckpointAgent(agent);

// 关键操作前创建检查点
const checkpointId = checkpointAgent.createCheckpoint();
try {
  await agent.prompt("执行复杂操作...");
  // 如果成功，可以删除检查点
  checkpointAgent.cleanup();
} catch (error) {
  // 失败时恢复
  checkpointAgent.restoreCheckpoint(checkpointId);
  console.log("操作失败，已恢复到之前状态");
}
```

## 4. 性能优化

### 优化一：工具结果缓存

```typescript
class CachedTool implements AgentTool {
  private cache: Map<string, { result: AgentToolResult<any>; timestamp: number }> = new Map();
  private ttl: number = 5 * 60 * 1000;  // 5 分钟

  constructor(
    private innerTool: AgentTool,
    options?: { ttl?: number }
  ) {
    if (options?.ttl) this.ttl = options.ttl;
  }

  get name() { return this.innerTool.name; }
  get label() { return this.innerTool.label; }
  get description() { return this.innerTool.description; }
  get parameters() { return this.innerTool.parameters; }

  async execute(
    toolCallId: string,
    params: any,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<any>
  ): Promise<AgentToolResult<any>> {
    const cacheKey = JSON.stringify(params);
    const cached = this.cache.get(cacheKey);
    
    // 检查缓存
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log(`[Cache Hit] ${this.name}`);
      return cached.result;
    }

    // 执行并缓存
    console.log(`[Cache Miss] ${this.name}`);
    const result = await this.innerTool.execute(toolCallId, params, signal, onUpdate);
    
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    return result;
  }

  clearCache() {
    this.cache.clear();
  }
}

// 使用
const cachedReadFile = new CachedTool(readFileTool, { ttl: 60000 });
```

### 优化二：并发控制

```typescript
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrency: number) {}

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

  private release() {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}

// 在工具中使用
const limiter = new ConcurrencyLimiter(3);

const limitedTool: AgentTool = {
  ...readFileTool,
  execute: async (toolCallId, params, signal, onUpdate) => {
    const release = await limiter.acquire();
    try {
      return await readFileTool.execute(toolCallId, params, signal, onUpdate);
    } finally {
      release();
    }
  },
};
```

### 优化三：流式渲染优化

```typescript
// 防抖渲染
class DebouncedRenderer {
  private buffer = "";
  private timer: NodeJS.Timeout | null = null;
  private readonly delay = 16;  // ~60fps

  constructor(private render: (text: string) => void) {}

  append(text: string) {
    this.buffer += text;
    
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.render(this.buffer);
        this.buffer = "";
        this.timer = null;
      }, this.delay);
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer) {
      this.render(this.buffer);
      this.buffer = "";
    }
  }
}

// 使用
const renderer = new DebouncedRenderer((text) => {
  ui.updateStreamingText(text);
});

agent.subscribe((event) => {
  if (event.type === "message_update" && 
      event.assistantMessageEvent.type === "text_delta") {
    renderer.append(event.assistantMessageEvent.delta);
  }
  if (event.type === "message_end") {
    renderer.flush();
  }
});
```

## 5. 安全最佳实践

### 输入验证

```typescript
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const safeReadFileTool: AgentTool = {
  name: "read_file",
  label: "读取文件",
  description: "读取文件内容",
  parameters: Type.Object({
    path: Type.String({ 
      description: "文件路径",
      pattern: "^[\\w\\-\\./]+$",  // 限制允许的字符
    }),
  }),
  execute: async (toolCallId, params, signal) => {
    // 验证参数
    if (!Value.Check(this.parameters, params)) {
      throw new Error("Invalid parameters");
    }

    // 路径安全检查
    const resolvedPath = path.resolve(params.path);
    const allowedDir = path.resolve("./workspace");
    
    if (!resolvedPath.startsWith(allowedDir)) {
      throw new Error("Access denied: path outside allowed directory");
    }

    // 检查文件大小
    const stats = await fs.stat(resolvedPath);
    if (stats.size > 10 * 1024 * 1024) {  // 10MB
      throw new Error("File too large");
    }

    const content = await fs.readFile(resolvedPath, "utf-8");
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};
```

### 权限控制

```typescript
interface Permission {
  tool: string;
  allowed: boolean;
  requireConfirmation?: boolean;
}

class PermissionManager {
  private permissions: Map<string, Permission> = new Map();

  setPermission(tool: string, allowed: boolean, requireConfirmation = false) {
    this.permissions.set(tool, { tool, allowed, requireConfirmation });
  }

  async checkPermission(tool: string): Promise<boolean> {
    const perm = this.permissions.get(tool);
    if (!perm || !perm.allowed) return false;
    
    if (perm.requireConfirmation) {
      return await this.showConfirmation(tool);
    }
    
    return true;
  }

  private async showConfirmation(tool: string): Promise<boolean> {
    // 显示确认对话框
    return new Promise((resolve) => {
      ui.showConfirmation(`Allow tool: ${tool}?`, resolve);
    });
  }
}

// 在 Agent 中使用
const permissionManager = new PermissionManager();
permissionManager.setPermission("write_file", true, true);  // 需要确认
permissionManager.setPermission("read_file", true, false);  // 直接允许
permissionManager.setPermission("delete_file", false);       // 禁止

const agent = new Agent({
  beforeToolExecution: async (toolCallId, tool, args) => {
    const allowed = await permissionManager.checkPermission(tool.name);
    if (!allowed) {
      throw new Error(`Permission denied for tool: ${tool.name}`);
    }
  },
});
```

## 6. 测试策略

### 单元测试

```typescript
import { describe, it, expect, vi } from "vitest";

describe("Agent", () => {
  it("should handle user prompt", async () => {
    const agent = new Agent({
      initialState: {
        systemPrompt: "Test",
        model: getModel("openai", "gpt-4o-mini"),
      },
    });

    const events: AgentEvent[] = [];
    agent.subscribe((e) => events.push(e));

    await agent.prompt("Hello");

    expect(events.some(e => e.type === "agent_start")).toBe(true);
    expect(events.some(e => e.type === "agent_end")).toBe(true);
    expect(agent.state.messages).toHaveLength(2);  // user + assistant
  });

  it("should handle tool execution", async () => {
    const mockTool: AgentTool = {
      name: "test_tool",
      label: "测试工具",
      description: "A test tool",
      parameters: Type.Object({ value: Type.Number() }),
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "result" }],
        details: {},
      }),
    };

    const agent = new Agent({
      initialState: {
        model: getModel("openai", "gpt-4o-mini"),
        tools: [mockTool],
      },
    });

    // 模拟 LLM 返回 tool call
    // ... 测试代码

    expect(mockTool.execute).toHaveBeenCalled();
  });
});
```

### 集成测试

```typescript
describe("Agent Integration", () => {
  it("should complete full conversation flow", async () => {
    const agent = createTestAgent();
    
    // 多轮对话
    await agent.prompt("What is 2+2?");
    await agent.prompt("Multiply that by 3");
    
    // 验证状态
    expect(agent.state.messages.length).toBeGreaterThan(2);
    
    // 验证上下文保留
    const lastMessage = agent.state.messages[agent.state.messages.length - 1];
    expect(lastMessage.role).toBe("assistant");
  });

  it("should handle steering correctly", async () => {
    const agent = createTestAgent();
    
    // 开始对话
    const promptPromise = agent.prompt("Tell me a story");
    
    // 中途干预
    setTimeout(() => {
      agent.steer({
        role: "user",
        content: [{ type: "text", text: "Make it about cats" }],
        timestamp: Date.now(),
      });
    }, 100);
    
    await promptPromise;
    
    // 验证干预被处理
    expect(agent.state.messages.some(m => 
      m.role === "user" && 
      m.content[0]?.text?.includes("cats")
    )).toBe(true);
  });
});
```

## 总结

高级模式与最佳实践的核心要点：

1. **状态持久化**：自动保存、版本控制、检查点恢复
2. **多 Agent 协作**：角色分工、共享上下文、流水线处理
3. **错误恢复**：自动重试、降级处理、检查点机制
4. **性能优化**：工具缓存、并发控制、流式渲染优化
5. **安全实践**：输入验证、权限控制、路径限制
6. **测试策略**：单元测试、集成测试、Mock 工具

这些模式帮助你构建**可靠、高效、安全**的生产级 Agent 应用。

---

**系列完成**：至此，你已经掌握了 pi-agent 的全部核心概念和高级用法。建议：
1. 从简单示例开始实践
2. 逐步添加自定义消息类型
3. 根据场景选择合适的模式
4. 始终关注错误处理和安全性
