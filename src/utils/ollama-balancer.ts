import { Ollama } from "@langchain/ollama";

/**
 * 여러 Ollama 서버 간 로드 밸런싱을 제공하는 클래스
 * Ollama를 상속받아 LangChain 체인과 호환됩니다
 */
export class OllamaLoadBalancer extends Ollama {
  private servers: Ollama[];
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
        new Ollama({
          baseUrl: url.trim(),
          model: model,
        })
    );

    console.log(`🔄 Ollama 로드 밸런서 초기화:`);
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
  private getNextServer(): { server: Ollama; index: number; url: string } {
    const index = this.currentIndex;
    const server = this.servers[index];
    const url = (server as any).baseUrl || "unknown";

    // 다음 인덱스로 이동 (순환)
    this.currentIndex = (this.currentIndex + 1) % this.servers.length;

    return { server, index, url };
  }

  /**
   * LLM 호출 (로드 밸런싱) - Ollama.invoke 오버라이드
   */
  override async invoke(input: any, options?: any): Promise<string> {
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
   * 임베딩 생성 (로드 밸런싱)
   */
  async embedQuery(text: string): Promise<number[]> {
    const maxRetries = this.servers.length;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { server, index, url } = this.getNextServer();

      try {
        console.log(
          `   🔹 임베딩 서버 [${index + 1}/${this.servers.length}]: ${url}`
        );

        const startTime = Date.now();
        const embedding = await (server as any).embedQuery(text);
        const elapsed = Date.now() - startTime;

        console.log(`   ✓ 임베딩 완료 (${elapsed}ms)`);

        return embedding;
      } catch (error) {
        lastError = error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`   ✗ 서버 [${index + 1}] 실패: ${errorMsg}`);

        if (attempt < maxRetries - 1) {
          console.log(`   → 다음 서버로 폴백...`);
        }
      }
    }

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
          await server.invoke("test", { timeout: 5000 } as any);
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
