# pi

在 GPU pods 上部署和管理 LLM，为智能体工作负载自动配置 vLLM。

## 安装

```bash
npm install -g @mariozechner/pi
```

## pi 是什么？

`pi` 简化了在远程 GPU pods 上运行大语言模型的流程。它可以自动：
- 在全新的 Ubuntu pods 上设置 vLLM
- 为智能体模型(Qwen、GPT-OSS、GLM 等)配置工具调用
- 在同一 pod 上管理多个模型，采用"智能"GPU 分配
- 为每个模型提供 OpenAI 兼容的 API 端点
- 包含一个带有文件系统工具的交互式智能体用于测试

## 快速上手

```bash
# 设置必要的环境变量
export HF_TOKEN=your_huggingface_token      # 从 https://huggingface.co/settings/tokens 获取
export PI_API_KEY=your_api_key              # 你想用于 API 认证的任意字符串

# 使用 NFS 存储设置 DataCrunch pod(模型路径自动提取)
pi pods setup dc1 "ssh root@1.2.3.4" \
  --mount "sudo mount -t nfs -o nconnect=16 nfs.fin-02.datacrunch.io:/your-pseudo /mnt/hf-models"

# 启动模型(已知模型自动配置)
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen

# 向模型发送单条消息
pi agent qwen "What is the Fibonacci sequence?"

# 带文件系统工具的交互式聊天模式
pi agent qwen -i

# 配合任何 OpenAI 兼容客户端使用
export OPENAI_BASE_URL='http://1.2.3.4:8001/v1'
export OPENAI_API_KEY=$PI_API_KEY
```

## 前提条件

- Node.js 18+
- HuggingFace token(用于模型下载)
- GPU pod 需具备：
  - Ubuntu 22.04 或 24.04
  - SSH root 访问权限
  - 已安装 NVIDIA 驱动
  - 用于模型的持久化存储

## 支持的提供商

### 主要支持

**DataCrunch** - 最适合共享模型存储
- NFS 卷可在同一区域的多个 pods 间共享
- 模型只需下载一次，到处可用
- 非常适合团队或多个实验

**RunPod** - 良好的持久化存储
- 网络卷独立持久化
- 无法在多个运行中的 pods 间同时共享
- 适合单 pod 工作流

### 也支持
- Vast.ai(卷锁定到特定机器)
- Prime Intellect(无持久化存储)
- AWS EC2(需 EFS 配置)
- 任何配备 NVIDIA GPUs、CUDA 驱动和 SSH 的 Ubuntu 机器

## 命令

### Pod 管理

```bash
pi pods setup <name> "<ssh>" [options]        # 设置新 pod
  --mount "<mount_command>"                   # 在设置期间运行挂载命令
  --models-path <path>                        # 覆盖提取的路径(可选)
  --vllm release|nightly|gpt-oss              # vLLM 版本(默认: release)

pi pods                                       # 列出所有已配置的 pods
pi pods active <name>                         # 切换活跃 pod
pi pods remove <name>                         # 从本地配置中移除 pod
pi shell [<name>]                             # SSH 进入 pod
pi ssh [<name>] "<command>"                   # 在 pod 上运行命令
```

**注意**: 使用 `--mount` 时，模型路径会自动从挂载命令的目标目录中提取。只有在未使用 `--mount` 或需要覆盖提取的路径时，才需要 `--models-path`。

#### vLLM 版本选项

- `release`(默认): 稳定的 vLLM 发布版本，推荐大多数用户使用
- `nightly`: 最新 vLLM 功能，新模型如 GLM-4.5 需要此版本
- `gpt-oss`: 仅用于 OpenAI GPT-OSS 模型的特殊构建

### 模型管理

```bash
pi start <model> --name <name> [options]  # 启动模型
  --memory <percent>      # GPU 内存: 30%, 50%, 90%(默认: 90%)
  --context <size>        # 上下文窗口: 4k, 8k, 16k, 32k, 64k, 128k
  --gpus <count>          # 使用的 GPU 数量(仅限预定义模型)
  --pod <name>            # 指定目标 pod(覆盖活跃 pod)
  --vllm <args...>        # 直接向 vLLM 传递自定义参数

pi stop [<name>]          # 停止模型(未指定名称则停止全部)
pi list                   # 列出运行中的模型及状态
pi logs <name>            # 流式查看模型日志(tail -f)
```

### 智能体与聊天界面

```bash
pi agent <name> "<message>"               # 向模型发送单条消息
pi agent <name> "<msg1>" "<msg2>"         # 按顺序发送多条消息
pi agent <name> -i                        # 交互式聊天模式
pi agent <name> -i -c                     # 继续之前的会话

# 独立的 OpenAI 兼容智能体(可与任何 API 配合使用)
pi-agent --base-url http://localhost:8000/v1 --model llama-3.1 "Hello"
pi-agent --api-key sk-... "What is 2+2?"  # 默认使用 OpenAI
pi-agent --json "What is 2+2?"            # 将事件流输出为 JSONL
pi-agent -i                                # 交互模式
```

智能体包含文件操作工具(read、list、bash、glob、rg)用于测试智能体能力，特别适用于代码导航和分析任务。

## 预定义模型配置

`pi` 包含热门智能体模型的预定义配置，因此你无需手动指定 `--vllm` 参数。`pi` 还会检查你选择的模型是否真的能在你的 pod 上运行，考虑 GPU 数量和可用显存。不带额外参数运行 `pi start` 可查看能在活跃 pod 上运行的预定义模型列表。

### Qwen 模型
```bash
# Qwen2.5-Coder-32B - 优秀的编程模型，适合单个 H100/H200
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen

# Qwen3-Coder-30B - 带工具使用的高级推理能力
pi start Qwen/Qwen3-Coder-30B-A3B-Instruct --name qwen3

# Qwen3-Coder-480B - 在 8xH200 上的顶尖模型(数据并行模式)
pi start Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8 --name qwen-480b
```

### GPT-OSS 模型
```bash
# 设置期间需要特殊的 vLLM 构建
pi pods setup gpt-pod "ssh root@1.2.3.4" --models-path /workspace --vllm gpt-oss

# GPT-OSS-20B - 适合 16GB+ 显存
pi start openai/gpt-oss-20b --name gpt20

# GPT-OSS-120B - 需要 60GB+ 显存
pi start openai/gpt-oss-120b --name gpt120
```

### GLM 模型
```bash
# GLM-4.5 - 需要 8-16 个 GPU，包含思考模式
pi start zai-org/GLM-4.5 --name glm

# GLM-4.5-Air - 较小版本，1-2 个 GPU
pi start zai-org/GLM-4.5-Air --name glm-air
```

### 使用 --vllm 的自定义模型

对于不在预定义列表中的模型，使用 `--vllm` 直接向 vLLM 传递参数：

```bash
# DeepSeek 自定义设置
pi start deepseek-ai/DeepSeek-V3 --name deepseek --vllm \
  --tensor-parallel-size 4 --trust-remote-code

# Mistral 流水线并行
pi start mistralai/Mixtral-8x22B-Instruct-v0.1 --name mixtral --vllm \
  --tensor-parallel-size 8 --pipeline-parallel-size 2

# 任意模型指定工具解析器
pi start some/model --name mymodel --vllm \
  --tool-call-parser hermes --enable-auto-tool-choice
```

## DataCrunch 设置

DataCrunch 提供最佳的跨 pod 共享 NFS 存储体验：

### 1. 创建共享文件系统(SFS)
- 进入 DataCrunch 控制面板 → Storage → Create SFS
- 选择大小和数据中心
- 记录挂载命令(例如 `sudo mount -t nfs -o nconnect=16 nfs.fin-02.datacrunch.io:/hf-models-fin02-8ac1bab7 /mnt/hf-models-fin02`)

### 2. 创建 GPU 实例
- 在与 SFS 相同的数据中心创建实例
- 将 SFS 共享给该实例
- 从控制面板获取 SSH 命令

### 3. 使用 pi 设置
```bash
# 从 DataCrunch 控制面板获取挂载命令
pi pods setup dc1 "ssh root@instance.datacrunch.io" \
  --mount "sudo mount -t nfs -o nconnect=16 nfs.fin-02.datacrunch.io:/your-pseudo /mnt/hf-models"

# 模型自动存储在 /mnt/hf-models(从挂载命令提取)
```

### 4. 优势
- 模型在实例重启后依然保留
- 可在同一数据中心的多个实例间共享模型
- 只需下载一次，到处可用
- 仅支付存储费用，下载期间不产生计算费用

## RunPod 设置

RunPod 提供良好的网络卷持久化存储：

### 1. 创建网络卷(可选)
- 进入 RunPod 控制面板 → Storage → Create Network Volume
- 选择大小和区域

### 2. 创建 GPU Pod
- 创建 pod 时选择"Network Volume"(如使用)
- 将卷挂载到 `/runpod-volume`
- 从 pod 详情获取 SSH 命令

### 3. 使用 pi 设置
```bash
# 使用网络卷
pi pods setup runpod "ssh root@pod.runpod.io" --models-path /runpod-volume

# 或使用 workspace(随 pod 持久化但不可共享)
pi pods setup runpod "ssh root@pod.runpod.io" --models-path /workspace
```


## 多 GPU 支持

### 自动 GPU 分配
运行多个模型时，pi 会自动将它们分配到不同的 GPU：
```bash
pi start model1 --name m1  # 自动分配到 GPU 0
pi start model2 --name m2  # 自动分配到 GPU 1
pi start model3 --name m3  # 自动分配到 GPU 2
```

### 为预定义模型指定 GPU 数量
对于有多种配置的预定义模型，使用 `--gpus` 控制 GPU 使用：
```bash
# 在 1 个 GPU 上运行 Qwen 而非所有可用 GPU
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name qwen --gpus 1

# 在 8 个 GPU 上运行 GLM-4.5(如果有 8-GPU 配置)
pi start zai-org/GLM-4.5 --name glm --gpus 8
```

如果模型没有请求 GPU 数量的配置，你会看到可用选项。

### 大模型的张量并行
对于单个 GPU 无法容纳的模型：
```bash
# 使用所有可用 GPU
pi start meta-llama/Llama-3.1-70B-Instruct --name llama70b --vllm \
  --tensor-parallel-size 4

# 指定 GPU 数量
pi start Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8 --name qwen480 --vllm \
  --data-parallel-size 8 --enable-expert-parallel
```

## API 集成

所有模型都暴露 OpenAI 兼容的端点：

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://your-pod-ip:8001/v1",
    api_key="your-pi-api-key"
)

# 带工具调用的聊天补全
response = client.chat.completions.create(
    model="Qwen/Qwen2.5-Coder-32B-Instruct",
    messages=[
        {"role": "user", "content": "Write a Python function to calculate fibonacci"}
    ],
    tools=[{
        "type": "function",
        "function": {
            "name": "execute_code",
            "description": "Execute Python code",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"}
                },
                "required": ["code"]
            }
        }
    }],
    tool_choice="auto"
)
```

## 独立智能体 CLI

`pi` 包含一个独立的 OpenAI 兼容智能体，可与任何 API 配合使用：

```bash
# 全局安装以获取 pi-agent 命令
npm install -g @mariozechner/pi

# 配合 OpenAI 使用
pi-agent --api-key sk-... "What is machine learning?"

# 配合本地 vLLM 使用
pi-agent --base-url http://localhost:8000/v1 \
         --model meta-llama/Llama-3.1-8B-Instruct \
         --api-key dummy \
         "Explain quantum computing"

# 交互模式
pi-agent -i

# 继续之前的会话
pi-agent --continue "Follow up question"

# 自定义系统提示词
pi-agent --system-prompt "You are a Python expert" "Write a web scraper"

# 使用 responses API(用于 GPT-OSS 模型)
pi-agent --api responses --model openai/gpt-oss-20b "Hello"
```

智能体支持：
- 跨对话的会话持久化
- 带语法高亮的交互式 TUI 模式
- 用于代码导航的文件系统工具(read、list、bash、glob、rg)
- Chat Completions 和 Responses API 两种格式
- 自定义系统提示词

## 工具调用支持

`pi` 会自动为已知模型配置适当的工具调用解析器：

- **Qwen 模型**: `hermes` 解析器(Qwen3-Coder 使用 `qwen3_coder`)
- **GLM 模型**: `glm4_moe` 解析器，支持推理
- **GPT-OSS 模型**: 使用 `/v1/responses` 端点，因为工具调用(OpenAI 称为函数调用)目前是 [`v1/chat/completions` 端点的 WIP](https://docs.vllm.ai/projects/recipes/en/latest/OpenAI/GPT-OSS.html#tool-use)。
- **自定义模型**: 使用 `--vllm --tool-call-parser <parser> --enable-auto-tool-choice` 指定

禁用工具调用：
```bash
pi start model --name mymodel --vllm --disable-tool-call-parser
```

## 内存和上下文管理

### GPU 内存分配
控制 vLLM 预分配多少 GPU 内存：
- `--memory 30%`: 高并发，有限上下文
- `--memory 50%`: 平衡(默认)
- `--memory 90%`: 最大上下文，低并发

### 上下文窗口
设置最大输入+输出 token 数：
- `--context 4k`: 总计 4,096 tokens
- `--context 32k`: 总计 32,768 tokens
- `--context 128k`: 总计 131,072 tokens

编程工作负载示例：
```bash
# 大上下文用于代码分析，适度并发
pi start Qwen/Qwen2.5-Coder-32B-Instruct --name coder \
  --context 64k --memory 70%
```

**注意**: 使用 `--vllm` 时，`--memory`、`--context` 和 `--gpus` 参数会被忽略。如果你尝试同时使用，会看到警告。

## 会话持久化

交互式智能体模式(`-i`)会为每个项目目录保存会话：

```bash
# 启动新会话
pi agent qwen -i

# 继续之前的会话(保持聊天历史)
pi agent qwen -i -c
```

会话存储在 `~/.pi/sessions/`，按项目路径组织，包含：
- 完整的对话历史
- 工具调用结果
- Token 使用统计

## 架构与事件系统

智能体使用统一的事件驱动架构，所有交互都通过 `AgentEvent` 类型流转。这实现了：
- 控制台和 TUI 模式间一致的 UI 渲染
- 会话录制和回放
- API 调用与 UI 更新的清晰分离
- 用于程序化集成的 JSON 输出模式

事件会根据模型类型自动转换为适当的 API 格式(Chat Completions 或 Responses)。

### JSON 输出模式

使用 `--json` 标志将事件流输出为 JSONL(JSON Lines)，供程序化消费：
```bash
pi-agent --api-key sk-... --json "What is 2+2?"
```

每行是一个完整的事件 JSON 对象：
```jsonl
{"type":"user_message","text":"What is 2+2?"}
{"type":"assistant_start"}
{"type":"assistant_message","text":"2 + 2 = 4"}
{"type":"token_usage","inputTokens":10,"outputTokens":5,"totalTokens":15,"cacheReadTokens":0,"cacheWriteTokens":0}
```

## 故障排除

### OOM(内存不足)错误
- 降低 `--memory` 百分比
- 使用更小的模型或量化版本(FP8)
- 减小 `--context` 大小

### 模型无法启动
```bash
# 检查 GPU 使用情况
pi ssh "nvidia-smi"

# 检查端口是否被占用
pi list

# 强制停止所有模型
pi stop
```

### 工具调用问题
- 并非所有模型都能可靠支持工具调用
- 尝试不同的解析器：`--vllm --tool-call-parser mistral`
- 或禁用：`--vllm --disable-tool-call-parser`

### 模型访问被拒绝
某些模型(Llama、Mistral)需要 HuggingFace 访问批准。访问模型页面并点击"Request access"。

### vLLM 构建问题
如果使用 `--vllm nightly` 失败，尝试：
- 使用 `--vllm release` 获取稳定版本
- 使用 `pi ssh "nvidia-smi"` 检查 CUDA 兼容性

### 智能体找不到消息
如果智能体显示配置而非你的消息，确保用引号包裹包含特殊字符的消息：
```bash
# 正确
pi agent qwen "What is this file about?"

# 错误(shell 可能解析特殊字符)
pi agent qwen What is this file about?
```

## 高级用法

### 使用多个 Pods
```bash
# 为任何命令覆盖活跃 pod
pi start model --name test --pod dev-pod
pi list --pod prod-pod
pi stop test --pod dev-pod
```

### 自定义 vLLM 参数
```bash
# 在 --vllm 后传递任何 vLLM 参数
pi start model --name custom --vllm \
  --quantization awq \
  --enable-prefix-caching \
  --max-num-seqs 256 \
  --gpu-memory-utilization 0.95
```

### 监控
```bash
# 观察 GPU 利用率
pi ssh "watch -n 1 nvidia-smi"

# 检查模型下载
pi ssh "du -sh ~/.cache/huggingface/hub/*"

# 查看所有日志
pi ssh "ls -la ~/.vllm_logs/"

# 检查智能体会话历史
ls -la ~/.pi/sessions/
```

## 环境变量

- `HF_TOKEN` - 用于模型下载的 HuggingFace token
- `PI_API_KEY` - vLLM 端点的 API key
- `PI_CONFIG_DIR` - 配置目录(默认: `~/.pi`)
- `OPENAI_API_KEY` - 当未提供 `--api-key` 时，`pi-agent` 使用此变量

## 许可证

MIT