# 工具系统详解

> **难度：进阶** | **预计阅读时间：30 分钟**

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
│  │  │ 注册表  │  │ 权限控制│  │ 执行器  │  │ 结果处理│  │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  │   │
│  │       └────────────┴────────────┴────────────┘        │   │
│  │                          │                              │   │
│  └──────────────────────────┼──────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      工具集合                            │   │
│  │                                                         │   │
│  │  📖 文件操作    🔍 代码搜索    🛠️ 开发工具    📊 项目管理 │   │
│  │  ├── read       ├── grep       ├── lsp-*      ├── git    │   │
│  │  ├── write      ├── ast-grep   ├── skill      └── github │   │
│  │  ├── edit       └── glob                                  │   │
│  │  └── bash                                                 │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 工具接口

所有工具都实现 `AgentTool` 接口：

```typescript
// packages/coding-agent/src/core/tools/index.ts

export interface ToolConfig {
  // 工具名称
  name: string;
  
  // 是否启用
  enabled: boolean;
  
  // 权限配置
  permissions?: {
    // 允许的路径模式
    allowedPaths?: string[];
    
    // 禁止的路径模式
    deniedPaths?: string[];
    
    // 是否需要确认
    requireConfirmation?: boolean;
  };
}

export interface ToolContext {
  // 当前工作目录
  cwd: string;
  
  // 会话 ID
  sessionId: string;
  
  // 环境变量
  env: Record<string, string>;
  
  // 日志函数
  log: (message: string) => void;
}

// 工具函数类型
export type ToolFunction = (
  args: any,
  context: ToolContext
) => Promise<ToolResult>;

export interface ToolResult {
  // 返回内容
  content: Array<{ type: "text" | "image"; text?: string; data?: string }>;
  
  // 是否错误
  isError?: boolean;
  
  // 额外元数据
  metadata?: Record<string, any>;
}
```

## 文件操作工具

### read 工具

读取文件内容。

```typescript
// packages/coding-agent/src/core/tools/read.ts

export const readTool: AgentTool = {
  name: "read",
  label: "读取文件",
  description: "读取指定文件的内容",
  parameters: Type.Object({
    filePath: Type.String({
      description: "文件路径，可以是相对路径或绝对路径",
    }),
    offset: Type.Optional(Type.Number({
      description: "起始行号（从0开始）",
      default: 0,
    })),
    limit: Type.Optional(Type.Number({
      description: "读取行数",
      default: 100,
    })),
  }),
  
  execute: async (toolCallId, params, signal) => {
    const { filePath, offset = 0, limit = 100 } = params;
    
    // 检查文件是否存在
    if (!await fileExists(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    
    // 检查文件大小
    const stats = await fs.stat(filePath);
    if (stats.size > 10 * 1024 * 1024) {
      throw new Error(`文件过大: ${filePath} (${formatBytes(stats.size)})`);
    }
    
    // 读取文件
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    
    // 截取指定范围
    const selectedLines = lines.slice(offset, offset + limit);
    
    // 添加行号
    const numberedContent = selectedLines
      .map((line, i) => `${offset + i + 1}: ${line}`)
      .join("\n");
    
    return {
      content: [{ type: "text", text: numberedContent }],
      details: {
        filePath,
        totalLines: lines.length,
        offset,
        limit,
        hasMore: offset + limit < lines.length,
      },
    };
  },
};
```

**使用示例**:

```typescript
// AI 调用
const result = await readTool.execute("call_1", {
  filePath: "src/index.ts",
  offset: 0,
  limit: 50,
});

// 返回
// content: [{
//   type: "text",
//   text: "1: import { ...\n2: export function..."
// }]
// details: { filePath: "src/index.ts", totalLines: 100, ... }
```

### write 工具

创建或覆盖文件。

```typescript
// packages/coding-agent/src/core/tools/write.ts

export const writeTool: AgentTool = {
  name: "write",
  label: "写入文件",
  description: "创建新文件或覆盖现有文件",
  parameters: Type.Object({
    filePath: Type.String({
      description: "文件路径",
    }),
    content: Type.String({
      description: "文件内容",
    }),
    createDirs: Type.Optional(Type.Boolean({
      description: "是否自动创建父目录",
      default: true,
    })),
  }),
  
  execute: async (toolCallId, params, context) => {
    const { filePath, content, createDirs = true } = params;
    
    // 检查权限
    if (isPathDenied(filePath, context.config)) {
      throw new Error(`无权写入: ${filePath}`);
    }
    
    // 创建父目录
    if (createDirs) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }
    
    // 写入文件
    await fs.writeFile(filePath, content, "utf-8");
    
    return {
      content: [{ type: "text", text: `文件已写入: ${filePath}` }],
      details: {
        filePath,
        size: content.length,
        lines: content.split("\n").length,
      },
    };
  },
};
```

### edit 工具

精确编辑文件内容。

```typescript
// packages/coding-agent/src/core/tools/edit.ts

export const editTool: AgentTool = {
  name: "edit",
  label: "编辑文件",
  description: "对文件进行精确的编辑操作",
  parameters: Type.Object({
    filePath: Type.String(),
    edits: Type.Array(Type.Object({
      oldText: Type.String({
        description: "要替换的文本（必须完全匹配）",
      }),
      newText: Type.String({
        description: "新文本",
      }),
    })),
  }),
  
  execute: async (toolCallId, params, context) => {
    const { filePath, edits } = params;
    
    // 读取原文件
    const content = await fs.readFile(filePath, "utf-8");
    let newContent = content;
    const appliedEdits: string[] = [];
    const failedEdits: string[] = [];
    
    // 应用每个编辑
    for (const edit of edits) {
      if (newContent.includes(edit.oldText)) {
        newContent = newContent.replace(edit.oldText, edit.newText);
        appliedEdits.push(`替换: "${edit.oldText.slice(0, 50)}..."`);
      } else {
        failedEdits.push(`未找到: "${edit.oldText.slice(0, 50)}..."`);
      }
    }
    
    // 写入文件
    await fs.writeFile(filePath, newContent, "utf-8");
    
    return {
      content: [{
        type: "text",
        text: `已编辑: ${filePath}\n成功: ${appliedEdits.length}\n失败: ${failedEdits.length}`,
      }],
      details: {
        filePath,
        appliedEdits,
        failedEdits,
        diff: generateDiff(content, newContent),
      },
    };
  },
};
```

**edit vs write**：
- `write`：创建新文件或完全覆盖
- `edit`：精确修改文件的特定部分，保留其他内容

### bash 工具

执行命令行命令。

```typescript
// packages/coding-agent/src/core/tools/bash.ts

export const bashTool: AgentTool = {
  name: "bash",
  label: "执行命令",
  description: "执行命令行命令",
  parameters: Type.Object({
    command: Type.String({
      description: "要执行的命令",
    }),
    cwd: Type.Optional(Type.String({
      description: "工作目录",
    })),
    timeout: Type.Optional(Type.Number({
      description: "超时时间（毫秒）",
      default: 30000,
    })),
    env: Type.Optional(Type.Record(Type.String(), Type.String())),
  }),
  
  execute: async (toolCallId, params, context, signal) => {
    const { command, cwd, timeout = 30000, env = {} } = params;
    
    // 安全检查：禁止危险命令
    const dangerousCommands = [
      "rm -rf /",
      "dd if=/dev/zero",
      ":(){ :|:& };:",  // fork bomb
    ];
    
    for (const dangerous of dangerousCommands) {
      if (command.includes(dangerous)) {
        throw new Error(`危险命令被阻止: ${command}`);
      }
    }
    
    // 执行命令
    const { stdout, stderr, exitCode } = await exec(command, {
      cwd: cwd || context.cwd,
      timeout,
      env: { ...process.env, ...env },
      signal,
    });
    
    return {
      content: [
        { type: "text", text: stdout || "(无输出)" },
      ],
      details: {
        command,
        exitCode,
        stderr,
        duration: Date.now() - startTime,
      },
      isError: exitCode !== 0,
    };
  },
};
```

## 代码搜索工具

### grep 工具

文本搜索。

```typescript
// packages/coding-agent/src/core/tools/grep.ts

export const grepTool: AgentTool = {
  name: "grep",
  label: "文本搜索",
  description: "在文件中搜索文本模式",
  parameters: Type.Object({
    pattern: Type.String({
      description: "搜索模式（正则表达式）",
    }),
    path: Type.Optional(Type.String({
      description: "搜索路径",
      default: ".",
    })),
    include: Type.Optional(Type.String({
      description: "包含的文件模式",
    })),
    exclude: Type.Optional(Type.String({
      description: "排除的文件模式",
    })),
    context: Type.Optional(Type.Number({
      description: "上下文行数",
      default: 2,
    })),
  }),
  
  execute: async (toolCallId, params) => {
    const { pattern, path = ".", include, exclude, context = 2 } = params;
    
    // 构建 grep 命令
    const args = [
      "-r",
      "-n",
      "--color=never",
      `-C ${context}`,
      pattern,
      path,
    ];
    
    if (include) args.push(`--include=${include}`);
    if (exclude) args.push(`--exclude=${exclude}`);
    
    const { stdout } = await exec(`grep ${args.join(" ")}`);
    
    // 解析结果
    const matches = parseGrepOutput(stdout);
    
    return {
      content: [{
        type: "text",
        text: matches.map(m => `${m.file}:${m.line}: ${m.text}`).join("\n"),
      }],
      details: {
        pattern,
        matchCount: matches.length,
        files: [...new Set(matches.map(m => m.file))],
      },
    };
  },
};
```

### ast-grep 工具

AST 搜索，支持结构化代码搜索。

```typescript
// packages/coding-agent/src/core/tools/ast-grep.ts

export const astGrepTool: AgentTool = {
  name: "ast-grep",
  label: "AST 搜索",
  description: "使用 AST 模式搜索代码",
  parameters: Type.Object({
    pattern: Type.String({
      description: "AST 模式（如: function $NAME($$$) { $$$ }）",
    }),
    language: Type.String({
      description: "编程语言",
      enum: ["typescript", "javascript", "python", "rust", "go"],
    }),
    path: Type.Optional(Type.String({
      description: "搜索路径",
      default: ".",
    })),
  }),
  
  execute: async (toolCallId, params) => {
    const { pattern, language, path = "." } = params;
    
    // 调用 ast-grep
    const result = await exec(`ast-grep --pattern '${pattern}' --lang ${language} ${path}`);
    
    return {
      content: [{ type: "text", text: result.stdout }],
      details: {
        pattern,
        language,
        matchCount: parseMatchCount(result.stdout),
      },
    };
  },
};
```

**AST 模式示例**:

```typescript
// 搜索所有 console.log
pattern: "console.log($$$)"

// 搜索所有未使用的变量
pattern: "const $NAME = $INIT"

// 搜索所有 fetch 调用
pattern: "fetch($URL)"
```

## LSP 工具

### lsp-diagnostics 工具

获取代码诊断信息（类型错误、警告等）。

```typescript
// packages/coding-agent/src/core/tools/lsp-diagnostics.ts

export const lspDiagnosticsTool: AgentTool = {
  name: "lsp-diagnostics",
  label: "LSP 诊断",
  description: "获取文件的类型错误和警告",
  parameters: Type.Object({
    filePath: Type.String(),
  }),
  
  execute: async (toolCallId, params) => {
    const { filePath } = params;
    
    // 连接到 LSP 服务器
    const lsp = await getLspClient(filePath);
    
    // 获取诊断
    const diagnostics = await lsp.getDiagnostics(filePath);
    
    // 格式化输出
    const formatted = diagnostics.map(d => ({
      severity: d.severity === 1 ? "Error" : d.severity === 2 ? "Warning" : "Info",
      line: d.range.start.line + 1,
      column: d.range.start.character + 1,
      message: d.message,
      code: d.code,
    }));
    
    return {
      content: [{
        type: "text",
        text: formatted.map(d => 
          `${d.severity} [${d.line}:${d.column}]: ${d.message}`
        ).join("\n"),
      }],
      details: {
        filePath,
        errorCount: formatted.filter(d => d.severity === "Error").length,
        warningCount: formatted.filter(d => d.severity === "Warning").length,
        diagnostics: formatted,
      },
    };
  },
};
```

### lsp-symbols 工具

获取文件符号信息（函数、类、变量等）。

```typescript
// packages/coding-agent/src/core/tools/lsp-symbols.ts

export const lspSymbolsTool: AgentTool = {
  name: "lsp-symbols",
  label: "LSP 符号",
  description: "获取文件的符号列表",
  parameters: Type.Object({
    filePath: Type.String(),
    query: Type.Optional(Type.String()),
  }),
  
  execute: async (toolCallId, params) => {
    const { filePath, query } = params;
    
    const lsp = await getLspClient(filePath);
    const symbols = await lsp.getDocumentSymbols(filePath);
    
    // 过滤和格式化
    const filtered = query
      ? symbols.filter(s => s.name.includes(query))
      : symbols;
    
    return {
      content: [{
        type: "text",
        text: formatSymbols(filtered),
      }],
      details: {
        filePath,
        symbolCount: filtered.length,
        symbols: filtered,
      },
    };
  },
};
```

## 项目管理工具

### git 工具

Git 操作。

```typescript
// packages/coding-agent/src/core/tools/git.ts

export const gitTool: AgentTool = {
  name: "git",
  label: "Git 操作",
  description: "执行 Git 命令",
  parameters: Type.Object({
    command: Type.String({
      description: "Git 子命令",
      enum: ["status", "diff", "log", "branch", "add", "commit", "push"],
    }),
    args: Type.Optional(Type.Array(Type.String())),
  }),
  
  execute: async (toolCallId, params) => {
    const { command, args = [] } = params;
    
    // 白名单检查
    const allowedCommands = ["status", "diff", "log", "branch", "add", "commit"];
    if (!allowedCommands.includes(command)) {
      throw new Error(`Git 命令 '${command}' 不在白名单中`);
    }
    
    const { stdout } = await exec(`git ${command} ${args.join(" ")}`);
    
    return {
      content: [{ type: "text", text: stdout }],
      details: { command, args },
    };
  },
};
```

### skill 工具

调用 Skill 系统。

```typescript
// packages/coding-agent/src/core/tools/skill.ts

export const skillTool: AgentTool = {
  name: "skill",
  label: "调用 Skill",
  description: "调用预定义的 Skill",
  parameters: Type.Object({
    name: Type.String({
      description: "Skill 名称",
    }),
    args: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
  
  execute: async (toolCallId, params, context) => {
    const { name, args = {} } = params;
    
    // 加载 skill
    const skill = await loadSkill(name);
    
    // 执行 skill
    const result = await skill.execute(args, context);
    
    return {
      content: [{ type: "text", text: result.output }],
      details: {
        skill: name,
        args,
        duration: result.duration,
      },
    };
  },
};
```

## 工具权限控制

### 路径限制

```typescript
// 配置允许/禁止的路径
const toolConfig: ToolConfig = {
  name: "write",
  enabled: true,
  permissions: {
    allowedPaths: [
      "src/**",
      "tests/**",
      "docs/**",
    ],
    deniedPaths: [
      ".env",
      "**/node_modules/**",
      "/etc/**",
    ],
    requireConfirmation: true,
  },
};

// 检查路径
function isPathAllowed(filePath: string, config: ToolConfig): boolean {
  // 检查禁止路径
  for (const denied of config.permissions?.deniedPaths || []) {
    if (minimatch(filePath, denied)) return false;
  }
  
  // 检查允许路径
  for (const allowed of config.permissions?.allowedPaths || []) {
    if (minimatch(filePath, allowed)) return true;
  }
  
  return false;
}
```

### 命令白名单

```typescript
// bash 工具白名单
const allowedCommands = [
  "ls", "cat", "grep", "find",
  "npm", "yarn", "pnpm",
  "git", "git status", "git diff", "git log",
  "npx", "node", "python",
];

function isCommandAllowed(command: string): boolean {
  const cmd = command.trim().split(" ")[0];
  return allowedCommands.includes(cmd);
}
```

## 工具最佳实践

### ✅ 应该做的

1. **优先使用 edit 而非 write**
   ```typescript
   // ✅ 正确：精确修改
   edit({
     filePath: "src/index.ts",
     edits: [{
       oldText: "function old() { ... }",
       newText: "function new() { ... }",
     }],
   });
   
   // ❌ 避免：完全重写
   write({ filePath: "src/index.ts", content: "..." });
   ```

2. **使用 glob 限制搜索范围**
   ```typescript
   // ✅ 正确：限制文件类型
   grep({
     pattern: "TODO",
     include: "*.ts",
     exclude: "node_modules",
   });
   ```

3. **结合多个工具**
   ```typescript
   // 1. 搜索代码
   const searchResult = await grep({ pattern: "function foo" });
   
   // 2. 读取文件
   const fileContent = await read({ filePath: searchResult.files[0] });
   
   // 3. 编辑文件
   await edit({ filePath: searchResult.files[0], edits: [...] });
   
   // 4. 验证修改
   const diagnostics = await lspDiagnostics({ filePath: searchResult.files[0] });
   ```

### ❌ 避免的错误

1. **在 bash 中执行复杂逻辑**
   ```typescript
   // ❌ 错误：难以调试和维护
   bash({ command: "cat file | grep pattern | sed 's/old/new/' > output" });
   
   // ✅ 正确：使用专门的工具
   const content = await read({ filePath: "file" });
   const matches = content.split("\n").filter(l => l.includes("pattern"));
   await write({ filePath: "output", content: matches.join("\n") });
   ```

2. **忽略工具返回的错误**
   ```typescript
   // ❌ 错误：不检查错误
   const result = await bash({ command: "npm test" });
   // 继续执行...
   
   // ✅ 正确：检查错误
   const result = await bash({ command: "npm test" });
   if (result.isError) {
     // 处理错误
   }
   ```

## 总结

工具系统的核心要点：

1. **文件操作**：read、write、edit、bash
2. **代码搜索**：grep、ast-grep
3. **开发工具**：lsp-diagnostics、lsp-symbols
4. **项目管理**：git、skill
5. **权限控制**：路径限制、命令白名单

---

**下篇预告**: [04-session-management.md](04-session-management.md) —— 会话管理与持久化，包括会话生命周期、自动保存、历史记录、状态恢复等。
