import { ChatOllama } from "@langchain/ollama";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence, RunnableLambda } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { VectorStoreRetriever } from "@langchain/core/vectorstores";
import type {
  ChangelogData,
  EnhancedChangelogData,
  OllamaConfig,
  FileChange,
  AffectedFileCandidate,
} from "../types.js";
import { ChatOllamaLoadBalancer } from "./chat-ollama-balancer.js";
import type { CodeAnalysisTools } from "./tools.js";

export class ChangelogGenerator {
  private llm: ChatOllama | ChatOllamaLoadBalancer;
  private enhancedPrompt: PromptTemplate;

  constructor(config: OllamaConfig) {
    // 여러 서버가 설정되어 있으면 로드 밸런서 사용
    if (config.serverUrls && config.serverUrls.length > 1) {
      this.llm = new ChatOllamaLoadBalancer(config.serverUrls, config.model);
    } else {
      this.llm = new ChatOllama({
        baseUrl: config.baseUrl,
        model: config.model,
      });
    }

    // 향상된 CHANGELOG 프롬프트 템플릿
    this.enhancedPrompt =
      PromptTemplate.fromTemplate(`당신은 소프트웨어 릴리즈 노트를 작성하는 전문가입니다.
다음 릴리즈 정보를 바탕으로 사용자 친화적이고 명확한 CHANGELOG를 한국어로 작성해주세요.

**중요**: 
1. 파일 변경사항을 분석하여 실제로 무엇이 바뀌었는지 구체적으로 설명해주세요.
2. 영향 분석을 참고하여 이번 변경이 다른 부분에 미칠 수 있는 영향도 언급해주세요.
3. 단순히 커밋 메시지를 나열하는 것이 아니라, 코드 변경의 의미와 영향을 사용자 관점에서 설명해주세요.

변경사항을 다음 카테고리로 분류하세요:
- 🎉 새로운 기능 (Features): 새로 추가된 기능
- 🐛 버그 수정 (Bug Fixes): 수정된 버그
- ⚠️ Breaking Changes: 기존 사용자에게 영향을 줄 수 있는 변경사항
- 🔄 영향 범위: 이번 변경으로 영향받을 수 있는 다른 부분들
- 📝 기타 (Other): 문서 업데이트, 리팩토링, 테스트 등

릴리즈 정보:
{release_info}

파일 변경사항:
{file_changes}

영향 분석 (RAG 기반):
{impact_analysis}

다음 형식으로 CHANGELOG를 작성해주세요:

## 🎉 새로운 기능
- [항목이 있으면 여기에 나열]

## 🐛 버그 수정
- [항목이 있으면 여기에 나열]

## ⚠️ Breaking Changes
- [항목이 있으면 여기에 나열]

## 🔄 영향 범위
- [영향 분석에서 발견된 잠재적 영향이 있으면 사용자 관점에서 간결하게 요약]

## 📝 기타 변경사항
- [항목이 있으면 여기에 나열]

---
*이 CHANGELOG는 AI에 의해 자동 생성되었습니다.*`);
  }

  /**
   * 파일 변경사항을 포맷팅합니다
   */
  private formatFileChanges(fileChanges: FileChange[]): string {
    if (fileChanges.length === 0) return "";

    let formatted = `## 📁 파일 변경사항 (${fileChanges.length}개)\n\n`;

    // 상태별로 그룹화
    const grouped = {
      added: fileChanges.filter((f) => f.status === "added"),
      modified: fileChanges.filter((f) => f.status === "modified"),
      removed: fileChanges.filter((f) => f.status === "removed"),
      renamed: fileChanges.filter((f) => f.status === "renamed"),
    };

    if (grouped.added.length > 0) {
      formatted += `### ➕ 추가된 파일 (${grouped.added.length}개)\n`;
      for (const file of grouped.added.slice(0, 10)) {
        formatted += `- \`${file.filename}\` (+${file.additions}줄)\n`;
      }
      if (grouped.added.length > 10) {
        formatted += `  ... 그리고 ${grouped.added.length - 10}개 더\n`;
      }
      formatted += `\n`;
    }

    if (grouped.modified.length > 0) {
      formatted += `### ✏️ 수정된 파일 (${grouped.modified.length}개)\n`;
      for (const file of grouped.modified.slice(0, 10)) {
        formatted += `- \`${file.filename}\` (+${file.additions}/-${file.deletions}줄)\n`;
        // diff가 있으면 주요 변경사항 요약
        if (file.patch) {
          const lines = file.patch.split("\n").slice(0, 3);
          formatted += `  ${lines.join("\n  ")}\n`;
        }
      }
      if (grouped.modified.length > 10) {
        formatted += `  ... 그리고 ${grouped.modified.length - 10}개 더\n`;
      }
      formatted += `\n`;
    }

    if (grouped.removed.length > 0) {
      formatted += `### ❌ 삭제된 파일 (${grouped.removed.length}개)\n`;
      for (const file of grouped.removed.slice(0, 10)) {
        formatted += `- \`${file.filename}\`\n`;
      }
      if (grouped.removed.length > 10) {
        formatted += `  ... 그리고 ${grouped.removed.length - 10}개 더\n`;
      }
      formatted += `\n`;
    }

    if (grouped.renamed.length > 0) {
      formatted += `### 🔄 이름 변경된 파일 (${grouped.renamed.length}개)\n`;
      for (const file of grouped.renamed) {
        formatted += `- \`${file.previous_filename}\` → \`${file.filename}\`\n`;
      }
      formatted += `\n`;
    }

    return formatted;
  }

  /**
   * 변경사항 데이터를 텍스트로 포맷팅합니다
   */
  private formatChangelogData(data: ChangelogData): string {
    let formatted = `# 릴리즈 정보\n`;
    formatted += `- 현재 태그: ${data.currentTag}\n`;
    formatted += `- 이전 태그: ${data.previousTag || "없음"}\n`;
    formatted += `- 총 커밋 수: ${data.commits.length}\n`;
    formatted += `- 총 PR 수: ${data.prs.length}\n\n`;

    if (data.prs.length > 0) {
      formatted += `## Pull Requests\n`;
      for (const pr of data.prs) {
        formatted += `\n### PR #${pr.number}: ${pr.title}\n`;
        formatted += `- URL: ${pr.html_url}\n`;
        if (pr.labels.length > 0) {
          formatted += `- 라벨: ${pr.labels.map((l) => l.name).join(", ")}\n`;
        }
        if (pr.body) {
          formatted += `- 설명:\n${pr.body.substring(0, 500)}\n`;
        }
      }
      formatted += `\n`;
    }

    formatted += `## 커밋 목록\n`;
    for (const commit of data.commits) {
      formatted += `\n- ${commit.sha.substring(0, 7)}: ${
        commit.commit.message.split("\n")[0]
      }\n`;
      formatted += `  작성자: ${commit.commit.author.name}\n`;
    }

    return formatted;
  }

  /**
   * 식별자 추출 (기존 RAGService 로직 이동)
   */
  private extractIdentifiers(fileChange: FileChange): string[] {
    const identifiers: string[] = [];

    if (!fileChange.patch && !fileChange.content) {
      return identifiers;
    }

    const text = fileChange.patch || fileChange.content || "";

    const functionPatterns = [
      /(?:function|const|let|var|async)\s+(\w+)/g,
      /(\w+)\s*[=:]\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[{:]/g,
      /def\s+(\w+)/g,
      /func\s+(\w+)/g,
    ];

    const typePatterns = [
      /(?:class|interface|type|enum)\s+(\w+)/g,
      /(?:struct|trait)\s+(\w+)/g,
    ];

    const importPatterns = [
      /(?:import|export)\s+.*?\{\s*([^}]+)\s*\}/g,
      /(?:import|export)\s+(\w+)/g,
    ];

    [...functionPatterns, ...typePatterns, ...importPatterns].forEach(
      (pattern) => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const identifier = match[1];
          if (
            identifier &&
            identifier.length > 2 &&
            !identifiers.includes(identifier)
          ) {
            identifiers.push(identifier);
          }
        }
      }
    );

    return identifiers.slice(0, 20);
  }

  /**
   * 영향받는 파일 후보 포맷팅
   */
  private formatCandidates(candidates: AffectedFileCandidate[]): string {
    if (candidates.length === 0) {
      return "영향받을 가능성 있는 파일 없음";
    }

    let result = "RAG 분석 결과, 다음 파일들이 영향받을 가능성이 있습니다:\n\n";
    for (const candidate of candidates) {
      result += `- \`${candidate.filename}\`: ${candidate.reason}\n`;
    }
    result +=
      "\n**참고**: Tool을 사용하여 이 파일들을 직접 읽고 분석할 수 있습니다.";
    return result;
  }

  /**
   * 영향 분석 결과 포맷팅 (레거시 메서드, 기존 체인 호환성)
   */
  private formatImpactDocs(impactDocs: string[]): string {
    if (impactDocs.length === 0) {
      return "영향 분석 결과 없음";
    }

    let result = "다음 파일들이 이번 변경사항의 영향을 받을 수 있습니다:\n\n";
    for (const impact of impactDocs.slice(0, 10)) {
      result += `- ${impact}\n`;
    }
    result +=
      "\n**주의**: 위 파일들도 함께 검토하고 테스트하는 것을 권장합니다.";
    return result;
  }

  /**
   * LangChain bindTools를 사용한 영향 분석
   */
  private async analyzeImpactWithLangChainTools(
    candidates: AffectedFileCandidate[],
    fileChanges: FileChange[],
    llmWithTools: any,
    tools: any[]
  ): Promise<string> {
    console.log("🔧 LangChain Tool calling을 통한 상세 영향 분석 시작...");

    // 변경사항 요약
    const changesSummary = fileChanges
      .slice(0, 10)
      .map(
        (f) =>
          `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions}줄)`
      )
      .join("\n");

    // 후보 파일 목록
    const candidatesList = candidates
      .map((c) => `- ${c.filename}: ${c.reason}`)
      .join("\n");

    const analysisPrompt = `당신은 코드 변경사항의 영향을 분석하는 전문가입니다.

다음 파일들이 변경되었습니다:
${changesSummary}

RAG 분석 결과, 다음 파일들이 영향받을 가능성이 있습니다:
${candidatesList}

당신의 임무는 실제 코드를 읽고 분석하여 이 변경사항이 다른 파일들에 어떤 영향을 미치는지 파악하는 것입니다.

분석 절차:
1. 변경된 주요 파일들을 read_file tool로 읽어서 어떤 변경이 있는지 확인
2. 영향받을 가능성이 있는 후보 파일들도 read_file로 확인
3. 필요하다면 search_code로 특정 함수나 클래스 사용처 검색
4. 분석 결과를 구체적으로 요약

최종적으로 다음을 포함하여 답변하세요:
- 실제로 영향받는 파일들과 그 이유
- 잠재적 Breaking Changes가 있다면 명시
- 사용자가 주의해야 할 점

Tool을 적극적으로 사용하여 실제 코드를 확인하세요.`;

    try {
      // 초기 프롬프트 출력
      console.log("\n" + "=".repeat(80));
      console.log("📨 초기 분석 프롬프트:");
      console.log("=".repeat(80));
      console.log(analysisPrompt);
      console.log("=".repeat(80) + "\n");

      // Tool calling 루프
      const MAX_ITERATIONS = 40;
      let conversation: any[] = [];
      let finalAnalysis = "";

      conversation.push({
        role: "user",
        content: analysisPrompt,
      });

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        console.log(`\n${"=".repeat(80)}`);
        console.log(`🔄 [반복 ${iteration + 1}/${MAX_ITERATIONS}]`);
        console.log("=".repeat(80));

        console.log("\n💭 LLM에게 요청 중...");
        const response = await llmWithTools.invoke(conversation);

        // 응답 내용 출력
        const responseContent =
          typeof response === "string" ? response : response.content || "";

        if (responseContent) {
          console.log("\n🤖 LLM 응답 내용:");
          console.log("-".repeat(80));
          if (responseContent.length > 500) {
            console.log(responseContent.substring(0, 500) + "\n... (생략) ...");
          } else {
            console.log(responseContent);
          }
          console.log("-".repeat(80));
        }

        // Tool calls 확인
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`\n🔧 ${response.tool_calls.length}개의 Tool 호출 감지:`);

          // Tool 결과 수집
          const toolResults = [];

          for (const toolCall of response.tool_calls) {
            const argsStr = JSON.stringify(toolCall.args);
            const argsPreview =
              argsStr.length > 100
                ? argsStr.substring(0, 100) + "..."
                : argsStr;
            console.log(`\n   📞 Tool: ${toolCall.name}`);
            console.log(`      인자: ${argsPreview}`);

            // Tool 실행
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool) {
              try {
                const result = await tool.invoke(toolCall.args);

                // 결과 미리보기 출력
                const resultPreview =
                  result.length > 200
                    ? result.substring(0, 200) + "\n      ... (생략) ..."
                    : result;
                console.log(`      결과: ${resultPreview}`);

                toolResults.push({
                  role: "tool",
                  content: result,
                  tool_call_id: toolCall.id,
                });
              } catch (error) {
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                console.error(`      ✗ 실패: ${errorMsg}`);
                toolResults.push({
                  role: "tool",
                  content: `오류: ${errorMsg}`,
                  tool_call_id: toolCall.id,
                });
              }
            } else {
              console.warn(`      ⚠️  Tool을 찾을 수 없음: ${toolCall.name}`);
            }
          }

          // 대화에 응답과 tool 결과 추가
          conversation.push(response);
          conversation.push(...toolResults);

          console.log(`\n✅ Tool 실행 완료, 다음 반복으로 계속...`);
        } else {
          // Tool call이 없으면 최종 응답 또는 계속 진행
          if (responseContent && responseContent.trim().length > 0) {
            // 실제 내용이 있으면 최종 분석으로 간주
            console.log(`\n✅ Tool 호출이 없음 - 최종 분석 완료!`);
            finalAnalysis = responseContent;

            if (iteration === 0) {
              console.warn(
                "\n⚠️  주의: LLM이 첫 번째 반복에서 Tool을 사용하지 않았습니다."
              );
              console.warn(
                "   모델이 tool calling을 제대로 지원하는지 확인하세요."
              );
            }
            break;
          } else {
            // 내용이 없으면 계속 진행 (빈 응답 무시)
            console.log(
              `\n⚠️  Tool 호출도 없고 내용도 비어있음 - 계속 진행...`
            );
            // 빈 응답을 대화에 추가 (컨텍스트 유지)
            conversation.push(response);
            // 다시 요청하도록 프롬프트 추가
            conversation.push({
              role: "user",
              content:
                "분석을 계속해주세요. 필요한 파일을 read_file로 읽거나, 코드를 search_code로 검색하여 영향 분석을 완료해주세요.",
            });
          }
        }
      }

      if (!finalAnalysis && conversation.length > 1) {
        console.log(
          "\n⚠️  최종 분석을 생성하지 못했습니다. 마지막 응답을 사용합니다."
        );
        const lastResponse = conversation[conversation.length - 1];
        finalAnalysis =
          typeof lastResponse === "string"
            ? lastResponse
            : lastResponse.content || "영향 분석을 완료했습니다.";
      }

      if (!finalAnalysis) {
        finalAnalysis =
          "영향 분석을 완료했지만 최종 요약을 생성하지 못했습니다.";
      }

      console.log("\n" + "=".repeat(80));
      console.log("✅ 최종 영향 분석 결과:");
      console.log("=".repeat(80));
      console.log(finalAnalysis);
      console.log("=".repeat(80) + "\n");

      return finalAnalysis;
    } catch (error) {
      console.error("❌ 영향 분석 실패:", error);
      return `영향 분석 중 오류가 발생했습니다: ${error}`;
    }
  }

  /**
   * Tool calling을 통한 상세 영향 분석 (DEPRECATED - 수동 구현)
   */
  private async analyzeImpactWithTools(
    candidates: AffectedFileCandidate[],
    fileChanges: FileChange[],
    toolExecutor: any
  ): Promise<string> {
    console.log("🔧 Tool calling을 통한 상세 영향 분석 시작...");

    const tools = toolExecutor.getTools();

    // 변경사항 요약
    const changesSummary = fileChanges
      .slice(0, 10)
      .map(
        (f) =>
          `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions}줄)`
      )
      .join("\n");

    // 후보 파일 목록
    const candidatesList = candidates
      .map((c) => `- ${c.filename}: ${c.reason}`)
      .join("\n");

    const analysisPrompt = `당신은 코드 변경사항의 영향을 분석하는 전문가입니다.

다음 파일들이 변경되었습니다:
${changesSummary}

RAG 분석 결과, 다음 파일들이 영향받을 가능성이 있습니다:
${candidatesList}

**중요**: 반드시 제공된 Tool을 사용하여 파일을 직접 읽고 분석해야 합니다.

사용 가능한 Tool:
1. read_file - 파일 내용 읽기
2. search_code - 코드에서 패턴 검색
3. list_files - 디렉토리 목록 보기
4. get_file_info - 파일 정보 조회

Tool 호출 형식 (필수):
<tool_call>
{"name": "read_file", "arguments": {"path": "파일경로"}}
</tool_call>

예시:
<tool_call>
{"name": "read_file", "arguments": {"path": "packages/core/src/repository/base-repository.ts", "start_line": 1, "end_line": 50}}
</tool_call>

분석 절차:
1. 먼저 변경된 주요 파일들을 read_file로 읽어서 어떤 변경이 있는지 확인
2. 영향받을 가능성 있는 파일들도 read_file로 읽어서 실제 영향 확인
3. 필요하면 search_code로 특정 함수/클래스 사용처 검색
4. 모든 분석을 마친 후 결과를 한국어로 요약

분석 질문:
1. 실제로 영향을 받는 파일이 맞는가?
2. 어떤 부분이 어떻게 영향을 받는가?
3. 변경으로 인해 문제가 발생할 가능성이 있는가?
4. 주의해야 할 Breaking Change가 있는가?

**지금 바로 Tool을 사용하여 파일 읽기를 시작하세요. 추측하지 말고 실제 코드를 확인하세요.**

최종 결과 형식:

## 영향 분석 결과

### 영향받는 파일
- [파일명]: [영향 내용]

### 잠재적 문제점
- [문제점 설명]

### 권장사항
- [권장사항]`;

    try {
      console.log("\n" + "=".repeat(80));
      console.log("📨 초기 프롬프트:");
      console.log("=".repeat(80));
      console.log(analysisPrompt);
      console.log("=".repeat(80));

      let messages = [{ role: "user", content: analysisPrompt }];
      let iterationCount = 0;
      const MAX_ITERATIONS = 10; // 무한 루프 방지
      let finalResponse = "";

      while (iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        console.log(`\n${"=".repeat(80)}`);
        console.log(`🔄 [반복 ${iterationCount}/${MAX_ITERATIONS}]`);
        console.log("=".repeat(80));

        // Ollama에 요청 (tool calling 지원)
        console.log("\n💭 LLM에게 요청 중...");
        console.log(
          `   제공된 Tool: ${tools.map((t: any) => t.function.name).join(", ")}`
        );

        const response = await this.llm.invoke(
          messages as any,
          {
            tools: tools,
            tool_choice: "auto", // Ollama가 자동으로 tool 선택
          } as any
        );

        // 응답 파싱
        const responseText =
          typeof response === "string" ? response : String(response);

        console.log("\n🤖 LLM 응답:");
        console.log("-".repeat(80));
        // 응답 내용 출력 (너무 길면 잘라서)
        if (responseText.length > 500) {
          console.log(responseText.substring(0, 500) + "\n... (생략) ...");
        } else {
          console.log(responseText);
        }
        console.log("-".repeat(80));

        // Tool call이 있는지 확인
        // Ollama의 tool call 형식을 파싱 (여러 형식 지원)
        let toolCallMatch = responseText.match(
          /<tool_call>([\s\S]*?)<\/tool_call>/
        );

        // JSON 블록 형식도 시도
        if (!toolCallMatch) {
          toolCallMatch = responseText.match(
            /```json\s*(\{[\s\S]*?"name"[\s\S]*?\})\s*```/
          );
        }

        // 직접 JSON 형식도 시도
        if (!toolCallMatch) {
          toolCallMatch = responseText.match(
            /(\{"name":\s*"[^"]+",\s*"arguments"[\s\S]*?\})/
          );
        }

        if (!toolCallMatch) {
          // Tool call이 없으면 최종 응답으로 간주
          finalResponse = responseText;
          console.log(`\n✅ 분석 완료! (총 ${iterationCount}번 반복)`);

          // 하지만 Tool을 사용하지 않았다면 경고
          if (iterationCount === 1) {
            console.warn(
              `\n⚠️  주의: LLM이 Tool을 사용하지 않았습니다. 모델이 tool calling을 지원하는지 확인하세요.`
            );
            console.warn(
              `   현재 모델: ${(this.llm as any).model || "unknown"}`
            );
            console.warn(
              `   Tool calling 지원 모델: llama3.1:8b, llama3.2, qwen2.5, mistral 등`
            );
          }
          break;
        }

        // Tool call 실행
        try {
          const toolCallJson = JSON.parse(toolCallMatch[1].trim());
          const toolName = toolCallJson.name;
          const toolArgs =
            toolCallJson.arguments ||
            toolCallJson.parameters ||
            toolCallJson.args;

          console.log(`\n🔧 Tool 호출 감지:`);
          console.log(`   함수: ${toolName}`);
          console.log(`   인자: ${JSON.stringify(toolArgs, null, 2)}`);

          console.log(`\n⏳ Tool 실행 중...`);
          const toolResult = await toolExecutor.execute(toolName, toolArgs);

          console.log(`\n📋 Tool 실행 결과:`);
          console.log("-".repeat(80));
          // 결과가 너무 길면 처음과 끝만 보여주기
          if (toolResult.length > 1000) {
            const lines = toolResult.split("\n");
            if (lines.length > 20) {
              console.log(lines.slice(0, 10).join("\n"));
              console.log(`\n... (${lines.length - 20}줄 생략) ...\n`);
              console.log(lines.slice(-10).join("\n"));
            } else {
              console.log(toolResult.substring(0, 500));
              console.log(`\n... (${toolResult.length - 500}자 생략) ...`);
            }
          } else {
            console.log(toolResult);
          }
          console.log("-".repeat(80));

          // 대화에 tool 결과 추가
          messages.push({
            role: "assistant",
            content: responseText,
          } as any);
          messages.push({
            role: "tool",
            content: toolResult,
          } as any);

          console.log(`\n✓ Tool 실행 완료. LLM이 결과를 분석합니다...`);
        } catch (error) {
          console.warn(`\n⚠️  Tool 실행 실패:`, error);
          // Tool 실행 실패 시 에러 메시지를 포함하여 계속 진행
          messages.push({
            role: "assistant",
            content: responseText,
          } as any);
          messages.push({
            role: "tool",
            content: `Tool 실행 실패: ${error}`,
          } as any);
        }
      }

      if (iterationCount >= MAX_ITERATIONS) {
        console.warn(`  ⚠️  최대 반복 횟수 도달`);
        finalResponse =
          "영향 분석 중 최대 반복 횟수에 도달했습니다. 부분 결과를 사용합니다.";
      }

      return finalResponse || "영향 분석을 완료할 수 없습니다.";
    } catch (error) {
      console.error("❌ Tool calling 영향 분석 실패:", error);
      return "영향 분석 중 오류가 발생했습니다.";
    }
  }

  /**
   * RAG-LLM 통합 체인을 생성합니다
   */
  private async createEnhancedChain(
    data: EnhancedChangelogData,
    retriever: VectorStoreRetriever
  ) {
    // 1. 식별자 추출 함수
    const extractIdentifiersStep = RunnableLambda.from(
      async (input: EnhancedChangelogData) => {
        console.log("🔍 변경된 파일에서 식별자 추출 중...");
        const identifiers: string[] = [];

        const topFiles = input.fileChanges
          .filter((f) => f.content || f.patch)
          .sort((a, b) => b.changes - a.changes)
          .slice(0, 10);

        for (const file of topFiles) {
          const fileIdentifiers = this.extractIdentifiers(file);
          identifiers.push(...fileIdentifiers.slice(0, 5));
        }

        console.log(`   발견된 식별자: ${identifiers.length}개`);
        return { data: input, identifiers };
      }
    );

    // 2. RAG 검색 함수
    const ragSearchStep = RunnableLambda.from(
      async (input: { data: EnhancedChangelogData; identifiers: string[] }) => {
        console.log("🔎 RAG 검색 중...");
        const impactDocs: string[] = [];
        const affectedFiles = new Set<string>();

        for (const identifier of input.identifiers) {
          try {
            const docs = await retriever.invoke(identifier);

            for (const doc of docs) {
              const foundFile = doc.metadata.filename;
              const sourceFiles = input.data.fileChanges.map((f) => f.filename);

              // 변경된 파일 자체는 제외
              if (
                foundFile &&
                !sourceFiles.includes(foundFile) &&
                !affectedFiles.has(foundFile)
              ) {
                affectedFiles.add(foundFile);

                const impact = `**${identifier}** → \`${foundFile}\`에서 사용됨`;
                impactDocs.push(impact);

                if (impactDocs.length >= 15) break;
              }
            }
            if (impactDocs.length >= 15) break;
          } catch (error) {
            console.warn(`  ⚠️  ${identifier} 검색 실패:`, error);
          }
        }

        console.log(`   발견된 영향: ${affectedFiles.size}개 파일`);
        return { data: input.data, impactDocs };
      }
    );

    // 3. 프롬프트 입력 준비
    const preparePromptStep = RunnableLambda.from(
      (input: { data: EnhancedChangelogData; impactDocs: string[] }) => {
        console.log("📝 프롬프트 준비 중...");

        return {
          release_info: this.formatChangelogData(input.data),
          file_changes: this.formatFileChanges(input.data.fileChanges),
          impact_analysis: this.formatImpactDocs(input.impactDocs),
        };
      }
    );

    // 4. 전체 체인 구성
    return RunnableSequence.from([
      extractIdentifiersStep,
      ragSearchStep,
      preparePromptStep,
      this.enhancedPrompt,
      this.llm,
      new StringOutputParser(),
    ]);
  }

  /**
   * 향상된 CHANGELOG 생성 (파일 변경 및 RAG 컨텍스트 포함)
   * @deprecated 기존 RAG 기반 메서드 (Tool calling 버전 사용 권장)
   */
  async generateEnhanced(
    data: EnhancedChangelogData,
    retriever: VectorStoreRetriever
  ): Promise<string> {
    console.log("🤖 RAG-LLM 체인 실행 중...");

    const chain = await this.createEnhancedChain(data, retriever);
    const result = await chain.invoke(data);

    console.log("✅ CHANGELOG 생성 완료");
    return result;
  }

  /**
   * Tool calling 기반 향상된 CHANGELOG 생성
   */
  async generateWithTools(
    data: EnhancedChangelogData,
    candidates: AffectedFileCandidate[],
    codeAnalysisTools: CodeAnalysisTools
  ): Promise<string> {
    console.log("🤖 Tool calling 기반 CHANGELOG 생성 시작...");

    // 1. Tool binding
    const tools = codeAnalysisTools.getTools();
    const llmWithTools = this.llm.bindTools(tools);

    console.log(`🔧 ${tools.length}개의 Tool 바인딩 완료`);

    // 2. Tool calling으로 상세 영향 분석 수행
    let impactAnalysis = "";
    if (candidates.length > 0) {
      impactAnalysis = await this.analyzeImpactWithLangChainTools(
        candidates,
        data.fileChanges,
        llmWithTools,
        tools
      );
    } else {
      impactAnalysis = "영향받는 파일 후보가 없습니다.";
    }

    // 3. CHANGELOG 생성 프롬프트 준비
    const releaseInfo = this.formatChangelogData(data);
    const fileChanges = this.formatFileChanges(data.fileChanges);

    const changelogPrompt = `당신은 소프트웨어 릴리즈 노트를 작성하는 전문가입니다.
다음 릴리즈 정보를 바탕으로 사용자 친화적이고 명확한 CHANGELOG를 한국어로 작성해주세요.

**중요**: 
1. 파일 변경사항을 분석하여 실제로 무엇이 바뀌었는지 구체적으로 설명해주세요.
2. 상세 영향 분석을 참고하여 이번 변경이 다른 부분에 미칠 수 있는 영향도 언급해주세요.
3. 단순히 커밋 메시지를 나열하는 것이 아니라, 코드 변경의 의미와 영향을 사용자 관점에서 설명해주세요.

변경사항을 다음 카테고리로 분류하세요:
- 🎉 새로운 기능 (Features): 새로 추가된 기능
- 🐛 버그 수정 (Bug Fixes): 수정된 버그
- ⚠️ Breaking Changes: 기존 사용자에게 영향을 줄 수 있는 변경사항
- 🔄 영향 범위: 이번 변경으로 영향받을 수 있는 다른 부분들
- 📝 기타 (Other): 문서 업데이트, 리팩토링, 테스트 등

릴리즈 정보:
${releaseInfo}

파일 변경사항:
${fileChanges}

상세 영향 분석 (Tool 기반):
${impactAnalysis}

다음 형식으로 CHANGELOG를 작성해주세요:

## 🎉 새로운 기능
- [항목이 있으면 여기에 나열]

## 🐛 버그 수정
- [항목이 있으면 여기에 나열]

## ⚠️ Breaking Changes
- [항목이 있으면 여기에 나열]

## 🔄 영향 범위
- [영향 분석에서 발견된 잠재적 영향이 있으면 사용자 관점에서 간결하게 요약]

## 📝 기타 변경사항
- [항목이 있으면 여기에 나열]

---
*이 CHANGELOG는 AI에 의해 자동 생성되었습니다 (RAG + Tool Calling).*`;

    // 4. LLM으로 CHANGELOG 생성
    try {
      const response = await this.llm.invoke(changelogPrompt);
      console.log("✅ CHANGELOG 생성 완료");

      // AIMessage에서 content 추출
      const changelog =
        typeof response === "string"
          ? response
          : (response as any).content || String(response);

      return changelog;
    } catch (error) {
      console.error("❌ CHANGELOG 생성 실패:", error);
      throw error;
    }
  }

  /**
   * LLM을 사용하여 CHANGELOG를 생성합니다 (기본 버전)
   */
  async generate(data: ChangelogData): Promise<string> {
    console.log("🤖 AI를 사용하여 CHANGELOG 생성 중...");

    const formattedData = this.formatChangelogData(data);

    const prompt = `당신은 소프트웨어 릴리즈 노트를 작성하는 전문가입니다. 
다음 릴리즈 정보를 바탕으로 사용자 친화적이고 명확한 CHANGELOG를 한국어로 작성해주세요.

변경사항을 다음 카테고리로 분류하세요:
- 🎉 새로운 기능 (Features): 새로 추가된 기능
- 🐛 버그 수정 (Bug Fixes): 수정된 버그
- ⚠️ Breaking Changes: 기존 사용자에게 영향을 줄 수 있는 변경사항
- 📝 기타 (Other): 문서 업데이트, 리팩토링, 테스트 등

각 항목은 간결하고 명확하게 작성하며, 사용자가 이해하기 쉽게 설명해주세요.
기술적인 세부사항보다는 사용자 입장에서의 변화를 중심으로 작성해주세요.

릴리즈 정보:
${formattedData}

다음 형식으로 CHANGELOG를 작성해주세요:

## 🎉 새로운 기능
- [항목이 있으면 여기에 나열]

## 🐛 버그 수정
- [항목이 있으면 여기에 나열]

## ⚠️ Breaking Changes
- [항목이 있으면 여기에 나열]

## 📝 기타 변경사항
- [항목이 있으면 여기에 나열]

---
*이 CHANGELOG는 AI에 의해 자동 생성되었습니다.*`;

    try {
      const response = await this.llm.invoke(prompt);
      console.log("✅ CHANGELOG 생성 완료");
      return response;
    } catch (error) {
      console.error("CHANGELOG 생성 실패", error);
      throw new Error(`CHANGELOG 생성 중 오류 발생: ${error}`);
    }
  }

  /**
   * 간단한 폴백 CHANGELOG를 생성합니다 (LLM 실패 시)
   */
  generateFallback(data: ChangelogData): string {
    let changelog = `## 📋 변경사항\n\n`;
    changelog += `이 릴리즈는 ${data.commits.length}개의 커밋을 포함합니다.\n\n`;

    if (data.prs.length > 0) {
      changelog += `### Pull Requests\n\n`;
      for (const pr of data.prs) {
        changelog += `- [#${pr.number}](${pr.html_url}) ${pr.title}\n`;
      }
      changelog += `\n`;
    }

    changelog += `### 커밋 목록\n\n`;
    for (const commit of data.commits.slice(0, 20)) {
      const firstLine = commit.commit.message.split("\n")[0];
      changelog += `- [${commit.sha.substring(0, 7)}](${
        commit.html_url
      }) ${firstLine}\n`;
    }

    if (data.commits.length > 20) {
      changelog += `\n... 그리고 ${data.commits.length - 20}개의 추가 커밋\n`;
    }

    changelog += `\n---\n*자동 생성된 CHANGELOG*\n`;

    return changelog;
  }

  /**
   * CHANGELOG를 생성하고, 실패 시 폴백을 사용합니다
   */
  async generateWithFallback(data: ChangelogData): Promise<string> {
    try {
      return await this.generate(data);
    } catch (error) {
      console.warn("⚠️  AI 생성 실패, 기본 CHANGELOG로 대체합니다", error);
      return this.generateFallback(data);
    }
  }
}
