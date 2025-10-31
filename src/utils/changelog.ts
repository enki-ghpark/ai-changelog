import { Ollama } from "@langchain/ollama";
import type {
  ChangelogData,
  EnhancedChangelogData,
  GeneratedChangelog,
  OllamaConfig,
  FileChange,
} from "../types.js";

export class ChangelogGenerator {
  private llm: Ollama;

  constructor(config: OllamaConfig) {
    this.llm = new Ollama({
      baseUrl: config.baseUrl,
      model: config.model,
    });
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
   * 향상된 CHANGELOG 생성 (파일 변경 및 RAG 컨텍스트 포함)
   */
  async generateEnhanced(data: EnhancedChangelogData): Promise<string> {
    console.log("🤖 AI를 사용하여 향상된 CHANGELOG 생성 중...");

    const formattedData = this.formatChangelogData(data);
    const formattedFiles = this.formatFileChanges(data.fileChanges);

    // 영향 분석 포맷팅
    console.log(`📊 RAG 컨텍스트: ${data.codeContext.length}개 항목`);

    let impactAnalysis = "";
    if (data.codeContext.length > 0) {
      impactAnalysis = `\n## 🔍 영향 분석 (RAG 기반)\n\n`;
      impactAnalysis += `다음 파일들이 이번 변경사항의 영향을 받을 수 있습니다:\n\n`;
      for (const impact of data.codeContext.slice(0, 10)) {
        impactAnalysis += `${impact}\n\n`;
      }
      impactAnalysis += `\n**주의**: 위 파일들도 함께 검토하고 테스트하는 것을 권장합니다.\n`;

      console.log(
        `📝 영향 분석 프롬프트 생성 완료 (${impactAnalysis.length}자)`
      );
    } else {
      console.log(
        "⚠️  RAG 컨텍스트가 비어있습니다. 영향 분석 없이 진행합니다."
      );
    }

    const prompt = `당신은 소프트웨어 릴리즈 노트를 작성하는 전문가입니다. 
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

각 항목은 간결하고 명확하게 작성하며, 사용자가 이해하기 쉽게 설명해주세요.
기술적인 세부사항보다는 사용자 입장에서의 변화를 중심으로 작성해주세요.

릴리즈 정보:
${formattedData}

${formattedFiles}

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
- [예: "이 변경으로 인해 X 기능을 사용하는 코드도 영향을 받을 수 있습니다"]

## 📝 기타 변경사항
- [항목이 있으면 여기에 나열]

---
*이 CHANGELOG는 AI에 의해 자동 생성되었습니다.*`;

    // 디버깅: 프롬프트 길이 출력
    console.log(`📤 LLM에 전달하는 프롬프트 길이: ${prompt.length}자`);
    if (data.codeContext.length > 0) {
      console.log(`   → 영향 분석 포함: ${data.codeContext.length}개 항목`);
    }

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
   * LLM을 사용하여 CHANGELOG를 생성합니다 (기본 버전)
   */
  async generate(data: ChangelogData): Promise<string> {
    // EnhancedChangelogData가 아닌 경우 기본 생성기 사용
    if ("fileChanges" in data && "codeContext" in data) {
      return this.generateEnhanced(data as EnhancedChangelogData);
    }

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
