# 工具系统详解

> **难度：进阶** | **预计阅读时间：30 分钟**

> **注意**：本文档中的代码示例为概念性说明。实际 API 请参考对应源码路径。
> - 工具定义：`packages/coding-agent/src/core/tools/index.ts`
> - 各工具实现：`packages/coding-agent/src/core/tools/*.ts`

上一章我们了解了架构设计与运行模式。本章将深入工具系统——这是 pi-coding-agent 能够实际操作代码库的核心能力。

## 工具系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      工具系统架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      工具管理器                          │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │ 注册表  │  │ 工厂函数│  │ 执行器  │  │ 结果处理│  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  │       └────────────┴────────────┴────────────┘        │   │
│  │                          │                              │   │
│  └──────────────────────────┼──────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      工具集合                            │   │
│  │                                                         │   │
│  │  📖 文件操作    🔍 代码搜索                               │   │
│  │  ├── read       ├── grep                                │   │
│  │  ├── write      ├── find                                │   │
│  │  ├── edit       └── ls                                  │   │
│  │  └── bash                                                 │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 可用工具列表

pi-coding-agent 提供以下 7 个核心工具：

| 工具名 | 用途 | 对应源码 |
|--------|------|----------|
| `read` | 读取文件内容（支持文本和图片） | [`tools/read.ts`](../../../../packages/coding-agent/src/core/tools/read.ts) |
| `write` | 创建或覆盖文件 | [`tools/write.ts`](../../../../packages/coding-agent/src/core/tools/write.ts) |
| `edit` | 精确编辑文件内容 | [`tools/edit.ts`](../../../../packages/coding-agent/src/core/tools/edit.ts) |
| `bash` | 执行 shell 命令 | [`tools/bash.ts`](../../../../packages/coding-agent/src/core/tools/bash.ts) |
| `grep` | 文本搜索（使用 ripgrep） | [`tools/grep.ts`](../../../../packages/coding-agent/src/core/tools/grep.ts) |
| `find` | 文件查找（使用 fd） | [`tools/find.ts`](../../../../packages/coding-agent/src/core/tools/find.ts) |
| `ls` | 目录列表 | [`tools/ls.ts`](../../../../packages/coding-agent/src/core/tools/ls.ts) |

工具分为两组预设：

- **完整工具集**（`codingTools`）：`read`, `bash`, `edit`, `write` —— 支持文件读写操作
- **只读工具集**（`readOnlyTools`）：`read`, `grep`, `find`, `ls` —— 仅用于代码探索，不修改文件

## 工具接口定义

[真实API] 工具基于 `AgentTool<T>` 接口定义（来自 `@mariozechner/pi-agent-core`）：

```typescript
// packages/coding-agent/src/core/tools/index.ts

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";

// 工具类型定义
export type Tool = AgentTool<any>;

// 工具集合
export const allTools = {
  read: readTool,
  bash: bashTool,
  edit: editTool,
  write: writeTool,
  grep: grepTool,
  find: findTool,
  ls: lsTool,
};

export type ToolName = keyof typeof allTools;
```

### 工具激活方式

[概念性示例] 工具通过以下方式激活：

```typescript
// 1. CLI 参数方式
// pi --tools read,bash,edit,write

// 2. 配置方式
const agent = new CodingAgent({
  tools: ["read", "grep", "find"], // 只读模式
});
```

## 文件操作工具

### read 工具

[简化示意] 读取文件内容，支持文本文件和图片。

```typescript
// packages/coding-agent/src/core/tools/read.ts

const readSchema = Type.Object({
  path: Type.String({ description: "文件路径（相对或绝对）" }),
  offset: Type.Optional(Type.Number({ description: "起始行号（1-indexed）" })),
  limit: Type.Optional(Type.Number({ description: "最大读取行数" })),
});

export function createReadTool(cwd: string, options?: ReadToolOptions): AgentTool<typeof readSchema> {
  return {
    name: "read",
    label: "read",
    description: `读取文件内容...`,
    parameters: readSchema,
    execute: async (_toolCallId, { path, offset, limit }, signal) => {
      // 实现细节：支持文本和图片读取
      // 文本输出截断至 200 行或 30KB
      // 图片自动调整大小至 2000x2000
    },
  };
}
```

**使用示例**:

```typescript
// 读取文件前50行
const result = await readTool.execute("call_1", {
  path: "src/index.ts",
  offset: 1,
  limit: 50,
});

// 返回结构
// {
//   content: [{ type: "text", text: "..." }],
//   details: { truncation?: TruncationResult }
// }
```

**特性说明**:
- 支持文本文件和图片（jpg, png, gif, webp）
- 图片会自动调整为最大 2000x2000 像素
- 文本输出截断至 200 行或 30KB（以先达到者为准）
- 使用 `offset` 和 `limit` 分页读取大文件

### write 工具

[简化示意] 创建新文件或完全覆盖现有文件。

```typescript
// packages/coding-agent/src/core/tools/write.ts

const writeSchema = Type.Object({
  path: Type.String({ description: "文件路径（相对或绝对）" }),
  content: Type.String({ description: "要写入的文件内容" }),
});

export function createWriteTool(cwd: string, options?: WriteToolOptions): AgentTool<typeof writeSchema> {
  return {
    name: "write",
    label: "write",
    description: "写入内容到文件。如文件不存在则创建，存在则覆盖。自动创建父目录。",
    parameters: writeSchema,
    execute: async (_toolCallId, { path, content }, signal) => {
      // 实现细节：自动创建父目录，写入文件
    },
  };
}
```

**使用示例**:

```typescript
const result = await writeTool.execute("call_1", {
  path: "src/utils/helper.ts",
  content: `export function helper() {\n  return "hello";\n}`,
});

// 返回结构
// {
//   content: [{ type: "text", text: "Successfully wrote 42 bytes to src/utils/helper.ts" }],
//   details: undefined
// }
```

**特性说明**:
- 自动创建父目录（递归）
- 完全覆盖现有文件内容

### edit 工具

[简化示意] 通过精确文本替换编辑文件。

```typescript
// packages/coding-agent/src/core/tools/edit.ts

const editSchema = Type.Object({
  path: Type.String({ description: "文件路径（相对或绝对）" }),
  oldText: Type.String({ description: "要替换的精确文本（必须完全匹配）" }),
  newText: Type.String({ description: "新文本" }),
});

export function createEditTool(cwd: string, options?: EditToolOptions): AgentTool<typeof editSchema> {
  return {
    name: "edit",
    label: "edit",
    description: "通过替换精确文本编辑文件。oldText 必须完全匹配（包括空白字符）。",
    parameters: editSchema,
    execute: async (_toolCallId, { path, oldText, newText }, signal) => {
      // 实现细节：
      // 1. 查找 oldText（使用模糊匹配作为后备）
      // 2. 确保匹配唯一
      // 3. 替换并写入
      // 4. 生成统一 diff
    },
  };
}
```

**使用示例**:

```typescript
const result = await editTool.execute("call_1", {
  path: "src/index.ts",
  oldText: "function old() {\n  return 1;\n}",
  newText: "function new() {\n  return 2;\n}",
});

// 返回结构
// {
//   content: [{ type: "text", text: "Successfully replaced text in src/index.ts." }],
//   details: { diff: "...", firstChangedLine?: number }
// }
```

**edit vs write 对比**：

| 特性 | `write` | `edit` |
|------|---------|--------|
| 用途 | 创建新文件或完全覆盖 | 精确修改文件的特定部分 |
| 保留内容 | 否（完全替换） | 是（仅替换匹配部分） |
| 匹配方式 | N/A | 精确文本匹配（支持模糊匹配作为后备） |
| 唯一性检查 | N/A | 要求匹配文本在文件中唯一 |
| 返回值 | 字节数 | 统一 diff 和变更行号 |

### bash 工具

[简化示意] 执行 shell 命令。

```typescript
// packages/coding-agent/src/core/tools/bash.ts

const bashSchema = Type.Object({
  command: Type.String({ description: "要执行的 Bash 命令" }),
  timeout: Type.Optional(Type.Number({ description: "超时时间（秒，可选）" })),
});

export function createBashTool(cwd: string, options?: BashToolOptions): AgentTool<typeof bashSchema> {
  return {
    name: "bash",
    label: "bash",
    description: `在当前工作目录执行 bash 命令...`,
    parameters: bashSchema,
    execute: async (_toolCallId, { command, timeout }, signal, onUpdate) => {
      // 实现细节：
      // 1. 使用 spawn 执行命令
      // 2. 支持流式输出（通过 onUpdate 回调）
      // 3. 输出截断至最后 200 行或 30KB
      // 4. 如截断，完整输出保存到临时文件
    },
  };
}
```

**使用示例**:

```typescript
const result = await bashTool.execute("call_1", {
  command: "npm run build",
  timeout: 120,
});

// 返回结构（成功）
// {
//   content: [{ type: "text", text: "..." }],
//   details: { truncation?: TruncationResult, fullOutputPath?: string }
// }

// 返回结构（失败，exitCode !== 0）
// 抛出 Error，消息包含输出和退出码
```

**特性说明**:
- 输出截断至最后 200 行或 30KB
- 如截断，完整输出保存到临时文件路径（`fullOutputPath`）
- 支持流式输出（通过 `onUpdate` 回调）
- 支持超时（秒）

**安全说明**：[概念性示例] 安全检查由用户在项目的 `AGENTS.md` 中定义，非代码硬编码：

```markdown
<!-- AGENTS.md -->

## 禁止的命令
- rm -rf /
- dd if=/dev/zero
```

## 代码搜索工具

### grep 工具

[简化示意] 使用 ripgrep (rg) 搜索文件内容。

```typescript
// packages/coding-agent/src/core/tools/grep.ts

const grepSchema = Type.Object({
  pattern: Type.String({ description: "搜索模式（正则或字面字符串）" }),
  path: Type.Optional(Type.String({ description: "搜索目录或文件" })),
  glob: Type.Optional(Type.String({ description: "Glob 过滤，如 '*.ts'" })),
  ignoreCase: Type.Optional(Type.Boolean({ description: "忽略大小写" })),
  literal: Type.Optional(Type.Boolean({ description: "将模式视为字面字符串而非正则" })),
  context: Type.Optional(Type.Number({ description: "匹配前后上下文行数" })),
  limit: Type.Optional(Type.Number({ description: "最大匹配数（默认 100）" })),
});

export function createGrepTool(cwd: string, options?: GrepToolOptions): AgentTool<typeof grepSchema> {
  return {
    name: "grep",
    label: "grep",
    description: `搜索文件内容...`,
    parameters: grepSchema,
    execute: async (_toolCallId, params, signal) => {
      // 实现细节：
      // 1. 使用 ripgrep (rg) 执行搜索
      // 2. 输出截断至 100 匹配或 30KB
      // 3. 长行截断至 500 字符
    },
  };
}
```

**使用示例**:

```typescript
const result = await grepTool.execute("call_1", {
  pattern: "function.*main",
  path: "src",
  glob: "*.ts",
  context: 2,
});

// 返回示例
// src/index.ts:10: function main() {
// src/index.ts-11-   const x = 1;
// src/index.ts:12:     console.log("hello");
// src/index.ts-13-   }
```

**特性说明**:
- 底层使用 **ripgrep (rg)**，而非系统 grep
- 自动下载 rg（如不可用）
- 尊重 `.gitignore`
- 输出截断至 100 匹配或 30KB
- 长行截断至 500 字符

### find 工具

[简化示意] 使用 fd 按 glob 模式查找文件。

```typescript
// packages/coding-agent/src/core/tools/find.ts

const findSchema = Type.Object({
  pattern: Type.String({ description: "Glob 模式，如 '*.ts' 或 'src/**/*.spec.ts'" }),
  path: Type.Optional(Type.String({ description: "搜索目录" })),
  limit: Type.Optional(Type.Number({ description: "最大结果数（默认 1000）" })),
});

export function createFindTool(cwd: string, options?: FindToolOptions): AgentTool<typeof findSchema> {
  return {
    name: "find",
    label: "find",
    description: `按 glob 模式搜索文件...`,
    parameters: findSchema,
    execute: async (_toolCallId, { pattern, path, limit }, signal) => {
      // 实现细节：
      // 1. 使用 fd 执行搜索
      // 2. 尊重 .gitignore
      // 3. 输出截断至 1000 结果或 30KB
    },
  };
}
```

**使用示例**:

```typescript
const result = await findTool.execute("call_1", {
  pattern: "**/*.test.ts",
  path: "packages",
});

// 返回示例
// packages/ai/test/stream.test.ts
// packages/ai/test/tokens.test.ts
// packages/agent/test/context.test.ts
```

### ls 工具

[简化示意] 列出目录内容。

```typescript
// packages/coding-agent/src/core/tools/ls.ts

const lsSchema = Type.Object({
  path: Type.Optional(Type.String({ description: "要列出的目录" })),
  limit: Type.Optional(Type.Number({ description: "最大条目数（默认 500）" })),
});

export function createLsTool(cwd: string, options?: LsToolOptions): AgentTool<typeof lsSchema> {
  return {
    name: "ls",
    label: "ls",
    description: `列出目录内容...`,
    parameters: lsSchema,
    execute: async (_toolCallId, { path, limit }, signal) => {
      // 实现细节：
      // 1. 按字母顺序排序
      // 2. 目录以 '/' 后缀标记
      // 3. 包含 dotfiles
    },
  };
}
```

**使用示例**:

```typescript
const result = await lsTool.execute("call_1", {
  path: "packages/coding-agent/src",
});

// 返回示例
// cli/
// core/
// index.ts
// utils/
```

## 工具注册与扩展

[概念性示例] 通过 Extension 注册自定义工具：

```typescript
// 扩展注册自定义工具
const myExtension: Extension = {
  name: "my-extension",
  register: (context) => {
    // 使用工厂函数创建工具实例
    const customTool = createReadTool(context.cwd, {
      operations: myCustomOperations,
    });

    context.registerTool(customTool);
  },
};
```

[真实API] 工具工厂函数（来自 `tools/index.ts`）：

```typescript
// packages/coding-agent/src/core/tools/index.ts

// 创建完整工具集（用于代码编辑）
export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
  return [
    createReadTool(cwd, options?.read),
    createBashTool(cwd, options?.bash),
    createEditTool(cwd),
    createWriteTool(cwd),
  ];
}

// 创建只读工具集（用于代码探索）
export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
  return [
    createReadTool(cwd, options?.read),
    createGrepTool(cwd),
    createFindTool(cwd),
    createLsTool(cwd),
  ];
}

// 创建全部工具
export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
  return {
    read: createReadTool(cwd, options?.read),
    bash: createBashTool(cwd, options?.bash),
    edit: createEditTool(cwd),
    write: createWriteTool(cwd),
    grep: createGrepTool(cwd),
    find: createFindTool(cwd),
    ls: createLsTool(cwd),
  };
}
```

### 自定义操作（用于远程系统）

[概念性示例] 通过自定义 Operations 将工具委托给远程系统（如 SSH）：

```typescript
// 自定义 read 操作
const sshReadOperations: ReadOperations = {
  readFile: async (absolutePath) => {
    // 通过 SSH 读取远程文件
    return sshClient.readFile(absolutePath);
  },
  access: async (absolutePath) => {
    // 检查远程文件是否可读
    await sshClient.stat(absolutePath);
  },
};

// 使用自定义操作创建工具
const remoteReadTool = createReadTool("/remote/project", {
  operations: sshReadOperations,
});
```

## 工具执行流程

[概念性示例] Agent 调用工具的完整流程：

```
┌─────────────────────────────────────────────────────────────┐
│                     工具执行流程                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. LLM 生成 ToolCall                                       │
│     │                                                       │
│     ▼                                                       │
│  ┌─────────────────┐                                        │
│  │  ToolCall       │  { toolCallId, name, arguments }       │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  2. Agent 查找对应工具                                       │
│     │                                                       │
│     ▼                                                       │
│  3. 验证参数（TypeBox schema）                               │
│     │                                                       │
│     ▼                                                       │
│  4. 执行工具（带 AbortSignal 支持取消）                       │
│     │                                                       │
│     ▼                                                       │
│  5. 返回 ToolResult                                         │
│  ┌─────────────────┐                                        │
│  │  ToolResult     │  { content, details? }                 │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  6. 返回给 LLM（作为 ToolMessage）                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

[真实API] AgentTool 执行签名：

```typescript
// 来自 @mariozechner/pi-agent-core

interface AgentTool<TSchema extends TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  execute: (
    toolCallId: string,
    args: Static<TSchema>,
    signal?: AbortSignal,
    onUpdate?: (result: Partial<ToolResult>) => void
  ) => Promise<ToolResult>;
}

interface ToolResult {
  content: (TextContent | ImageContent)[];
  details?: Record<string, any>;
}

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
```

## 工具最佳实践

### 应该做的

**1. 优先使用 edit 而非 write**

```typescript
// 正确：精确修改，保留文件其他部分
await editTool.execute("call_1", {
  path: "src/index.ts",
  oldText: "function old() { return 1; }",
  newText: "function old() { return 2; }",
});

// 避免：除非创建新文件，否则不要完全重写
// await writeTool.execute("call_1", { path: "src/index.ts", content: "..." });
```

**2. 结合多个工具完成复杂任务**

```typescript
// 1. 搜索相关文件
const findResult = await findTool.execute("call_1", {
  pattern: "**/*.test.ts",
});

// 2. 读取文件内容
const files = findResult.content[0].text.split("\n");
const content = await readTool.execute("call_2", {
  path: files[0],
});

// 3. 编辑文件
await editTool.execute("call_3", {
  path: files[0],
  oldText: "...",
  newText: "...",
});

// 4. 验证修改
await bashTool.execute("call_4", {
  command: "npm test",
});
```

**3. 使用 glob 限制搜索范围**

```typescript
// 正确：限制文件类型
await grepTool.execute("call_1", {
  pattern: "TODO",
  glob: "*.ts",
});

// 避免：无限制搜索可能返回过多结果
// await grepTool.execute("call_1", { pattern: "TODO" });
```

### 避免的错误

**1. 在 bash 中执行复杂逻辑**

```typescript
// 错误：难以调试和维护
await bashTool.execute("call_1", {
  command: "cat file | grep pattern | sed 's/old/new/' > output",
});

// 正确：使用专门的工具
const content = await readTool.execute("call_1", { path: "file" });
const lines = content.content[0].text
  .split("\n")
  .filter(l => l.includes("pattern"))
  .map(l => l.replace("old", "new"));
await writeTool.execute("call_2", {
  path: "output",
  content: lines.join("\n"),
});
```

**2. 忽略工具返回的错误**

```typescript
// 错误：不检查错误
const result = await bashTool.execute("call_1", {
  command: "npm test",
});
// bash 工具在非零退出码时会抛出 Error

// 正确：使用 try-catch
import { tryCatch } from "./utils";

const { data, error } = await tryCatch(
  bashTool.execute("call_1", { command: "npm test" })
);

if (error) {
  console.error("测试失败:", error.message);
}
```

## 工具输出截断

所有工具都实现了输出截断机制：

| 工具 | 截断限制 | 处理方式 |
|------|----------|----------|
| `read` | 200 行 / 30KB | 提示使用 `offset` 继续读取 |
| `write` | N/A | 返回写入字节数 |
| `edit` | N/A | 返回 diff 和变更行号 |
| `bash` | 200 行 / 30KB | 保存完整输出到临时文件 |
| `grep` | 100 匹配 / 30KB | 提示增加 `limit` 或优化模式 |
| `find` | 1000 结果 / 30KB | 提示增加 `limit` 或优化模式 |
| `ls` | 500 条目 / 30KB | 提示增加 `limit` |

## 总结

工具系统的核心要点：

1. **7 个核心工具**：`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`
2. **两组预设**：完整工具集（`codingTools`）和只读工具集（`readOnlyTools`）
3. **统一接口**：基于 `AgentTool<T>` 接口，使用 TypeBox 进行参数验证
4. **可扩展性**：通过工厂函数和自定义 Operations 支持远程系统
5. **输出限制**：所有工具都有输出截断机制，防止超出上下文限制

---

**下篇预告**: [04-session-management.md](04-session-management.md) —— 会话管理与持久化，包括会话生命周期、自动保存、历史记录、状态恢复等。
