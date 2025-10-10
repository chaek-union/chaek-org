# 책 (Chaek) 프로젝트 - Claude AI 가이드

## 프로젝트 개요

이 프로젝트는 대학 교재를 호스팅하는 SvelteKit 기반 웹 플랫폼입니다. GitHub의 HonKit 기반 저장소를 자동으로 빌드하고 서빙합니다.

## 핵심 아키텍처

### 디렉토리 구조
- `src/routes/` - SvelteKit 라우트
  - `+page.svelte` - 메인 페이지 (교재 목록)
  - `books/[bookId]/` - 개별 교재 뷰어
  - `api/webhook/` - GitHub webhook 엔드포인트
- `src/lib/server/` - 서버 전용 모듈
  - `books.ts` - 교재 목록 및 메타데이터 관리
  - `compiler.ts` - Git 클론 및 HonKit 빌드 로직
- `books/` - 클론된 Git 저장소 (gitignored)
- `static/books/` - 컴파일된 정적 HTML (gitignored)

### 주요 플로우

1. **GitHub Webhook → 자동 빌드**
   - `chaek-union` 조직의 저장소에서 push 발생
   - `/api/webhook` 엔드포인트가 이벤트 수신
   - `compiler.ts`가 저장소 클론/업데이트
   - `npx honkit build` 실행하여 `static/books/{repo-name}/`에 출력

2. **교재 목록 표시**
   - `books.ts`가 `books/` 디렉토리 스캔
   - 컴파일된 교재만 목록에 표시
   - 한국어/영어 다국어 지원

3. **교재 읽기**
   - `/books/{bookId}` 라우트로 접근
   - iframe으로 `/books/{bookId}/index.html` 로드

## 기술 스택

- **프론트엔드**: SvelteKit, TypeScript
- **백엔드**: Node.js (SvelteKit API routes)
- **빌드**: HonKit (GitBook fork)
- **Git**: simple-git 라이브러리
- **i18n**: 커스텀 i18n 구현 (브라우저 언어 자동 감지)

## 환경 변수

환경 변수가 필요하지 않습니다. Webhook은 `chaek-union` 조직 검증만 수행합니다.

## 개발 시 주의사항

### 코드 수정 시
- 서버 전용 코드는 `src/lib/server/`에 위치해야 함
- 프론트엔드에서는 절대 `fs`, `child_process` 등 Node.js API를 직접 사용하지 말 것
- 모든 서버 로직은 `+page.server.ts`, `+server.ts` 또는 `src/lib/server/`에서만

### Webhook 보안
- `chaek-union` 조직 외의 저장소는 자동으로 거부됨
- Secret 검증은 사용하지 않음 (조직 검증만 수행)
- 모든 push 이벤트는 로그에 기록됨

### 빌드 프로세스
- HonKit 빌드는 비동기로 실행 (webhook 응답을 블로킹하지 않음)
- 빌드 실패 시 로그에만 기록되며 사용자에게는 표시되지 않음
- 빌드는 `npx honkit build` 명령어 사용 (각 저장소의 로컬 의존성 사용)

### 교재 저장소 요구사항
- HonKit 프로젝트 구조 (`book.json` 또는 `SUMMARY.md`)
- `npx honkit build` 명령어로 빌드 가능해야 함
- `chaek-union` GitHub 조직에 속해야 함

## 일반적인 작업

### 새로운 기능 추가
1. 프론트엔드 UI 변경: `src/routes/+page.svelte` 또는 관련 Svelte 파일 수정
2. API 엔드포인트 추가: `src/routes/api/` 하위에 `+server.ts` 생성
3. 서버 로직 추가: `src/lib/server/` 하위에 `.ts` 파일 생성

### 디버깅
- 개발 서버: `npm run dev`
- 빌드 로그: 콘솔 출력 확인 (`console.log`, `console.error`)
- Webhook 테스트: `/api/webhook`에 GET 요청으로 상태 확인 가능

### 배포
- 빌드: `npm run build`
- 실행: `node build` 또는 `node build/index.js`
- 포트: 기본값은 3000 (환경변수 `PORT`로 변경 가능)

## 알려진 제약사항

1. 교재는 반드시 `chaek-union` 조직에 속해야 함
2. HonKit 빌드 실패 시 사용자에게 에러 표시 안 됨 (개선 필요)
3. 교재 메타데이터는 파일시스템 기반 (DB 없음)
4. 빌드 진행 상태 추적 불가능 (개선 필요)
5. 동시 빌드 시 충돌 가능성 (락 메커니즘 없음)

## 기여 가이드라인

- UI 텍스트는 한국어/영어 번역 파일(`src/lib/i18n/locales/`)에 추가
- 코드 주석은 영어 또는 한국어 모두 가능
- TypeScript strict 모드 준수
- 서버/클라이언트 코드 경계 명확히 구분

## 다국어 지원

- 브라우저 언어 설정에 따라 자동으로 한국어/영어 선택
- localStorage에 사용자 언어 선택 저장
- 번역 파일: `src/lib/i18n/locales/{ko,en}.json`
- i18n 로직: `src/lib/i18n/index.ts`
