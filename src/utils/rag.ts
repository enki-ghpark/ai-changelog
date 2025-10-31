import { OllamaEmbeddings } from "@langchain/ollama";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import type { RAGConfig, FileChange } from "../types.js";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface CachedEmbedding {
  hash: string;
  modelName: string;
  documents: Array<{
    pageContent: string;
    metadata: Record<string, any>;
  }>;
  embeddings: number[][]; // 임베딩 벡터 배열
}

export class RAGService {
  private embeddings: OllamaEmbeddings;
  private vectorStore: MemoryVectorStore | null = null;
  private textSplitter: RecursiveCharacterTextSplitter;
  private config: RAGConfig;
  private cacheDir: string;

  constructor(config: RAGConfig) {
    this.config = config;

    // 캐시 디렉토리 설정
    this.cacheDir = join(process.cwd(), ".cache", "embeddings");
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    // Ollama 임베딩 모델 초기화
    this.embeddings = new OllamaEmbeddings({
      baseUrl: config.ollamaBaseUrl,
      model: config.embeddingModel,
    });

    // 텍스트 스플리터 초기화
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: ["\n\n", "\n", " ", ""],
    });
  }

  /**
   * 파일 내용의 해시를 계산합니다
   */
  private calculateHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * 캐시 파일 경로를 생성합니다
   */
  private getCachePath(hash: string): string {
    return join(this.cacheDir, `${hash}.json`);
  }

  /**
   * 캐시에서 문서와 임베딩을 로드합니다
   */
  private loadFromCache(
    hash: string
  ): { documents: Document[]; embeddings: number[][] } | null {
    try {
      const cachePath = this.getCachePath(hash);
      if (!existsSync(cachePath)) {
        return null;
      }

      const cached: CachedEmbedding = JSON.parse(
        readFileSync(cachePath, "utf-8")
      );

      // 모델명이 다르면 캐시 무효화
      if (cached.modelName !== this.config.embeddingModel) {
        return null;
      }

      const documents = cached.documents.map(
        (doc) =>
          new Document({ pageContent: doc.pageContent, metadata: doc.metadata })
      );

      return {
        documents,
        embeddings: cached.embeddings,
      };
    } catch (error) {
      console.warn(`캐시 로드 실패:`, error);
      return null;
    }
  }

  /**
   * 문서와 임베딩을 캐시에 저장합니다
   */
  private saveToCache(
    hash: string,
    documents: Document[],
    embeddings: number[][]
  ): void {
    try {
      const cachePath = this.getCachePath(hash);
      const cache: CachedEmbedding = {
        hash,
        modelName: this.config.embeddingModel,
        documents: documents.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        })),
        embeddings,
      };

      writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
    } catch (error) {
      console.warn(`캐시 저장 실패:`, error);
    }
  }

  /**
   * 파일 변경사항을 문서와 임베딩으로 변환합니다 (캐싱 활용)
   */
  private async createDocumentsWithEmbeddings(
    fileChanges: FileChange[]
  ): Promise<{
    documents: Document[];
    embeddings: number[][];
    cacheHits: number;
    cacheMisses: number;
  }> {
    const allDocuments: Document[] = [];
    const allEmbeddings: number[][] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // 캐시되지 않은 파일들을 모아서 배치로 처리
    const uncachedDocuments: Document[] = [];
    const uncachedFileHashes: string[] = [];

    for (const file of fileChanges) {
      if (!file.content) continue;

      try {
        const contentHash = this.calculateHash(file.content);
        const cached = this.loadFromCache(contentHash);

        if (cached) {
          // 캐시 히트: 메타데이터 업데이트하고 바로 추가
          for (let i = 0; i < cached.documents.length; i++) {
            const doc = cached.documents[i];
            doc.metadata = {
              ...doc.metadata,
              filename: file.filename,
              status: file.status,
              additions: file.additions.toString(),
              deletions: file.deletions.toString(),
              changes: file.changes.toString(),
            };
            allDocuments.push(doc);
            allEmbeddings.push(cached.embeddings[i]);
          }
          cacheHits++;
        } else {
          // 캐시 미스: 나중에 배치로 처리하기 위해 모아둠
          const chunks = await this.textSplitter.createDocuments(
            [file.content],
            [
              {
                filename: file.filename,
                status: file.status,
                additions: file.additions.toString(),
                deletions: file.deletions.toString(),
                changes: file.changes.toString(),
              },
            ]
          );

          if (file.patch) {
            const patchDoc = new Document({
              pageContent: `파일: ${file.filename}\n변경 타입: ${file.status}\n\nDiff:\n${file.patch}`,
              metadata: {
                filename: file.filename,
                type: "diff",
                status: file.status,
              },
            });
            chunks.push(patchDoc);
          }

          uncachedDocuments.push(...chunks);
          uncachedFileHashes.push(contentHash);
          cacheMisses++;
        }
      } catch (error) {
        console.warn(`파일 ${file.filename} 처리 중 오류:`, error);
      }
    }

    console.log(
      `💾 캐시 통계: ${cacheHits}개 히트, ${cacheMisses}개 미스 (${
        cacheHits + cacheMisses > 0
          ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)
          : 0
      }% 절약)`
    );

    // 캐시되지 않은 문서들의 임베딩 생성 (배치 처리)
    if (uncachedDocuments.length > 0) {
      console.log(
        `🔄 ${uncachedDocuments.length}개의 새 문서 임베딩 생성 중...`
      );

      const BATCH_SIZE = 20;
      const batches = [];
      for (let i = 0; i < uncachedDocuments.length; i += BATCH_SIZE) {
        batches.push(uncachedDocuments.slice(i, i + BATCH_SIZE));
      }

      const newEmbeddings: number[][] = [];
      for (let i = 0; i < batches.length; i++) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log(
            `⏳ 배치 ${i + 1}/${batches.length} 처리 중... (${
              batches[i].length
            }개 문서)`
          );

          const texts = batches[i].map((doc) => doc.pageContent);
          const batchEmbeddings = await this.embeddings.embedDocuments(texts);
          newEmbeddings.push(...batchEmbeddings);

          console.log(`✅ 배치 ${i + 1}/${batches.length} 완료`);
        } catch (error) {
          console.error(`❌ 배치 ${i + 1}/${batches.length} 실패:`, error);
          throw error;
        }
      }

      // 파일별로 캐시 저장 (청크와 임베딩을 함께)
      let fileStartIdx = 0;
      for (let fileIdx = 0; fileIdx < cacheMisses; fileIdx++) {
        const file = fileChanges.filter((f) => f.content)[cacheHits + fileIdx];
        if (!file?.content) continue;

        // 이 파일에 해당하는 청크 수 계산
        const fileChunks = await this.textSplitter.createDocuments([
          file.content,
        ]);
        const chunkCount = fileChunks.length + (file.patch ? 1 : 0);

        const fileDocuments = uncachedDocuments.slice(
          fileStartIdx,
          fileStartIdx + chunkCount
        );
        const fileEmbeddings = newEmbeddings.slice(
          fileStartIdx,
          fileStartIdx + chunkCount
        );

        // 캐시에 저장 (메타데이터는 기본값만)
        const chunksForCache = fileDocuments.map(
          (chunk) =>
            new Document({
              pageContent: chunk.pageContent,
              metadata: { type: chunk.metadata.type || "content" },
            })
        );

        const contentHash = uncachedFileHashes[fileIdx];
        this.saveToCache(contentHash, chunksForCache, fileEmbeddings);

        fileStartIdx += chunkCount;
      }

      allDocuments.push(...uncachedDocuments);
      allEmbeddings.push(...newEmbeddings);
    }

    return {
      documents: allDocuments,
      embeddings: allEmbeddings,
      cacheHits,
      cacheMisses,
    };
  }

  /**
   * 파일 변경사항을 벡터 스토어에 색인합니다 (임베딩 캐싱 활용)
   */
  async indexFiles(fileChanges: FileChange[]): Promise<void> {
    console.log("🔍 파일 변경사항을 RAG 시스템에 색인 중...");

    // 문서와 임베딩 생성 (캐시 활용)
    const { documents, embeddings, cacheHits, cacheMisses } =
      await this.createDocumentsWithEmbeddings(fileChanges);

    if (documents.length === 0) {
      console.warn("⚠️  색인할 문서가 없습니다");
      return;
    }

    console.log(`📚 ${documents.length}개의 문서 청크 생성됨`);

    try {
      // 임베딩이 이미 있으므로 MemoryVectorStore에 직접 추가
      this.vectorStore = new MemoryVectorStore(this.embeddings);

      // addVectors 메서드를 사용하여 임베딩을 직접 추가
      await this.vectorStore.addVectors(embeddings, documents);

      console.log(
        `✅ RAG 시스템 색인 완료 (캐시: ${cacheHits}/${
          cacheHits + cacheMisses
        })`
      );
    } catch (error) {
      console.error("❌ RAG 시스템 색인 실패:", error);
      throw error;
    }
  }

  /**
   * 쿼리와 관련된 코드를 검색합니다
   */
  async searchRelevantCode(query: string): Promise<string[]> {
    if (!this.vectorStore) {
      console.warn("⚠️  벡터 스토어가 초기화되지 않았습니다");
      return [];
    }

    try {
      // 유사도 검색
      const results = await this.vectorStore.similaritySearch(
        query,
        this.config.topK
      );

      // 결과를 문자열 배열로 변환
      const context = results.map((doc) => {
        const filename = doc.metadata.filename || "unknown";
        const content = doc.pageContent;
        return `파일: ${filename}\n${content}`;
      });

      return context;
    } catch (error) {
      console.error("코드 검색 중 오류:", error);
      return [];
    }
  }

  /**
   * 여러 쿼리로 관련 코드를 검색하고 병합합니다
   */
  async searchMultipleQueries(queries: string[]): Promise<string[]> {
    const allResults: string[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      const results = await this.searchRelevantCode(query);

      for (const result of results) {
        // 중복 제거
        if (!seen.has(result)) {
          seen.add(result);
          allResults.push(result);
        }
      }
    }

    return allResults;
  }

  /**
   * 변경된 파일에서 핵심 식별자(함수명, 클래스명 등)를 추출합니다
   */
  private extractIdentifiers(fileChange: FileChange): string[] {
    const identifiers: string[] = [];

    if (!fileChange.patch && !fileChange.content) {
      return identifiers;
    }

    // diff에서 추가/수정된 라인에서 식별자 추출
    const text = fileChange.patch || fileChange.content || "";

    // 함수/메서드 이름 (function foo, const bar =, foo() {, async foo, def foo, func foo)
    const functionPatterns = [
      /(?:function|const|let|var|async)\s+(\w+)/g,
      /(\w+)\s*[=:]\s*(?:async\s*)?\([^)]*\)\s*=>/g, // arrow functions
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[{:]/g, // methods
      /def\s+(\w+)/g, // Python
      /func\s+(\w+)/g, // Go
    ];

    // 클래스/인터페이스/타입 이름
    const typePatterns = [
      /(?:class|interface|type|enum)\s+(\w+)/g,
      /(?:struct|trait)\s+(\w+)/g, // Rust/Go
    ];

    // import/export (다른 파일에서 사용하는 심볼)
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

    return identifiers.slice(0, 20); // 상위 20개만
  }

  /**
   * 파일 변경사항 기반으로 영향받는 파일을 분석합니다
   */
  async generateCodeContext(fileChanges: FileChange[]): Promise<string[]> {
    console.log("🔎 변경사항이 영향을 미치는 파일 분석 중...");

    if (!this.vectorStore) {
      console.warn("⚠️  벡터 스토어가 초기화되지 않았습니다");
      return [];
    }

    const impactAnalysis: string[] = [];
    const affectedFiles = new Set<string>();

    // 주요 변경 파일 선택 (변경 라인 수 기준)
    const topFiles = fileChanges
      .filter((f) => f.content || f.patch)
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 10); // 상위 10개 파일만 분석

    console.log(`📊 ${topFiles.length}개의 주요 변경 파일 분석 중...`);

    for (const file of topFiles) {
      // 1. 변경된 파일에서 핵심 식별자 추출
      const identifiers = this.extractIdentifiers(file);

      if (identifiers.length === 0) {
        continue;
      }

      console.log(`  📄 ${file.filename}: ${identifiers.length}개 식별자 발견`);

      // 2. 각 식별자를 사용하는 다른 파일 검색
      for (const identifier of identifiers.slice(0, 5)) {
        // 상위 5개만
        try {
          const results = await this.vectorStore.similaritySearch(
            identifier,
            3 // 각 식별자당 상위 3개 결과
          );

          for (const doc of results) {
            const foundFile = doc.metadata.filename;

            // 변경된 파일 자체는 제외
            if (
              foundFile &&
              foundFile !== file.filename &&
              !affectedFiles.has(foundFile)
            ) {
              affectedFiles.add(foundFile);

              // 영향 분석 결과 저장
              const impact =
                `**${identifier}** (${file.filename}에서 변경)\n` +
                `  → \`${foundFile}\`에서 사용됨\n` +
                `  → 잠재적 영향: 이 파일도 검토가 필요할 수 있습니다`;

              impactAnalysis.push(impact);

              // 너무 많은 결과 방지
              if (impactAnalysis.length >= 15) {
                break;
              }
            }
          }

          if (impactAnalysis.length >= 15) {
            break;
          }
        } catch (error) {
          console.warn(`  ⚠️  ${identifier} 검색 중 오류:`, error);
        }
      }

      if (impactAnalysis.length >= 15) {
        break;
      }
    }

    console.log(`✅ ${affectedFiles.size}개의 영향받는 파일 발견`);

    return impactAnalysis;
  }

  /**
   * 벡터 스토어 초기화 (메모리 해제)
   */
  clear(): void {
    this.vectorStore = null;
  }
}
