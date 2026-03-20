# 沙盒系统

## 概述

Mom 沙盒为运行不受信任的代码提供了一个安全的隔离环境。它基于 Docker，支持多种语言运行时，具有资源限制、网络隔离和持久化存储功能。

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        主机系统                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Mom 进程                              │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │   │
│  │  │   Agent     │───→│   Sandbox   │───→│   Docker    │ │   │
│  │  │             │    │   Manager   │    │   Client    │ │   │
│  │  └─────────────┘    └─────────────┘    └──────┬──────┘ │   │
│  │                                                │        │   │
│  └────────────────────────────────────────────────┼────────┘   │
│                                                   │            │
│  ┌────────────────────────────────────────────────┼────────┐   │
│  │              Docker 守护进程                    │        │   │
│  │  ┌─────────────────────────────────────────────┘        │   │
│  │  │                                                      │   │
│  │  ▼                                                      │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │   │
│  │  │   Node.js   │    │   Python    │    │    Bash     │ │   │
│  │  │   容器      │    │   容器      │    │   容器      │ │   │
│  │  │             │    │             │    │             │ │   │
│  │  │  workspace/ │    │  workspace/ │    │  workspace/ │ │   │
│  │  │  - 代码     │    │  - 代码     │    │  - 代码     │ │   │
│  │  │  - 输入     │    │  - 输入     │    │  - 输入     │ │   │
│  │  │  - 输出     │    │  - 输出     │    │  - 输出     │ │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘ │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

## 安全模型

### 容器隔离

每个代码执行都在一个独立的 Docker 容器中运行：

- **无 root 权限**：容器以非 root 用户运行
- **只读根文件系统**：基础镜像不可变
- **临时层**：写入操作进入可丢弃的覆盖层
- **资源限制**：CPU、内存、磁盘配额
- **网络隔离**：可选的出站网络访问

### 运行时环境

| 运行时 | 镜像 | 用途 |
|--------|------|------|
| Node.js | `node:20-alpine` | JavaScript/TypeScript 执行 |
| Python | `python:3.12-alpine` | Python 脚本执行 |
| Bash | `alpine:latest` | Shell 脚本、命令执行 |

### 资源限制

```typescript
interface ResourceLimits {
  /** 最大内存（MB） */
  memory: number;
  
  /** 最大 CPU 份额（相对权重） */
  cpuShares: number;
  
  /** 最大执行时间（秒） */
  timeout: number;
  
  /** 最大磁盘使用（MB） */
  diskQuota: number;
  
  /** 是否允许网络访问 */
  network: boolean;
}

const DEFAULT_LIMITS: ResourceLimits = {
  memory: 512,
  cpuShares: 512,
  timeout: 60,
  diskQuota: 100,
  network: false
};
```

## 目录结构

```
workspace/
├── sandbox/
│   ├── templates/          # Dockerfile 模板
│   │   ├── nodejs.dockerfile
│   │   ├── python.dockerfile
│   │   └── bash.dockerfile
│   └── cache/              # 镜像缓存
├── runs/                   # 执行目录（每个运行一个）
│   ├── run-2025-01-15-abc123/
│   │   ├── code/          # 源代码
│   │   ├── input/         # 输入文件
│   │   ├── output/        # 输出文件
│   │   └── logs/          # 执行日志
│   └── run-2025-01-15-def456/
│       └── ...
└── shared/                 # 在运行间持久化的数据
    └── ...
```

## API

### SandboxManager

```typescript
class SandboxManager {
  constructor(options: SandboxOptions);
  
  /** 执行代码 */
  async execute(request: ExecuteRequest): Promise<ExecuteResult>;
  
  /** 清理旧的运行目录 */
  async cleanup(maxAge: number): Promise<void>;
  
  /** 停止所有运行 */
  async stopAll(): Promise<void>;
}

interface SandboxOptions {
  /** 工作区根目录 */
  workspaceRoot: string;
  
  /** Docker 套接字路径 */
  dockerSocket: string;
  
  /** 默认资源限制 */
  defaultLimits?: ResourceLimits;
}

interface ExecuteRequest {
  /** 运行时类型 */
  runtime: "nodejs" | "python" | "bash";
  
  /** 代码内容 */
  code: string;
  
  /** 输入文件（将挂载到容器） */
  inputs?: FileInput[];
  
  /** 覆盖默认限制 */
  limits?: Partial<ResourceLimits>;
  
  /** 环境变量 */
  env?: Record<string, string>;
}

interface ExecuteResult {
  /** 是否成功 */
  success: boolean;
  
  /** 退出代码 */
  exitCode: number;
  
  /** stdout 输出 */
  stdout: string;
  
  /** stderr 输出 */
  stderr: string;
  
  /** 输出文件 */
  outputs: FileOutput[];
  
  /** 执行时间（毫秒） */
  duration: number;
  
  /** 内存使用（字节） */
  memoryUsed: number;
}
```

## 使用示例

### 执行 JavaScript

```typescript
const sandbox = new SandboxManager({
  workspaceRoot: "/workspace",
  dockerSocket: "/var/run/docker.sock"
});

const result = await sandbox.execute({
  runtime: "nodejs",
  code: `
    const fs = require('fs');
    const data = fs.readFileSync('/workspace/input/data.txt', 'utf8');
    const lines = data.split('\\n').length;
    fs.writeFileSync('/workspace/output/result.txt', \`Lines: \${lines}\`);
    console.log('Done!');
  `,
  inputs: [{
    name: "data.txt",
    content: "Line 1\\nLine 2\\nLine 3"
  }],
  limits: {
    timeout: 30,
    memory: 256
  }
});

if (result.success) {
  console.log("Output:", result.stdout);
  console.log("Files:", result.outputs);
} else {
  console.error("Error:", result.stderr);
}
```

### 执行 Python

```typescript
const result = await sandbox.execute({
  runtime: "python",
  code: `
import json
import sys

# 读取输入
with open('/workspace/input/config.json') as f:
    config = json.load(f)

# 处理
result = {key: value.upper() for key, value in config.items()}

# 写入输出
with open('/workspace/output/result.json', 'w') as f:
    json.dump(result, f, indent=2)

print("Processing complete!")
  `,
  inputs: [{
    name: "config.json",
    content: '{"name": "test", "status": "active"}'
  }]
});
```

### 执行 Shell 命令

```typescript
const result = await sandbox.execute({
  runtime: "bash",
  code: `
    # 处理输入文件
    wc -l /workspace/input/*.txt > /workspace/output/counts.txt
    
    # 生成报告
    echo "Processing complete at $(date)" >> /workspace/output/report.txt
    ls -la /workspace/input/ >> /workspace/output/report.txt
  `,
  inputs: [/* ... */],
  limits: {
    network: true  // 允许网络访问
  }
});
```

## 错误处理

### 执行错误

```typescript
type ExecutionError =
  | { type: "timeout"; message: string; duration: number }
  | { type: "memory"; message: string; memoryUsed: number }
  | { type: "disk"; message: string; diskUsed: number }
  | { type: "runtime"; message: string; exitCode: number }
  | { type: "system"; message: string; cause: Error };
```

### 错误示例

```typescript
try {
  const result = await sandbox.execute({
    runtime: "nodejs",
    code: "while(true) {}"  // 无限循环
  });
} catch (error) {
  if (error.type === "timeout") {
    console.error(`Execution timed out after ${error.duration}ms`);
  }
}
```

## 文件处理

### 输入文件

输入文件挂载到容器的 `/workspace/input/` 目录：

```typescript
interface FileInput {
  /** 文件名 */
  name: string;
  
  /** 文件内容（字符串或 Buffer） */
  content: string | Buffer;
  
  /** 可选的 MIME 类型 */
  mimeType?: string;
}
```

### 输出文件

输出文件从容器的 `/workspace/output/` 目录收集：

```typescript
interface FileOutput {
  /** 文件名 */
  name: string;
  
  /** 文件内容 */
  content: Buffer;
  
  /** MIME 类型 */
  mimeType: string;
  
  /** 文件大小 */
  size: number;
}
```

### 文件大小限制

- 单个输入文件：最大 10MB
- 总输入大小：最大 50MB
- 输出文件：受磁盘配额限制

## 网络策略

### 默认：无网络

默认情况下，容器没有网络访问权限。这提供了最强的隔离。

### 启用网络

当需要网络访问时（例如下载依赖）：

```typescript
const result = await sandbox.execute({
  runtime: "nodejs",
  code: `
    const https = require('https');
    https.get('https://api.example.com/data', ...);
  `,
  limits: {
    network: true  // 允许出站 HTTPS
  }
});
```

### 网络限制

- 仅允许出站连接
- 不允许入站连接
- DNS 解析受限
- 可以配置防火墙规则限制特定域名

## 缓存策略

### 镜像缓存

Docker 镜像被缓存以避免重复拉取：

```typescript
// 检查镜像是否存在
const hasImage = await sandbox.hasImage("node:20-alpine");

// 预拉取镜像
await sandbox.pullImage("python:3.12-alpine");
```

### 层缓存

- 基础镜像层被缓存
- 每个运行创建新的可写层
- 运行后丢弃可写层

## 监控和日志

### 执行日志

```typescript
interface ExecutionLog {
  /** 运行 ID */
  runId: string;
  
  /** 开始时间 */
  startTime: string;
  
  /** 结束时间 */
  endTime: string;
  
  /** 资源使用 */
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
  
  /** 完整输出 */
  output: {
    stdout: string;
    stderr: string;
  };
}
```

### 日志保留

- 日志保留 7 天
- 自动清理旧日志
- 可配置保留策略

## 故障排除

### Docker 未运行

```
Error: Docker daemon not accessible
```

**解决：** 确保 Docker 正在运行：
```bash
sudo systemctl start docker
```

### 镜像拉取失败

```
Error: Failed to pull image node:20-alpine
```

**解决：** 检查网络连接，或手动拉取：
```bash
docker pull node:20-alpine
```

### 资源不足

```
Error: Memory limit exceeded (512MB)
```

**解决：** 增加内存限制或优化代码：
```typescript
limits: { memory: 1024 }
```

### 权限错误

```
Error: Permission denied writing to /workspace/output/
```

**解决：** 确保代码写入 `/workspace/output/` 而不是其他位置。

## 最佳实践

1. **最小权限原则**：仅在需要时启用网络
2. **资源限制**：始终设置合理的超时和内存限制
3. **输入验证**：验证所有输入文件
4. **错误处理**：始终检查执行结果
5. **清理**：定期调用 `cleanup()` 释放磁盘空间
6. **日志记录**：记录所有执行以供审计
