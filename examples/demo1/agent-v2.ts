import { Agent } from "@mariozechner/pi-agent-core";
import {
	getModel,
	streamSimple,
	type Context,
	type AssistantMessage
} from "@mariozechner/pi-ai";
import {
	qwen35Plus,
	qwen3Max,
	qwen3CoderNext,
	qwen3CoderPlus,
	minimaxM25,
	glm5,
	glm47,
	kimiK25,
	getBailianModel,
	defaultBailianModel,
} from "../models/bailian";

// 创建 Agent 实例
const agent = new Agent({
	initialState: {
		systemPrompt: "You are a helpful assistant.",
		// model: defaultBailianModel,
		model: getModel("opencode", "gpt-5-nano"),
	},
});

const eventTypes = {
	"agent_start": "[Agent 开始]",
	"agent_end": "[Agent 结束]",
	"turn_start": "[回合开始]",
	"turn_end": "[回合结束]",
	"message_start": "[消息开始]",
	"message_update": "[消息更新]",
	"message_end": "[消息结束]",
	"tool_execution_start": "[工具开始]",
	"tool_execution_update": "[工具更新]",
	"tool_execution_end": "[工具结束]",
}

agent.subscribe((event) => {
	if (event.type !== 'message_update') {
		console.log(event.type, eventTypes[event.type]);
	}
	switch (event.type) {
		case "message_start":
			console.log(`${event.message.role}`, event.message.content);
			break;
		case "message_update": {
			// 百炼的模型，没有触发 message_update 事件，应该是没适配，我们可以使用内置模型 opencode 来测试
			const { assistantMessageEvent } = event;
			switch (assistantMessageEvent.type) {
				case "text_start":
					console.log('\n[文本开始]');
					break;
				case "text_delta":
					process.stdout.write(assistantMessageEvent.delta);
					break;
				case "text_end":
					console.log('\n[文本结束]');
					break;
				case "thinking_start":
					console.log("\n[思考开始]");
					break;
				case "thinking_delta":
					process.stdout.write(assistantMessageEvent.delta);
					break;
				case "thinking_end":
					console.log("\n[思考结束]");
					break;
				case "toolcall_start":
					console.log("\n[工具调用开始]");
					break;
				case "toolcall_end":
					console.log("\n[工具调用结束]", assistantMessageEvent.toolCall);
					break;
				case "done":
					console.log("\n[流完成]");
					break;
				case "error":
					console.error("\n[流错误]", assistantMessageEvent.error);
					break;
			}
			break;
		}
	}
});

// 检查 API Key
const apiKey = process.env.BAILIAN_API_KEY;

// 主函数：演示如何使用
async function main() {
	if (!apiKey) {
		console.error("错误: 请设置 BAILIAN_API_KEY 环境变量");
		console.error("获取 API Key: https://dashscope.aliyun.com/");
		process.exit(1);
	}

	console.log("使用模型:", defaultBailianModel.name);
	console.log("模型 ID:", defaultBailianModel.id);
	console.log("上下文窗口:", defaultBailianModel.contextWindow, "tokens");
	console.log("支持推理:", defaultBailianModel.reasoning);
	console.log("---");

	await example1();
	// await example11();
	// await example2();
	// await example3();
	// await example4();
	// await example5();
}

main().catch(console.error);

export {
	qwen35Plus,
	qwen3Max,
	qwen3CoderNext,
	qwen3CoderPlus,
	minimaxM25,
	glm5,
	glm47,
	kimiK25,
	defaultBailianModel,
	getBailianModel,
};


async function example1() {
	// 示例 1: 简单对话 - 使用 streamSimple 流式输出
	console.log("\n=== 示例 1: 简单对话（流式输出）===");
	await agent.prompt("你好！请介绍一下你自己。");
}


async function example11() {
	// 示例 1: 简单对话 - 使用 streamSimple 流式输出
	console.log("\n=== 示例 1: 简单对话（流式输出）===");

	// 使用 streamSimple 进行流式输出
	console.log("\n[测试] 使用 streamSimple 流式调用 API...");
	const context: Context = {
		systemPrompt: "You are a helpful assistant.",
		messages: [
			{ role: "user", content: "你好！请介绍一下你自己。", timestamp: Date.now() },
		],
	};

	try {
		const stream = streamSimple(defaultBailianModel, context, {
			apiKey,
			temperature: 0.7,
			maxTokens: 1024,
		});

		console.log("[流式输出开始]");

		// 遍历流式事件
		for await (const event of stream) {
			console.log(event.type);
			switch (event.type) {
				case "text_delta":
					process.stdout.write(event.delta);
					break;
				case "text_end":
					console.log("\n[文本结束]");
					break;
				case "thinking_start":
					console.log("\n[思考开始]");
					break;
				case "thinking_delta":
					process.stdout.write(event.delta);
					break;
				case "thinking_end":
					console.log("\n[思考结束]");
					break;
				case "toolcall_start":
					console.log("\n[工具调用开始]");
					break;
				case "toolcall_end":
					console.log("\n[工具调用结束]", event.toolCall);
					break;
				case "done":
					console.log("\n[流完成]");
					break;
				case "error":
					console.error("\n[流错误]", event.error);
					break;
			}
		}

		// 获取最终结果
		const response = await stream.result();
		console.log("\n[Token 使用]:", response.usage);
	} catch (error) {
		console.error("[测试] API 调用失败:", error);
	}

	// 再测试 Agent 方式
	console.log("\n[测试] 使用 Agent 方式调用...");
	await agent.prompt("你好！请介绍一下你自己。");
}


async function example2() {
	// 示例 2: 推理问题
	console.log("\n\n=== 示例 2: 推理问题 ===");
	await agent.prompt("解这个方程: 3x + 7 = 22");
}


async function example3() {
	console.log("\n\n=== 示例 3: 切换模型 (Kimi K2.5) ===");
	const kimiAgent = new Agent({
		initialState: {
			systemPrompt: "你是一个视觉助手。",
			model: kimiK25,
		},
	});

	kimiAgent.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			process.stdout.write(event.assistantMessageEvent.delta);
		}
	});

	await kimiAgent.prompt("描述一下你看到的图片（假设上传了一张风景照片）");

}


async function example4() {
	console.log("\n\n=== 示例 4: 手动调用 streamSimple ===");
	const context: Context = {
		systemPrompt: "你是一个专业的代码助手。",
		messages: [
			{ role: "user", content: "用 Python 写一个快速排序算法", timestamp: Date.now() },
		],
	};

	const stream = streamSimple(qwen3CoderPlus, context, {
		apiKey,
		temperature: 0.7,
		maxTokens: 2048,
	});

	for await (const event of stream) {
		switch (event.type) {
			case "text_delta":
				process.stdout.write(event.delta);
				break;
			case "text_end":
				console.log("\n[文本结束]");
				break;
			case "thinking_start":
				console.log("\n[思考开始]");
				break;
			case "thinking_delta":
				process.stdout.write(event.delta);
				break;
			case "thinking_end":
				console.log("\n[思考结束]");
				break;
			case "done":
				console.log("\n[流完成]");
				break;
			case "error":
				console.error("\n[流错误]", event.error);
				break;
		}
	}

	const response = await stream.result();
	console.log("\n--- Token 使用统计 ---");
	console.log(`输入: ${response.usage.input} tokens`);
	console.log(`输出: ${response.usage.output} tokens`);
	console.log(`总消耗: ${response.usage.totalTokens} tokens`);

}


async function example5() {
	console.log("\n\n=== 示例 5: 通过 ID 获取模型 ===");
	const model = getBailianModel("glm-5");
	if (model) {
		console.log("找到模型:", model.name);
		console.log("上下文窗口:", model.contextWindow);
	}
}
