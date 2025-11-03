import { Ollama } from "@langchain/ollama";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence, RunnableLambda } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { VectorStoreRetriever } from "@langchain/core/vectorstores";
import type {
  ChangelogData,
  EnhancedChangelogData,
  OllamaConfig,
  FileChange,
} from "../types.js";

export class ChangelogGenerator {
  private llm: Ollama;
  private enhancedPrompt: PromptTemplate;

  constructor(config: OllamaConfig) {
    this.llm = new Ollama({
      baseUrl: config.baseUrl,
      model: config.model,
    });

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
   * 영향 분석 결과 포맷팅
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
