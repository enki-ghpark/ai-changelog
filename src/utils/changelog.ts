import { Ollama } from '@langchain/ollama';
import type { ChangelogData, GeneratedChangelog, OllamaConfig } from '../types.js';

export class ChangelogGenerator {
  private llm: Ollama;

  constructor(config: OllamaConfig) {
    this.llm = new Ollama({
      baseUrl: config.baseUrl,
      model: config.model,
    });
  }

  /**
   * 변경사항 데이터를 텍스트로 포맷팅합니다
   */
  private formatChangelogData(data: ChangelogData): string {
    let formatted = `# 릴리즈 정보\n`;
    formatted += `- 현재 태그: ${data.currentTag}\n`;
    formatted += `- 이전 태그: ${data.previousTag || '없음'}\n`;
    formatted += `- 총 커밋 수: ${data.commits.length}\n`;
    formatted += `- 총 PR 수: ${data.prs.length}\n\n`;

    if (data.prs.length > 0) {
      formatted += `## Pull Requests\n`;
      for (const pr of data.prs) {
        formatted += `\n### PR #${pr.number}: ${pr.title}\n`;
        formatted += `- URL: ${pr.html_url}\n`;
        if (pr.labels.length > 0) {
          formatted += `- 라벨: ${pr.labels.map(l => l.name).join(', ')}\n`;
        }
        if (pr.body) {
          formatted += `- 설명:\n${pr.body.substring(0, 500)}\n`;
        }
      }
      formatted += `\n`;
    }

    formatted += `## 커밋 목록\n`;
    for (const commit of data.commits) {
      formatted += `\n- ${commit.sha.substring(0, 7)}: ${commit.commit.message.split('\n')[0]}\n`;
      formatted += `  작성자: ${commit.commit.author.name}\n`;
    }

    return formatted;
  }

  /**
   * LLM을 사용하여 CHANGELOG를 생성합니다
   */
  async generate(data: ChangelogData): Promise<string> {
    console.log('🤖 AI를 사용하여 CHANGELOG 생성 중...');

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
      console.log('✅ CHANGELOG 생성 완료');
      return response;
    } catch (error) {
      console.error('CHANGELOG 생성 실패', error);
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
      const firstLine = commit.commit.message.split('\n')[0];
      changelog += `- [${commit.sha.substring(0, 7)}](${commit.html_url}) ${firstLine}\n`;
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
      console.warn('⚠️  AI 생성 실패, 기본 CHANGELOG로 대체합니다', error);
      return this.generateFallback(data);
    }
  }
}

