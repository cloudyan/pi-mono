# Skill 系统详解

> 难度：进阶
> 预计阅读时间：35 分钟

## 问题引入

想象这样一个场景：你的 mom 机器人已经能够执行 bash 命令、读写文件，功能相当强大。但随着使用深入，你开始遇到各种"能力缺口"：

- 想让 mom 帮你管理 Gmail？需要教她 IMAP/SMTP 协议
- 想让 mom 自动化浏览器操作？需要教她 Puppeteer API
- 想让 mom 处理 PDF？需要教她 pdf-lib 或 PyPDF

每次新增能力，都要修改代码或重新部署，这显然不够优雅。有没有一种方式，能让 mom 在不修改核心代码的情况下，动态扩展新能力？

**Skill 系统应运而生。**

Skill（技能）是一种声明式的能力扩展机制。它本质是一个包含 `SKILL.md` 文件的目录，里面写着"什么情况下使用我"以及"怎么使用我"。mom 会在启动时自动发现这些技能，并在合适时机加载它们。

```
┌─────────────────────────────────────────────────────────────┐
│                      mom 核心系统                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  bash   │  │  read   │  │  write  │  │  edit   │  ...   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ 动态注入能力说明
                          │
┌─────────────────────────────────────────────────────────────┐
│                      Skills 层                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   gmail     │  │  web-search │  │   pdf       │  ...    │
│  │  邮件处理    │  │  网络搜索    │  │  PDF处理    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

这种设计带来了几个关键优势：

1. **零代码扩展**：创建一个目录 + 一个 Markdown 文件，就能新增能力
2. **按需加载**：只有真正需要时，才读取完整的技能内容
3. **可移植性**：技能可以在不同机器间复制共享
4. **渐进式披露**：系统提示只包含技能名称和描述，完整内容延迟加载

## 核心概念

### Skill 格式

每个 Skill 是一个目录，核心是 `SKILL.md` 文件：

```
my-skill/                     # 目录名 = 技能名
├── SKILL.md                  # 必需：前置元数据 + 使用说明
├── scripts/                  # 可选：辅助脚本
│   └── process.sh
├── lib/                      # 可选：依赖库
│   └── helper.js
└── references/               # 可选：详细文档
    └── api.md
```

`SKILL.md` 的结构遵循 YAML Frontmatter + Markdown 格式：

```markdown
---
name: my-skill
description: 当用户需要处理某某任务时使用此技能
---

# 我的技能

## 环境准备

首次使用前运行：
\`\`\`bash
cd {baseDir} && npm install
\`\`\`

## 使用方法

\`\`\`bash
./scripts/process.sh <input-file>
\`\`\`
```

**关键字段说明：**

| 字段 | 必需 | 约束 | 说明 |
|------|------|------|------|
| `name` | 是 | 最长 64 字符，小写字母/数字/连字符，必须与父目录名一致 | 技能唯一标识 |
| `description` | 是 | 最长 1024 字符 | 决定何时触发加载 |
| `disable-model-invocation` | 否 | 布尔值 | 为 true 时只能通过 `/skill:name` 手动调用 |

**命名规则严格校验：**

```
✅ 有效名称：pdf-tools, gmail-sender, data-analysis
❌ 无效名称：PDF-Tools（大写）, -pdf（连字符开头）, pdf--tools（连续连字符）
```

### 加载机制

Skill 加载是一个分层扫描的过程：

```
loadMomSkills(channelDir, workspacePath)
        │
        ▼
┌───────────────────────────────────────┐
│ 扫描 workspace/skills/ (全局技能)      │
│ 扫描 channel/skills/ (频道技能)        │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│ 对每个目录：                           │
│ 1. 检查是否存在 SKILL.md               │
│ 2. 存在 → 解析为单个技能，停止递归      │
│ 3. 不存在 → 递归子目录继续查找          │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│ 解析 SKILL.md：                        │
│ 1. 提取 YAML frontmatter              │
│ 2. 验证 name/description 格式         │
│ 3. 转换路径为容器内路径                 │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│ 处理命名冲突：                         │
│ 相同 name 的技能，保留先加载的          │
│ 记录 collision 诊断信息                │
└───────────────────────────────────────┘
```

**核心代码解析：**

```typescript
// packages/mom/src/agent.ts: loadMomSkills 函数

function loadMomSkills(channelDir: string, workspacePath: string): Skill[] {
  const skillMap = new Map<string, Skill>();

  // 宿主机上的工作空间路径
  const hostWorkspacePath = join(channelDir, "..");

  // 路径转换函数：将宿主机路径转换为容器内路径
  const translatePath = (hostPath: string): string => {
    if (hostPath.startsWith(hostWorkspacePath)) {
      return workspacePath + hostPath.slice(hostWorkspacePath.length);
    }
    return hostPath;
  };

  // 第一层：加载全局技能（workspace/skills/）
  const workspaceSkillsDir = join(hostWorkspacePath, "skills");
  for (const skill of loadSkillsFromDir({ dir: workspaceSkillsDir, source: "workspace" }).skills) {
    skill.filePath = translatePath(skill.filePath);  // 转换路径
    skill.baseDir = translatePath(skill.baseDir);
    skillMap.set(skill.name, skill);
  }

  // 第二层：加载频道技能（channel/skills/），可覆盖全局技能
  const channelSkillsDir = join(channelDir, "skills");
  for (const skill of loadSkillsFromDir({ dir: channelSkillsDir, source: "channel" }).skills) {
    skill.filePath = translatePath(skill.filePath);
    skill.baseDir = translatePath(skill.baseDir);
    skillMap.set(skill.name, skill);  // 相同 name 会覆盖
  }

  return Array.from(skillMap.values());
}
```

**为什么要路径转换？**

当 mom 运行在 Docker 容器中时：
- 宿主机路径：`/Users/xxx/data/skills/gmail/SKILL.md`
- 容器内路径：`/workspace/skills/gmail/SKILL.md`

LLM 需要的是容器内路径，才能正确执行脚本。

### 注入策略

加载后的技能如何进入 LLM 的视野？答案是 **XML 格式注入系统提示**：

```typescript
// packages/coding-agent/src/core/skills.ts: formatSkillsForPrompt 函数

export function formatSkillsForPrompt(skills: Skill[]): string {
  // 过滤掉 disableModelInvocation=true 的技能
  const visibleSkills = skills.filter((s) => !s.disableModelInvocation);

  if (visibleSkills.length === 0) {
    return "";
  }

  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory...",
    "",
    "<available_skills>",
  ];

  for (const skill of visibleSkills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}
```

**注入后的系统提示示例：**

```
...（其他系统提示内容）...

The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.

<available_skills>
  <skill>
    <name>gmail</name>
    <description>Read, search, and send Gmail via IMAP/SMTP</description>
    <location>/workspace/skills/gmail/SKILL.md</location>
  </skill>
  <skill>
    <name>web-search</name>
    <description>Search the web for current information</description>
    <location>/workspace/skills/web-search/SKILL.md</location>
  </skill>
</available_skills>
```

**渐进式披露的核心思想：**

```
┌────────────────────────────────────────────────────────────┐
│ 系统提示（始终在上下文中）                                   │
│                                                            │
│ <available_skills>                                         │
│   <skill>                                                  │
│     <name>gmail</name>                                     │
│     <description>Read, search, send Gmail...</description> │
│     <location>/workspace/skills/gmail/SKILL.md</location>  │
│   </skill>                                                 │
│ </available_skills>                                        │
└────────────────────────────────────────────────────────────┘
                          │
                          │ LLM 识别用户请求匹配
                          │ "帮我查收 Gmail"
                          ▼
┌────────────────────────────────────────────────────────────┐
│ 读取完整 SKILL.md（按需加载）                               │
│                                                            │
│ # Gmail Skill                                              │
│                                                            │
│ ## Setup                                                   │
│ npm install imap smtp...                                   │
│                                                            │
│ ## Usage                                                   │
│ ./scripts/check-inbox.sh                                   │
│ ./scripts/send-email.sh <to> <subject>                     │
└────────────────────────────────────────────────────────────┘
```

这种设计避免了将所有技能的完整内容都塞进系统提示，显著降低了 token 消耗。

## 实现详解

### 目录扫描算法

Skill 发现采用递归扫描 + 提前终止策略：

```typescript
// packages/coding-agent/src/core/skills.ts: loadSkillsFromDirInternal 函数

function loadSkillsFromDirInternal(
  dir: string,
  source: string,
  includeRootFiles: boolean,
  ignoreMatcher?: IgnoreMatcher,
  rootDir?: string,
): LoadSkillsResult {
  const skills: Skill[] = [];
  const diagnostics: ResourceDiagnostic[] = [];

  if (!existsSync(dir)) {
    return { skills, diagnostics };
  }

  // 解析 .gitignore/.ignore 规则
  const ig = ignoreMatcher ?? ignore();
  addIgnoreRules(ig, dir, root);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    // 第一遍：检查是否存在 SKILL.md
    for (const entry of entries) {
      if (entry.name !== "SKILL.md") continue;

      const fullPath = join(dir, entry.name);
      const result = loadSkillFromFile(fullPath, source);

      if (result.skill) skills.push(result.skill);
      diagnostics.push(...result.diagnostics);

      // 发现 SKILL.md 后立即返回，不继续递归
      return { skills, diagnostics };
    }

    // 第二遍：递归子目录
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const fullPath = join(dir, entry.name);

      // 检查是否被 ignore 规则排除
      if (ig.ignores(relativePath)) continue;

      if (isDirectory) {
        const subResult = loadSkillsFromDirInternal(fullPath, source, false, ig, root);
        skills.push(...subResult.skills);
        diagnostics.push(...subResult.diagnostics);
      }
    }
  } catch {}

  return { skills, diagnostics };
}
```

**关键设计决策：**

1. **SKILL.md 优先**：如果目录根存在 `SKILL.md`，该目录被视为一个技能，不再递归子目录
2. **尊重 .gitignore**：被忽略的文件不会作为技能加载
3. **跳过 node_modules**：避免扫描依赖包

### Frontmatter 解析

```typescript
// packages/coding-agent/src/utils/frontmatter.ts

export function parseFrontmatter<T extends Record<string, unknown>>(
  content: string,
): { frontmatter: T; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {} as T, body: content };
  }

  const [, yamlContent, body] = match;
  const frontmatter = yaml.parse(yamlContent) as T;

  return { frontmatter, body };
}
```

**解析流程：**

```markdown
---
name: gmail
description: |
  Read, search, and send Gmail.
  Supports IMAP and SMTP.
disable-model-invocation: false
---

# Gmail Skill
...
```

解析结果：

```typescript
{
  frontmatter: {
    name: "gmail",
    description: "Read, search, and send Gmail.\nSupports IMAP and SMTP.",
    "disable-model-invocation": false
  },
  body: "\n# Gmail Skill\n..."
}
```

### 验证逻辑

```typescript
// packages/coding-agent/src/core/skills.ts: validateName 函数

function validateName(name: string, parentDirName: string): string[] {
  const errors: string[] = [];

  // 检查是否与父目录名一致
  if (name !== parentDirName) {
    errors.push(`name "${name}" does not match parent directory "${parentDirName}"`);
  }

  // 检查长度
  if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
  }

  // 检查字符集
  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
  }

  // 检查连字符位置
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push(`name must not start or end with a hyphen`);
  }

  // 检查连续连字符
  if (name.includes("--")) {
    errors.push(`name must not contain consecutive hyphens`);
  }

  return errors;
}
```

**验证策略：宽松但警告**

大多数验证失败只会产生警告，技能仍会加载。唯一的硬性要求是 `description` 不能为空。

### 命名冲突处理

```typescript
// packages/coding-agent/src/core/skills.ts: loadSkills 函数

function addSkills(result: LoadSkillsResult) {
  for (const skill of result.skills) {
    // 检测重复文件（通过符号链接）
    const realPath = realpathSync(skill.filePath);
    if (realPathSet.has(realPath)) continue;

    // 检测命名冲突
    const existing = skillMap.get(skill.name);
    if (existing) {
      collisionDiagnostics.push({
        type: "collision",
        message: `name "${skill.name}" collision`,
        path: skill.filePath,
        collision: {
          resourceType: "skill",
          name: skill.name,
          winnerPath: existing.filePath,
          loserPath: skill.filePath,
        },
      });
    } else {
      skillMap.set(skill.name, skill);
      realPathSet.add(realPath);
    }
  }
}
```

**冲突优先级：先加载者优先**

```
/workspace/skills/gmail/SKILL.md       ← 先加载，保留
/channel/skills/gmail/SKILL.md         ← 后加载，冲突警告，丢弃
```

## 使用模式

### 创建技能

**场景：创建一个笔记管理技能**

```bash
# 创建技能目录
mkdir -p /workspace/skills/note

# 创建 SKILL.md
cat > /workspace/skills/note/SKILL.md << 'EOF'
---
name: note
description: Add and read notes from a persistent notes file. Use when user wants to take notes or recall previous notes.
---

# Note Skill

Manage a simple notes file with timestamps.

## Usage

Add a note:
\`\`\`bash
bash {baseDir}/note.sh add "Buy groceries"
\`\`\`

Read all notes:
\`\`\`bash
bash {baseDir}/note.sh read
\`\`\`

Clear notes:
\`\`\`bash
bash {baseDir}/note.sh clear
\`\`\`
EOF

# 创建辅助脚本
cat > /workspace/skills/note/note.sh << 'EOF'
#!/bin/bash
NOTES_FILE="$HOME/.notes.txt"

case "$1" in
  add)
    echo "[$(date -Iseconds)] $2" >> "$NOTES_FILE"
    echo "Note added"
    ;;
  read)
    cat "$NOTES_FILE" 2>/dev/null || echo "No notes yet"
    ;;
  clear)
    rm -f "$NOTES_FILE"
    echo "Notes cleared"
    ;;
  *)
    echo "Usage: note.sh {add|read|clear}"
    exit 1
    ;;
esac
EOF

chmod +x /workspace/skills/note/note.sh
```

**`{baseDir}` 占位符**

SKILL.md 中的 `{baseDir}` 会在运行时被替换为技能目录的实际路径。这保证了脚本的跨平台可移植性。

### 加载技能

**自动发现路径：**

| 层级 | 路径 | 作用范围 |
|------|------|----------|
| 全局 | `~/.pi/agent/skills/` | 所有工作空间 |
| 全局 | `~/.agents/skills/` | 所有工作空间 |
| 项目 | `.pi/skills/` | 当前项目 |
| 项目 | `.agents/skills/` | 当前项目及祖先目录 |

**mom 的双层加载：**

```
data/                           # 工作空间根目录
├── skills/                     # 全局技能（所有频道共享）
│   ├── gmail/
│   └── web-search/
├── C123ABC/                    # Slack 频道
│   └── skills/                 # 频道技能（仅此频道可用）
│       └── calendar/
└── D456DEF/                    # 另一个频道
    └── skills/
        └── jira/
```

**手动加载：**

```bash
# 通过命令行参数指定
mom --skill /path/to/my-skill

# 通过 settings.json 配置
{
  "skills": [
    "~/.pi/agent/skills",
    "../shared-skills"
  ]
}
```

### 手动触发技能

设置 `disable-model-invocation: true` 后，技能不会出现在系统提示中：

```markdown
---
name: internal-tool
description: Internal automation tool
disable-model-invocation: true
---

# Internal Tool
...
```

用户必须显式调用：

```
/skill:internal-tool
```

### 查看已加载技能

```typescript
// 在 mom 运行时查看
console.log(skills.map(s => `${s.name}: ${s.description}`));

// 或查看诊断信息
diagnostics.forEach(d => {
  if (d.type === "warning") console.warn(d.message);
  if (d.type === "collision") console.warn(`Collision: ${d.collision.name}`);
});
```

## 最佳实践

### 描述要精准

```yaml
# ❌ 太模糊，LLM 难以判断何时使用
description: Helps with emails.

# ✅ 具体明确，触发条件清晰
description: Read, search, and send Gmail via IMAP/SMTP. Use when user mentions email, Gmail, or needs to check inbox.
```

### 使用相对路径引用

```markdown
<!-- ✅ 正确：相对路径 -->
See [API Reference](references/api.md) for details.

<!-- ❌ 错误：绝对路径 -->
See [API Reference](/workspace/skills/my-skill/references/api.md) for details.
```

### 提供环境准备步骤

```markdown
## Setup (运行一次)

\`\`\`bash
cd {baseDir} && npm install
\`\`\`

## First-time Configuration

Set your API key:
\`\`\`bash
echo "API_KEY=your-key" > {baseDir}/.env
\`\`\`
```

### 分离文档与指令

```
pdf-tools/
├── SKILL.md              # 核心使用指南（简洁）
├── scripts/
│   └── extract.sh
└── references/
    ├── pdf-spec.md       # 详细规范（按需读取）
    └── advanced.md       # 高级用法
```

SKILL.md 保持简洁，详细文档放在 `references/` 下，让 LLM 按需读取。

### 避免命名冲突

```bash
# ❌ 容易冲突的通用名称
skills/utils/SKILL.md
skills/helper/SKILL.md

# ✅ 语义明确的前缀命名
skills/gmail-utils/SKILL.md
skills/web-helper/SKILL.md
```

### 正确处理技能依赖

```markdown
## Dependencies

This skill requires:
- Node.js 18+
- `jq` for JSON processing

Install on Alpine:
\`\`\`bash
apk add jq
\`\`\`
```

不要在技能脚本中假设环境已就绪，始终提供安装指引。

## 总结

Skill 系统的设计哲学可以概括为一句话：**用 Markdown 扩展 AI 能力**。

**核心要点：**

1. **声明式定义**：一个目录 + 一个 SKILL.md = 一个技能
2. **渐进式披露**：系统提示只包含元信息，完整内容按需读取
3. **分层加载**：全局技能 + 频道技能，后者可覆盖前者
4. **路径无关**：`{baseDir}` 占位符保证跨环境可移植
5. **宽松验证**：大部分格式问题只警告不阻断

**系统流程图：**

```
启动 mom
    │
    ▼
扫描 skills/ 目录
    │
    ▼
解析 SKILL.md → 提取 name/description
    │
    ▼
验证格式 → 生成警告/错误
    │
    ▼
处理命名冲突 → 保留先加载者
    │
    ▼
生成 XML → 注入系统提示
    │
    ▼
用户请求匹配 description
    │
    ▼
LLM 读取完整 SKILL.md
    │
    ▼
执行技能指令
```

这种设计让 mom 成为一个可无限扩展的平台，而不仅仅是一个固定的工具集。

## 下篇预告

下一篇我们将深入 **Events 系统**——mom 的定时唤醒机制。

- 如何让 mom 在指定时间自动执行任务
- 三种事件类型：immediate / one-shot / periodic
- Cron 表达式与跨时区处理
- Silent completion：静默完成周期任务

Events 系统让 mom 从"被动响应"进化为"主动工作"，敬请期待。