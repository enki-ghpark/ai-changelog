/**
 * LangChain Tool Calling 테스트
 * Ollama 모델이 tool을 제대로 호출하는지 테스트
 */

import { ChatOllama } from "@langchain/ollama";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 환경변수 로드
import dotenv from "dotenv";
dotenv.config();

// 간단한 계산기 tool
const calculatorTool = tool(
  async ({ operation, a, b }) => {
    console.log(`\n🔧 Calculator Tool 실행: ${operation}(${a}, ${b})`);

    switch (operation) {
      case "add":
        return `${a} + ${b} = ${a + b}`;
      case "subtract":
        return `${a} - ${b} = ${a - b}`;
      case "multiply":
        return `${a} × ${b} = ${a * b}`;
      case "divide":
        return b !== 0 ? `${a} ÷ ${b} = ${a / b}` : "Error: Division by zero";
      default:
        return "Unknown operation";
    }
  },
  {
    name: "calculator",
    description:
      "수학 계산을 수행합니다. 덧셈, 뺄셈, 곱셈, 나눗셈을 지원합니다.",
    schema: z.object({
      operation: z
        .enum(["add", "subtract", "multiply", "divide"])
        .describe("수행할 연산"),
      a: z.number().describe("첫 번째 숫자"),
      b: z.number().describe("두 번째 숫자"),
    }),
  }
);

// 텍스트 길이 측정 tool
const textLengthTool = tool(
  async ({ text }) => {
    console.log(`\n🔧 Text Length Tool 실행`);
    return `텍스트 "${text}"의 길이는 ${text.length}자입니다.`;
  },
  {
    name: "text_length",
    description: "주어진 텍스트의 길이를 계산합니다.",
    schema: z.object({
      text: z.string().describe("길이를 측정할 텍스트"),
    }),
  }
);

async function testToolCalling() {
  console.log("🚀 LangChain Tool Calling 테스트 시작\n");

  const ollamaUrl =
    process.env.OLLAMA_SERVERS?.split(",")[0] ||
    process.env.OLLAMA_BASE_URL ||
    "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.1:latest";

  console.log(`🤖 Ollama 서버: ${ollamaUrl}`);
  console.log(`🧠 모델: ${model}\n`);

  // LLM 초기화 (ChatOllama 사용 - bindTools 지원)
  const llm = new ChatOllama({
    baseUrl: ollamaUrl,
    model: model,
  });

  // Tool 바인딩
  const tools = [calculatorTool, textLengthTool];
  const llmWithTools = llm.bindTools(tools);

  console.log("✅ Tool 바인딩 완료\n");
  console.log("사용 가능한 Tool:");
  tools.forEach((tool) => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });

  // 테스트 케이스 1: 계산기
  console.log("\n" + "=".repeat(80));
  console.log("📝 테스트 1: 계산 요청");
  console.log("=".repeat(80));

  const testPrompt1 =
    "25 곱하기 4는 얼마야? calculator tool을 사용해서 계산해줘.";
  console.log(`프롬프트: ${testPrompt1}\n`);

  try {
    console.log("💭 LLM 호출 중...\n");
    const response1 = await llmWithTools.invoke(testPrompt1);

    console.log("🤖 LLM 응답:");
    console.log(JSON.stringify(response1, null, 2));

    // Tool calls 확인
    if (response1.tool_calls && response1.tool_calls.length > 0) {
      console.log("\n✅ Tool Call 감지됨!");
      for (const toolCall of response1.tool_calls) {
        console.log(`\nTool: ${toolCall.name}`);
        console.log(`Args: ${JSON.stringify(toolCall.args)}`);

        // Tool 실행
        const tool = tools.find((t) => t.name === toolCall.name);
        if (tool) {
          const result = await tool.invoke(toolCall.args);
          console.log(`결과: ${result}`);
        }
      }
    } else {
      console.log("\n⚠️  Tool Call이 없습니다.");
      console.log("모델이 tool을 호출하지 않고 직접 답변했을 수 있습니다.");
    }
  } catch (error) {
    console.error("\n❌ 에러 발생:", error);
  }

  // 테스트 케이스 2: 텍스트 길이
  console.log("\n" + "=".repeat(80));
  console.log("📝 테스트 2: 텍스트 길이 측정");
  console.log("=".repeat(80));

  const testPrompt2 = '"Hello, World!"의 길이를 text_length tool로 측정해줘.';
  console.log(`프롬프트: ${testPrompt2}\n`);

  try {
    console.log("💭 LLM 호출 중...\n");
    const response2 = await llmWithTools.invoke(testPrompt2);

    console.log("🤖 LLM 응답:");
    console.log(JSON.stringify(response2, null, 2));

    if (response2.tool_calls && response2.tool_calls.length > 0) {
      console.log("\n✅ Tool Call 감지됨!");
      for (const toolCall of response2.tool_calls) {
        console.log(`\nTool: ${toolCall.name}`);
        console.log(`Args: ${JSON.stringify(toolCall.args)}`);

        const tool = tools.find((t) => t.name === toolCall.name);
        if (tool) {
          const result = await tool.invoke(toolCall.args);
          console.log(`결과: ${result}`);
        }
      }
    } else {
      console.log("\n⚠️  Tool Call이 없습니다.");
    }
  } catch (error) {
    console.error("\n❌ 에러 발생:", error);
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ 테스트 완료");
  console.log("=".repeat(80));
}

// 실행
testToolCalling().catch(console.error);
