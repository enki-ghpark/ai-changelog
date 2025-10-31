# act를 사용한 로컬 테스트 가이드

이 문서는 [act](https://github.com/nektos/act)를 사용하여 GitHub Actions 워크플로우를 로컬에서 테스트하는 방법을 상세히 설명합니다.

## 사전 요구사항

- Docker Desktop 또는 Docker Engine 설치
- act CLI 설치
- Git 저장소 초기화
- 유효한 GitHub Personal Access Token

## 1. act 설치

### macOS (Homebrew)

```bash
brew install act
```

### Linux

```bash
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

### Windows (Chocolatey)

```bash
choco install act-cli
```

## 2. Docker 확인

act는 Docker를 사용하므로 Docker가 실행 중인지 확인하세요:

```bash
docker ps
```

## 3. Secrets 및 Variables 설정

### `.secrets` 파일 생성

```bash
cp .secrets.example .secrets
```

`.secrets` 파일 내용:

```
GITHUB_TOKEN=ghp_your_actual_github_token_here
OLLAMA_BASE_URL=http://localhost:11434
```

**GitHub Token 생성:**

1. GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
2. "Generate new token (classic)" 클릭
3. 필요한 권한 선택:
   - `repo` (전체)
   - `workflow`
4. Token 생성 후 `.secrets` 파일에 복사

### `.vars` 파일 생성

```bash
cp .vars.example .vars
```

`.vars` 파일 내용:

```
OLLAMA_MODEL=llama3.1:latest
```

## 4. Git 저장소 초기화

act는 Git 저장소에서 실행되어야 합니다:

```bash
git init
git add -A
git commit -m "Initial commit"
```

## 5. act 실행

### 워크플로우 목록 확인

```bash
act release --list
```

출력 예시:

```
Stage  Job ID              Job name            Workflow name            Workflow file  Events
0      generate-changelog  generate-changelog  자동 CHANGELOG 생성          changelog.yml  release
```

### Dry Run (실행 계획 확인)

실제로 실행하지 않고 어떤 단계가 실행될지 확인:

```bash
pnpm run test:act -- --dryrun
```

또는:

```bash
act release -e .github/workflows/test-event.json --secret-file .secrets --var-file .vars --dryrun
```

### 실제 실행

```bash
pnpm run test:act
```

또는:

```bash
act release -e .github/workflows/test-event.json --secret-file .secrets --var-file .vars
```

### 특정 Job만 실행

```bash
act release -j generate-changelog --secret-file .secrets --var-file .vars
```

### 상세 로그 출력

```bash
act release -e .github/workflows/test-event.json --secret-file .secrets --var-file .vars --verbose
```

## 6. 테스트 이벤트 커스터마이징

`.github/workflows/test-event.json` 파일을 수정하여 다른 릴리즈 시나리오를 테스트할 수 있습니다:

```json
{
  "release": {
    "tag_name": "v2.0.0",
    "name": "Major Release 2.0.0",
    "body": "대규모 업데이트",
    "draft": false,
    "prerelease": false,
    "created_at": "2024-02-01T00:00:00Z",
    "published_at": "2024-02-01T00:00:00Z",
    "id": 2
  },
  "repository": {
    "name": "github-auto-changelog",
    "full_name": "your-org/github-auto-changelog",
    "owner": {
      "login": "your-org"
    }
  }
}
```

## 7. 일반적인 문제 해결

### Docker 이미지 다운로드 실패

**증상:** Docker 이미지를 pull할 수 없음

**해결:**

```bash
docker pull catthehacker/ubuntu:act-latest
```

### Apple M-series 칩 아키텍처 경고

**증상:** `⚠ You are using Apple M-series chip...` 경고

**해결:** `.actrc` 파일에 이미 `--container-architecture linux/amd64` 설정이 포함되어 있습니다.

### GitHub Token 인증 실패

**증상:** `authentication required: Invalid username or token`

**해결:**

1. `.secrets` 파일에 유효한 GitHub Token이 있는지 확인
2. Token 권한(`repo`, `workflow`)이 있는지 확인
3. Token이 만료되지 않았는지 확인

### Ollama 연결 실패

**증상:** Ollama 서버에 연결할 수 없음

**해결:**

1. Ollama 서버가 실행 중인지 확인:
   ```bash
   curl http://localhost:11434/api/version
   ```
2. 네트워크 방화벽 설정 확인
3. Docker 컨테이너에서 호스트 네트워크에 접근할 수 있는지 확인

### Self-hosted Runner 경고

**증상:** `Skipping unsupported platform` 경고

**해결:** `.actrc` 파일에 이미 다음 설정이 포함되어 있습니다:

```
-P self-hosted=catthehacker/ubuntu:act-latest
-P common=catthehacker/ubuntu:act-latest
```

## 8. 성능 최적화

### 캐시된 이미지 사용

act는 Docker 이미지를 캐시하므로 첫 실행 후 후속 실행이 빨라집니다.

### 작은 이미지 사용 (선택사항)

더 빠른 테스트를 원한다면 `.actrc`를 수정:

```
-P common=node:20-slim
```

**주의:** 일부 GitHub Actions가 작동하지 않을 수 있습니다.

## 9. CI/CD 파이프라인 검증

act를 사용하면 GitHub에 푸시하기 전에 로컬에서 워크플로우를 검증할 수 있습니다:

1. 워크플로우 파일 수정
2. act로 로컬 테스트
3. 문제 해결
4. GitHub에 푸시

이를 통해 개발 주기를 크게 단축할 수 있습니다.

## 10. 참고 자료

- [act 공식 문서](https://nektosact.com/)
- [act GitHub 저장소](https://github.com/nektos/act)
- [GitHub Actions 문서](https://docs.github.com/en/actions)
