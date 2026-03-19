# 02 - 模型部署与配置

> **难度：进阶** | **预计阅读时间：30 分钟**

## 问题引入

你已经配置好了一个 GPU Pod，现在想部署一个大语言模型。看似简单的一个命令：

```bash
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen
```

但背后隐藏着复杂的问题：

1. **GPU 显存够吗？** 32B 模型需要约 64GB 显存，你的 H100 只有 80GB
2. **用几张 GPU？** 单卡能跑，但吞吐量低；多卡需要张量并行
3. **vLLM 参数怎么配？** `--tensor-parallel-size`、`--tool-call-parser`、`--max-model-len`...
4. **上下文开多大？** 32K 还是 128K？显存够不够？
5. **怎么支持工具调用？** 不同模型需要不同的解析器

如果手动配置，你需要查阅模型文档、计算显存需求、选择合适的参数。而且不同模型配置不同：

| 模型 | 工具解析器 | 特殊参数 |
|-----|-----------|---------|
| Qwen2.5-Coder | `hermes` | 无 |
| Qwen3-Coder | `qwen3_coder` | 无 |
| GLM-4.5 | `glm45` | `--reasoning-parser` |
| GPT-OSS-120B | 无 | `--async-scheduling` |

**pi 的模型部署系统就是为了解决这个问题。** 它内置了常见模型的配置，自动匹配硬件能力，让你一行命令完成部署。

## 核心概念

### 模型配置架构

pi 使用三层架构来管理模型配置：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        模型配置三层架构                               │
│                                                                     │
│   第一层：models.json（静态配置）                                    │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ ModelInfo                                                    │  │
│   │ ├─ name: "Qwen2.5-Coder-32B"                                │  │
│   │ └─ configs: ModelConfig[]  ← 多个 GPU 配置                  │  │
│   │     ├─ { gpuCount: 1, args: [...], gpuTypes: ["H100"] }    │  │
│   │     └─ { gpuCount: 2, args: [...], gpuTypes: ["H100"] }    │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│   第二层：model-configs.ts（匹配逻辑）                              │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ getModelConfig(modelId, gpus, requestedCount)               │  │
│   │ ├─ 检查 GPU 数量是否匹配                                     │  │
│   │ ├─ 检查 GPU 类型是否匹配                                     │  │
│   │ └─ 返回最佳配置或 null                                       │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│   第三层：models.ts（运行时应用）                                   │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ startModel()                                                 │  │
│   │ ├─ 获取配置                                                   │  │
│   │ ├─ 选择 GPU                                                   │  │
│   │ ├─ 应用覆盖参数（--memory, --context）                       │  │
│   │ └─ 生成启动命令                                               │  │
│   └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 类型定义

```typescript
// packages/pods/src/model-configs.ts（内部类型）

// 单个 GPU 配置
interface ModelConfig {
  gpuCount: number;                    // 需要的 GPU 数量
  gpuTypes?: string[];                 // 支持的 GPU 类型（如 ["H100", "H200"]）
  args: string[];                      // vLLM 命令行参数
  env?: Record<string, string>;        // 环境变量
  notes?: string;                      // 备注（如显存要求）
}

// 模型信息
interface ModelInfo {
  name: string;                        // 显示名称
  configs: ModelConfig[];              // 多个 GPU 配置选项
  notes?: string;                      // 通用备注
}

// 所有预定义模型
interface ModelsData {
  models: Record<string, ModelInfo>;   // key: HuggingFace model ID
}
```

### 配置示例

让我们看一个完整的配置示例：

```json
{
  "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8": {
    "name": "Qwen3-Coder-480B-FP8",
    "configs": [
      {
        "gpuCount": 8,
        "gpuTypes": ["H200", "H20"],
        "args": [
          "--max-model-len", "131072",
          "--enable-expert-parallel",
          "--data-parallel-size", "8",
          "--enable-auto-tool-choice",
          "--tool-call-parser", "qwen3_coder"
        ],
        "env": {
          "VLLM_USE_DEEP_GEMM": "1"
        },
        "notes": "Use data-parallel mode to avoid weight quantization errors."
      }
    ]
  }
}
```

**解析这个配置：**

| 字段 | 值 | 说明 |
|-----|-----|------|
| `gpuCount` | 8 | 需要 8 张 GPU |
| `gpuTypes` | ["H200", "H20"] | 仅支持 H200 或 H20 |
| `args` | `--data-parallel-size 8` | 数据并行模式（非张量并行） |
| `args` | `--max-model-len 131072` | 支持 128K 上下文 |
| `args` | `--tool-call-parser qwen3_coder` | Qwen3 专用工具解析器 |
| `env` | `VLLM_USE_DEEP_GEMM=1` | 启用 Deep GEMM 优化 |

### GPU 分配策略

当部署模型时，pi 使用智能的 GPU 分配策略：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GPU 分配流程                                  │
│                                                                     │
│   输入：pod.gpus = [GPU0, GPU1, GPU2, GPU3]                        │
│         requestedCount = 2                                          │
│                                                                     │
│   Step 1: 统计当前 GPU 使用情况                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ GPU 0: 1 个模型（qwen）                                      │  │
│   │ GPU 1: 0 个模型                                              │  │
│   │ GPU 2: 1 个模型（glm）                                       │  │
│   │ GPU 3: 0 个模型                                              │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│   Step 2: 按使用次数排序（最少优先）                                │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ GPU 1: 0 次 → 最高优先级                                     │  │
│   │ GPU 3: 0 次 → 次高优先级                                     │  │
│   │ GPU 0: 1 次                                                  │  │
│   │ GPU 2: 1 次                                                  │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│   Step 3: 选择前 N 个 GPU                                          │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ selectedGPUs = [1, 3]                                        │  │
│   │ CUDA_VISIBLE_DEVICES=1,3                                     │  │
│   └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 端口分配

每个模型需要一个独立的端口。pi 使用自动递增策略：

```typescript
// 从 8001 开始分配
const getNextPort = (pod: Pod): number => {
  const usedPorts = Object.values(pod.models).map((m) => m.port);
  let port = 8001;
  while (usedPorts.includes(port)) {
    port++;
  }
  return port;
};
```

**端口分配示例：**

| 模型名称 | 端口 | API 地址 |
|---------|------|---------|
| qwen | 8001 | http://pod-ip:8001/v1 |
| glm | 8002 | http://pod-ip:8002/v1 |
| gpt120 | 8003 | http://pod-ip:8003/v1 |

## 实现详解

### 预定义模型查找

`model-configs.ts` 提供了核心的模型查找功能：

```typescript
// packages/pods/src/model-configs.ts

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { GPU } from "./types.js";

// 加载预定义模型配置
const modelsJsonPath = join(__dirname, "models.json");
const modelsData: ModelsData = JSON.parse(
  readFileSync(modelsJsonPath, "utf-8")
);

/**
 * 获取最佳配置
 * @param modelId 模型 ID（如 "Qwen/Qwen2.5-Coder-32B-Instruct"）
 * @param gpus Pod 中的 GPU 列表
 * @param requestedGpuCount 请求的 GPU 数量
 */
export const getModelConfig = (
  modelId: string,
  gpus: GPU[],
  requestedGpuCount: number,
): { args: string[]; env?: Record<string, string>; notes?: string } | null => {
  const modelInfo = modelsData.models[modelId];
  if (!modelInfo) {
    // 未知模型，返回 null（使用默认单 GPU 配置）
    return null;
  }

  // 从 GPU 名称提取类型（"NVIDIA H200" → "H200"）
  const gpuType = gpus[0]?.name?.replace("NVIDIA", "")?.trim()?.split(" ")[0] || "";

  // 查找匹配的配置
  for (const config of modelInfo.configs) {
    // 检查 GPU 数量
    if (config.gpuCount !== requestedGpuCount) {
      continue;
    }

    // 检查 GPU 类型（如果配置中指定了）
    if (config.gpuTypes && config.gpuTypes.length > 0) {
      const typeMatches = config.gpuTypes.some(
        (type) => gpuType.includes(type) || type.includes(gpuType)
      );
      if (!typeMatches) {
        continue;
      }
    }

    // 找到匹配的配置
    return {
      args: [...config.args],
      env: config.env ? { ...config.env } : undefined,
      notes: config.notes || modelInfo.notes,
    };
  }

  // 没有找到匹配的配置
  return null;
};

/**
 * 检查是否为已知模型
 */
export const isKnownModel = (modelId: string): boolean => {
  return modelId in modelsData.models;
};

/**
 * 获取模型显示名称
 */
export const getModelName = (modelId: string): string => {
  return modelsData.models[modelId]?.name || modelId;
};
```

### 模型启动流程

`models.ts` 中的 `startModel` 函数是模型部署的核心：

```typescript
// packages/pods/src/commands/models.ts

export const startModel = async (
  modelId: string,          // 模型 ID
  name: string,             // 实例名称
  options: {
    pod?: string;           // 指定 Pod
    vllmArgs?: string[];    // 自定义 vLLM 参数
    memory?: string;        // GPU 显存使用率
    context?: string;       // 上下文大小
    gpus?: number;          // GPU 数量
  },
) => {
  const { name: podName, pod } = getPod(options.pod);

  // ========== 验证 ==========
  if (!pod.modelsPath) {
    console.error(chalk.red("Pod does not have a models path configured"));
    process.exit(1);
  }
  if (pod.models[name]) {
    console.error(chalk.red(`Model '${name}' already exists`));
    process.exit(1);
  }

  // ========== 分配端口 ==========
  const port = getNextPort(pod);

  // ========== 确定配置 ==========
  let gpus: number[] = [];
  let vllmArgs: string[] = [];
  let modelConfig = null;

  if (options.vllmArgs?.length) {
    // 情况 1：自定义参数完全覆盖
    vllmArgs = options.vllmArgs;
    console.log(chalk.gray("Using custom vLLM args"));
  } else if (isKnownModel(modelId)) {
    // 情况 2：预定义模型
    if (options.gpus) {
      // 用户指定 GPU 数量
      modelConfig = getModelConfig(modelId, pod.gpus, options.gpus);
      if (!modelConfig) {
        // 显示可用的 GPU 配置
        console.error(chalk.red(`No config for ${options.gpus} GPU(s)`));
        showAvailableConfigs(modelId, pod.gpus);
        process.exit(1);
      }
      gpus = selectGPUs(pod, options.gpus);
    } else {
      // 自动选择最佳配置（从最大 GPU 数开始尝试）
      for (let gpuCount = pod.gpus.length; gpuCount >= 1; gpuCount--) {
        modelConfig = getModelConfig(modelId, pod.gpus, gpuCount);
        if (modelConfig) {
          gpus = selectGPUs(pod, gpuCount);
          break;
        }
      }
    }
    vllmArgs = [...(modelConfig?.args || [])];
  } else {
    // 情况 3：未知模型，默认单 GPU
    gpus = selectGPUs(pod, 1);
    console.log(chalk.gray("Unknown model, defaulting to single GPU"));
  }

  // ========== 应用覆盖参数 ==========
  if (!options.vllmArgs?.length) {
    // 覆盖显存使用率
    if (options.memory) {
      const fraction = parseFloat(options.memory.replace("%", "")) / 100;
      vllmArgs = vllmArgs.filter((arg) => !arg.includes("gpu-memory-utilization"));
      vllmArgs.push("--gpu-memory-utilization", String(fraction));
    }

    // 覆盖上下文大小
    if (options.context) {
      const contextSizes: Record<string, number> = {
        "4k": 4096, "8k": 8192, "16k": 16384,
        "32k": 32768, "64k": 65536, "128k": 131072,
      };
      const maxTokens = contextSizes[options.context.toLowerCase()]
        || parseInt(options.context, 10);
      vllmArgs = vllmArgs.filter((arg) => !arg.includes("max-model-len"));
      vllmArgs.push("--max-model-len", String(maxTokens));
    }
  }

  // ========== 执行部署 ==========
  await deployModel(pod, modelId, name, port, gpus, vllmArgs, modelConfig);
};
```

### GPU 选择算法

```typescript
// packages/pods/src/commands/models.ts

/**
 * 选择 GPU（负载均衡策略）
 * @param pod Pod 配置
 * @param count 需要的 GPU 数量
 * @returns GPU ID 数组
 */
const selectGPUs = (pod: Pod, count: number = 1): number[] => {
  // 如果需要所有 GPU，直接返回
  if (count === pod.gpus.length) {
    return pod.gpus.map((g) => g.id);
  }

  // 统计每个 GPU 上的模型数量
  const gpuUsage = new Map<number, number>();
  for (const gpu of pod.gpus) {
    gpuUsage.set(gpu.id, 0);
  }

  for (const model of Object.values(pod.models)) {
    for (const gpuId of model.gpu) {
      gpuUsage.set(gpuId, (gpuUsage.get(gpuId) || 0) + 1);
    }
  }

  // 按使用次数排序（最少优先）
  const sortedGPUs = Array.from(gpuUsage.entries())
    .sort((a, b) => a[1] - b[1])  // 升序排列
    .map((entry) => entry[0]);

  // 返回使用最少的 N 个 GPU
  return sortedGPUs.slice(0, count);
};
```

**负载均衡效果：**

```
初始状态：
  GPU 0: 空
  GPU 1: 空
  GPU 2: 空
  GPU 3: 空

部署 model1（需要 1 GPU）：
  → 选择 GPU 0（使用次数最少）
  
  GPU 0: model1
  GPU 1: 空
  GPU 2: 空
  GPU 3: 空

部署 model2（需要 2 GPU）：
  → 选择 GPU 1, 2（使用次数最少的前两个）
  
  GPU 0: model1
  GPU 1: model2
  GPU 2: model2
  GPU 3: 空

部署 model3（需要 1 GPU）：
  → 选择 GPU 3（使用次数最少）
  
  GPU 0: model1
  GPU 1: model2
  GPU 2: model2
  GPU 3: model3
```

### 远程执行脚本

pi 使用模板脚本来启动 vLLM：

```bash
#!/usr/bin/env bash
# packages/pods/scripts/model_run.sh

set -euo pipefail

# 这些值在部署时被替换
MODEL_ID="{{MODEL_ID}}"
NAME="{{NAME}}"
PORT="{{PORT}}"
VLLM_ARGS="{{VLLM_ARGS}}"

# 清理函数
cleanup() {
    local exit_code=$?
    echo "Model runner exiting with code $exit_code"
    pkill -P $$ 2>/dev/null || true
    exit $exit_code
}
trap cleanup EXIT TERM INT

# 强制彩色输出
export FORCE_COLOR=1
export PYTHONUNBUFFERED=1
export TERM=xterm-256color

# 激活虚拟环境
source /root/venv/bin/activate

echo "========================================="
echo "Model Run: $NAME"
echo "Model ID: $MODEL_ID"
echo "Port: $PORT"
echo "vLLM Args: $VLLM_ARGS"
echo "========================================="

# 下载模型（使用 hf-transfer 加速）
echo "Downloading model (will skip if cached)..."
HF_HUB_ENABLE_HF_TRANSFER=1 hf download "$MODEL_ID"

if [ $? -ne 0 ]; then
    echo "❌ ERROR: Failed to download model" >&2
    exit 1
fi

echo "✅ Model download complete"

# 构建 vLLM 命令
VLLM_CMD="vllm serve '$MODEL_ID' --port $PORT --api-key '$PI_API_KEY'"
if [ -n "$VLLM_ARGS" ]; then
    VLLM_CMD="$VLLM_CMD $VLLM_ARGS"
fi

echo "Starting vLLM server..."
echo "Command: $VLLM_CMD"

# 启动 vLLM
bash -c "$VLLM_CMD" &
VLLM_PID=$!

# 等待进程结束
wait $VLLM_PID
```

**脚本处理流程：**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    模型启动流程                                      │
│                                                                     │
│   本地 pi CLI                                                       │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ 1. 读取 model_run.sh 模板                                    │  │
│   │ 2. 替换占位符：                                               │  │
│   │    {{MODEL_ID}} → Qwen/Qwen2.5-Coder-32B-Instruct           │  │
│   │    {{NAME}} → qwen                                           │  │
│   │    {{PORT}} → 8001                                           │  │
│   │    {{VLLM_ARGS}} → --tool-call-parser hermes ...            │  │
│   │ 3. 通过 SSH 上传脚本                                          │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│   远程 Pod                                                          │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ 4. 创建 wrapper 脚本（使用 script 命令保留彩色输出）          │  │
│   │ 5. 使用 setsid 在新会话中启动                                │  │
│   │ 6. 输出到 ~/.vllm_logs/qwen.log                              │  │
│   │ 7. 返回 PID 给本地                                           │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              ↓                                      │
│   本地 pi CLI                                                       │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ 8. tail -f 远程日志                                          │  │
│   │ 9. 等待 "Application startup complete"                       │  │
│   │ 10. 保存到 ~/.pi/pods.json                                   │  │
│   │ 11. 显示连接信息                                              │  │
│   └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 使用模式

### 模式一：预定义模型（最简单）

对于预定义模型，pi 自动处理所有配置：

```bash
# 一行命令，自动选择最佳配置
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen

# 输出：
# Starting model 'qwen' on pod 'dc1'...
# Model: Qwen/Qwen2.5-Coder-32B-Instruct
# Port: 8001
# GPU(s): 0, 1
#
# Downloading model (will skip if cached)...
# ...
# ✓ Model started successfully!
#
# Connection Details:
# Base URL:    http://1.2.3.4:8001/v1
# Model:       Qwen/Qwen2.5-Coder-32B-Instruct
# API Key:     your-api-key
```

**支持的预定义模型：**

| 模型系列 | 模型示例 | GPU 需求 | 特点 |
|---------|---------|---------|------|
| Qwen2.5-Coder | 32B | 1-2x H100 | 优秀的编程能力 |
| Qwen3-Coder | 30B / 480B | 1x 或 8x H200 | 增强的工具调用 |
| GPT-OSS | 20B / 120B | 1-8x H100 | OpenAI 开源模型 |
| GLM-4.5 | Full / Air | 4-16x H100 | 支持思维链 |
| Kimi-K2 | 480B | 16x H200 | 多模态支持 |

### 模式二：指定 GPU 数量

对于有多个配置的模型，可以指定使用的 GPU 数量：

```bash
# 使用 1 GPU（节约资源）
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen --gpus 1

# 使用 2 GPU（更高吞吐）
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen --gpus 2

# 如果请求的配置不存在，会显示可用选项
pi start zai-org/GLM-4.5 --name glm --gpus 1
# Error: Model 'GLM-4.5' does not have a configuration for 1 GPU(s)
# Available configurations:
#   - 8 GPU(s)
#   - 16 GPU(s)
```

### 模式三：调整内存和上下文

覆盖默认的显存和上下文设置：

```bash
# 保守的显存配置（适合多模型并发）
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen \
  --memory 50% \
  --context 32k

# 激进的显存配置（适合大上下文）
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen \
  --memory 90% \
  --context 128k

# 上下文大小的可选值
# 4k  = 4,096 tokens
# 8k  = 8,192 tokens
# 16k = 16,384 tokens
# 32k = 32,768 tokens
# 64k = 65,536 tokens
# 128k = 131,072 tokens
```

**显存与上下文的关系：**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    显存分配策略                                      │
│                                                                     │
│   GPU 总显存: 80GB (H100)                                           │
│                                                                     │
│   --memory 90%                                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ ████████████████████████████████████████████████████████░░░░│  │
│   │ ← 模型权重 + KV Cache (72GB)                    → 预留(8GB)│  │
│   │                                                             │  │
│   │ 可支持上下文: 32K-128K（取决于模型大小）                    │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   --memory 50%                                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ ██████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  │
│   │ ← 模型权重 + KV Cache (40GB)          → 可用于其他模型(40GB)│  │
│   │                                                             │  │
│   │ 可支持上下文: 8K-32K（更多并发空间）                        │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   --memory 30%                                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  │
│   │ ← 仅模型权重 (24GB)                → 大量空间留给其他模型   │  │
│   │                                                             │  │
│   │ 可支持上下文: 4K-8K（高并发场景）                           │  │
│   └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 模式四：自定义 vLLM 参数

对于未预定义的模型或需要特殊配置：

```bash
# DeepSeek V3（未预定义）
pi start deepseek-ai/DeepSeek-V3 --name deepseek --vllm \
  --tensor-parallel-size 4 \
  --trust-remote-code \
  --max-model-len 65536

# 使用特定的工具解析器
pi start meta-llama/Llama-3.1-70B-Instruct --name llama --vllm \
  --tensor-parallel-size 2 \
  --tool-call-parser llama3_json \
  --enable-auto-tool-choice

# 禁用工具调用
pi start some/model --name custom --vllm \
  --disable-tool-call-parser

# 启用量化
pi start model/name --name quantized --vllm \
  --quantization awq \
  --enforce-eager
```

**常用 vLLM 参数：**

| 参数 | 说明 | 示例 |
|-----|------|------|
| `--tensor-parallel-size` | 张量并行度 | `--tensor-parallel-size 4` |
| `--pipeline-parallel-size` | 流水线并行度 | `--pipeline-parallel-size 2` |
| `--data-parallel-size` | 数据并行度 | `--data-parallel-size 8` |
| `--max-model-len` | 最大上下文 | `--max-model-len 131072` |
| `--gpu-memory-utilization` | 显存使用率 | `--gpu-memory-utilization 0.9` |
| `--tool-call-parser` | 工具解析器 | `--tool-call-parser hermes` |
| `--enable-auto-tool-choice` | 自动工具选择 | 默认开启 |
| `--quantization` | 量化方法 | `--quantization awq` |
| `--trust-remote-code` | 信任远程代码 | 用于自定义模型 |

### 模式五：多模型部署

在同一 Pod 上部署多个模型：

```bash
# 部署第一个模型
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name coder
# 自动分配: GPU 0, 端口 8001

# 部署第二个模型
pi start Qwen/Qwen3-Coder-30B-A3B-Instruct --name qwen3
# 自动分配: GPU 1（负载均衡选择使用最少的 GPU）, 端口 8002

# 查看所有运行中的模型
pi list
# Models on pod 'dc1':
#   coder - Port 8001 - GPU 0 - PID 12345
#     Model: Qwen/Qwen2.5-Coder-32B-Instruct
#     URL: http://1.2.3.4:8001/v1
#   qwen3 - Port 8002 - GPU 1 - PID 12346
#     Model: Qwen/Qwen3-Coder-30B-A3B-Instruct
#     URL: http://1.2.3.4:8002/v1
```

### 模式六：跨 Pod 部署

在多个 Pod 上部署模型：

```bash
# 在默认 Pod 上部署
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen

# 在指定 Pod 上部署
pi start zai-org/GLM-4.5-Air --name glm --pod prod-pod

# 查看指定 Pod 的模型
pi list --pod prod-pod
```

## 最佳实践

### ✅ 应该做的

**1. 使用预定义模型**

```bash
# 推荐：预定义模型自动优化配置
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen

# 不推荐：手动配置容易出错
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen --vllm \
  --tool-call-parser hermes \
  --enable-auto-tool-choice \
  --tensor-parallel-size 2  # 可能不需要
```

**2. 合理配置显存**

```bash
# 生产环境：高吞吐
pi start model --name prod --memory 90% --context 64k

# 测试环境：多模型并发
pi start model --name test --memory 50% --context 8k

# 开发环境：保守配置
pi start model --name dev --memory 70% --context 32k
```

**3. 查看可用配置**

```bash
# 列出所有预定义模型
pi start

# 查看特定 Pod 兼容的模型
pi pods active my-pod
pi start
# 只显示可以在 my-pod 上运行的模型
```

**4. 监控模型状态**

```bash
# 查看模型列表和状态
pi list

# 查看日志
pi logs qwen

# SSH 检查 GPU
pi ssh "nvidia-smi"
```

### ❌ 避免的错误

**1. 混用 --vllm 和其他参数**

```bash
# 错误：--vllm 时其他参数被忽略
pi start model --name test --vllm --tensor-parallel-size 2 --memory 80%
# Warning: --memory is ignored when using --vllm

# 正确：在 --vllm 中包含所有参数
pi start model --name test --vllm \
  --tensor-parallel-size 2 \
  --gpu-memory-utilization 0.8
```

**2. 超出 GPU 能力**

```bash
# 错误：在 2x H100 上请求 8 GPU 配置
pi start zai-org/GLM-4.5 --name glm --gpus 8
# Error: Requested 8 GPUs but pod only has 2

# 正确：选择适合硬件的模型或升级 Pod
pi start zai-org/GLM-4.5-Air --name glm --gpus 2
```

**3. 重复的模型名称**

```bash
# 错误：名称冲突
pi start model1 --name qwen
pi start model2 --name qwen  # Error: Model 'qwen' already exists

# 正确：使用不同名称
pi start model1 --name qwen-32b
pi start model2 --name qwen-72b
```

**4. 忽略错误日志**

```bash
# 错误：模型启动失败后不做任何处理
pi start model --name test
# Model failed to start: Out of GPU memory (OOM)
# 然后直接重试...

# 正确：分析错误原因
pi logs test  # 查看完整错误日志
pi ssh "nvidia-smi"  # 检查 GPU 状态
# 然后调整参数：
pi start model --name test --memory 50% --context 4k
```

## 故障排除

### 常见错误及解决方案

#### 1. OOM（显存不足）

**症状：**
```
torch.OutOfMemoryError: CUDA out of memory
```

**解决方案：**

```bash
# 方案 1：降低显存使用率
pi start model --name test --memory 50%

# 方案 2：减小上下文
pi start model --name test --context 4k

# 方案 3：使用 FP8 量化版本（如果有）
pi start Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8 --name test

# 方案 4：增加 GPU 数量
pi start model --name test --gpus 2

# 方案 5：先停止其他模型
pi stop other-model
pi start model --name test
```

#### 2. 模型启动超时

**症状：**
```
Log stream ended. Model may still be running.
```

**诊断：**

```bash
# 检查进程状态
pi ssh "ps aux | grep vllm"

# 检查日志
pi ssh "tail -100 ~/.vllm_logs/test.log"

# 检查端口
pi ssh "curl http://localhost:8001/health"
```

#### 3. 工具调用不工作

**症状：**
模型不响应工具调用请求

**解决方案：**

```bash
# 检查工具解析器配置
pi logs model | grep "tool"

# 尝试不同的解析器
pi start model --name test --vllm \
  --tool-call-parser hermes \
  --enable-auto-tool-choice

# 检查模型是否支持工具调用
# 某些模型不支持可靠的工具调用
```

#### 4. GPU 类型不匹配

**症状：**
```
Model 'GLM-4.5' not compatible with this pod's GPUs
```

**解决方案：**

```bash
# 查看当前 Pod 的 GPU 类型
pi pods

# 查看模型要求的 GPU 类型
pi start zai-org/GLM-4.5
# Note: Model requires H100 or H200

# 使用兼容的模型或升级 Pod
```

#### 5. HuggingFace 访问限制

**症状：**
```
401 Client Error: Unauthorized
```

**解决方案：**

```bash
# 检查 HF_TOKEN
echo $HF_TOKEN

# 某些模型需要申请访问权限
# 访问 https://huggingface.co/model-name
# 点击 "Request access"

# 等待批准后重试
pi start meta-llama/Llama-3.1-70B-Instruct --name llama
```

### 调试技巧

```bash
# 实时查看 GPU 使用
pi ssh "watch -n 1 nvidia-smi"

# 查看模型下载进度
pi ssh "ls -la ~/.cache/huggingface/hub/"

# 查看完整启动日志
pi ssh "cat ~/.vllm_logs/model.log"

# 测试 API 端点
pi ssh "curl -s http://localhost:8001/v1/models"

# 检查环境变量
pi ssh "env | grep -E 'HF_|VLLM_|CUDA_'"
```

## 总结

本章我们深入学习了 pi 的模型部署系统：

1. **三层配置架构**：静态配置（models.json）→ 匹配逻辑（model-configs.ts）→ 运行时应用（models.ts）

2. **智能资源分配**：自动选择 GPU、端口，负载均衡策略确保资源高效利用

3. **预定义模型库**：支持 Qwen、GPT-OSS、GLM、Kimi 等主流模型，开箱即用

4. **灵活的配置选项**：支持 GPU 数量、显存、上下文的灵活调整，以及完全自定义的 vLLM 参数

5. **完善的错误处理**：OOM 检测、兼容性检查、详细的错误提示和解决方案

掌握模型部署后，下一章我们将学习如何使用 Agent 交互模式与部署的模型进行对话。

## 下篇预告

**[03 - Agent 交互模式](./03-agent-interface.md)** - 学习 `pi agent` 命令的多种使用方式：单次对话、交互式聊天、会话持久化，以及如何使用内置工具进行代码分析和文件操作。

---

**前置知识**：[01 - Pod 管理基础](./01-pod-management.md)
**相关源码**：
- `packages/pods/src/commands/models.ts` - 模型命令实现
- `packages/pods/src/model-configs.ts` - 配置匹配逻辑
- `packages/pods/src/models.json` - 预定义模型配置
- `packages/pods/scripts/model_run.sh` - 启动脚本模板

**相关文档**：
- [vLLM 官方文档](https://docs.vllm.ai/)
- [HuggingFace 模型下载](https://huggingface.co/docs/huggingface_hub/guides/download)