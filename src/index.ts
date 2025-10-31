import { GitHubService } from './utils/github.js';
import { ChangelogGenerator } from './utils/changelog.js';
import type { GitHubConfig, OllamaConfig } from './types.js';

async function main() {
  console.log('🚀 GitHub 자동 CHANGELOG 생성 시작\n');

  // 환경 변수 확인
  const githubToken = process.env.GITHUB_TOKEN;
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://10.4.100.42:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:latest';
  const repository = process.env.GITHUB_REPOSITORY;
  const releaseTag = process.env.RELEASE_TAG;

  if (!githubToken) {
    console.error('❌ GITHUB_TOKEN 환경 변수가 설정되지 않았습니다');
    process.exit(1);
  }

  if (!repository) {
    console.error('❌ GITHUB_REPOSITORY 환경 변수가 설정되지 않았습니다');
    process.exit(1);
  }

  if (!releaseTag) {
    console.error('❌ RELEASE_TAG 환경 변수가 설정되지 않았습니다');
    process.exit(1);
  }

  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    console.error('❌ GITHUB_REPOSITORY 형식이 올바르지 않습니다 (owner/repo)');
    process.exit(1);
  }

  console.log(`📦 저장소: ${owner}/${repo}`);
  console.log(`🏷️  릴리즈 태그: ${releaseTag}`);
  console.log(`🤖 Ollama 서버: ${ollamaBaseUrl}`);
  console.log(`🧠 모델: ${ollamaModel}\n`);

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
    console.log('📋 릴리즈 정보 조회 중...');
    const release = await githubService.getReleaseByTag(releaseTag);
    if (!release) {
      console.error(`❌ 릴리즈를 찾을 수 없습니다: ${releaseTag}`);
      process.exit(1);
    }
    console.log(`✅ 릴리즈 발견: ${release.name || release.tag_name}\n`);

    // 변경사항 데이터 수집
    const changelogData = await githubService.collectChangelogData(releaseTag);
    
    if (changelogData.commits.length === 0) {
      console.warn('⚠️  변경사항이 없습니다. CHANGELOG를 생성하지 않습니다.');
      process.exit(0);
    }

    console.log();

    // CHANGELOG 생성
    const changelog = await changelogGenerator.generateWithFallback(changelogData);
    console.log('\n📝 생성된 CHANGELOG:\n');
    console.log('─'.repeat(80));
    console.log(changelog);
    console.log('─'.repeat(80));
    console.log();

    // 기존 릴리즈 노트와 결합
    let finalBody = changelog;
    if (release.body && release.body.trim()) {
      finalBody = `${changelog}\n\n---\n\n## 원래 릴리즈 노트\n\n${release.body}`;
    }

    // 릴리즈 노트 업데이트
    console.log('📤 릴리즈 노트 업데이트 중...');
    const success = await githubService.updateReleaseNotes(release.id, finalBody);

    if (success) {
      console.log('\n✅ 모든 작업이 성공적으로 완료되었습니다!');
      process.exit(0);
    } else {
      console.error('\n❌ 릴리즈 노트 업데이트에 실패했습니다');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    if (error instanceof Error) {
      console.error('상세 내용:', error.message);
      console.error('스택 트레이스:', error.stack);
    }
    process.exit(1);
  }
}

// 스크립트 실행
main();

