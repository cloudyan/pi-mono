# 01 - Pod 管理基础

> **难度：入门** | **预计阅读时间：20 分钟**

## 问题引入

想象一下这个场景：你刚租了一台配备 H100 GPU 的服务器，想部署一个大语言模型来测试。你需要：

1. 安装 CUDA 工具链
2. 配置 Python 环境
3. 安装 vLLM 推理引擎
4. 下载模型文件（可能几十 GB）
5. 配置 API 端点和认证
6. 处理各种依赖冲突...

这个过程通常需要 30 分钟到 2 小时，而且很容易出错。如果你有 10 台服务器需要配置呢？如果每次重启实例都要重新配置呢？

**pi 的 Pod 管理就是为了解决这个问题。** 它把这一切自动化，让配置时间从小时级缩短到分钟级。

## 核心概念

### 什么是 Pod？

在 pi 的世界里，**Pod 是一个已配置好的 GPU 服务器**。它不是 Kubernetes 的 Pod，而是一个可以被 pi 管理的远程 GPU 机器。

```
┌─────────────────────────────────────────────────────────────┐
│                        本地机器                              │
│                                                             │
│   ┌─────────────┐      SSH        ┌─────────────────────┐  │
│   │   pi CLI    │ ───────────────→│   远程 GPU Pod      │  │
│   │             │                 │                     │  │
│   │ ~./pi/      │                 │ ~/venv/             │  │
│   │ pods.json   │                 │ ~/vllm_logs/        │  │
│   └─────────────┘                 │ ~/.cache/huggingface│  │
│                                   │                     │  │
│                                   │    ┌───────────┐    │  │
│                                   │    │  vLLM     │    │  │
│                                   │    │  :8001    │    │  │
│                                   │    └───────────┘    │  │
│                                   └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

一个 Pod 包含以下信息：

- **SSH 连接信息**：如何连接到这台服务器
- **GPU 配置**：有多少张 GPU，每张有多少显存
- **已部署的模型**：当前运行着哪些模型
- **模型存储路径**：模型文件存在哪里
- **vLLM 版本**：安装的是哪个版本的 vLLM

### 架构概览

pi 采用 **本地状态 + 远程执行** 的架构：

```
┌──────────────────────────────────────────────────────────────────┐
│                        pi 架构                                   │
│                                                                  │
│   本地端 (~/.pi/)                 远程端 (GPU Pod)              │
│   ┌──────────────────┐           ┌──────────────────────┐      │
│   │ pods.json        │           │ pod_setup.sh         │      │
│   │ ├─ pods          │           │                      │      │
│   │ │  ├─ dc1: {...} │           │ ┌────────────────┐   │      │
│   │ │  └─ dc2: {...} │           │ │ 安装 CUDA      │   │      │
│   │ └─ active: dc1   │           │ │ 安装 Python    │   │      │
│   │                  │           │ │ 安装 vLLM      │   │      │
│   │ sessions/        │           │ │ 配置环境变量   │   │      │
│   └────────┬─────────┘           │ │ 设置模型缓存   │   │      │
│            │                     │ └────────────────┘   │      │
│            │ SSH                 └──────────┬───────────┘      │
│            │                                │                   │
│            └────────────────────────────────┘                   │
│                      (ssh2 库)                                  │
└──────────────────────────────────────────────────────────────────┘
```

关键设计决策：

1. **无远程守护进程**：pi 不需要在 Pod 上运行任何后台服务
2. **本地状态管理**：所有配置和状态都存在本地 `~/.pi/pods.json`
3. **SSH 直连执行**：所有操作都通过 SSH 直接执行

### 类型定义

让我们看看 pi 如何用 TypeScript 描述这些概念：

```typescript
// packages/pods/src/types.ts

// GPU 信息
export interface GPU {
  id: number;       // GPU 索引，从 0 开始
  name: string;     // 型号名称，如 "H100"
  memory: string;   // 显存大小，如 "80GB"
}

// 运行中的模型
export interface Model {
  model: string;    // 模型 ID，如 "Qwen/Qwen2.5-Coder-32B-Instruct"
  port: number;     // 服务端口，如 8001
  gpu: number[];    // 使用的 GPU ID 列表
  pid: number;      // vLLM 进程 ID
}

// Pod 配置
export interface Pod {
  ssh: string;      // SSH 连接命令，如 "ssh root@1.2.3.4"
  gpus: GPU[];      // GPU 列表
  models: Record<string, Model>;  // 已部署的模型
  modelsPath?: string;   // 模型存储路径
  vllmVersion?: "release" | "nightly" | "gpt-oss";  // vLLM 版本
}

// 全局配置
export interface Config {
  pods: Record<string, Pod>;  // 所有 Pod
  active?: string;            // 当前激活的 Pod 名称
}
```

## 实现详解

### 配置管理

配置存储在 `~/.pi/pods.json`，由 `config.ts` 模块管理：

```typescript
// packages/pods/src/config.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Config, Pod } from "./types.js";

// 获取配置目录，支持通过环境变量自定义
const getConfigDir = (): string => {
  // 优先使用 PI_CONFIG_DIR 环境变量
  const configDir = process.env.PI_CONFIG_DIR || join(homedir(), ".pi");
  // 确保目录存在
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  return configDir;
};

// 配置文件路径
const getConfigPath = (): string => {
  return join(getConfigDir(), "pods.json");
};

// 加载配置，文件不存在时返回空配置
export const loadConfig = (): Config => {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { pods: {} };
  }
  try {
    const data = readFileSync(configPath, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error reading config: ${e}`);
    return { pods: {} };
  }
};

// 保存配置
export const saveConfig = (config: Config): void => {
  const configPath = getConfigPath();
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error(`Error saving config: ${e}`);
    process.exit(1);
  }
};
```

**设计要点**：

- 使用 `PI_CONFIG_DIR` 环境变量支持测试和自定义配置目录
- 文件不存在时返回空配置而不是报错，提供更好的用户体验
- 使用 `JSON.stringify(config, null, 2)` 保持配置文件可读

### SSH 连接管理

pi 使用 Node.js 的 `child_process.spawn` 来执行 SSH 命令，而不是使用 `ssh2` 库。这样可以利用系统的 SSH 配置（如密钥、known_hosts）：

```typescript
// packages/pods/src/ssh.ts

import { spawn } from "child_process";

export interface SSHResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 执行 SSH 命令并返回结果
 * 适用于需要获取输出的场景
 */
export const sshExec = async (
  sshCmd: string,      // SSH 连接命令，如 "ssh root@1.2.3.4"
  command: string,     // 要执行的远程命令
  options?: { keepAlive?: boolean },
): Promise<SSHResult> => {
  return new Promise((resolve) => {
    // 解析 SSH 命令
    const sshParts = sshCmd.split(" ").filter((p) => p);
    const sshBinary = sshParts[0];  // 通常是 "ssh"
    let sshArgs = [...sshParts.slice(1)];

    // 长时间运行的任务添加 keepalive 配置
    // 防止连接因超时断开
    if (options?.keepAlive) {
      sshArgs = [
        "-o", "ServerAliveInterval=30",  // 每 30 秒发送心跳
        "-o", "ServerAliveCountMax=120", // 最多允许 120 次失败
        ...sshArgs
      ];
    }

    sshArgs.push(command);

    const proc = spawn(sshBinary, sshArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
};

/**
 * 执行 SSH 命令并流式输出到控制台
 * 适用于需要实时查看输出的场景
 */
export const sshExecStream = async (
  sshCmd: string,
  command: string,
  options?: { silent?: boolean; forceTTY?: boolean; keepAlive?: boolean },
): Promise<number> => {
  return new Promise((resolve) => {
    const sshParts = sshCmd.split(" ").filter((p) => p);
    const sshBinary = sshParts[0];
    let sshArgs = [...sshParts.slice(1)];

    // 添加 -t 标志以获取彩色输出
    if (options?.forceTTY && !sshParts.includes("-t")) {
      sshArgs = ["-t", ...sshArgs];
    }

    // keepalive 配置
    if (options?.keepAlive) {
      sshArgs = [
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=120",
        ...sshArgs
      ];
    }

    sshArgs.push(command);

    // 静默模式或继承 stdio
    const spawnOptions = options?.silent
      ? { stdio: ["ignore", "ignore", "ignore"] }
      : { stdio: "inherit" };

    const proc = spawn(sshBinary, sshArgs, spawnOptions);

    proc.on("close", (code) => {
      resolve(code || 0);
    });
  });
};
```

**关键设计**：

1. **两种执行模式**：
   - `sshExec`：捕获输出，适用于需要解析结果的场景
   - `sshExecStream`：流式输出，适用于需要实时查看的场景

2. **Keepalive 机制**：
   - `ServerAliveInterval=30`：每 30 秒发送一次心跳
   - `ServerAliveCountMax=120`：最多允许 120 次失败（共 60 分钟）
   - 这对于长时间运行的模型下载非常重要

3. **TTY 支持**：
   - `forceTTY` 选项添加 `-t` 标志
   - 保留 apt、pip 等工具的彩色输出

### Pod 初始化流程

当你运行 `pi pods setup` 时，会发生以下事情：

```
┌─────────────────────────────────────────────────────────────┐
│                    pi pods setup 流程                       │
│                                                             │
│  1. 验证环境变量                                            │
│     ├─ HF_TOKEN: 用于下载模型                               │
│     └─ PI_API_KEY: 用于 API 认证                           │
│                                                             │
│  2. 测试 SSH 连接                                           │
│     └─ ssh root@x.x.x.x "echo 'SSH OK'"                    │
│                                                             │
│  3. 复制安装脚本                                            │
│     └─ scp pod_setup.sh → /tmp/pod_setup.sh               │
│                                                             │
│  4. 执行远程安装 (2-5 分钟)                                 │
│     ├─ 安装系统依赖 (apt)                                   │
│     ├─ 安装 CUDA Toolkit                                    │
│     ├─ 安装 uv + Python 3.12                               │
│     ├─ 创建虚拟环境                                         │
│     ├─ 安装 vLLM + PyTorch                                 │
│     ├─ 挂载存储 (如果提供)                                  │
│     └─ 配置环境变量                                         │
│                                                             │
│  5. 检测 GPU 信息                                           │
│     └─ nvidia-smi --query-gpu                              │
│                                                             │
│  6. 保存配置到本地                                          │
│     └─ ~/.pi/pods.json                                     │
└─────────────────────────────────────────────────────────────┘
```

核心实现代码：

```typescript
// packages/pods/src/commands/pods.ts

export const setupPod = async (
  name: string,
  sshCmd: string,
  options: { mount?: string; modelsPath?: string; vllm?: "release" | "nightly" | "gpt-oss" },
) => {
  // 1. 验证环境变量
  const hfToken = process.env.HF_TOKEN;
  const vllmApiKey = process.env.PI_API_KEY;

  if (!hfToken) {
    console.error("ERROR: HF_TOKEN environment variable is required");
    process.exit(1);
  }

  if (!vllmApiKey) {
    console.error("ERROR: PI_API_KEY environment variable is required");
    process.exit(1);
  }

  // 2. 自动提取模型路径
  let modelsPath = options.modelsPath;
  if (!modelsPath && options.mount) {
    // 从挂载命令提取最后一个路径参数
    // 例如: "mount -t nfs ... /mnt/sfs" → "/mnt/sfs"
    const parts = options.mount.split(" ");
    modelsPath = parts[parts.length - 1];
  }

  // 3. 测试 SSH 连接
  console.log("Testing SSH connection...");
  const testResult = await sshExec(sshCmd, "echo 'SSH OK'");
  if (testResult.exitCode !== 0) {
    console.error("Failed to connect via SSH");
    process.exit(1);
  }

  // 4. 复制并执行安装脚本
  const scriptPath = join(__dirname, "../../scripts/pod_setup.sh");
  await scpFile(sshCmd, scriptPath, "/tmp/pod_setup.sh");

  // 构建安装命令
  let setupCmd = `bash /tmp/pod_setup.sh --models-path '${modelsPath}' --hf-token '${hfToken}' --vllm-api-key '${vllmApiKey}'`;
  if (options.mount) {
    setupCmd += ` --mount '${options.mount}'`;
  }
  setupCmd += ` --vllm '${options.vllm || "release"}'`;

  // 执行安装（使用 forceTTY 保留彩色输出）
  const exitCode = await sshExecStream(sshCmd, setupCmd, { forceTTY: true });
  if (exitCode !== 0) {
    console.error("\nSetup failed.");
    process.exit(1);
  }

  // 5. 检测 GPU 信息
  const gpuResult = await sshExec(
    sshCmd,
    "nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader"
  );

  const gpus: GPU[] = [];
  if (gpuResult.exitCode === 0 && gpuResult.stdout) {
    const lines = gpuResult.stdout.trim().split("\n");
    for (const line of lines) {
      const [id, name, memory] = line.split(",").map((s) => s.trim());
      if (id !== undefined) {
        gpus.push({
          id: parseInt(id, 10),
          name: name || "Unknown",
          memory: memory || "Unknown",
        });
      }
    }
  }

  // 6. 保存配置
  const pod: Pod = {
    ssh: sshCmd,
    gpus,
    models: {},
    modelsPath,
    vllmVersion: options.vllm || "release",
  };

  addPod(name, pod);
  console.log(`✓ Pod '${name}' setup complete`);
};
```

### 安装脚本详解

远程安装脚本 `pod_setup.sh` 是 Pod 初始化的核心：

```bash
#!/usr/bin/env bash
# GPU pod bootstrap for vLLM deployment
set -euo pipefail

# 参数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        --mount)        MOUNT_COMMAND="$2"; shift 2 ;;
        --models-path)  MODELS_PATH="$2";   shift 2 ;;
        --hf-token)     HF_TOKEN="$2";      shift 2 ;;
        --vllm-api-key) PI_API_KEY="$2";    shift 2 ;;
        --vllm)         VLLM_VERSION="$2";  shift 2 ;;
        *)              echo "Unknown: $1"; exit 1 ;;
    esac
done

# 1. 安装系统依赖
apt update -y
apt install -y python3-pip python3-venv git build-essential cmake ninja-build curl wget

# 2. 安装匹配的 CUDA Toolkit
DRIVER_CUDA_VERSION=$(nvidia-smi | grep "CUDA Version" | awk '{print $9}')
UBUNTU_VERSION=$(lsb_release -rs)

# 根据版本选择 NVIDIA 仓库
if [[ "$UBUNTU_VERSION" == "24.04" ]]; then
    REPO_PATH="ubuntu2404"
elif [[ "$UBUNTU_VERSION" == "22.04" ]]; then
    REPO_PATH="ubuntu2204"
fi

# 安装 CUDA Toolkit
wget https://developer.download.nvidia.com/compute/cuda/repos/${REPO_PATH}/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring_1.1-1_all.deb
apt-get install -y cuda-toolkit-${CUDA_VERSION_APT}

# 3. 安装 uv 和 Python 3.12
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.12

# 4. 创建虚拟环境
uv venv --python 3.12 --seed ~/venv
source ~/venv/bin/activate

# 5. 安装 vLLM（三种版本）
case "$VLLM_VERSION" in
    release)
        uv pip install vllm>=0.10.0 --torch-backend=auto
        ;;
    nightly)
        uv pip install -U vllm --torch-backend=auto \
            --extra-index-url https://wheels.vllm.ai/nightly
        ;;
    gpt-oss)
        uv pip install --pre vllm==0.10.1+gptoss \
            --extra-index-url https://wheels.vllm.ai/gpt-oss/ \
            --extra-index-url https://download.pytorch.org/whl/nightly/${PYTORCH_CUDA}
        ;;
esac

# 6. 设置模型存储（创建符号链接）
mkdir -p "${MODELS_PATH}/huggingface/hub"
ln -s "${MODELS_PATH}/huggingface" ~/.cache/huggingface

# 7. 配置环境变量（写入 .bashrc）
cat >> ~/.bashrc << EOF
source ~/venv/bin/activate
export HF_TOKEN="${HF_TOKEN}"
export PI_API_KEY="${PI_API_KEY}"
export HF_HUB_ENABLE_HF_TRANSFER=1  # 加速下载
export VLLM_NO_USAGE_STATS=1
EOF
```

**关键步骤说明**：

1. **CUDA 匹配**：检测驱动支持的 CUDA 版本，安装对应的 Toolkit
2. **uv 安装器**：比 pip 快 10-100 倍的 Python 包管理器
3. **三版 vLLM**：
   - `release`：稳定版，适合大多数场景
   - `nightly`：每日构建，包含最新功能
   - `gpt-oss`：专门为 GPT-OSS 模型优化的版本
4. **模型缓存**：创建符号链接，让模型存储到持久化卷

## 使用模式

### 模式一：基础配置

最简单的 Pod 配置只需要 SSH 命令和模型存储路径：

```bash
# 设置环境变量
export HF_TOKEN=hf_xxxxx           # HuggingFace Token
export PI_API_KEY=my-secret-key    # API 认证密钥

# 配置 Pod
pi pods setup my-pod "ssh root@1.2.3.4" --models-path /workspace

# 等待 2-5 分钟，看到以下输出表示成功：
# ✓ SSH connection successful
# ✓ Detected 2 GPU(s)
#   GPU 0: H100 (80GB)
#   GPU 1: H100 (80GB)
# ✓ Pod 'my-pod' setup complete
```

配置文件 `~/.pi/pods.json` 的内容：

```json
{
  "pods": {
    "my-pod": {
      "ssh": "ssh root@1.2.3.4",
      "gpus": [
        { "id": 0, "name": "H100", "memory": "80GB" },
        { "id": 1, "name": "H100", "memory": "80GB" }
      ],
      "models": {},
      "modelsPath": "/workspace",
      "vllmVersion": "release"
    }
  },
  "active": "my-pod"
}
```

### 模式二：带持久化存储

使用 NFS 网络存储，模型可以在多个 Pod 间共享：

```bash
# DataCrunch 的 NFS 挂载
pi pods setup dc1 "ssh root@instance.datacrunch.io" \
  --mount "sudo mount -t nfs -o nconnect=16 nfs.fin-02.datacrunch.io:/hf-models /mnt/models"

# --mount 参数会自动提取 /mnt/models 作为 modelsPath
# 无需再指定 --models-path
```

**自动路径提取逻辑**：

```typescript
// 从挂载命令中提取模型路径
// "mount -t nfs ... /mnt/sfs" → "/mnt/sfs"
if (options.mount && !options.modelsPath) {
  const parts = options.mount.trim().split(" ");
  const lastPart = parts[parts.length - 1];
  if (lastPart?.startsWith("/")) {
    options.modelsPath = lastPart;
  }
}
```

### 模式三：多 Pod 管理

pi 支持配置多个 Pod 并在它们之间切换：

```bash
# 配置开发 Pod
pi pods setup dev-pod "ssh root@dev.example.com" --models-path /workspace

# 配置生产 Pod（使用 nightly 版本）
pi pods setup prod-pod "ssh root@prod.example.com" \
  --models-path /models \
  --vllm nightly

# 查看所有 Pod
pi pods
# 输出：
# * dev-pod - 2x H100 (vLLM: release) - ssh root@dev.example.com
#     Models: /workspace
#   prod-pod - 4x H100 (vLLM: nightly) - ssh root@prod.example.com
#     Models: /models

# 切换活动 Pod
pi pods active prod-pod
# ✓ Switched active pod to 'prod-pod'

# 使用 --pod 参数临时指定 Pod（不改变 active）
pi start model --name test --pod dev-pod
```

### 模式四：vLLM 版本选择

不同场景需要不同的 vLLM 版本：

```bash
# 稳定版（默认）- 适合生产环境
pi pods setup stable-pod "ssh root@1.2.3.4" \
  --models-path /workspace \
  --vllm release

# 每日构建 - 获取最新功能
pi pods setup nightly-pod "ssh root@1.2.3.4" \
  --models-path /workspace \
  --vllm nightly

# GPT-OSS 专用 - 仅用于 GPT-OSS 模型
pi pods setup gpt-pod "ssh root@1.2.3.4" \
  --models-path /workspace \
  --vllm gpt-oss
# ⚠️  GPT-OSS build - only for GPT-OSS models
```

**版本对比**：

| 版本 | 适用场景 | 稳定性 | 新功能 |
|-----|---------|--------|--------|
| `release` | 生产环境 | 高 | 标准 |
| `nightly` | 测试新模型 | 中 | 最新 |
| `gpt-oss` | GPT-OSS 模型 | 中 | GPT-OSS 专用 |

### 模式五：远程命令执行

pi 提供了便捷的远程命令执行方式：

```bash
# 打开交互式 Shell
pi shell
# 等同于: ssh root@1.2.3.4

# 执行单条命令
pi ssh "nvidia-smi"
# Running on pod 'my-pod': nvidia-smi

# 指定 Pod 执行命令
pi ssh prod-pod "df -h /workspace"

# 查看 GPU 状态
pi ssh "watch -n 1 nvidia-smi"

# 检查模型缓存大小
pi ssh "du -sh ~/.cache/huggingface/hub/*"
```

## 最佳实践

### ✅ 应该做的

**1. 使用持久化存储**

```bash
# 推荐：使用 NFS 挂载，模型可跨 Pod 共享
pi pods setup dc1 "ssh root@1.2.3.4" \
  --mount "mount -t nfs ... /mnt/models"

# 不推荐：模型存在本地，Pod 销毁后丢失
pi pods setup dc1 "ssh root@1.2.3.4" --models-path /workspace
```

**2. 合理命名 Pod**

```bash
# 推荐：包含环境和用途信息
pi pods setup prod-h100-2x "ssh root@prod.example.com"
pi pods setup dev-a100-1x "ssh root@dev.example.com"

# 不推荐：无意义的名称
pi pods setup pod1 "ssh root@1.2.3.4"
```

**3. 安全存储凭证**

```bash
# 推荐：使用环境变量或密钥管理
export HF_TOKEN=$(cat ~/.config/hf_token)
export PI_API_KEY=$(cat ~/.config/pi_api_key)

# 不推荐：硬编码在脚本中
# export HF_TOKEN=hf_xxxxx  # 危险！
```

**4. 定期检查 Pod 状态**

```bash
# 检查 GPU 使用情况
pi ssh "nvidia-smi"

# 检查磁盘空间
pi ssh "df -h \$(cat ~/.pi/pods.json | jq -r '.pods[\$(cat ~/.pi/pods.json | jq -r '.active')].modelsPath')"
```

### ❌ 避免的错误

**1. 忽略 GPU 驱动版本**

```bash
# 错误：在 CUDA 11.x 驱动上尝试安装 CUDA 12.x Toolkit
# 会导致 vLLM 无法运行

# 正确：让脚本自动检测并安装匹配版本
pi pods setup my-pod "ssh root@1.2.3.4" --models-path /workspace
# 脚本会自动安装与驱动匹配的 CUDA Toolkit
```

**2. 混用 vLLM 版本**

```bash
# 错误：在 release 版本的 Pod 上尝试运行需要 nightly 的模型
pi pods setup my-pod "ssh root@1.2.3.4" --vllm release
pi start zai-org/GLM-4.5 --name glm  # 可能失败

# 正确：为新模型创建专用 Pod
pi pods setup glm-pod "ssh root@1.2.3.4" --vllm nightly
```

**3. 忘记设置 API Key**

```bash
# 错误：没有设置 PI_API_KEY
pi pods setup my-pod "ssh root@1.2.3.4" --models-path /workspace
# ERROR: PI_API_KEY environment variable is required

# 正确：在配置前设置所有必需的环境变量
export HF_TOKEN=xxx
export PI_API_KEY=xxx
pi pods setup my-pod "ssh root@1.2.3.4" --models-path /workspace
```

**4. 删除正在使用的 Pod**

```bash
# 注意：pi pods remove 只删除本地配置，不影响远程 Pod
pi pods remove my-pod
# ✓ Removed pod 'my-pod' from configuration
# Note: This only removes the local configuration. The remote pod is not affected.
```

## 总结

本章我们学习了 pi 的 Pod 管理基础：

1. **Pod 本质**：一个被 pi 管理的远程 GPU 服务器，包含 SSH 连接、GPU 信息、模型配置等

2. **架构设计**：本地状态 + SSH 直连执行，无需远程守护进程，简洁高效

3. **初始化流程**：从验证环境变量到自动安装 CUDA、Python、vLLM 的完整自动化

4. **配置管理**：存储在 `~/.pi/pods.json`，支持多 Pod 管理和切换

5. **版本选择**：release（稳定）、nightly（最新）、gpt-oss（专用），按需选择

掌握了 Pod 管理后，下一章我们将学习如何在 Pod 上部署和配置模型。

## 下篇预告

**[02 - 模型部署与配置](./02-model-deployment.md)** - 学习如何使用 `pi start` 部署模型，理解 GPU 分配策略、预定义模型配置、以及如何自定义 vLLM 参数。

---

**前置知识**：Linux 基础命令、SSH 连接
**相关源码**：`packages/pods/src/config.ts`、`packages/pods/src/ssh.ts`、`packages/pods/src/commands/pods.ts`
**相关脚本**：`packages/pods/scripts/pod_setup.sh`