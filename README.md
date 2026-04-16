# yoonky-kor.github.io

Hugo + PaperMod 테마 기반 기술 블로그

## 구조

```
kyyoon.github.io/
├── .github/
│   └── workflows/
│       ├── deploy.yml          # Hugo 빌드 & GitHub Pages 배포
│       └── notion-sync.yml     # Notion 자동 동기화
├── archetypes/
│   ├── default.md              # 기본 frontmatter 템플릿
│   └── posts.md                # 포스트 전용 템플릿
├── content/
│   ├── about.md                # About 페이지
│   ├── archives.md             # 아카이브 페이지
│   ├── search.md               # 검색 페이지
│   └── posts/                  # 블로그 포스트
│       └── hello-world.md
├── scripts/
│   ├── notion-sync.js          # Notion → Hugo 동기화 스크립트
│   └── package.json            # 패키지 설정
├── themes/
│   └── PaperMod/               # PaperMod 테마 (submodule)
└── hugo.toml                   # Hugo 설정
```

## 배포

`main` 브랜치에 push 시 GitHub Actions가 자동으로 Hugo 빌드 후 GitHub Pages에 배포합니다.

## Notion 동기화

### 설정

GitHub 저장소 Settings > Secrets and variables > Actions에 다음 시크릿 추가:

| 시크릿 | 설명 |
|--------|------|
| `NOTION_TOKEN` | Notion Integration Token |
| `NOTION_DATABASE_ID` | 동기화할 Notion 데이터베이스 ID |

### Notion 데이터베이스 속성

| 속성명 | 타입 | 설명 |
|--------|------|------|
| Title | Title | 포스트 제목 |
| Slug | Rich Text | URL 슬러그 (영문) |
| Date | Date | 발행일 |
| Status | Select | `Published` 상태인 항목만 동기화 |
| Tags | Multi-select | 태그 |
| Categories | Multi-select | 카테고리 |
| Description | Rich Text | 포스트 설명 |

### 수동 실행

GitHub Actions > Notion Sync > Run workflow

## 로컬 개발

```bash
# Hugo 서버 실행
hugo server -D

# 새 포스트 생성
hugo new posts/my-post.md
```
