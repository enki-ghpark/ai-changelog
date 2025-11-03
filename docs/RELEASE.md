# Action 릴리즈 가이드

이 프로젝트는 GitHub Action으로 패키징되어 있어, 다른 레포지토리에서 가져다 사용할 수 있습니다.

## 릴리즈 프로세스

### 1. 코드 변경 및 테스트

변경사항을 개발하고 로컬에서 테스트합니다:

```bash
# 로컬 테스트
pnpm run build
pnpm run start
```

### 2. 빌드 및 번들

Action을 사용자가 사용할 수 있도록 번들링합니다:

```bash
pnpm run package
```

이 명령은:
1. TypeScript를 JavaScript로 컴파일 (`pnpm run build`)
2. @vercel/ncc로 모든 의존성을 포함한 단일 파일로 번들링 (`pnpm run bundle`)
3. `action-dist/index.js` 생성

### 3. 번들 커밋 (필수!)

**중요**: `action-dist/` 폴더는 반드시 Git에 커밋해야 합니다.

```bash
git add action-dist/
git add src/ package.json # 기타 변경사항
git commit -m "feat: 새로운 기능 추가"
```

> 💡 왜 번들을 커밋해야 하나요?
> 
> GitHub Actions는 사용자가 Action을 사용할 때 빌드 과정 없이 즉시 실행할 수 있어야 합니다.
> 따라서 번들된 결과물(`action-dist/`)을 리포지토리에 포함해야 합니다.

### 4. 버전 태그 생성

Semantic Versioning을 따라 태그를 생성합니다:

```bash
# 메이저 버전 (Breaking Changes)
git tag -a v2.0.0 -m "Release v2.0.0: Breaking changes"

# 마이너 버전 (새로운 기능)
git tag -a v1.1.0 -m "Release v1.1.0: 여러 Ollama URL 지원 추가"

# 패치 버전 (버그 수정)
git tag -a v1.0.1 -m "Release v1.0.1: 버그 수정"
```

### 5. 태그 푸시

```bash
git push origin v1.1.0
```

### 6. 메이저 버전 태그 업데이트 (선택사항)

사용자가 `@v1`처럼 메이저 버전만 지정해도 최신 버전을 사용할 수 있도록 메이저 버전 태그를 업데이트합니다:

```bash
git tag -fa v1 -m "Update v1 to v1.1.0"
git push origin v1 --force
```

### 7. GitHub Release 생성

GitHub에서 Release를 생성하면 자동으로 CHANGELOG가 생성됩니다! 🎉

1. GitHub 저장소 > Releases > "Draft a new release"
2. 태그 선택 (예: `v1.1.0`)
3. Release 제목 입력
4. "Publish release" 클릭
5. 자동으로 CHANGELOG가 생성되어 릴리즈 노트에 추가됩니다!

## 버전 지정 권장사항

사용자에게 다음과 같은 버전 지정 방식을 권장합니다:

### ✅ 권장: 메이저 버전

```yaml
uses: YOUR_USERNAME/github-auto-changelog@v1
```

- 자동으로 v1.x.x의 최신 버전 사용
- 버그 수정과 새 기능을 자동으로 받을 수 있음
- Breaking Changes는 받지 않음

### ⚠️  특정 버전 고정

```yaml
uses: YOUR_USERNAME/github-auto-changelog@v1.1.0
```

- 특정 버전 고정
- 예측 가능하지만 수동으로 업데이트 필요

### ❌ 비권장: main 브랜치

```yaml
uses: YOUR_USERNAME/github-auto-changelog@main
```

- 최신 개발 버전 사용
- 불안정할 수 있음
- 프로덕션에서는 사용하지 마세요

## 체크리스트

릴리즈 전 확인사항:

- [ ] 코드 변경사항 커밋
- [ ] `pnpm run package` 실행
- [ ] `action-dist/` 폴더 커밋
- [ ] 버전 태그 생성 및 푸시
- [ ] 메이저 버전 태그 업데이트 (선택사항)
- [ ] GitHub Release 생성
- [ ] README.md 업데이트 (필요시)

## 자동화 스크립트

릴리즈 프로세스를 자동화하는 스크립트 예시:

```bash
#!/bin/bash
# scripts/release.sh

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh v1.1.0"
  exit 1
fi

echo "📦 Building and bundling..."
pnpm run package

echo "✅ Committing bundle..."
git add action-dist/
git commit -m "chore: update action bundle for $VERSION"

echo "🏷️  Creating tag..."
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"

MAJOR_VERSION=$(echo "$VERSION" | cut -d. -f1)
echo "🔄 Updating major version tag..."
git tag -fa "$MAJOR_VERSION" -m "Update $MAJOR_VERSION to $VERSION"
git push origin "$MAJOR_VERSION" --force

echo "✨ Release $VERSION completed!"
echo "Now create a GitHub Release at:"
echo "https://github.com/YOUR_USERNAME/github-auto-changelog/releases/new?tag=$VERSION"
```

사용법:

```bash
chmod +x scripts/release.sh
./scripts/release.sh v1.1.0
```

## 문제 해결

### 번들 파일이 너무 큼

`action-dist/index.js`가 너무 크다면:

1. 불필요한 의존성 제거
2. Tree shaking 확인
3. ncc 옵션 조정

### Action이 실행되지 않음

1. `action.yml`의 `main` 경로 확인: `action-dist/index.js`
2. `action-dist/` 폴더가 Git에 커밋되었는지 확인
3. 태그가 올바르게 푸시되었는지 확인

### 사용자가 오래된 버전을 사용중

메이저 버전 태그를 업데이트했는지 확인:

```bash
git tag -fa v1 -m "Update v1 to v1.1.0"
git push origin v1 --force
```

## 참고 자료

- [GitHub Actions - Creating a JavaScript action](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action)
- [Semantic Versioning](https://semver.org/)
- [@vercel/ncc Documentation](https://github.com/vercel/ncc)

