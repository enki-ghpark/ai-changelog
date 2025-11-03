import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHubService } from "./utils/github.js";
import { ChangelogGenerator } from "./utils/changelog.js";
import { RAGService } from "./utils/rag.js";
import { CodeAnalysisTools } from "./utils/tools.js";
import type {
  GitHubConfig,
  OllamaConfig,
  RAGConfig,
  ChangelogData,
  EnhancedChangelogData,
} from "./types.js";

/**
 * 여러 Ollama URL 중 사용 가능한 URL을 찾습니다
 */
async function findAvailableOllamaUrl(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      core.info(`🔗 Ollama 서버 연결 시도: ${url}`);
      const response = await fetch(`${url}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        core.info(`✅ 연결 성공: ${url}`);
        return url;
      }
    } catch {
      core.warning(`⚠️  연결 실패: ${url}`);
    }
  }
  return null;
}

async function run() {
  try {
    // Inputs 읽기
    const githubToken = core.getInput("github-token", { required: true });
    const ollamaBaseUrlInput = core.getInput("ollama-base-url", {
      required: true,
    });
    const ollamaModel = core.getInput("ollama-model") || "llama3.1:latest";
    const ollamaEmbeddingModel =
      core.getInput("ollama-embedding-model") || "nomic-embed-text";
    const enableRAG = core.getInput("enable-rag") !== "false";
    const releaseTag =
      core.getInput("release-tag") || github.context.payload.release?.tag_name;

    if (!releaseTag) {
      core.setFailed(
        "릴리즈 태그를 찾을 수 없습니다. release 이벤트가 아니거나 release-tag input이 필요합니다."
      );
      return;
    }

    // 쉼표로 구분된 여러 Ollama URL 파싱
    const ollamaUrls = ollamaBaseUrlInput
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    core.info(`🔍 설정된 Ollama 서버: ${ollamaUrls.length}개`);
    ollamaUrls.forEach((url, index) => {
      core.info(`  ${index + 1}. ${url}`);
    });

    // 사용 가능한 Ollama URL 찾기
    const ollamaBaseUrl = await findAvailableOllamaUrl(ollamaUrls);
    if (!ollamaBaseUrl) {
      core.setFailed(
        `모든 Ollama 서버에 연결할 수 없습니다: ${ollamaUrls.join(", ")}`
      );
      return;
    }

    const repository =
      github.context.repo.owner + "/" + github.context.repo.repo;

    core.info(`🚀 CHANGELOG 생성 시작`);
    core.info(`📦 Repository: ${repository}`);
    core.info(`🏷️  Release Tag: ${releaseTag}`);
    core.info(`🌐 Ollama URL: ${ollamaBaseUrl}`);
    core.info(`🤖 Ollama Model: ${ollamaModel}`);
    core.info(`📊 Embedding Model: ${ollamaEmbeddingModel}`);
    core.info(`🔍 RAG: ${enableRAG ? "활성화" : "비활성화"}`);

    // 서비스 초기화
    const githubConfig: GitHubConfig = {
      token: githubToken,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    const ollamaConfig: OllamaConfig = {
      baseUrl: ollamaBaseUrl,
      model: ollamaModel,
    };

    const githubService = new GitHubService(githubConfig);
    const changelogGenerator = new ChangelogGenerator(ollamaConfig);

    // 릴리즈 조회
    const release = await githubService.getReleaseByTag(releaseTag);
    if (!release) {
      core.setFailed(`릴리즈를 찾을 수 없습니다: ${releaseTag}`);
      return;
    }
    core.info(`✅ 릴리즈 발견: ${release.name || release.tag_name}`);

    // CHANGELOG 데이터 수집 및 생성
    let changelogData: ChangelogData | EnhancedChangelogData;
    let ragService: RAGService | null = null;

    if (enableRAG) {
      changelogData = await githubService.collectEnhancedChangelogData(
        releaseTag
      );

      if (changelogData.commits.length === 0) {
        core.warning("변경사항이 없습니다. CHANGELOG를 생성하지 않습니다.");
        return;
      }

      const ragConfig: RAGConfig = {
        ollamaBaseUrl,
        embeddingModel: ollamaEmbeddingModel,
        chunkSize: 1000,
        chunkOverlap: 200,
        topK: 5,
      };
      ragService = new RAGService(ragConfig);

      try {
        core.info("🔍 전체 코드베이스를 RAG 시스템에 색인 중...");
        const allCodeFiles = await githubService.getAllCodeFiles(releaseTag);

        if (allCodeFiles.length > 0) {
          await ragService.indexFiles(allCodeFiles);
          core.info("✅ RAG 시스템 색인 완료");
        } else {
          core.warning("색인할 코드 파일을 찾을 수 없습니다");
        }
      } catch (error) {
        core.warning(`RAG 색인 실패, 파일 정보만 사용합니다: ${error}`);
      }
    } else {
      changelogData = await githubService.collectChangelogData(releaseTag);

      if (changelogData.commits.length === 0) {
        core.warning("변경사항이 없습니다. CHANGELOG를 생성하지 않습니다.");
        return;
      }
    }

    // CHANGELOG 생성
    let changelog: string;
    if (
      enableRAG &&
      ragService &&
      "fileChanges" in changelogData &&
      "codeContext" in changelogData
    ) {
      try {
        const enhancedData = changelogData as EnhancedChangelogData;

        // 1. RAG로 영향받을 가능성 있는 파일 후보 탐색
        core.info("📋 RAG로 영향 파일 후보 탐색 중...");
        const candidates = await ragService.findAffectedFileCandidates(
          enhancedData.fileChanges
        );

        if (candidates.length > 0) {
          core.info(`✅ ${candidates.length}개의 후보 파일 발견`);

          // 2. Code Analysis Tools 초기화 (RAG 서비스 포함)
          const codeAnalysisTools = new CodeAnalysisTools(
            githubService,
            releaseTag,
            ragService
          );

          // 3. Tool calling 기반 CHANGELOG 생성
          core.info("🔧 Tool calling 기반 상세 분석 시작...");
          changelog = await changelogGenerator.generateWithTools(
            enhancedData,
            candidates,
            codeAnalysisTools
          );

          // 캐시 정리
          codeAnalysisTools.clearCache();
        } else {
          // 후보가 없으면 기존 RAG 방식 사용
          core.info("⚠️  영향 파일 후보가 없어 기본 RAG 방식 사용");
          const retriever = ragService.getRetriever(3);
          changelog = await changelogGenerator.generateEnhanced(
            enhancedData,
            retriever
          );
        }
      } catch (error) {
        core.warning(
          `⚠️  Tool calling 기반 CHANGELOG 생성 실패, 기본 생성기 사용: ${error}`
        );
        changelog = await changelogGenerator.generate(changelogData);
      }
    } else {
      changelog = await changelogGenerator.generate(changelogData);
    }

    core.info("\n📝 생성된 CHANGELOG:");
    core.info("─".repeat(80));
    core.info(changelog);
    core.info("─".repeat(80));

    // RAG 리소스 정리
    if (ragService) {
      ragService.clear();
    }

    // 릴리즈 노트 업데이트
    core.info("📤 릴리즈 노트 업데이트 중...");
    const success = await githubService.updateReleaseNotes(
      release.id,
      changelog
    );

    if (success) {
      core.info("✅ 릴리즈 노트가 성공적으로 업데이트되었습니다!");
      core.setOutput("changelog", changelog);
    } else {
      core.setFailed("릴리즈 노트 업데이트에 실패했습니다.");
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

run();
