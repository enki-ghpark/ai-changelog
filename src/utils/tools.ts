import { GitHubService } from "./github.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { RAGService } from "./rag.js";

/**
 * LangChain Tool을 사용한 코드 분석 도구 모음
 */
export class CodeAnalysisTools {
  private githubService: GitHubService;
  private ref: string; // Git ref (tag, branch, commit SHA)
  private fileCache: Map<string, string> = new Map();
  private treeCache: any[] | null = null;
  private ragService: RAGService | null = null;

  constructor(
    githubService: GitHubService,
    ref: string,
    ragService?: RAGService
  ) {
    this.githubService = githubService;
    this.ref = ref;
    this.ragService = ragService || null;
  }

  /**
   * 모든 Tool을 배열로 반환합니다
   */
  getTools() {
    const tools: DynamicStructuredTool[] = [
      this.createReadFileTool(),
      this.createListFilesTool(),
      this.createSearchCodeTool(),
      this.createGetFileInfoTool(),
    ];

    // RAG 서비스가 있으면 RAG 검색 tool도 추가
    if (this.ragService) {
      tools.push(this.createSearchRAGTool());
    }

    return tools;
  }

  /**
   * read_file: 파일 내용을 읽는 tool
   */
  private createReadFileTool() {
    return new DynamicStructuredTool({
      name: "read_file",
      description:
        "레포지토리의 특정 파일 내용을 읽습니다. 전체 파일 또는 특정 라인 범위를 읽을 수 있습니다.",
      schema: z.object({
        path: z.string().describe("읽을 파일의 경로 (예: src/index.ts)"),
        start_line: z
          .number()
          .optional()
          .describe("시작 라인 번호 (선택사항, 1부터 시작)"),
        end_line: z
          .number()
          .optional()
          .describe("끝 라인 번호 (선택사항, 포함)"),
      }),
      func: async (input) => {
        const { path, start_line, end_line } = input as any;
        const startTime = Date.now();
        console.log(`      → read_file 시작: ${path}`);

        try {
          const result = await this.readFile(path, start_line, end_line);
          const elapsed = Date.now() - startTime;
          console.log(`      ✓ read_file 완료 (${elapsed}ms)`);
          return result;
        } catch (error) {
          const elapsed = Date.now() - startTime;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`      ✗ read_file 실패 (${elapsed}ms): ${errorMsg}`);
          return `오류: ${errorMsg}`;
        }
      },
    });
  }

  /**
   * list_files: 디렉토리 목록을 조회하는 tool
   */
  private createListFilesTool() {
    return new DynamicStructuredTool({
      name: "list_files",
      description: "특정 디렉토리의 파일 및 하위 디렉토리 목록을 조회합니다.",
      schema: z.object({
        directory: z
          .string()
          .describe(
            "조회할 디렉토리 경로 (예: src/utils). 빈 문자열이면 루트 디렉토리"
          ),
      }),
      func: async (input) => {
        const { directory } = input as any;
        const startTime = Date.now();
        console.log(`      → list_files 시작: ${directory || "(루트)"}`);

        try {
          const result = await this.listFiles(directory || "");
          const elapsed = Date.now() - startTime;
          console.log(`      ✓ list_files 완료 (${elapsed}ms)`);
          return result;
        } catch (error) {
          const elapsed = Date.now() - startTime;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`      ✗ list_files 실패 (${elapsed}ms): ${errorMsg}`);
          return `오류: ${errorMsg}`;
        }
      },
    });
  }

  /**
   * search_code: 코드 검색 tool
   */
  private createSearchCodeTool() {
    return new DynamicStructuredTool({
      name: "search_code",
      description:
        "코드베이스에서 특정 패턴을 검색합니다. 함수명, 클래스명, 변수명 등을 찾을 때 유용합니다.",
      schema: z.object({
        pattern: z.string().describe("검색할 패턴 (정규식 지원)"),
        file_pattern: z
          .string()
          .optional()
          .describe(
            "파일 확장자 필터 (선택사항, 예: .ts, .js). 빈 값이면 모든 파일 검색"
          ),
        max_results: z
          .number()
          .optional()
          .describe("최대 결과 수 (기본값: 10)"),
      }),
      func: async (input) => {
        const { pattern, file_pattern, max_results } = input as any;
        const startTime = Date.now();
        console.log(`      → search_code 시작: "${pattern}"`);

        try {
          const result = await this.searchCode(
            pattern,
            file_pattern,
            max_results || 10
          );
          const elapsed = Date.now() - startTime;
          console.log(`      ✓ search_code 완료 (${elapsed}ms)`);
          return result;
        } catch (error) {
          const elapsed = Date.now() - startTime;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`      ✗ search_code 실패 (${elapsed}ms): ${errorMsg}`);
          return `오류: ${errorMsg}`;
        }
      },
    });
  }

  /**
   * get_file_info: 파일 메타정보 조회 tool
   */
  private createGetFileInfoTool() {
    return new DynamicStructuredTool({
      name: "get_file_info",
      description: "파일의 메타정보를 조회합니다 (크기, 타입 등).",
      schema: z.object({
        path: z.string().describe("조회할 파일의 경로"),
      }),
      func: async (input) => {
        const { path } = input as any;
        const startTime = Date.now();
        console.log(`      → get_file_info 시작: ${path}`);

        try {
          const result = await this.getFileInfo(path);
          const elapsed = Date.now() - startTime;
          console.log(`      ✓ get_file_info 완료 (${elapsed}ms)`);
          return result;
        } catch (error) {
          const elapsed = Date.now() - startTime;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`      ✗ get_file_info 실패 (${elapsed}ms): ${errorMsg}`);
          return `오류: ${errorMsg}`;
        }
      },
    });
  }

  /**
   * search_similar_code: RAG 벡터 검색으로 유사한 코드 찾기 tool
   */
  private createSearchRAGTool() {
    return new DynamicStructuredTool({
      name: "search_similar_code",
      description:
        "RAG(벡터 검색)를 사용하여 쿼리와 의미적으로 유사한 코드를 찾습니다. 특정 개념이나 기능과 관련된 코드를 찾을 때 유용합니다. 예: '인증 관련 코드', 'API 호출 로직', '데이터베이스 쿼리'",
      schema: z.object({
        query: z
          .string()
          .describe(
            "검색할 쿼리 (자연어로 설명). 예: '사용자 인증 로직', '파일 업로드 처리'"
          ),
        top_k: z
          .number()
          .optional()
          .describe("반환할 최대 결과 수 (기본값: 5)"),
      }),
      func: async (input) => {
        const { query, top_k } = input as any;
        const startTime = Date.now();
        console.log(`      → search_similar_code 시작: "${query}"`);

        try {
          if (!this.ragService) {
            return "오류: RAG 서비스를 사용할 수 없습니다.";
          }

          const k = top_k || 5;
          const retriever = this.ragService.getRetriever(k);
          const documents = await retriever.invoke(query);

          if (documents.length === 0) {
            return `"${query}"와 관련된 코드를 찾지 못했습니다.`;
          }

          // 결과 포맷팅
          const results = documents.map((doc, idx) => {
            const metadata = doc.metadata || {};
            const filename = metadata.filename || "알 수 없음";
            const content = doc.pageContent || "";
            const preview =
              content.length > 300
                ? content.substring(0, 300) + "\n... (생략)"
                : content;

            return `[${idx + 1}] ${filename}\n${preview}`;
          });

          const elapsed = Date.now() - startTime;
          console.log(
            `      ✓ search_similar_code 완료 (${elapsed}ms, ${documents.length}개 발견)`
          );

          return `RAG 검색 결과: "${query}" (${
            documents.length
          }개 발견)\n\n${results.join("\n\n---\n\n")}`;
        } catch (error) {
          const elapsed = Date.now() - startTime;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(
            `      ✗ search_similar_code 실패 (${elapsed}ms): ${errorMsg}`
          );
          return `오류: ${errorMsg}`;
        }
      },
    });
  }

  // ===== Private Helper Methods =====

  /**
   * 파일 내용을 읽습니다
   */
  private async readFile(
    path: string,
    startLine?: number,
    endLine?: number
  ): Promise<string> {
    // 캐시 확인
    let content = this.fileCache.get(path);

    if (!content) {
      // 캐시에 없으면 GitHub에서 가져오기
      const fetchedContent = await this.githubService.getFileContent(
        path,
        this.ref
      );
      if (!fetchedContent) {
        return `파일을 찾을 수 없습니다: ${path}`;
      }
      content = fetchedContent;
      this.fileCache.set(path, content);
    }

    // 라인 범위 필터링
    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split("\n");
      const start = Math.max(0, (startLine || 1) - 1);
      const end = endLine ? Math.min(lines.length, endLine) : lines.length;
      const selectedLines = lines.slice(start, end);

      return `파일: ${path} (라인 ${start + 1}-${end})\n\n${selectedLines
        .map((line, idx) => `${start + idx + 1}: ${line}`)
        .join("\n")}`;
    }

    // 전체 파일
    const lines = content.split("\n");
    const preview =
      lines.length > 500
        ? `파일: ${path} (${lines.length}줄, 처음 500줄만 표시)\n\n${lines
            .slice(0, 500)
            .map((line, idx) => `${idx + 1}: ${line}`)
            .join("\n")}\n\n... (${lines.length - 500}줄 생략)`
        : `파일: ${path} (${lines.length}줄)\n\n${lines
            .map((line, idx) => `${idx + 1}: ${line}`)
            .join("\n")}`;

    return preview;
  }

  /**
   * 디렉토리 내용을 나열합니다
   */
  private async listFiles(directory: string): Promise<string> {
    // Tree 캐시가 없으면 가져오기
    if (!this.treeCache) {
      this.treeCache = await this.fetchTree();
    }

    // 디렉토리 정규화
    const normalizedDir = directory.replace(/^\/+|\/+$/g, "");
    const prefix = normalizedDir ? `${normalizedDir}/` : "";

    // 해당 디렉토리의 직접 자식만 필터링
    const items = this.treeCache.filter((item) => {
      const path = item.path || "";

      // 디렉토리가 비어있으면 루트 레벨 항목만
      if (!normalizedDir) {
        return !path.includes("/");
      }

      // 해당 디렉토리 내의 직접 자식만
      if (!path.startsWith(prefix)) return false;

      const relativePath = path.substring(prefix.length);
      return !relativePath.includes("/");
    });

    if (items.length === 0) {
      return `디렉토리를 찾을 수 없거나 비어있습니다: ${directory || "(루트)"}`;
    }

    // 디렉토리와 파일 분리
    const dirs: string[] = [];
    const files: string[] = [];

    for (const item of items) {
      const path = item.path || "";
      const name = normalizedDir ? path.substring(prefix.length) : path;

      if (item.type === "tree") {
        dirs.push(`📁 ${name}/`);
      } else {
        const size = item.size ? ` (${this.formatSize(item.size)})` : "";
        files.push(`📄 ${name}${size}`);
      }
    }

    const result = [
      `디렉토리: ${directory || "(루트)"} (${items.length}개 항목)\n`,
      ...dirs.sort(),
      ...files.sort(),
    ].join("\n");

    return result;
  }

  /**
   * 코드를 검색합니다
   */
  private async searchCode(
    pattern: string,
    filePattern?: string,
    maxResults: number = 10
  ): Promise<string> {
    // Tree 캐시가 없으면 가져오기
    if (!this.treeCache) {
      this.treeCache = await this.fetchTree();
    }

    // 파일 필터링
    let files = this.treeCache.filter((item) => item.type === "blob");

    if (filePattern) {
      files = files.filter((item) => (item.path || "").endsWith(filePattern));
    }

    // 검색 정규식
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "gi");
    } catch (error) {
      return `잘못된 정규식 패턴: ${pattern}`;
    }

    const results: Array<{
      file: string;
      line: number;
      content: string;
    }> = [];

    // 파일들을 순회하며 검색
    for (const file of files) {
      if (results.length >= maxResults) break;

      const path = file.path || "";

      // 파일 내용 가져오기
      let content = this.fileCache.get(path);
      if (!content) {
        try {
          const fetchedContent = await this.githubService.getFileContent(
            path,
            this.ref
          );
          if (fetchedContent) {
            content = fetchedContent;
            this.fileCache.set(path, content);
          }
        } catch (error) {
          continue; // 파일 읽기 실패 시 스킵
        }
      }

      if (!content) continue;

      // 라인별로 검색
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;

        const line = lines[i];
        if (regex.test(line)) {
          results.push({
            file: path,
            line: i + 1,
            content: line.trim(),
          });
        }

        // 정규식 상태 초기화
        regex.lastIndex = 0;
      }
    }

    if (results.length === 0) {
      return `검색 결과 없음: "${pattern}"${
        filePattern ? ` (파일: ${filePattern})` : ""
      }`;
    }

    const output = [
      `검색 결과: "${pattern}" (${results.length}개 발견${
        results.length >= maxResults ? ", 상위 " + maxResults + "개만 표시" : ""
      })\n`,
      ...results.map((r) => `${r.file}:${r.line}: ${r.content}`),
    ].join("\n");

    return output;
  }

  /**
   * 파일 정보를 조회합니다
   */
  private async getFileInfo(path: string): Promise<string> {
    // Tree 캐시가 없으면 가져오기
    if (!this.treeCache) {
      this.treeCache = await this.fetchTree();
    }

    const item = this.treeCache.find((item) => item.path === path);

    if (!item) {
      return `파일을 찾을 수 없습니다: ${path}`;
    }

    const info = [
      `파일 정보: ${path}`,
      `타입: ${item.type === "blob" ? "파일" : "디렉토리"}`,
    ];

    if (item.size !== undefined) {
      info.push(`크기: ${this.formatSize(item.size)}`);
    }

    if (item.sha) {
      info.push(`SHA: ${item.sha}`);
    }

    return info.join("\n");
  }

  /**
   * GitHub Tree API로 전체 파일 트리를 가져옵니다
   */
  private async fetchTree(): Promise<any[]> {
    try {
      const tree = await (this.githubService as any).octokit.rest.git.getTree({
        owner: (this.githubService as any).owner,
        repo: (this.githubService as any).repo,
        tree_sha: this.ref,
        recursive: "true",
      });
      return tree.data.tree || [];
    } catch (error) {
      console.error("Tree 가져오기 실패:", error);
      return [];
    }
  }

  /**
   * 파일 크기를 읽기 쉬운 형식으로 변환합니다
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * 캐시를 초기화합니다
   */
  clearCache(): void {
    this.fileCache.clear();
    this.treeCache = null;
  }
}
