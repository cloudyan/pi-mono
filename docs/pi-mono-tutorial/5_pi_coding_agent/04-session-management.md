# 会话管理与持久化

> **难度：进阶** | **预计阅读时间：20 分钟**

上一章我们了解了工具系统。本章将深入会话管理与持久化——这是 pi-coding-agent 能够长时间运行和恢复状态的关键。

## 会话生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                      会话生命周期                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    │
│  │ 创建    │───→│ 运行    │───→│ 暂停    │───→│ 恢复    │    │
│  │         │    │         │    │         │    │         │    │
│  │ - 初始化│    │ - 对话  │    │ - 保存  │    │ - 加载  │    │
│  │ - 配置  │    │ - 工具  │    │ - 状态  │    │ - 继续  │    │
│  │ - 工具  │    │ - 事件  │    │         │    │         │    │
│  └─────────┘    └────┬────┘    └─────────┘    └─────────┘    │
│                      │                                          │
│                      ▼                                          │
│                 ┌─────────┐                                     │
│                 │ 结束    │                                     │
│                 │         │                                     │
│                 │ - 保存  │                                     │
│                 │ - 清理  │                                     │
│                 └─────────┘                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 会话数据结构

```typescript
// packages/coding-agent/src/core/session.ts

export interface SessionData {
  // 基本信息
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  
  // Agent 状态
  agent: {
    systemPrompt: string;
    model: string;
    messages: AgentMessage[];
    tools: string[];
  };
  
  // 会话状态
  state: {
    phase: SessionPhase;
    context: SessionContext;
    stats: SessionStats;
  };
  
  // 元数据
  metadata: {
    version: number;
    workspace: string;
    gitBranch?: string;
  };
}

export type SessionPhase = 
  | "idle"      // 空闲
  | "thinking"  // AI 思考中
  | "acting"    // 执行工具
  | "waiting";  // 等待用户输入

export interface SessionContext {
  // 当前文件
  currentFile?: string;
  
  // 选中的文件
  selectedFiles?: string[];
  
  // Git 信息
  gitBranch?: string;
  gitCommit?: string;
  
  // 自定义上下文
  custom?: Record<string, any>;
}

export interface SessionStats {
  messageCount: number;
  toolCallCount: number;
  tokenCount: number;
  fileEditCount: number;
}
```

## 创建会话

```typescript
// packages/coding-agent/src/core/session.ts

export async function createSession(options: SessionOptions): Promise<Session> {
  const session: SessionData = {
    id: generateSessionId(),
    name: options.name || generateSessionName(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    
    agent: {
      systemPrompt: options.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      model: options.model || DEFAULT_MODEL,
      messages: [],
      tools: options.tools || DEFAULT_TOOLS,
    },
    
    state: {
      phase: "idle",
      context: {
        workspace: process.cwd(),
      },
      stats: {
        messageCount: 0,
        toolCallCount: 0,
        tokenCount: 0,
        fileEditCount: 0,
      },
    },
    
    metadata: {
      version: SESSION_VERSION,
      workspace: process.cwd(),
    },
  };
  
  // 保存到存储
  await saveSession(session);
  
  return new Session(session);
}
```

## 保存会话

### 自动保存

```typescript
// packages/coding-agent/src/core/session.ts

export class Session {
  private autoSaveTimer?: NodeJS.Timeout;
  private autoSaveInterval: number = 30000;  // 30 秒
  
  constructor(private data: SessionData) {
    // 启用自动保存
    if (this.data.metadata.autoSave !== false) {
      this.startAutoSave();
    }
  }
  
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      this.save();
    }, this.autoSaveInterval);
  }
  
  async save(): Promise<void> {
    this.data.updatedAt = Date.now();
    await saveSession(this.data);
  }
  
  dispose(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    // 最后保存
    this.save();
  }
}
```

### 存储格式

```typescript
// ~/.pi/sessions/{session-id}.json

{
  "id": "sess_abc123",
  "name": "feature-login",
  "createdAt": 1704067200000,
  "updatedAt": 1704067500000,
  
  "agent": {
    "systemPrompt": "你是一个全栈开发工程师...",
    "model": "anthropic:claude-sonnet-4-20250514",
    "messages": [
      {
        "role": "user",
        "content": [{ "type": "text", "text": "帮我实现登录功能" }],
        "timestamp": 1704067200000
      },
      {
        "role": "assistant",
        "content": [{ "type": "text", "text": "我来帮你实现..." }],
        "timestamp": 1704067210000
      }
    ],
    "tools": ["read", "write", "edit", "bash"]
  },
  
  "state": {
    "phase": "idle",
    "context": {
      "currentFile": "src/auth/login.ts",
      "selectedFiles": ["src/auth/login.ts", "src/auth/types.ts"],
      "gitBranch": "feature/login"
    },
    "stats": {
      "messageCount": 10,
      "toolCallCount": 25,
      "tokenCount": 5000,
      "fileEditCount": 5
    }
  },
  
  "metadata": {
    "version": 1,
    "workspace": "/home/user/projects/my-app",
    "gitBranch": "feature/login",
    "gitCommit": "abc123"
  }
}
```

## 恢复会话

```typescript
// packages/coding-agent/src/core/session.ts

export async function loadSession(sessionId: string): Promise<Session> {
  // 从存储加载
  const data = await loadSessionData(sessionId);
  
  if (!data) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  // 版本检查
  if (data.metadata.version !== SESSION_VERSION) {
    // 迁移数据
    await migrateSession(data);
  }
  
  // 创建工作区检查
  if (data.metadata.workspace !== process.cwd()) {
    console.warn(`Session workspace mismatch: ${data.metadata.workspace} vs ${process.cwd()}`);
  }
  
  return new Session(data);
}

// 列出所有会话
export async function listSessions(): Promise<SessionInfo[]> {
  const sessionsDir = path.join(os.homedir(), ".pi", "sessions");
  const files = await fs.readdir(sessionsDir);
  
  const sessions: SessionInfo[] = [];
  
  for (const file of files) {
    if (file.endsWith(".json")) {
      const data = await loadSessionData(file.slice(0, -5));
      if (data) {
        sessions.push({
          id: data.id,
          name: data.name,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          messageCount: data.state.stats.messageCount,
        });
      }
    }
  }
  
  // 按更新时间排序
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}
```

## 会话管理 CLI

```bash
# 列出所有会话
pi --list-sessions

# 输出:
# ID                    Name              Created           Updated           Messages
# --------------------  ----------------  ----------------  ----------------  --------
# sess_abc123           feature-login     2024-01-01 10:00  2024-01-01 11:30  25
# sess_def456           bugfix-auth       2024-01-01 09:00  2024-01-01 09:45  12

# 恢复会话
pi --session feature-login

# 删除会话
pi --delete-session feature-login

# 重命名会话
pi --rename-session old-name new-name
```

## 会话事件

```typescript
// packages/coding-agent/src/core/session.ts

export interface SessionEvents {
  // 会话创建
  onCreate?: (session: Session) => void;
  
  // 会话保存
  onSave?: (session: Session) => void;
  
  // 会话加载
  onLoad?: (session: Session) => void;
  
  // 状态变化
  onStateChange?: (session: Session, newState: SessionState) => void;
  
  // 消息添加
  onMessage?: (session: Session, message: AgentMessage) => void;
  
  // 工具调用
  onToolCall?: (session: Session, toolCall: ToolCall) => void;
}

// 使用示例
const session = await createSession({
  name: "my-task",
  onStateChange: (session, newState) => {
    console.log(`Session state: ${newState.phase}`);
  },
  onMessage: (session, message) => {
    // 实时同步到其他设备
    syncToCloud(session.id, message);
  },
});
```

## 会话备份

```typescript
// packages/coding-agent/src/core/session-backup.ts

export async function backupSession(sessionId: string): Promise<void> {
  const session = await loadSessionData(sessionId);
  if (!session) return;
  
  const backupDir = path.join(os.homedir(), ".pi", "backups");
  const backupPath = path.join(backupDir, `${sessionId}_${Date.now()}.json`);
  
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(backupPath, JSON.stringify(session, null, 2));
  
  // 清理旧备份（保留最近 10 个）
  await cleanupOldBackups(sessionId, 10);
}

export async function restoreFromBackup(backupPath: string): Promise<Session> {
  const content = await fs.readFile(backupPath, "utf-8");
  const data = JSON.parse(content) as SessionData;
  
  // 生成新 ID
  data.id = generateSessionId();
  data.name = `${data.name} (restored)`;
  
  await saveSession(data);
  
  return new Session(data);
}
```

## 最佳实践

### ✅ 应该做的

1. **使用有意义的会话名**
   ```bash
   # ✅ 正确
   pi --session refactor-auth
   
   # ❌ 避免
   pi --session session-1
   ```

2. **定期清理旧会话**
   ```bash
   # 列出所有会话
   pi --list-sessions
   
   # 删除不再需要的会话
   pi --delete-session old-feature
   ```

3. **启用自动保存**
   ```typescript
   const session = await createSession({
     name: "important-task",
     autoSave: true,
     saveInterval: 30000,
   });
   ```

### ❌ 避免的错误

1. **在会话中存储敏感信息**
   ```typescript
   // ❌ 错误：会话会持久化到磁盘
   session.context.custom = {
     apiKey: "sk-...",  // 不要这样做！
   };
   
   // ✅ 正确：使用环境变量
   process.env.API_KEY
   ```

2. **忽略会话版本兼容性**
   ```typescript
   // 加载旧版本会话时检查版本
   if (data.metadata.version !== SESSION_VERSION) {
     await migrateSession(data);
   }
   ```

## 总结

会话管理与持久化的核心要点：

1. **会话数据结构**：包含基本信息、Agent 状态、会话状态、元数据
2. **自动保存**：定时保存会话状态
3. **会话恢复**：从存储加载并恢复状态
4. **会话管理**：列出、删除、重命名会话
5. **会话事件**：监听会话状态变化
6. **会话备份**：定期备份防止数据丢失

---

**下篇预告**: [05-interactive-mode.md](05-interactive-mode.md) —— 交互模式与 TUI，包括 TUI 组件设计、消息渲染、输入处理、工具调用显示等。
