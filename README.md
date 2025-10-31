# GitHub 자동 CHANGELOG 생성 봇

GitHub 릴리즈가 발행될 때 자동으로 변경사항을 분석하고, Ollama를 활용하여 사용자 친화적인 CHANGELOG를 생성하여 릴리즈 노트에 추가하는 자동화 봇입니다.

## ✨ 주요 기능

- 🤖 **AI 기반 CHANGELOG 생성**: LangChain과 Ollama를 사용하여 지능적으로 변경사항을 분석하고 카테고리화
- 📦 **자동 릴리즈 분석**: 이전 릴리즈와 현재 릴리즈 사이의 모든 커밋과 PR을 자동으로 수집
- 🏷️ **PR 라벨 인식**: Pull Request의 라벨을 기반으로 변경사항을 자동 분류
- 🔄 **폴백 메커니즘**: AI 생성 실패 시 기본 CHANGELOG로 자동 전환
- 🧪 **완전한 테스트 커버리지**: Vitest를 사용한 유닛 테스트 포함

## 🛠️ 기술 스택

- **TypeScript**: 타입 안정성을 갖춘 개발
- **Octokit**: GitHub API 통합
- **LangChain**: AI 체인 구성
- **Ollama**: 로컬/원격 LLM 실행
- **Vitest**: 빠른 유닛 테스트
- **GitHub Actions**: CI/CD 자동화

## 📋 사전 요구사항

- Node.js 20 이상
- pnpm 9 이상
- GitHub 저장소에 대한 쓰기 권한
- Ollama 서버 (http://10.4.100.42:11434)

## 🚀 설치 및 설정

### 1. 저장소 복제

```bash
git clone <repository-url>
cd github-auto-changelog
```

### 2. 의존성 설치

```bash
pnpm install
```

### 3. 환경 변수 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성합니다:

```bash
cp .env.example .env
```

환경 변수 설정:

```env
GITHUB_TOKEN=ghp_your_github_token_here
GITHUB_REPOSITORY=owner/repo
RELEASE_TAG=v1.0.0
OLLAMA_BASE_URL=http://10.4.100.42:11434
OLLAMA_MODEL=llama3.1:latest
```

### 4. GitHub Actions 설정

이 봇은 GitHub Actions를 통해 자동으로 실행됩니다. `.github/workflows/changelog.yml` 파일이 이미 구성되어 있습니다.

**Self-hosted Runner 설정:**

저장소 설정에서 self-hosted runner를 추가하고 `common` 라벨을 지정하세요.

**GitHub Secrets 설정:**

저장소 설정 > Secrets and variables > Actions > Secrets에서 다음 secret을 추가하세요:

- `OLLAMA_BASE_URL`: Ollama 서버 URL (예: `http://10.4.100.42:11434`)

**GitHub Variables 설정:**

저장소 설정 > Secrets and variables > Actions > Variables에서 다음 변수를 추가하세요 (선택사항):

- `OLLAMA_MODEL`: 사용할 Ollama 모델 (기본값: `llama3.1:latest`)

## 📖 사용 방법

### 자동 실행 (권장)

릴리즈를 발행하면 자동으로 GitHub Actions가 실행되어 CHANGELOG를 생성합니다:

1. GitHub에서 새 릴리즈를 생성
2. 태그를 지정하고 릴리즈 발행
3. GitHub Actions가 자동으로 실행되어 CHANGELOG 생성
4. 릴리즈 노트가 자동으로 업데이트됨

### 로컬 실행

로컬에서 테스트하거나 수동으로 실행할 수 있습니다:

```bash
# TypeScript로 직접 실행
pnpm run start

# 빌드 후 실행
pnpm run build
node dist/index.js
```

## 🧪 테스트

### 유닛 테스트

```bash
# 테스트 실행 (watch 모드)
pnpm test

# 테스트 한 번만 실행
pnpm run test:run

# 커버리지 포함 테스트
pnpm run test:coverage
```

### GitHub Actions 로컬 테스트 (act 사용)

[act](https://github.com/nektos/act)를 사용하여 GitHub Actions를 로컬에서 테스트할 수 있습니다.

> 📖 **가이드 문서:**
>
> - 상세 가이드: [docs/ACT_TESTING_GUIDE.md](docs/ACT_TESTING_GUIDE.md)
> - 문제 해결: [docs/ACT_TROUBLESHOOTING.md](docs/ACT_TROUBLESHOOTING.md)
> - 실제 저장소로 테스트: [docs/TESTING_WITH_REAL_REPO.md](docs/TESTING_WITH_REAL_REPO.md)

#### 1. act 설치

**macOS:**

```bash
brew install act
```

**Linux:**

```bash
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

**Windows:**

```bash
choco install act-cli
```

#### 2. Secrets 및 Variables 설정

`.secrets.example`과 `.vars.example` 파일을 복사하여 실제 값으로 설정:

```bash
cp .secrets.example .secrets
cp .vars.example .vars
```

`.secrets` 파일 편집:

```
GITHUB_TOKEN=ghp_your_actual_token
OLLAMA_BASE_URL=http://10.4.100.42:11434
```

`.vars` 파일 편집:

```
OLLAMA_MODEL=llama3.1:latest
```

#### 3. act 실행

```bash
# pnpm 스크립트로 실행
pnpm run test:act

# 또는 직접 실행
act release -e .github/workflows/test-event.json --secret-file .secrets --var-file .vars

# Dry run (실제로 실행하지 않고 확인만)
act release -e .github/workflows/test-event.json --secret-file .secrets --var-file .vars --dryrun

# 특정 job만 실행
act release -j generate-changelog --secret-file .secrets --var-file .vars
```

**주의사항:**

- `.secrets`와 `.vars` 파일은 Git에 커밋되지 않도록 `.gitignore`에 포함되어 있습니다.
- act는 Docker를 사용하므로 Docker가 설치되어 있어야 합니다.
- Apple M-series 칩을 사용하는 경우 `.actrc`에 `--container-architecture linux/amd64` 설정이 포함되어 있습니다.
- `.secrets` 파일에 유효한 `GITHUB_TOKEN`을 설정해야 GitHub Actions (actions/setup-node 등)을 사용할 수 있습니다.
- Ollama 서버(`http://10.4.100.42:11434`)에 접근 가능한 네트워크 환경이어야 합니다.

**테스트 결과 확인:**

act를 실행하면 다음과 같은 단계가 진행됩니다:

1. ✅ Docker 이미지 pull 및 컨테이너 생성
2. ✅ 코드 체크아웃
3. ✅ Node.js 및 pnpm 설정
4. ✅ 의존성 설치 및 빌드
5. ✅ CHANGELOG 생성 스크립트 실행

워크플로우 구조 확인:

```bash
# 실행 가능한 job 목록 보기
act release --list
```

## 📁 프로젝트 구조

```
github-auto-changelog/
├── .github/
│   └── workflows/
│       ├── changelog.yml          # GitHub Actions 워크플로우
│       └── test-event.json        # act 테스트용 이벤트 데이터
├── docs/
│   └── ACT_TESTING_GUIDE.md       # act 상세 가이드
├── src/
│   ├── utils/
│   │   ├── github.ts              # GitHub API 유틸리티
│   │   ├── github.test.ts         # GitHub 유틸리티 테스트
│   │   ├── changelog.ts           # CHANGELOG 생성기
│   │   └── changelog.test.ts      # CHANGELOG 생성기 테스트
│   ├── types.ts                   # TypeScript 타입 정의
│   └── index.ts                   # 메인 엔트리 포인트
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .actrc                         # act 설정 파일
├── .secrets.example               # act secrets 예제
├── .vars.example                  # act variables 예제
├── .env.example
├── .gitignore
└── README.md
```

## 🔧 구성 옵션

### GitHub Actions 환경 변수

워크플로우에서 다음 환경 변수를 자동으로 설정합니다:

- `GITHUB_TOKEN`: GitHub Actions에서 자동 제공
- `GITHUB_REPOSITORY`: 현재 저장소 (자동 설정)
- `RELEASE_TAG`: 릴리즈 태그 (자동 설정)
- `OLLAMA_BASE_URL`: Ollama 서버 URL (GitHub Secret에서 설정 필수)
- `OLLAMA_MODEL`: 사용할 모델 (GitHub Variable로 설정, 기본값: `llama3.1:latest`)

### Ollama 모델 변경

다른 Ollama 모델을 사용하려면 저장소 설정 > Secrets and variables > Actions > Variables에서 `OLLAMA_MODEL` 변수를 추가하거나 수정하세요.

예: `llama3.2:latest`, `mistral:latest` 등

## 📝 CHANGELOG 형식

생성되는 CHANGELOG는 다음 카테고리로 구성됩니다:

- 🎉 **새로운 기능**: 추가된 새 기능
- 🐛 **버그 수정**: 수정된 버그
- ⚠️ **Breaking Changes**: 기존 사용자에게 영향을 줄 수 있는 변경사항
- 📝 **기타 변경사항**: 문서 업데이트, 리팩토링, 테스트 등

## 🤝 기여

기여는 언제나 환영합니다! Pull Request를 보내주세요.

1. 저장소 포크
2. 기능 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m '새로운 기능 추가'`)
4. 브랜치에 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 생성

## 🐛 문제 해결

### Ollama 연결 실패

Ollama 서버가 실행 중인지 확인하세요:

```bash
curl http://10.4.100.42:11434/api/version
```

또한 GitHub Secrets에 `OLLAMA_BASE_URL`이 올바르게 설정되어 있는지 확인하세요.

### GitHub API 권한 오류

`GITHUB_TOKEN`에 다음 권한이 있는지 확인하세요:

- `contents:read`
- `metadata:read`
- `pull-requests:read`

### Self-hosted Runner 문제

Runner가 온라인 상태인지 확인하고, 저장소 설정에서 Runner 상태를 확인하세요.

### Secret 및 Variable 설정 확인

저장소 설정 > Secrets and variables > Actions에서 다음이 설정되어 있는지 확인하세요:

**Secrets (필수):**

- `OLLAMA_BASE_URL`: Ollama 서버 URL

**Variables (선택사항):**

- `OLLAMA_MODEL`: Ollama 모델 이름 (미설정 시 `llama3.1:latest` 사용)

## 📄 라이선스

ISC License

## 🙋 지원

문제가 있거나 질문이 있으시면 이슈를 생성해주세요.
