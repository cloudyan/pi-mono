# Skill 系统详解

> **难度：进阶** | **预计阅读时间：25 分钟**

> **注意**：本文档中的代码示例为概念性说明。实际 API 请参考对应源码路径。
> - Skill 加载与验证：`packages/coding-agent/src/core/skills.ts`
> - 资源加载器：`packages/coding-agent/src/core/resource-loader.ts`
> - Skill 命令扩展：`packages/coding-agent/src/core/agent-session.ts`

Skill 系统是 pi-coding-agent 的核心扩展能力之一，遵循 [agentskills.io](https://agentskills.io) 标准。与 Extension 不同，Skill 不需要编写代码，只需要编写 Markdown。

## 1. 概述

### 1.1 Skill 是什么？

Skill 是一个**Markdown 文件**，包含特定任务的专业指导。它遵循 [agentskills.io](https://agentskills.io) 标准，通过简单的 Markdown 格式为 AI 提供上下文指导。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Skill 文件结构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Frontmatter (YAML)                                      │   │
│  │  ─────────────────                                       │   │
│  │  name: brave-search                                      │   │
│  │  description: 使用 Brave Search API 进行网页搜索         │   │
│  │  disable-model-invocation: false                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Content (Markdown)                                      │   │
│  │  ─────────────────                                       │   │
│  │  ## 配置                                                  │   │
│  │  需要环境变量：`BRAVE_API_KEY`                            │   │
│  │                                                          │   │
│  │  ## 使用方式                                              │   │
│  │  当用户需要搜索时...                                      │   │
│  │                                                          │   │
│  │  ## 示例                                                  │   │
│  │  ```bash                                                 │   │
│  │  curl "https://api.search.brave.com/api/v1/search?q=..." │   │
│  │  ```                                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Skill 的核心价值

| 价值 | 说明 |
|------|------|
| **渐进式披露** | 描述常驻上下文，完整内容按需加载，节省 Token |
| **可扩展** | 无需修改代码，只需添加 Markdown 文件 |
| **可分享** | 标准格式，可在项目、团队、社区间共享 |
| **轻量级** | 纯配置式，无需编译或部署 |

### 1.3 Skill vs Extension

| 对比项 | Skill | Extension |
|--------|-------|-----------|
| **类型** | 配置式（Markdown） | 代码式（TypeScript） |
| **复杂度** | 低 | 高 |
| **能力** | 提供上下文指导 | 注册工具、命令、事件处理 |
| **适用场景** | 特定任务的执行指导 | 自定义工具、UI 扩展 |
| **开发成本** | 几分钟 | 数小时 |
| **热重载** | 自动 | 需重启 |

## 2. Skill 文件格式

### 2.1 文件结构

```markdown
---
name: my-skill-name              # 可选，默认使用父目录名
description: Skill description   # 必需，最大 1024 字符
disable-model-invocation: false  # 可选，设为 true 则只能通过 /skill:name 手动触发
---

# Skill 标题

## 配置

环境变量、认证信息、依赖说明等。

## 使用方式

详细的执行步骤和工具调用说明。

## 示例

典型的使用场景示例。

## 注意事项

常见错误和边界情况处理。
```

### 2.2 Frontmatter 字段详解

#### `name`（可选）

Skill 的唯一标识符。

- **格式**：1-64 个字符，小写字母、数字、连字符 `[a-z0-9-]+`
- **限制**：不能以连字符开头或结尾，不能包含连续连字符 `--`
- **默认**：使用父目录名
- **必须与父目录名匹配**

```yaml
# 正确
name: brave-search
name: setup-node-v2

# 错误
name: BraveSearch      # 包含大写
name: setup_node       # 包含下划线
name: -setup-node      # 以连字符开头
name: setup--node      # 连续连字符
```

#### `description`（必需）

Skill 的用途描述，用于 LLM 判断是否应使用该 Skill。

- **格式**：纯文本，最多 1024 字符
- **要求**：清晰、具体，说明触发条件和用途
- **常驻**：始终包含在系统提示词中

```yaml
# 好的描述
description: 使用 Brave Search API 进行网页搜索，返回搜索结果标题、链接和摘要

# 不好的描述
description: 搜索工具  # 过于模糊
```

#### `disable-model-invocation`（可选）

是否禁用模型自动调用。

| 值 | 行为 |
|----|------|
| `false`（默认） | 描述常驻系统提示词，LLM 可自动匹配并调用 |
| `true` | 完全不出现在系统提示词，只能通过 `/skill:name` 手动触发 |

```yaml
# 适合自动触发的 Skill（默认）
disable-model-invocation: false

# 适合手动触发的 Skill
disable-model-invocation: true
```

### 2.3 Content 部分

Content 是 Skill 的核心，包含详细的指令、示例和脚本。它只在 Skill 被触发时加载到上下文中。

建议包含以下章节：

| 章节 | 用途 |
|------|------|
| **配置** | 环境变量、API 密钥、依赖说明 |
| **使用方式** | 何时使用、如何调用工具 |
| **示例** | 典型的使用场景和代码示例 |
| **注意事项** | 常见错误、边界情况、限制 |
| **参考** | 相关文档、链接 |

## 3. Skill 发现机制

### 3.1 加载路径优先级

pi-coding-agent 按以下优先级从多个位置加载 Skill（高优先级覆盖低优先级）：

| 优先级 | 来源 | 路径 | CLI 参数 |
|--------|------|------|----------|
| 1 | CLI 参数 | 任意路径 | `--skill <path>` |
| 2 | 扩展注册 | Extension 提供 | - |
| 3 | 项目本地 | `.pi/skills/`, `.agents/skills/` | - |
| 4 | 全局安装 | `~/.pi/agent/skills/`, `~/.agents/skills/` | - |
| 5 | Pi Packages | npm/git 安装的包中的 `skills/` 目录 | - |

### 3.2 目录结构示例

```
# CLI 参数指定
--skill /path/to/custom-skill.md

# 扩展提供的 Skill
<extension-dir>/
└── skills/
    └── my-extension-skill/
        └── SKILL.md

# 项目本地 Skill
<project-root>/
├── .pi/
│   └── skills/
│       ├── brave-search/
│       │   └── SKILL.md
│       └── setup-node/
│           └── SKILL.md
└── .agents/
    └── skills/
        └── legacy-skill/
            └── SKILL.md

# 全局安装 Skill
~/.pi/agent/skills/
├── database-migration/
│   └── SKILL.md
└── pr-review/
    └── SKILL.md

# Pi Packages 中的 Skill
node_modules/@pi-agent/some-package/skills/
└── package-skill/
    └── SKILL.md
```

### 3.3 路径向上递归查找

从工作目录向上递归查找 `.pi/skills/` 和 `.agents/skills/` 目录：

```
工作目录: /home/user/projects/my-app/src/components
                                    │
                                    ▼
                    检查 /home/user/projects/my-app/src/.pi/skills/
                    检查 /home/user/projects/my-app/src/.agents/skills/
                                    │
                                    ▼
                    检查 /home/user/projects/my-app/.pi/skills/  ← 找到
                    检查 /home/user/projects/my-app/.agents/skills/
                                    │
                                    ▼
                    检查 /home/user/projects/.pi/skills/
                    ...（继续向上直到根目录）
```

### 3.4 同名 Skill 冲突处理

当多个路径存在同名 Skill 时：

1. **保留第一个**：按优先级顺序，第一个找到的 Skill 被保留
2. **忽略后续**：后续同名 Skill 被忽略
3. **发出警告**：在 diagnostics 中记录冲突

```typescript
// 对应源码：packages/coding-agent/src/core/skills.ts

export interface ResourceDiagnostic {
  type: "warning" | "error";
  message: string;
  path: string;
}

// 冲突示例诊断
{
  type: "warning",
  message: "Skill 'brave-search' already loaded from /home/user/.pi/skills/brave-search/SKILL.md, skipping /usr/share/pi/skills/brave-search/SKILL.md",
  path: "/usr/share/pi/skills/brave-search/SKILL.md"
}
```

## 4. Skill 使用方式

### 4.1 自动触发（默认）

```
┌─────────────────────────────────────────────────────────────────┐
│                     自动触发流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Skill 描述常驻系统提示词                                     │
│     │                                                          │
│     ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ <available_skills>                                       │   │
│  │   <skill>                                                │   │
│  │     <name>brave-search</name>                            │   │
│  │     <description>使用 Brave Search API 进行网页搜索...</description>│
│  │   </skill>                                               │   │
│  │ </available_skills>                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│     │                                                          │
│     ▼                                                          │
│  2. LLM 根据用户请求匹配 Skill                                   │
│     用户："帮我搜索最新的 React 版本"                            │
│     LLM：这个请求匹配 brave-search Skill                        │
│     │                                                          │
│     ▼                                                          │
│  3. LLM 调用 `read` 工具加载完整内容                             │
│     [read] /home/user/.pi/skills/brave-search/SKILL.md         │
│     │                                                          │
│     ▼                                                          │
│  4. 根据 Skill 指导执行搜索                                      │
│     [bash] curl "https://api.search.brave.com/..."             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**适合场景**：
- 通用能力（搜索、数据处理）
- 常用工具（Git 操作、测试运行）
- 领域特定任务（前端开发、数据库管理）

### 4.2 手动触发

在交互模式下输入 `/skill:name` 命令手动触发 Skill：

```bash
# 手动触发 setup-node Skill
/skill:setup-node

# 触发时附带额外参数
/skill:setup-node --framework=express --typescript
```

手动触发时，整个 Skill 文件内容会立即加载到上下文中。

**适合场景**：
- 特定场景需要明确上下文
- 需要覆盖自动触发的默认行为
- Skill 设置了 `disable-model-invocation: true`

### 4.3 禁用触发

设置 `disable-model-invocation: true`：

```yaml
---
name: internal-deploy
description: 内部部署流程，仅限运维人员使用
disable-model-invocation: true
---
```

**行为**：
- 完全不出现在系统提示词中
- LLM 无法自动匹配该 Skill
- 只能通过 `/skill:name` 调用

**适合场景**：
- 内部/敏感操作
- 需要显式授权的 Skill
- 低频但重要的任务

## 5. 渐进式披露设计

### 5.1 为什么需要？

传统方式的问题：
- 所有 Skill 的完整内容常驻上下文 → Token 浪费
- 不相关的 Skill 内容 → 上下文污染
- LLM 难以从大量内容中找到相关指导

```
┌─────────────────────────────────────────────────────────────────┐
│                    传统方式（不推荐）                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  系统提示词（假设 10 个 Skill，每个 2KB）：                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Skill 1 完整内容 (2KB)                                   │   │
│  │ Skill 2 完整内容 (2KB)                                   │   │
│  │ Skill 3 完整内容 (2KB)                                   │   │
│  │ ...                                                      │   │
│  │ Skill 10 完整内容 (2KB)                                  │   │
│  │ 实际使用的 Skill：只有 1 个                               │   │
│  │                                                          │   │
│  │ 浪费：~18KB Token                                        │   │
│  │ 污染：不相关内容干扰 LLM 判断                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 实现方式

```
┌─────────────────────────────────────────────────────────────────┐
│                     渐进式披露（推荐）                           │
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
│  1. 常驻上下文保持精简，仅包含描述（~100B/Skill）               │
│  2. 只有当需要时才加载完整内容                                  │
│  3. AI 可以根据描述判断是否加载特定 Skill                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**对应源码**：

```typescript
// packages/coding-agent/src/core/skills.ts

/** 将 Skill 格式化为系统提示词中的 XML */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const skillEntries = skills
    .filter((skill) => !skill.disableModelInvocation)
    .map((skill) => {
      // 只包含描述信息，不包含完整内容
      return `  <skill>\n` +
        `    <name>${escapeXml(skill.name)}</name>\n` +
        `    <description>${escapeXml(skill.description)}</description>\n` +
        `    <location>${escapeXml(skill.filePath)}</location>\n` +
        `  </skill>`;
    })
    .join("\n");

  return `<available_skills>\n` +
    `The following skills provide specialized instructions for specific tasks.\n` +
    `Use the read tool to load a skill's file when the task matches its description.\n\n` +
    `${skillEntries}\n` +
    `</available_skills>`;
}
```

### 5.3 对比 Extension

| 特性 | Skill | Extension |
|------|-------|-----------|
| **加载方式** | 渐进式（描述→按需内容） | 完全加载（代码） |
| **常驻开销** | 极低（仅描述） | 较高（代码体积） |
| **灵活性** | 配置式，随时修改 | 代码式，需编译 |
| **能力范围** | 上下文指导 | 工具/命令/UI 扩展 |
| **适用场景** | 执行流程指导 | 自定义能力实现 |

## 6. Skill 验证规则

### 6.1 名称规范

```typescript
// packages/coding-agent/src/core/skills.ts

const SKILL_NAME_MAX_LENGTH = 64;
const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

function validateSkillName(name: string): string[] {
  const errors: string[] = [];

  // 长度检查
  if (name.length === 0 || name.length > SKILL_NAME_MAX_LENGTH) {
    errors.push(`Name must be 1-${SKILL_NAME_MAX_LENGTH} characters`);
  }

  // 字符检查
  if (!SKILL_NAME_PATTERN.test(name)) {
    errors.push("Name must contain only lowercase letters, numbers, and hyphens");
  }

  // 首尾连字符检查
  if (name.startsWith("-")) {
    errors.push("Name cannot start with a hyphen");
  }
  if (name.endsWith("-")) {
    errors.push("Name cannot end with a hyphen");
  }

  // 连续连字符检查
  if (name.includes("--")) {
    errors.push("Name cannot contain consecutive hyphens");
  }

  return errors;
}
```

### 6.2 目录名匹配

Skill 文件必须位于与其名称匹配的目录中：

```
# 正确
.pi/skills/brave-search/SKILL.md        # name: brave-search
.pi/skills/setup-node-v2/SKILL.md       # name: setup-node-v2

# 错误（不匹配）
.pi/skills/my-search/SKILL.md           # name: brave-search  ❌
.pi/skills/setup/SKILL.md               # name: setup-node    ❌
```

### 6.3 描述长度

```typescript
const SKILL_DESCRIPTION_MAX_LENGTH = 1024;

function validateSkillDescription(description: string): string[] {
  const errors: string[] = [];

  if (description.length === 0) {
    errors.push("Description is required");
  }

  if (description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
    errors.push(`Description must be at most ${SKILL_DESCRIPTION_MAX_LENGTH} characters`);
  }

  return errors;
}
```

### 6.4 验证结果

```typescript
export interface LoadSkillsResult {
  /** 成功加载的 Skill */
  skills: Skill[];
  /** 诊断信息（警告、错误） */
  diagnostics: ResourceDiagnostic[];
}

export interface ResourceDiagnostic {
  type: "warning" | "error";
  message: string;
  path: string;
}
```

## 7. 创建 Skill 示例

### 7.1 完整示例：brave-search

创建 `.pi/skills/brave-search/SKILL.md`：

```markdown
---
name: brave-search
description: 使用 Brave Search API 进行网页搜索，返回搜索结果标题、链接和摘要。当用户需要搜索网络信息、查找资料、获取最新资讯时使用此 Skill。
---

# Brave Search

使用 Brave Search API 进行网页搜索。

## 配置

需要以下环境变量：
- `BRAVE_API_KEY`: Brave Search API 密钥
  - 获取地址：https://api.search.brave.com/
  - 支持免费额度：每月 2000 次请求

## 使用方式

当用户需要搜索信息时，使用 `bash` 工具调用 Brave Search API。

### API 调用

```bash
curl -s "https://api.search.brave.com/api/v1/search?q={查询词}&count={数量}" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer $BRAVE_API_KEY"
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `q` | 搜索查询词 | 必需 |
| `count` | 返回结果数量 | 10 |
| `offset` | 结果偏移量 | 0 |
| `search_lang` | 搜索语言 | en |

## 示例

### 示例 1：搜索技术文档

用户问："React useEffect 的用法"

1. 构造查询：`React useEffect usage examples`
2. 调用 API：
   ```bash
   curl -s "https://api.search.brave.com/api/v1/search?q=React%20useEffect%20usage%20examples&count=5" \
     -H "Accept: application/json" \
     -H "Authorization: Bearer $BRAVE_API_KEY"
   ```
3. 从返回的 JSON 中提取 `web.results`
4. 向用户展示结果标题和链接

### 示例 2：搜索最新新闻

用户问："最新的 TypeScript 版本有什么新特性"

1. 构造查询：`TypeScript latest version features`
2. 调用 API：
   ```bash
   curl -s "https://api.search.brave.com/api/v1/search?q=TypeScript%20latest%20version%20features&count=5" \
     -H "Accept: application/json" \
     -H "Authorization: Bearer $BRAVE_API_KEY"
   ```
3. 分析搜索结果，提取关键信息
4. 向用户总结新特性

## 注意事项

1. **错误处理**：API 可能返回 401（认证失败）、429（频率限制）等错误
2. **结果截断**：搜索结果可能较多，选择最相关的 3-5 条展示
3. **隐私**：不要记录用户的搜索查询
4. **引用**：向用户展示信息时，提供来源链接
```

### 7.2 步骤说明

1. **创建目录**：
   ```bash
   mkdir -p .pi/skills/brave-search
   ```

2. **编写 SKILL.md**：
   使用上述示例内容创建文件

3. **验证加载**：
   启动 pi，查看系统提示词中是否包含该 Skill

4. **测试使用**：
   输入搜索相关的问题，观察 LLM 是否自动使用该 Skill

## 8. Skill 最佳实践

### 8.1 描述要具体

让 LLM 能准确判断何时使用该 Skill。

```yaml
# 好的描述
description: 使用 Brave Search API 进行网页搜索，返回搜索结果标题、链接和摘要。当用户需要搜索网络信息、查找资料、获取最新资讯时使用此 Skill。

# 不好的描述
description: 搜索工具  # 过于模糊
description: 使用 Brave Search API  # 不完整
```

### 8.2 提供完整上下文

包含认证、参数、错误处理等信息。

```markdown
## 配置
- 环境变量
- API 密钥获取方式
- 支持的免费额度

## 使用方式
- 详细的 API 调用格式
- 参数说明表
- 返回值结构

## 注意事项
- 常见错误处理
- 边界情况说明
- 安全提示
```

### 8.3 使用示例

展示典型使用场景，帮助 LLM 理解如何应用。

```markdown
## 示例

### 示例 1：基本用法
...

### 示例 2：处理边界情况
...

### 示例 3：结合其他工具
...
```

### 8.4 避免过于宽泛

一个 Skill 聚焦一个能力，保持职责单一。

```yaml
# 过于宽泛（不推荐）
description: 处理所有 HTTP 请求、API 调用、数据抓取

# 聚焦具体能力（推荐）
description: 使用 curl 发送 HTTP GET 请求获取 JSON 数据
```

### 8.5 版本控制

将 Skill 文件放入项目仓库，便于团队共享和版本管理。

```
项目仓库/
├── .pi/
│   └── skills/           ← 提交到 Git
│       └── my-skill/
│           └── SKILL.md
├── src/
└── package.json
```

## 9. 共享与分发

### 9.1 GitHub 仓库

参考 [anthropics/skills](https://github.com/anthropics/skills) 仓库结构：

```
skills/
├── skill-name-1/
│   └── SKILL.md
├── skill-name-2/
│   └── SKILL.md
└── README.md
```

### 9.2 Pi Packages

打包成 npm 模块，通过包管理器分发：

```json
// package.json
{
  "name": "@my-org/pi-skills",
  "version": "1.0.0",
  "pi": {
    "skills": "./skills"
  }
}
```

目录结构：

```
node_modules/@my-org/pi-skills/
├── package.json
└── skills/
    └── my-skill/
        └── SKILL.md
```

### 9.3 文档站点

agentskills.io 生态，提供标准规范和最佳实践参考。

## 10. 对应源码

### 10.1 Skill 加载与验证

**文件**：`packages/coding-agent/src/core/skills.ts`

```typescript
// 核心接口
export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  disableModelInvocation: boolean;
}

// 加载 Skill
export function loadSkills(options?: LoadSkillsOptions): LoadSkillsResult;

// 从目录加载
export function loadSkillsFromDir(options: LoadSkillsFromDirOptions): LoadSkillsResult;

// 格式化为提示词
export function formatSkillsForPrompt(skills: Skill[]): string;
```

### 10.2 资源加载器

**文件**：`packages/coding-agent/src/core/resource-loader.ts`

```typescript
export interface ResourceLoader {
  getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] };
  reload(): Promise<void>;
}
```

### 10.3 Skill 命令扩展

**文件**：`packages/coding-agent/src/core/agent-session.ts`

```typescript
export class AgentSession {
  // 处理 /skill:name 命令
  private async handleSkillCommand(skillName: string): Promise<void>;
}
```

### 10.4 Skill 命令注册

**文件**：`packages/coding-agent/src/core/extensions/built-in/skill-commands.ts`

```typescript
// 注册 /skill:name 命令
export function registerSkillCommands(context: ExtensionContext): void {
  context.registerCommand({
    name: "skill",
    description: "Load a skill by name",
    handler: async (args, commandCtx) => {
      const skillName = args._[0];
      // 加载并注入 Skill 内容
    },
  });
}
```

## 总结

Skill 系统的核心要点：

1. **Skill 是什么**：遵循 agentskills.io 标准的 Markdown 文件，提供特定任务的专业指导
2. **渐进式披露**：描述常驻上下文，完整内容按需加载，节省 Token
3. **三种使用方式**：自动触发（默认）、手动触发（`/skill:name`）、禁用触发
4. **加载路径**：CLI 参数 > 扩展 > 项目本地 > 全局安装 > Pi Packages
5. **验证规则**：名称规范、目录名匹配、描述长度限制
6. **最佳实践**：描述具体、提供完整上下文、使用示例、聚焦单一能力

---

**下篇预告**: [05-interactive-mode.md](05-interactive-mode.md) —— 交互模式详解，包括 TUI 界面、快捷键、消息管理、分支导航等。
