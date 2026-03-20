# 会话树导航

`/tree` 命令提供基于树的会话历史导航功能。

## 概述

会话以树形结构存储，每条记录都有 `id` 和 `parentId`。"叶子"指针追踪当前位置。`/tree` 让你可以导航到任意节点，并可选择对离开的分支进行摘要。

### 与 `/fork` 的对比

| 功能 | `/fork` | `/tree` |
|------|---------|---------|
| 视图 | 用户消息的平铺列表 | 完整树形结构 |
| 操作 | 提取路径到**新会话文件** | 在**同一会话**中改变叶子 |
| 摘要 | 从不 | 可选（用户确认） |
| 事件 | `session_before_fork` / `session_fork` | `session_before_tree` / `session_tree` |

## 树形 UI

```
├─ user: "Hello, can you help..."
│  └─ assistant: "Of course! I can..."
│     ├─ user: "Let's try approach A..."
│     │  └─ assistant: "For approach A..."
│     │     └─ [compaction: 12k tokens]
│     │        └─ user: "That worked..."  ← active
│     └─ user: "Actually, approach B..."
│        └─ assistant: "For approach B..."
```

### 控制方式

| 按键 | 操作 |
|------|------|
| ↑/↓ | 导航（深度优先顺序） |
| ←/→ | 翻页上/下 |
| Ctrl+←/Ctrl+→ 或 Alt+←/Alt+→ | 折叠/展开并在分支段之间跳转 |
| Enter | 选择节点 |
| Escape/Ctrl+C | 取消 |
| Ctrl+U | 切换：仅显示用户消息 |
| Ctrl+O | 切换：显示全部（包括自定义/标签记录） |

`Ctrl+←` 或 `Alt+←` 会折叠当前节点（如果可折叠）。可折叠的节点是根节点和有可见子节点的分支段起点。如果当前节点不可折叠或已折叠，选区会跳转到上一个可见的分支段起点。

`Ctrl+→` 或 `Alt+→` 会展开当前节点（如果已折叠）。否则，选区会跳转到下一个可见的分支段起点，或在没有更多分支点时跳转到分支末尾。

### 显示规则

- 高度：终端高度的一半
- 当前叶子标记为 `← active`
- 标签内联显示：`[label-name]`
- 可折叠的分支起点在连接符中显示 `⊟`。已折叠的分支显示 `⊞`
- 活动路径标记 `•` 在折叠指示符后显示（如适用）
- 搜索和筛选变更会重置所有折叠状态
- 默认筛选隐藏 `label` 和 `custom` 记录（在 Ctrl+O 模式下显示）
- 子节点按时间戳排序（最旧的在前）

## 选择行为

### 用户消息或自定义消息

1. 叶子设为所选节点的**父节点**（如果是根节点则为 `null`）
2. 消息文本放入**编辑器**以便重新提交
3. 用户编辑并提交，创建新分支

### 非用户消息（assistant、compaction 等）

1. 叶子设为**所选节点**
2. 编辑器保持为空
3. 用户从该点继续

### 选择根用户消息

如果用户选择第一条消息（没有父节点）：

1. 叶子重置为 `null`（空对话）
2. 消息文本放入编辑器
3. 用户实际上从头开始

## 分支摘要

切换分支时，用户有三个选项：

1. **不摘要** - 立即切换，不进行摘要
2. **摘要** - 使用默认提示词生成摘要
3. **自定义提示词摘要** - 打开编辑器输入额外的关注指令，附加到默认摘要提示词后

### 摘要范围

从旧叶子回溯到与目标的公共祖先的路径：

```
A → B → C → D → E → F  ← 旧叶子
        ↘ G → H        ← 目标
```

被放弃的路径：D → E → F（被摘要）

摘要停止于：

1. 公共祖先（始终）
2. Compaction 节点（如果先遇到）

### 摘要存储

存储为 `BranchSummaryEntry`：

```typescript
interface BranchSummaryEntry {
  type: "branch_summary";
  id: string;
  parentId: string;      // 新叶子位置
  timestamp: string;
  fromId: string;        // 被放弃的旧叶子
  summary: string;       // LLM 生成的摘要
  details?: unknown;     // 可选的 hook 数据
}
```

## 实现

### AgentSession.navigateTree()

```typescript
async navigateTree(
  targetId: string,
  options?: {
    summarize?: boolean;
    customInstructions?: string;
    replaceInstructions?: boolean;
    label?: string;
  }
): Promise<{ editorText?: string; cancelled: boolean }>
```

选项：

- `summarize`：是否生成被放弃分支的摘要
- `customInstructions`：摘要器的自定义指令
- `replaceInstructions`：如果为 true，`customInstructions` 替换默认提示词而非附加
- `label`：附加到分支摘要记录的标签（如果不摘要则附加到目标记录）

流程：

1. 验证目标，检查无操作（target === 当前叶子）
2. 查找旧叶子与目标之间的公共祖先
3. 收集待摘要的记录（如果请求）
4. 触发 `session_before_tree` 事件（hook 可取消或提供摘要）
5. 如需要运行默认摘要器
6. 通过 `branch()` 或 `branchWithSummary()` 切换叶子
7. 更新 agent：`agent.replaceMessages(sessionManager.buildSessionContext().messages)`
8. 触发 `session_tree` 事件
9. 通过会话事件通知自定义工具
10. 如果选择的是用户消息，返回包含 `editorText` 的结果

### SessionManager

- `getLeafUuid(): string | null` - 当前叶子（如果为空则为 null）
- `resetLeaf(): void` - 将叶子设为 null（用于根用户消息导航）
- `getTree(): SessionTreeNode[]` - 完整树，子节点按时间戳排序
- `branch(id)` - 改变叶子指针
- `branchWithSummary(id, summary)` - 改变叶子并创建摘要记录

### InteractiveMode

`/tree` 命令显示 `TreeSelectorComponent`，然后：

1. 提示是否摘要
2. 调用 `session.navigateTree()`
3. 清空并重新渲染聊天
4. 如适用设置编辑器文本

## Hook 事件

### `session_before_tree`

```typescript
interface TreePreparation {
  targetId: string;
  oldLeafId: string | null;
  commonAncestorId: string | null;
  entriesToSummarize: SessionEntry[];
  userWantsSummary: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
}

interface SessionBeforeTreeEvent {
  type: "session_before_tree";
  preparation: TreePreparation;
  signal: AbortSignal;
}

interface SessionBeforeTreeResult {
  cancel?: boolean;
  summary?: { summary: string; details?: unknown };
  customInstructions?: string;    // 覆盖自定义指令
  replaceInstructions?: boolean;  // 覆盖替换模式
  label?: string;                 // 覆盖标签
}
```

扩展可以通过从 `session_before_tree` 处理器返回 `customInstructions`、`replaceInstructions` 和 `label` 来覆盖它们。

### `session_tree`

```typescript
interface SessionTreeEvent {
  type: "session_tree";
  newLeafId: string | null;
  oldLeafId: string | null;
  summaryEntry?: BranchSummaryEntry;
  fromHook?: boolean;
}
```

### 示例：自定义摘要器

```typescript
export default function(pi: HookAPI) {
  pi.on("session_before_tree", async (event, ctx) => {
    if (!event.preparation.userWantsSummary) return;
    if (event.preparation.entriesToSummarize.length === 0) return;
    
    const summary = await myCustomSummarizer(event.preparation.entriesToSummarize);
    return { summary: { summary, details: { custom: true } } };
  });
}
```

## 错误处理

- 摘要失败：取消导航，显示错误
- 用户中止（Escape）：取消导航
- Hook 返回 `cancel: true`：静默取消导航