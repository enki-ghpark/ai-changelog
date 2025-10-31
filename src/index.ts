import { GitHubService } from "./utils/github.js";
import { ChangelogGenerator } from "./utils/changelog.js";
import { RAGService } from "./utils/rag.js";
import type { GitHubConfig, OllamaConfig, RAGConfig } from "./types.js";

async function main() {
  console.log("🚀 GitHub 자동 CHANGELOG 생성 시작\n");

  // 환경 변수 확인
  const githubToken = process.env.GITHUB_TOKEN;
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.1:latest";
  const ollamaEmbeddingModel =
    process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
  const enableRAG = process.env.ENABLE_RAG !== "false"; // 기본적으로 활성화
  const repository = process.env.GITHUB_REPOSITORY;
  const releaseTag = process.env.RELEASE_TAG;

  if (!githubToken) {
    console.error("❌ GITHUB_TOKEN 환경 변수가 설정되지 않았습니다");
    process.exit(1);
  }

  if (!repository) {
    console.error("❌ GITHUB_REPOSITORY 환경 변수가 설정되지 않았습니다");
    process.exit(1);
  }

  if (!releaseTag) {
    console.error("❌ RELEASE_TAG 환경 변수가 설정되지 않았습니다");
    process.exit(1);
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error("❌ GITHUB_REPOSITORY 형식이 올바르지 않습니다 (owner/repo)");
    process.exit(1);
  }

  console.log(`📦 저장소: ${owner}/${repo}`);
  console.log(`🏷️  릴리즈 태그: ${releaseTag}`);
  console.log(`🤖 Ollama 서버: ${ollamaBaseUrl}`);
  console.log(`🧠 모델: ${ollamaModel}`);
  console.log(`🔍 RAG 활성화: ${enableRAG ? "예" : "아니오"}\n`);

  try {
    // GitHub 서비스 초기화
    const githubConfig: GitHubConfig = {
      owner,
      repo,
      token: githubToken,
    };
    const githubService = new GitHubService(githubConfig);

    // Ollama 초기화
    const ollamaConfig: OllamaConfig = {
      baseUrl: ollamaBaseUrl,
      model: ollamaModel,
    };
    const changelogGenerator = new ChangelogGenerator(ollamaConfig);

    // 릴리즈 정보 가져오기
    console.log("📋 릴리즈 정보 조회 중...");
    const release = await githubService.getReleaseByTag(releaseTag);
    if (!release) {
      console.error(`❌ 릴리즈를 찾을 수 없습니다: ${releaseTag}`);
      process.exit(1);
    }
    console.log(`✅ 릴리즈 발견: ${release.name || release.tag_name}\n`);

    // 향상된 변경사항 데이터 수집 (파일 변경 포함)
    let changelogData;
    let ragService: RAGService | null = null;

    if (enableRAG) {
      // RAG를 사용하는 경우 향상된 데이터 수집
      changelogData = await githubService.collectEnhancedChangelogData(
        releaseTag
      );

      if (changelogData.commits.length === 0) {
        console.warn("⚠️  변경사항이 없습니다. CHANGELOG를 생성하지 않습니다.");
        process.exit(0);
      }

      // RAG 서비스 초기화
      const ragConfig: RAGConfig = {
        ollamaBaseUrl,
        embeddingModel: ollamaEmbeddingModel,
        chunkSize: 1000,
        chunkOverlap: 200,
        topK: 5,
      };
      ragService = new RAGService(ragConfig);

      // 전체 코드베이스를 RAG 시스템에 색인
      try {
        console.log("🔍 전체 코드베이스를 RAG 시스템에 색인 중...");
        const allCodeFiles = await githubService.getAllCodeFiles(releaseTag);

        if (allCodeFiles.length > 0) {
          await ragService.indexFiles(allCodeFiles);

          // 변경된 파일을 기반으로 코드 컨텍스트 생성 (전체 코드베이스에서 검색)
          changelogData.codeContext = await ragService.generateCodeContext(
            changelogData.fileChanges
          );
        } else {
          console.warn("⚠️  색인할 코드 파일을 찾을 수 없습니다");
          changelogData.codeContext = [];
        }
      } catch (error) {
        console.warn("⚠️  RAG 색인 실패, 파일 정보만 사용합니다", error);
        changelogData.codeContext = [];
      }
    } else {
      // RAG를 사용하지 않는 경우 기본 데이터 수집
      changelogData = await githubService.collectChangelogData(releaseTag);

      if (changelogData.commits.length === 0) {
        console.warn("⚠️  변경사항이 없습니다. CHANGELOG를 생성하지 않습니다.");
        process.exit(0);
      }
    }

    console.log();

    // CHANGELOG 생성
    const changelog = await changelogGenerator.generateWithFallback(
      changelogData
    );
    console.log("\n📝 생성된 CHANGELOG:\n");
    console.log("─".repeat(80));
    console.log(changelog);
    console.log("─".repeat(80));
    console.log();

    // RAG 리소스 정리
    if (ragService) {
      ragService.clear();
    }

    // 릴리즈 노트 업데이트 (기존 내용 덮어쓰기)
    console.log("📤 릴리즈 노트 업데이트 중...");
    const success = await githubService.updateReleaseNotes(
      release.id,
      changelog
    );

    if (success) {
      console.log("\n✅ 모든 작업이 성공적으로 완료되었습니다!");
      process.exit(0);
    } else {
      console.error("\n❌ 릴리즈 노트 업데이트에 실패했습니다");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ 오류 발생:", error);
    if (error instanceof Error) {
      console.error("상세 내용:", error.message);
      console.error("스택 트레이스:", error.stack);
    }
    process.exit(1);
  }
}

// 스크립트 실행
main();
