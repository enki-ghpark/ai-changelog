import { ChatOllama } from "@langchain/ollama";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * 여러 Ollama 서버 간 로드 밸런싱을 제공하는 ChatOllama 클래스
 * ChatOllama를 상속받아 bindTools() 등 모든 기능을 지원합니다
 */
export class ChatOllamaLoadBalancer extends ChatOllama {
  private servers: ChatOllama[];
  private currentIndex: number = 0;

  constructor(serverUrls: string[], model: string) {
    if (serverUrls.length === 0) {
      throw new Error("최소 하나 이상의 Ollama 서버 URL이 필요합니다");
    }

    // 첫 번째 서버로 부모 클래스 초기화
    super({
      baseUrl: serverUrls[0],
      model: model,
    });

    this.servers = serverUrls.map(
      (url) =>
        new ChatOllama({
          baseUrl: url.trim(),
          model: model,
        })
    );

    console.log(`🔄 ChatOllama 로드 밸런서 초기화:`);
    console.log(`   서버 수: ${this.servers.length}`);
    serverUrls.forEach((url, idx) => {
      console.log(`   [${idx + 1}] ${url}`);
    });
    console.log(`   모델: ${model}`);
    console.log(`   스케줄링: 라운드 로빈\n`);
  }

  /**
   * 다음 서버를 라운드 로빈 방식으로 선택
   */
  private getNextServer(): { server: ChatOllama; index: number; url: string } {
    const index = this.currentIndex;
    const server = this.servers[index];
    const url = (server as any).baseUrl || "unknown";

    // 다음 인덱스로 이동 (순환)
    this.currentIndex = (this.currentIndex + 1) % this.servers.length;

    return { server, index, url };
  }

  /**
   * LLM 호출 (로드 밸런싱) - ChatOllama._generate 오버라이드
   * bindTools()와 함께 사용될 때 자동으로 호출됩니다
   */
  override async invoke(
    input: BaseMessage[] | string,
    options?: any
  ): Promise<any> {
    const maxRetries = this.servers.length; // 모든 서버를 한 번씩 시도
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { server, index, url } = this.getNextServer();

      try {
        console.log(
          `   🔹 서버 [${index + 1}/${this.servers.length}] 사용: ${url}`
        );

        const startTime = Date.now();
        const response = await server.invoke(input, options);
        const elapsed = Date.now() - startTime;

        console.log(`   ✓ 응답 완료 (${elapsed}ms)`);

        return response;
      } catch (error) {
        lastError = error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `   ✗ 서버 [${index + 1}] 실패: ${errorMsg.substring(0, 100)}`
        );

        // 마지막 시도가 아니면 다음 서버로
        if (attempt < maxRetries - 1) {
          console.log(`   → 다음 서버로 폴백...`);
        }
      }
    }

    // 모든 서버 실패
    console.error(`❌ 모든 Ollama 서버 실패 (${maxRetries}개 시도)`);
    throw lastError;
  }

  /**
   * 서버 상태 확인
   */
  async healthCheck(): Promise<
    Array<{ url: string; healthy: boolean; error?: string }>
  > {
    console.log("\n🏥 서버 헬스 체크 중...");

    const results = await Promise.all(
      this.servers.map(async (server, index) => {
        const url = (server as any).baseUrl || "unknown";

        try {
          // 간단한 테스트 요청
          await server.invoke("test");
          console.log(`   ✓ 서버 [${index + 1}] ${url}: 정상`);
          return { url, healthy: true };
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.warn(`   ✗ 서버 [${index + 1}] ${url}: 오류 - ${errorMsg}`);
          return { url, healthy: false, error: errorMsg };
        }
      })
    );

    const healthyCount = results.filter((r) => r.healthy).length;
    console.log(
      `\n헬스 체크 완료: ${healthyCount}/${this.servers.length} 서버 정상\n`
    );

    return results;
  }

  /**
   * 서버 통계
   */
  getStats() {
    return {
      totalServers: this.servers.length,
      currentIndex: this.currentIndex,
      model: this.model,
    };
  }
}

