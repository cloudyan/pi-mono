## `gpt-oss` vLLM 使用指南

`gpt-oss-20b` 和 `gpt-oss-120b` 是 OpenAI 开源的功能强大的推理模型。
在 vLLM 中,你可以在 NVIDIA H100、H200、B200 以及 MI300x、MI325x、MI355x 和 Radeon AI PRO R9700 上运行这些模型。
我们正在积极努力确保这些模型可以在 Ampere、Ada Lovelace 和 RTX 5090 上运行。
具体来说,vLLM 针对 `gpt-oss` 模型系列进行了以下优化:

* **灵活的并行选项**: 模型可以在 2、4、8 个 GPU 上进行分片,从而提高吞吐量。
* **高性能注意力(Attention)和 MoE 内核**: 注意力内核专门针对注意力下沉(attention sinks)机制和滑动窗口形状进行了优化。
* **异步调度**: 通过重叠 CPU 操作和 GPU 操作来优化最大利用率和提高吞吐量。

这是一份持续更新的文档,我们欢迎贡献、修正和创建新的使用方案!

## 快速开始

### 安装

我们强烈建议使用新的虚拟环境,因为首次发布版本需要各种依赖项的前沿内核,这些可能与其他模型不兼容。具体来说,我们将安装: vLLM 的预发布版本、PyTorch nightly、Triton nightly、FlashInfer 预发布版本、HuggingFace 预发布版本、Harmony 以及 gpt-oss 库工具。

```
uv venv
source .venv/bin/activate

uv pip install --pre vllm==0.10.1+gptoss \
    --extra-index-url https://wheels.vllm.ai/gpt-oss/ \
    --extra-index-url https://download.pytorch.org/whl/nightly/cu128 \
    --index-strategy unsafe-best-match
```

我们还提供了一个包含所有依赖项的 Docker 容器:

```
docker run --gpus all \
    -p 8000:8000 \
    --ipc=host \
    vllm/vllm-openai:gptoss \
    --model openai/gpt-oss-20b
```

### H100 和 H200

你可以使用默认参数启动模型:

* `--async-scheduling` 可以启用以获得更高性能。目前与结构化输出不兼容。
* 我们推荐 TP=2 作为 H100 和 H200 的最佳性能权衡点。

```
# openai/gpt-oss-20b 应该在单个 GPU 上运行
vllm serve openai/gpt-oss-20b --async-scheduling

# gpt-oss-120b 可以适配单个 H100/H200,但扩展到更高的 TP 大小有助于提高吞吐量
vllm serve openai/gpt-oss-120b --async-scheduling
vllm serve openai/gpt-oss-120b --tensor-parallel-size 2 --async-scheduling
vllm serve openai/gpt-oss-120b --tensor-parallel-size 4 --async-scheduling
```

### B200

NVIDIA Blackwell 需要安装 FlashInfer 库和几个环境变量来启用必要的内核。我们推荐 TP=1 作为高性能选项的起点。我们正在积极优化 vLLM 在 Blackwell 上的性能。

```
# 这 3 个环境变量都是必需的
export VLLM_USE_TRTLLM_ATTENTION=1
export VLLM_USE_TRTLLM_DECODE_ATTENTION=1
export VLLM_USE_TRTLLM_CONTEXT_ATTENTION=1

# 从以下两个中只选择一个。
# MoE 的 mxfp8 激活。更快,但准确度风险更高。
export VLLM_USE_FLASHINFER_MXFP4_MOE=1
# MoE 的 bf16 激活。匹配参考精度。
export VLLM_USE_FLASHINFER_MXFP4_BF16_MOE=1

# openai/gpt-oss-20b
vllm serve openai/gpt-oss-20b --async-scheduling

# gpt-oss-120b
vllm serve openai/gpt-oss-120b --async-scheduling
vllm serve openai/gpt-oss-120b --tensor-parallel-size 2 --async-scheduling
vllm serve openai/gpt-oss-120b --tensor-parallel-size 4 --async-scheduling
```

### AMD

ROCm 在第一天就支持 OpenAI gpt-oss-120b 或 gpt-oss-20b 模型在这 3 种不同的 GPU 上运行,同时提供预构建的 Docker 容器:

* gfx950: MI350x 系列, `rocm/vllm-dev:open-mi355-08052025`
* gfx942: MI300x/MI325 系列, `rocm/vllm-dev:open-mi300-08052025`
* gfx1201: Radeon AI PRO R9700, `rocm/vllm-dev:open-r9700-08052025`

运行容器:

```
alias drun='sudo docker run -it --network=host --device=/dev/kfd --device=/dev/dri --group-add=video --ipc=host --cap-add=SYS_PTRACE --security-opt seccomp=unconfined --shm-size 32G -v /data:/data -v $HOME:/myhome -w /myhome'

drun rocm/vllm-dev:open-mi300-08052025
```

对于 MI300x 和 R9700:

```
export VLLM_ROCM_USE_AITER=1
export VLLM_USE_AITER_UNIFIED_ATTENTION=1
export VLLM_ROCM_USE_AITER_MHA=0

vllm serve openai/gpt-oss-120b --compilation-config '{"full_cuda_graph": true}'
```

对于 MI355x:

```
# MoE 预洗牌、融合和 Triton GEMM 标志
export VLLM_USE_AITER_TRITON_FUSED_SPLIT_QKV_ROPE=1
export VLLM_USE_AITER_TRITON_FUSED_ADD_RMSNORM_PAD=1
export VLLM_USE_AITER_TRITON_GEMM=1
export VLLM_ROCM_USE_AITER=1
export VLLM_USE_AITER_UNIFIED_ATTENTION=1
export VLLM_ROCM_USE_AITER_MHA=0
export TRITON_HIP_PRESHUFFLE_SCALES=1

vllm serve openai/gpt-oss-120b --compilation-config '{"compile_sizes": [1, 2, 4, 8, 16, 24, 32, 64, 128, 256, 4096, 8192], "full_cuda_graph": true}' --block-size 64
```

## 使用方法

一旦 `vllm serve` 运行并显示 `INFO: Application startup complete`,你可以使用 HTTP 请求或 OpenAI SDK 向以下端点发送请求:

* `/v1/responses` 端点可以在思维链(chain-of-thought)之间执行工具使用(浏览、Python、MCP)并返回最终响应。该端点利用 `openai-harmony` 库进行输入渲染和输出解析。有状态操作和完整的流式 API 正在开发中。OpenAI 推荐使用 Responses API 作为与这个模型交互的方式。
* `/v1/chat/completions` 端点提供了熟悉的接口。不会调用工具,但会结构性地返回推理和最终文本输出。函数调用(function calling)功能正在开发中。你还可以在请求参数中设置 `include_reasoning: false` 来跳过 CoT 作为输出的一部分。
* `/v1/completions` 端点是一个简单的输入输出接口,没有任何模板渲染。

所有端点都接受 `stream: true` 作为操作的一部分,以启用增量 token 流式传输。请注意,vLLM 目前不涵盖 Responses API 的全部范围,更多详情请参见下面的限制部分。

### 工具使用

gpt-oss 的一个主要特性是能够直接调用工具,称为"内置工具"。在 vLLM 中,我们提供了几种选择:

* 默认情况下,我们通过 Docker 容器与参考库的浏览器(使用 `ExaBackend`)和演示 Python 解释器集成。为了使用搜索后端,你需要访问 [exa.ai](http://exa.ai) 并将 `EXA_API_KEY=` 设置为环境变量。对于 Python,要么安装 Docker,要么设置 `PYTHON_EXECUTION_BACKEND=UV` 以危险地允许在同一台机器上执行模型生成的代码片段。

```
uv pip install gpt-oss

vllm serve ... --tool-server demo
```

* 请注意,默认选项仅用于演示目的。对于生产用途,vLLM 本身可以作为 MCP 客户端连接到多个服务。
这是一个 [示例工具服务器](https://github.com/openai/gpt-oss/tree/main/gpt-oss-mcp-server),vLLM 可以与之配合使用,它们包装了演示工具:

```
mcp run -t sse browser_server.py:mcp
mcp run -t sse python_server.py:mcp

vllm serve ... --tool-server ip-1:port-1,ip-2:port-2
```

URL 应该是实现服务器信息中 `instructions` 并提供良好文档化工具的 MCP SSE 服务器。这些工具将被注入到模型的系统提示中,以启用它们。

## 准确性评估面板

OpenAI 推荐使用 gpt-oss 参考库进行评估。例如,

```
python -m gpt_oss.evals --model 120b-low --eval gpqa --n-threads 128
python -m gpt_oss.evals --model 120b --eval gpqa --n-threads 128
python -m gpt_oss.evals --model 120b-high --eval gpqa --n-threads 128
```
要在 AIME2025 上评估,将 `gpqa` 改为 `aime25`。
使用 vLLM 部署时:

```
# 在 8xH100 上的示例部署
vllm serve openai/gpt-oss-120b \
  --tensor_parallel_size 8 \
  --max-model-len 131072 \
  --max-num-batched-tokens 10240 \
  --max-num-seqs 128 \
  --gpu-memory-utilization 0.85 \
  --no-enable-prefix-caching
```

这是我们能够在没有工具使用的情况下复现的分数,我们也鼓励你尝试复现!
我们观察到这些数字在不同运行之间可能会有轻微变化,所以可以随意多次运行评估以了解方差。
对于快速正确性检查,我们建议从低推理努力设置(120b-low)开始,这应该在几分钟内完成。

模型: 120B

| 推理努力 | GPQA | AIME25 |
| :---- | :---- | :---- |
| 低(Low)  | 65.3 | 51.2 |
| 中(Mid)  | 72.4 | 79.6 |
| 高(High)  | 79.4 | 93.0 |

模型: 20B

| 推理努力 | GPQA | AIME25 |
| :---- | :---- | :---- |
| 低(Low)  | 56.8 | 38.8 |
| 中(Mid)  | 67.5 | 75.0 |
| 高(High)  | 70.9 | 85.8  |

## 已知限制

* 在 H100 上使用张量并行(tensor parallel)大小 1、默认 GPU 内存利用率和批处理 token 会导致 CUDA 内存不足(Out-of-memory)。当运行 tp1 时,请增加你的 GPU 内存利用率或降低批处理 token 数量。

```
vllm serve openai/gpt-oss-120b --gpu-memory-utilization 0.95 --max-num-batched-tokens 1024
```

* 在 H100 上运行 TP2 时,将你的 GPU 内存利用率设置在 0.95 以下,否则也会导致 OOM。
* Responses API 目前有几个限制;我们非常欢迎在 vLLM 中对此服务进行贡献和维护。
* 使用量统计(currently broken)目前已损坏,只返回全零。
* 注释(引用来自搜索结果中的 URL)不受支持。
* 通过 `max_tokens` 进行截断可能无法保留部分块。
* 目前流式传输相当基础,例如:
  * 项目 ID 和索引需要更多工作。
  * 工具调用和输出没有正确流式传输,而是批处理。
  * 缺少适当的错误处理。

## 故障排除

- Blackwell 上的注意力下沉(Attention sink)数据类型错误:

```
  ERROR 08-05 07:31:10 [multiproc_executor.py:559]     assert sinks.dtype == torch.float32, "Sinks must be of type float32"
  **(VllmWorker TP0 pid=174579)** ERROR 08-05 07:31:10 [multiproc_executor.py:559]            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  **(VllmWorker TP0 pid=174579)** ERROR 08-05 07:31:10 [multiproc_executor.py:559] AssertionError: Sinks must be of type float32
```

**解决方案:请参考 Blackwell 部分检查是否添加了相关的环境变量。**

- 与 `tl.language` 未定义相关的 Triton 问题:

**解决方案:确保你的环境中没有安装其他 triton (pytorch-triton 等)。**