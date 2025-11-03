import { OllamaEmbeddings } from "@langchain/ollama";

/**
 * 여러 Ollama 서버 간 임베딩 로드 밸런싱을 제공하는 클래스
 * OllamaEmbeddings를 상속받아 LangChain과 호환됩니다
 */
export class OllamaEmbeddingsBalancer extends OllamaEmbeddings {
  private servers: OllamaEmbeddings[];
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
        new OllamaEmbeddings({
          baseUrl: url.trim(),
          model: model,
        })
    );

    console.log(`🔄 임베딩 로드 밸런서 초기화:`);
    console.log(`   서버 수: ${this.servers.length}`);
    serverUrls.forEach((url, idx) => {
      console.log(`   [${idx + 1}] ${url}`);
    });
    console.log(`   임베딩 모델: ${model}`);
    console.log(`   스케줄링: 라운드 로빈\n`);
  }

  /**
   * 다음 서버를 라운드 로빈 방식으로 선택
   */
  private getNextServer(): {
    server: OllamaEmbeddings;
    index: number;
    url: string;
  } {
    const index = this.currentIndex;
    const server = this.servers[index];
    const url = (server as any).baseUrl || "unknown";

    // 다음 인덱스로 이동 (순환)
    this.currentIndex = (this.currentIndex + 1) % this.servers.length;

    return { server, index, url };
  }

  /**
   * 단일 텍스트 임베딩 (로드 밸런싱)
   */
  override async embedQuery(text: string): Promise<number[]> {
    const maxRetries = this.servers.length;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { server, index, url } = this.getNextServer();

      try {
        const startTime = Date.now();
        const embedding = await server.embedQuery(text);
        const elapsed = Date.now() - startTime;

        console.log(
          `      ✓ 임베딩 완료 [서버 ${index + 1}] (${elapsed}ms)`
        );

        return embedding;
      } catch (error) {
        lastError = error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `      ✗ 서버 [${index + 1}] 실패: ${errorMsg.substring(0, 50)}`
        );

        if (attempt < maxRetries - 1) {
          console.log(`      → 다음 서버로 폴백...`);
        }
      }
    }

    throw lastError;
  }

  /**
   * 여러 텍스트 배치 임베딩 (로드 밸런싱)
   * 배치 전체를 하나의 서버에 요청
   */
  override async embedDocuments(texts: string[]): Promise<number[][]> {
    const maxRetries = this.servers.length;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { server, index, url } = this.getNextServer();

      try {
        console.log(
          `      🔹 배치 임베딩 [서버 ${index + 1}/${this.servers.length}]: ${texts.length}개 문서`
        );

        const startTime = Date.now();
        const embeddings = await server.embedDocuments(texts);
        const elapsed = Date.now() - startTime;

        console.log(
          `      ✓ 배치 완료 [서버 ${index + 1}] (${elapsed}ms, ${(elapsed / texts.length).toFixed(0)}ms/문서)`
        );

        return embeddings;
      } catch (error) {
        lastError = error;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `      ✗ 서버 [${index + 1}] 실패: ${errorMsg.substring(0, 50)}`
        );

        if (attempt < maxRetries - 1) {
          console.log(`      → 다음 서버로 폴백...`);
        }
      }
    }

    console.error(`❌ 모든 임베딩 서버 실패 (${maxRetries}개 시도)`);
    throw lastError;
  }

  /**
   * 서버 통계
   */
  getStats() {
    return {
      totalServers: this.servers.length,
      currentIndex: this.currentIndex,
      model: (this as any).model,
    };
  }
}

