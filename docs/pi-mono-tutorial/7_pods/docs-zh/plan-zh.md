## Pi

Pi 自动在 GPU pods(来自 DataCrunch、Vast.ai、Prime Intellect、RunPod 或任何带有 NVIDIA GPU 的 Ubuntu 机器)上部署 vLLM(vLLM, Very Large Language Model Inference System)。它通过独立的 vLLM 实例管理多个并发模型部署,每个实例都可通过 OpenAI API 协议访问,并需要 API 密钥认证。

Pod 被视为临时的 — 需要时启动,完成后销毁。为了避免重新下载模型(100GB+ 的模型需要 30 分钟以上),pi 使用持久性网络卷来存储模型,这些卷可以在同一提供商的不同 pod 之间共享。这既最小化了成本(只支付活跃计算时间)也减少了设置时间(模型已经缓存)。

## 使用方法

### Pods(容器节点)
```bash
pi pods setup dc1 "ssh root@1.2.3.4" --mount "mount -t nfs..."  # 设置 pod(需要 HF_TOKEN、PI_API_KEY 环境变量)
pi pods                              # 列出所有 pods(* = 活跃状态)
pi pods active dc2                   # 切换到活跃 pod
pi pods remove dc1                   # 移除 pod
```

### Models(模型)
```bash
pi start Qwen/Qwen2.5-72B-Instruct --name qwen72b          # 已知模型 - pi 处理 vLLM 参数
pi start some/unknown-model --name mymodel --vllm --tensor-parallel-size 4 --max-model-len 32768  # 自定义 vLLM 参数
pi list                              # 列出运行中的模型及其端口
pi stop qwen72b                      # 停止模型
pi logs qwen72b                      # 查看模型日志
```

对于已知模型,pi 会根据 pod 的硬件自动从模型文档中配置合适的 vLLM 参数。对于未知模型或自定义配置,可以在 `--vllm` 后传递 vLLM 参数。

## Pod 管理

Pi 将各种提供商的 GPU pods(DataCrunch、Vast.ai、Prime Intellect、RunPod)作为临时计算资源进行管理。用户通过提供商仪表板手动创建 pods,然后将其注册到 pi 进行自动化设置和管理。

核心能力:
- **Pod 设置**: 在约 2 分钟内将裸 Ubuntu/Debian 机器转换为 vLLM 就绪环境
- **模型缓存**: 可选的持久性存储,由 pods 共享,避免重新下载 100GB+ 的模型
- **多 Pod 管理**: 注册多个 pods,在它们之间切换,维护不同的环境

### Pod 设置

当用户在提供商上创建新的 pod 时,他们使用提供商的 SSH 命令将其注册到 pi:

```bash
pi pods setup dc1 "ssh root@1.2.3.4" --mount "mount -t nfs..."
```

这会复制并执行 `pod_setup.sh`,该脚本:
1. 通过 `nvidia-smi` 检测 GPU 并将其数量/内存存储在本地配置中
2. 安装与驱动程序版本匹配的 CUDA 工具包
3. 创建 Python 环境
   - 安装 uv 和 Python 3.12
   - 在 ~/venv 创建 venv,包含 PyTorch(--torch-backend=auto)
   - 安装 vLLL(需要时使用模型特定版本)
   - 安装 FlashInfer(需要时从源码构建)
   - 安装 huggingface-hub(用于模型下载)
   - 安装 hf-transfer(用于加速下载)
4. 如果提供了持久性存储,则挂载它
   - 创建符号链接到 ~/.cache/huggingface 用于模型缓存
5. 永久配置环境变量

必需的环境变量:
- `HF_TOKEN`: HuggingFace 令牌,用于模型下载
- `PI_API_KEY`: API 密钥,用于保护 vLLM 端点

### 模型缓存

模型可能超过 100GB,需要 30 分钟以上下载。`--mount` 标志启用持久性模型缓存:

- **DataCrunch**: NFS 共享文件系统,可在同一区域的多个运行 pods 之间挂载
- **RunPod**: 网络卷独立持久化,但不能在运行中的 pods 之间共享
- **Vast.ai**: 卷锁定到特定机器 — 无法共享
- **Prime Intellect**: 没有持久性存储文档说明

如果不使用 `--mount`,模型将下载到 pod 本地存储,终止时会丢失。

### 多 Pod 管理

用户可以注册多个 pods 并在它们之间切换:

```bash
pi pods                    # 列出所有 pods(* = 活跃状态)
pi pods active dc2         # 切换到活跃 pod
pi pods remove dc1         # 从本地配置中移除 pod,但不会远程销毁 pod。
```

所有模型命令(`pi start`、`pi stop` 等)都针对活跃 pod,除非给出 `--pod <podname>`,这会覆盖该命令的活跃 pod。

## 模型部署

Pi 使用直接的 SSH 命令来管理 pod 上的 vLLM 实例。不需要远程管理器组件 — 一切都由本地 pi CLI 控制。

### 架构
pi CLI 在本地 `~/.pi/pods.json` 中维护所有状态:
```json
{
  "pods": {
    "dc1": {
      "ssh": "ssh root@1.2.3.4",
      "gpus": [
        {"id": 0, "name": "H100", "memory": "80GB"},
        {"id": 1, "name": "H100", "memory": "80GB"}
      ],
      "models": {
        "qwen": {
          "model": "Qwen/Qwen2.5-72B",
          "port": 8001,
          "gpu": "0",
          "pid": 12345
        }
      }
    }
  },
  "active": "dc1"
}
```

pi 配置目录的位置也可以通过 `PI_CONFIG_DIR` 环境变量指定,例如用于测试。

假设 pods 完全由 pi 管理 — 没有其他进程竞争端口或 GPU。

### 启动模型
当用户运行 `pi start Qwen/Qwen2.5-72B --name qwen` 时:
1. CLI 确定下一个可用端口(从 8001 开始)
2. 选择 GPU(基于存储的 GPU 信息进行轮询)
3. 如果模型未缓存,则下载模型:
   - 设置 `HF_HUB_ENABLE_HF_TRANSFER=1` 用于快速下载
   - 通过 SSH 运行,输出通过管道传输到本地终端
   - Ctrl+C 取消下载并返回控制权
4. 构建 vLLM 命令,包含适当的参数和 PI_API_KEY
5. 通过 SSH 执行: `ssh pod "nohup vllm serve ... > ~/.vllm_logs/qwen.log 2>&1 & echo $!"`
6. 等待 vLLM 就绪(检查健康端点)
7. 成功时: 在本地状态中存储端口、GPU、PID
8. 失败时: 显示 vLLM 日志中的确切错误,不保存到配置

### 管理模型
- **List(列表)**: 从本地状态显示模型,可选验证 PID 是否仍在运行
- **Stop(停止)**: 通过 SSH 使用 PID 杀死进程
- **Logs(日志)**: 通过 SSH tail -f 日志文件(Ctrl+C 停止跟踪,不杀死 vLLM)

### 错误处理
- **SSH 失败**: 提示用户检查连接或从配置中移除 pod
- **陈旧状态**: 因"进程未找到"而失败的命令自动清理本地状态
- **设置失败**: 设置期间按 Ctrl+C 会杀死远程脚本并干净退出

### 测试模型
`pi prompt` 命令提供了测试已部署模型的快速方法:
```bash
pi prompt qwen "What is 2+2?"                    # 简单提示
pi prompt qwen "Read file.txt and summarize"     # 使用内置工具
```

用于智能测试的内置工具:
- `ls(path, ignore?)`: 列出路径中的文件和目录,可选的忽略模式
- `read(file_path, offset?, limit?)`: 读取文件内容,可选的行的偏移/限制
- `glob(pattern, path?)`: 查找匹配 glob 模式的文件(例如,"**/*.py"、"src/**/*.ts")
- `rg(args)`: 运行 ripgrep 及其参数(例如,"pattern -t py -C 3"、"TODO --type-not test")

提供的提示将用当前本地工作目录的信息进行增强。文件工具期望绝对路径。

这允许测试基本的智能能力,而无需外部工具配置。

`prompt` 使用最新的 NodeJS OpenAI SDK 实现。它输出思考内容、工具调用和结果,以及正常的助手消息。

## 模型
我们特别想要支持这些模型,替代模型被标记为"可能工作"。这个列表将定期更新新模型。勾选框表示"支持"。

有关我们想要通过简单的 `pi start <model-name> --name <local-name>` 即开即用支持的模型列表、它们的硬件需求、vLLM 参数和注意事项,请参阅 [models.md](./models.md)。