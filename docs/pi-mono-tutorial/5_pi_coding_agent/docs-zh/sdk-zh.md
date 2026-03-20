> pi 可以帮助你使用 SDK。让它为你的用例构建一个集成。

# SDK

SDK 提供了对 pi agent(代理)能力的编程访问。使用它可以将 pi 嵌入到其他应用程序中、构建自定义界面，或与自动化工作流集成。

**示例用例：**
- 构建自定义 UI(用户界面)（Web、桌面、移动端）
- 将 agent 能力集成到现有应用程序中
- 创建带有 agent 推理的自动化流水线
- 构建生成子 agent 的自定义工具
- 以编程方式测试 agent 行为

有关从最小化到完全控制的完整示例，请参阅 [examples/sdk/](../examples/sdk/)。

## 快速上手

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";

// 设置凭证存储和模型注册表
const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
```

## 安装

```bash
npm install @mariozechner/pi-coding-agent
```

SDK 包含在主包中，无需单独安装。

## 核心概念

### createAgentSession()

主要的工厂函数。创建一个具有可配置选项的 `AgentSession`。

`createAgentSession()` 使用 `ResourceLoader` 来提供扩展、技能、提示模板、主题和上下文文件。如果你没有提供，它将使用带有标准发现机制的 `DefaultResourceLoader`。

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";

// 最小化：使用 DefaultResourceLoader 的默认配置
const { session } = await createAgentSession();

// 自定义：覆盖特定选项
const { session } = await createAgentSession({
  model: myModel,
  tools: [readTool, bashTool],
  sessionManager: SessionManager.inMemory(),
});
```

### AgentSession

会话管理 agent 的生命周期、消息历史和事件流。

```typescript
interface AgentSession {
  // 发送提示并等待完成
  // 如果正在流式传输，需要 streamingBehavior 选项来排队消息
  prompt(text: string, options?: PromptOptions): Promise<void>;
  
  // 在流式传输期间排队消息
  steer(text: string): Promise<void>;    // 在当前助手回合完成其工具调用后传递
  followUp(text: string): Promise<void>; // 等待：仅在 agent 完成时传递
  
  // 订阅事件（返回取消订阅函数）
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  
  // 会话信息
  sessionFile: string | undefined;  // 内存中时为 undefined
  sessionId: string;
  
  // 模型控制
  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;
  
  // 状态访问
  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;
  
  // 会话管理
  newSession(options?: { parentSession?: string }): Promise<boolean>;  // 如果被 hook(钩子)取消则返回 false
  switchSession(sessionPath: string): Promise<boolean>;
  
  // 分叉
  fork(entryId: string): Promise<{ selectedText: string; cancelled: boolean }>;  // 创建新会话文件
  navigateTree(targetId: string, options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string }): Promise<{ editorText?: string; cancelled: boolean }>;  // 原地导航
  
  // Hook 消息注入
  sendHookMessage(message: HookMessage, triggerTurn?: boolean): Promise<void>;
  
  // 压缩
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;
  
  // 中止当前操作
  abort(): Promise<void>;
  
  // 清理
  dispose(): void;
}
```

### 提示和消息排队

`prompt()` 方法处理提示模板、扩展命令和消息发送：

```typescript
// 基本提示（未流式传输时）
await session.prompt("What files are here?");

// 带图片
await session.prompt("What's in this image?", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }]
});

// 流式传输期间：必须指定如何排队消息
await session.prompt("Stop and do this instead", { streamingBehavior: "steer" });
await session.prompt("After you're done, also check X", { streamingBehavior: "followUp" });
```

**行为：**
- **扩展命令**（例如 `/mycommand`）：立即执行，即使在流式传输期间。它们通过 `pi.sendMessage()` 管理自己的 LLM 交互。
- **基于文件的提示模板**（来自 `.md` 文件）：在发送/排队前展开为其内容。
- **流式传输期间没有 `streamingBehavior`**：抛出错误。直接使用 `steer()` 或 `followUp()`，或指定该选项。

在流式传输期间显式排队：

```typescript
// 排队一个引导消息，在当前助手回合完成其工具调用后传递
await session.steer("New instruction");

// 等待 agent 完成（仅在 agent 停止时传递）
await session.followUp("After you're done, also do this");
```

`steer()` 和 `followUp()` 都会展开基于文件的提示模板，但会在扩展命令时报错（扩展命令不能被排队）。

### Agent 和 AgentState

`Agent` 类（来自 `@mariozechner/pi-agent-core`）处理核心 LLM 交互。通过 `session.agent` 访问它。

```typescript
// 访问当前状态
const state = session.agent.state;

// state.messages: AgentMessage[] - 对话历史
// state.model: Model - 当前模型
// state.thinkingLevel: ThinkingLevel - 当前思考级别
// state.systemPrompt: string - 系统提示
// state.tools: Tool[] - 可用工具

// 替换消息（用于分支、恢复）
session.agent.replaceMessages(messages);

// 等待 agent 完成处理
await session.agent.waitForIdle();
```

### 事件

订阅事件以接收流式输出和生命周期通知。

```typescript
session.subscribe((event) => {
  switch (event.type) {
    // 来自助手的流式文本
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        // 思考输出（如果启用了思考）
      }
      break;
    
    // 工具执行
    case "tool_execution_start":
      console.log(`Tool: ${event.toolName}`);
      break;
    case "tool_execution_update":
      // 流式工具输出
      break;
    case "tool_execution_end":
      console.log(`Result: ${event.isError ? "error" : "success"}`);
      break;
    
    // 消息生命周期
    case "message_start":
      // 新消息开始
      break;
    case "message_end":
      // 消息完成
      break;
    
    // Agent 生命周期
    case "agent_start":
      // Agent 开始处理提示
      break;
    case "agent_end":
      // Agent 完成（event.messages 包含新消息）
      break;
    
    // 回合生命周期（一次 LLM 响应 + 工具调用）
    case "turn_start":
      break;
    case "turn_end":
      // event.message: 助手响应
      // event.toolResults: 此回合的工具结果
      break;
    
    // 会话事件（自动压缩、重试）
    case "auto_compaction_start":
    case "auto_compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
      break;
  }
});
```

## 选项参考

### 目录

```typescript
const { session } = await createAgentSession({
  // DefaultResourceLoader 发现的工作目录
  cwd: process.cwd(), // 默认值
  
  // 全局配置目录
  agentDir: "~/.pi/agent", // 默认值（展开 ~）
});
```

`cwd` 被 `DefaultResourceLoader` 用于：
- 项目扩展（`.pi/extensions/`）
- 项目技能：
  - `.pi/skills/`
  - `cwd` 和祖先目录中的 `.agents/skills/`（直到 git 仓库根目录，或不在仓库中时的文件系统根目录）
- 项目提示（`.pi/prompts/`）
- 上下文文件（从 cwd 向上遍历的 `AGENTS.md`）
- 会话目录命名

`agentDir` 被 `DefaultResourceLoader` 用于：
- 全局扩展（`extensions/`）
- 全局技能：
  - `agentDir` 下的 `skills/`（例如 `~/.pi/agent/skills/`）
  - `~/.agents/skills/`
- 全局提示（`prompts/`）
- 全局上下文文件（`AGENTS.md`）
- 设置（`settings.json`）
- 自定义模型（`models.json`）
- 凭证（`auth.json`）
- 会话（`sessions/`）

当你传递自定义 `ResourceLoader` 时，`cwd` 和 `agentDir` 不再控制资源发现。它们仍然影响会话命名和工具路径解析。

### 模型

```typescript
import { getModel } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

// 查找特定的内置模型（不检查 API 密钥是否存在）
const opus = getModel("anthropic", "claude-opus-4-5");
if (!opus) throw new Error("Model not found");

// 按 provider/id 查找任何模型，包括 models.json 中的自定义模型
// （不检查 API 密钥是否存在）
const customModel = modelRegistry.find("my-provider", "my-model");

// 仅获取已配置有效 API 密钥的模型
const available = await modelRegistry.getAvailable();

const { session } = await createAgentSession({
  model: opus,
  thinkingLevel: "medium", // off, minimal, low, medium, high, xhigh
  
  // 用于循环的模型（交互模式下的 Ctrl+P）
  scopedModels: [
    { model: opus, thinkingLevel: "high" },
    { model: haiku, thinkingLevel: "off" },
  ],
  
  authStorage,
  modelRegistry,
});
```

如果未提供模型：
1. 尝试从会话恢复（如果继续）
2. 使用设置中的默认值
3. 回退到第一个可用模型

> 参阅 [examples/sdk/02-custom-model.ts](../examples/sdk/02-custom-model.ts)

### API 密钥和 OAuth

API 密钥解析优先级（由 AuthStorage 处理）：
1. 运行时覆盖（通过 `setRuntimeApiKey`，不持久化）
2. `auth.json` 中存储的凭证（API 密钥或 OAuth 令牌）
3. 环境变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
4. 回退解析器（用于来自 `models.json` 的自定义提供商密钥）

```typescript
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

// 默认：使用 ~/.pi/agent/auth.json 和 ~/.pi/agent/models.json
const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

// 运行时 API 密钥覆盖（不持久化到磁盘）
authStorage.setRuntimeApiKey("anthropic", "sk-my-temp-key");

// 自定义认证存储位置
const customAuth = AuthStorage.create("/my/app/auth.json");
const customRegistry = new ModelRegistry(customAuth, "/my/app/models.json");

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage: customAuth,
  modelRegistry: customRegistry,
});

// 无自定义 models.json（仅内置模型）
const simpleRegistry = new ModelRegistry(authStorage);
```

> 参阅 [examples/sdk/09-api-keys-and-oauth.ts](../examples/sdk/09-api-keys-and-oauth.ts)

### 系统提示

使用 `ResourceLoader` 覆盖系统提示：

```typescript
import { createAgentSession, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a helpful assistant.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参阅 [examples/sdk/03-custom-prompt.ts](../examples/sdk/03-custom-prompt.ts)

### 工具

```typescript
import {
  codingTools,   // read, bash, edit, write（默认）
  readOnlyTools, // read, grep, find, ls
  readTool, bashTool, editTool, writeTool,
  grepTool, findTool, lsTool,
} from "@mariozechner/pi-coding-agent";

// 使用内置工具集
const { session } = await createAgentSession({
  tools: readOnlyTools,
});

// 选择特定工具
const { session } = await createAgentSession({
  tools: [readTool, bashTool, grepTool],
});
```

#### 使用自定义 cwd 的工具

**重要：** 预构建的工具实例（`readTool`、`bashTool` 等）使用 `process.cwd()` 进行路径解析。当你指定自定义 `cwd` 并且提供显式 `tools` 时，必须使用工具工厂函数以确保路径正确解析：

```typescript
import {
  createCodingTools,    // 为特定 cwd 创建 [read, bash, edit, write]
  createReadOnlyTools,  // 为特定 cwd 创建 [read, grep, find, ls]
  createReadTool,
  createBashTool,
  createEditTool,
  createWriteTool,
  createGrepTool,
  createFindTool,
  createLsTool,
} from "@mariozechner/pi-coding-agent";

const cwd = "/path/to/project";

// 为工具集使用工厂
const { session } = await createAgentSession({
  cwd,
  tools: createCodingTools(cwd),  // 工具相对于 cwd 解析路径
});

// 或选择特定工具
const { session } = await createAgentSession({
  cwd,
  tools: [createReadTool(cwd), createBashTool(cwd), createGrepTool(cwd)],
});
```

**何时不需要工厂：**
- 如果省略 `tools`，pi 会自动使用正确的 `cwd` 创建它们
- 如果使用 `process.cwd()` 作为 `cwd`，预构建实例可以正常工作

**何时必须使用工厂：**
- 当你同时指定 `cwd`（与 `process.cwd()` 不同）和 `tools` 时

> 参阅 [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### 自定义工具

```typescript
import { Type } from "@sinclair/typebox";
import { createAgentSession, type ToolDefinition } from "@mariozechner/pi-coding-agent";

// 内联自定义工具
const myTool: ToolDefinition = {
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({
    input: Type.String({ description: "Input value" }),
  }),
  execute: async (toolCallId, params, onUpdate, ctx, signal) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
};

// 直接传递自定义工具
const { session } = await createAgentSession({
  customTools: [myTool],
});
```

通过 `customTools` 传递的自定义工具与扩展注册的工具合并。ResourceLoader 加载的扩展也可以通过 `pi.registerTool()` 注册工具。

> 参阅 [examples/sdk/05-tools.ts](../examples/sdk/05-tools.ts)

### 扩展

扩展由 `ResourceLoader` 加载。`DefaultResourceLoader` 从 `~/.pi/agent/extensions/`、`.pi/extensions/` 和 settings.json 扩展源发现扩展。

```typescript
import { createAgentSession, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const loader = new DefaultResourceLoader({
  additionalExtensionPaths: ["/path/to/my-extension.ts"],
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        console.log("[Inline Extension] Agent starting");
      });
    },
  ],
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

扩展可以注册工具、订阅事件、添加命令等。完整 API 请参阅 [extensions.md](extensions.md)。

**事件总线：** 扩展可以通过 `pi.events` 通信。如果需要从外部发出或监听事件，向 `DefaultResourceLoader` 传递共享的 `eventBus`：

```typescript
import { createEventBus, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const eventBus = createEventBus();
const loader = new DefaultResourceLoader({
  eventBus,
});
await loader.reload();

eventBus.on("my-extension:status", (data) => console.log(data));
```

> 参阅 [examples/sdk/06-extensions.ts](../examples/sdk/06-extensions.ts) 和 [docs/extensions.md](extensions.md)

### 技能

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type Skill,
} from "@mariozechner/pi-coding-agent";

const customSkill: Skill = {
  name: "my-skill",
  description: "Custom instructions",
  filePath: "/path/to/SKILL.md",
  baseDir: "/path/to",
  source: "custom",
};

const loader = new DefaultResourceLoader({
  skillsOverride: (current) => ({
    skills: [...current.skills, customSkill],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参阅 [examples/sdk/04-skills.ts](../examples/sdk/04-skills.ts)

### 上下文文件

```typescript
import { createAgentSession, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const loader = new DefaultResourceLoader({
  agentsFilesOverride: (current) => ({
    agentsFiles: [
      ...current.agentsFiles,
      { path: "/virtual/AGENTS.md", content: "# Guidelines\n\n- Be concise" },
    ],
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参阅 [examples/sdk/07-context-files.ts](../examples/sdk/07-context-files.ts)

### 斜杠命令

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type PromptTemplate,
} from "@mariozechner/pi-coding-agent";

const customCommand: PromptTemplate = {
  name: "deploy",
  description: "Deploy the application",
  source: "(custom)",
  content: "# Deploy\n\n1. Build\n2. Test\n3. Deploy",
};

const loader = new DefaultResourceLoader({
  promptsOverride: (current) => ({
    prompts: [...current.prompts, customCommand],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 参阅 [examples/sdk/08-prompt-templates.ts](../examples/sdk/08-prompt-templates.ts)

### 会话管理

会话使用带有 `id`/`parentId` 链接的树结构，支持原地分支。

```typescript
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

// 内存中（无持久化）
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

// 新建持久化会话
const { session } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd()),
});

// 继续最近的会话
const { session, modelFallbackMessage } = await createAgentSession({
  sessionManager: SessionManager.continueRecent(process.cwd()),
});
if (modelFallbackMessage) {
  console.log("Note:", modelFallbackMessage);
}

// 打开特定文件
const { session } = await createAgentSession({
  sessionManager: SessionManager.open("/path/to/session.jsonl"),
});

// 列出可用会话（异步，可选进度回调）
const sessions = await SessionManager.list(process.cwd());
for (const info of sessions) {
  console.log(`${info.id}: ${info.firstMessage} (${info.messageCount} messages, cwd: ${info.cwd})`);
}

// 列出所有项目的所有会话
const allSessions = await SessionManager.listAll((loaded, total) => {
  console.log(`Loading ${loaded}/${total}...`);
});

// 自定义会话目录（无 cwd 编码）
const customDir = "/path/to/my-sessions";
const { session } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd(), customDir),
});
```

**SessionManager 树 API：**

```typescript
const sm = SessionManager.open("/path/to/session.jsonl");

// 树遍历
const entries = sm.getEntries();        // 所有条目（不包括头部）
const tree = sm.getTree();              // 完整树结构
const path = sm.getPath();              // 从根到当前叶子的路径
const leaf = sm.getLeafEntry();         // 当前叶子条目
const entry = sm.getEntry(id);          // 按 ID 获取条目
const children = sm.getChildren(id);    // 条目的直接子节点

// 标签
const label = sm.getLabel(id);          // 获取条目标签
sm.appendLabelChange(id, "checkpoint"); // 设置标签

// 分支
sm.branch(entryId);                     // 将叶子移动到更早的条目
sm.branchWithSummary(id, "Summary...");  // 带上下文摘要的分支
sm.createBranchedSession(leafId);       // 提取路径到新文件
```

> 参阅 [examples/sdk/11-sessions.ts](../examples/sdk/11-sessions.ts) 和 [docs/session.md](session.md)

### 设置管理

```typescript
import { createAgentSession, SettingsManager, SessionManager } from "@mariozechner/pi-coding-agent";

// 默认：从文件加载（全局 + 项目合并）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create(),
});

// 带覆盖
const settingsManager = SettingsManager.create();
settingsManager.applyOverrides({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 5 },
});
const { session } = await createAgentSession({ settingsManager });

// 内存中（无文件 I/O，用于测试）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  sessionManager: SessionManager.inMemory(),
});

// 自定义目录
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create("/custom/cwd", "/custom/agent"),
});
```

**静态工厂：**
- `SettingsManager.create(cwd?, agentDir?)` - 从文件加载
- `SettingsManager.inMemory(settings?)` - 无文件 I/O

**项目特定设置：**

设置从两个位置加载并合并：
1. 全局：`~/.pi/agent/settings.json`
2. 项目：`<cwd>/.pi/settings.json`

项目覆盖全局。嵌套对象合并键。设置器默认修改全局设置。

**持久化和错误处理语义：**

- 设置获取器/设置器对于内存中状态是同步的。
- 设置器异步排队持久化写入。
- 当需要持久化边界时调用 `await settingsManager.flush()`（例如，在进程退出之前或在测试中断言文件内容之前）。
- `SettingsManager` 不打印设置 I/O 错误。使用 `settingsManager.drainErrors()` 并在你的应用层报告它们。

> 参阅 [examples/sdk/10-settings.ts](../examples/sdk/10-settings.ts)

## ResourceLoader

使用 `DefaultResourceLoader` 发现扩展、技能、提示、主题和上下文文件。

```typescript
import {
  DefaultResourceLoader,
  getAgentDir,
} from "@mariozechner/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
});
await loader.reload();

const extensions = loader.getExtensions();
const skills = loader.getSkills();
const prompts = loader.getPrompts();
const themes = loader.getThemes();
const contextFiles = loader.getAgentsFiles().agentsFiles;
```

## 返回值

`createAgentSession()` 返回：

```typescript
interface CreateAgentSessionResult {
  // 会话
  session: AgentSession;
  
  // 扩展结果（用于运行器设置）
  extensionsResult: LoadExtensionsResult;
  
  // 会话模型无法恢复时的警告
  modelFallbackMessage?: string;
}

interface LoadExtensionsResult {
  extensions: Extension[];
  errors: Array<{ path: string; error: string }>;
  runtime: ExtensionRuntime;
}
```

## 完整示例

```typescript
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  readTool,
  bashTool,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

// 设置认证存储（自定义位置）
const authStorage = AuthStorage.create("/custom/agent/auth.json");

// 运行时 API 密钥覆盖（不持久化）
if (process.env.MY_KEY) {
  authStorage.setRuntimeApiKey("anthropic", process.env.MY_KEY);
}

// 模型注册表（无自定义 models.json）
const modelRegistry = new ModelRegistry(authStorage);

// 内联工具
const statusTool: ToolDefinition = {
  name: "status",
  label: "Status",
  description: "Get system status",
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: "text", text: `Uptime: ${process.uptime()}s` }],
    details: {},
  }),
};

const model = getModel("anthropic", "claude-opus-4-5");
if (!model) throw new Error("Model not found");

// 带覆盖的内存设置
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 2 },
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/custom/agent",
  settingsManager,
  systemPromptOverride: () => "You are a minimal assistant. Be concise.",
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/custom/agent",

  model,
  thinkingLevel: "off",
  authStorage,
  modelRegistry,

  tools: [readTool, bashTool],
  customTools: [statusTool],
  resourceLoader: loader,

  sessionManager: SessionManager.inMemory(),
  settingsManager,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Get status and list files.");
```

## 运行模式

SDK 导出运行模式工具，用于在 `createAgentSession()` 之上构建自定义界面：

### InteractiveMode

完整的 TUI(终端用户界面)交互模式，带有编辑器、聊天历史和所有内置命令：

```typescript
import { createAgentSession, InteractiveMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });

const mode = new InteractiveMode(session, {
  // 全部可选
  migratedProviders: [],           // 显示迁移警告
  modelFallbackMessage: undefined, // 显示模型恢复警告
  initialMessage: "Hello",         // 启动时发送
  initialImages: [],               // 带初始消息的图片
  initialMessages: [],             // 额外的启动提示
});

await mode.run();  // 阻塞直到退出
```

### runPrintMode

单次模式：发送提示，输出结果，退出：

```typescript
import { createAgentSession, runPrintMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });

await runPrintMode(session, {
  mode: "text",              // "text" 表示最终响应，"json" 表示所有事件
  initialMessage: "Hello",   // 第一条消息（可包含 @file 内容）
  initialImages: [],         // 带初始消息的图片
  messages: ["Follow up"],   // 额外提示
});
```

### runRpcMode

用于子进程集成的 JSON-RPC 模式：

```typescript
import { createAgentSession, runRpcMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });

await runRpcMode(session);  // 从 stdin 读取 JSON 命令，写入 stdout
```

JSON 协议请参阅 [RPC 文档](rpc.md)。

## RPC 模式替代方案

对于不使用 SDK 构建的基于子进程的集成，直接使用 CLI：

```bash
pi --mode rpc --no-session
```

JSON 协议请参阅 [RPC 文档](rpc.md)。

以下情况首选 SDK：
- 你想要类型安全
- 你在同一个 Node.js 进程中
- 你需要直接访问 agent 状态
- 你想以编程方式自定义工具/扩展

以下情况首选 RPC 模式：
- 你从另一种语言集成
- 你想要进程隔离
- 你正在构建语言无关的客户端

## 导出

主入口点导出：

```typescript
// 工厂
createAgentSession

// 认证和模型
AuthStorage
ModelRegistry

// 资源加载
DefaultResourceLoader
type ResourceLoader
createEventBus

// 辅助函数

// 会话管理
SessionManager
SettingsManager

// 内置工具（使用 process.cwd()）
codingTools
readOnlyTools
readTool, bashTool, editTool, writeTool
grepTool, findTool, lsTool

// 工具工厂（用于自定义 cwd）
createCodingTools
createReadOnlyTools
createReadTool, createBashTool, createEditTool, createWriteTool
createGrepTool, createFindTool, createLsTool

// 类型
type CreateAgentSessionOptions
type CreateAgentSessionResult
type ExtensionFactory
type ExtensionAPI
type ToolDefinition
type Skill
type PromptTemplate
type Tool
```

有关扩展类型，完整 API 请参阅 [extensions.md](extensions.md)。