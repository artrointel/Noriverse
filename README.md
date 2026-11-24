<img src="docs/assets/noriverse-icon.png" alt="" width="128" height="128">

# Noriverse · 놀이버스

설치와 회원가입 없이 친구를 초대하고, 같은 방에서 여러 게임을 즐기는 브라우저 게임 플랫폼입니다.

## 로컬 개발 및 실행

Node.js 24를 사용합니다. 의존성을 설치한 뒤 웹 앱과 로컬 방 서비스를 별도 터미널에서 실행합니다.

```powershell
npm ci
npm run dev:rooms
# 새 터미널
npm run dev
```

[로컬 웹 앱](http://127.0.0.1:5173/)에서 게임을 고르고 **혼자하기** 또는 **방 만들기**를 실행합니다. 친구 방은 다른 Chrome 프로필이나 시크릿 창에서 초대 링크 또는 코드로 참가해 검증할 수 있습니다. 로컬 방 서비스는 Cloudflare 계정 없이 SQLite Durable Object를 모의 실행합니다.

규칙과 프로토콜 테스트는 `npm test`, 타입 확인과 번들은 `npm run build`로 실행합니다.
로컬 Worker를 실행한 상태에서 `npm run test:profile-storage`로 테스트 프로필을 만들어 새 캐릭터와 설정을 저장하고 본인·공개 조회에서 확인합니다. 검증을 마친 테스트 프로필은 정리합니다.

## 프로젝트 문서

- [서비스 기획과 벤치마킹](docs/product.md)
- [기술 설계와 인프라 검토](docs/technical-design.md)
- [로드맵과 Phase 1 검증 기준](docs/roadmap.md)
- [햄버거 타이쿤 규칙·성장·난이도·카드](docs/burger-tycoon.md)
- [방 랭킹보드와 점수 기준](docs/room-ranking.md)
- [별길 탐사대 설정집](docs/characters.md)
- [별길 탐사대 게임 기획서](docs/startrail-crew.md)
- [장기 검토 항목](docs/long-term.md)

## GitHub Pages 첫 배포

1. 공개 GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다. [GitHub Pages 설정 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. 친구 방·프로필·즐겨찾기도 함께 열려면 프로젝트 루트에서 Cloudflare 계정에 `npm exec -- wrangler login`으로 로그인한 뒤 `npm exec -- wrangler deploy`를 실행합니다. [`wrangler.jsonc`](wrangler.jsonc)의 `APP_ORIGIN`은 `https://artrointel.github.io`로 설정되어 있습니다. 저장소 소유자나 Pages 도메인을 바꾸면 `/Noriverse/` 같은 경로를 제외한 새 Pages 출처를 입력합니다. SQLite Durable Objects는 Workers Free 플랜에서도 사용할 수 있습니다. [Wrangler 문서](https://developers.cloudflare.com/workers/wrangler/commands/) · [Durable Objects 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/)
3. Worker를 배포했다면 GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables → New repository variable**에서 `NORIVERSE_API_ORIGIN`을 추가합니다. 값은 배포 명령이 출력한 Worker의 HTTPS 출처입니다. 이 변수를 비워두면 라이브러리와 한 기기 플레이를 먼저 공개할 수 있습니다. 변수를 나중에 추가하거나 변경하면 워크플로를 다시 실행합니다. [GitHub Actions 변수 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
4. 변경 사항을 `main`에 푸시합니다. 이미 반영했다면 **Actions → GitHub Pages → Run workflow**에서 `main`을 선택합니다. [배포 워크플로](.github/workflows/pages.yml)는 테스트, 프런트엔드 빌드, Pages 배포를 실행합니다. 성공하면 [놀이버스 GitHub Pages](https://artrointel.github.io/Noriverse/)에서 라이브러리와 로컬 플레이를 열어봅니다. Worker를 연결했다면 두 브라우저로 초대 링크 참가와 프로필 저장도 확인합니다.

Pages 빌드는 저장소 하위 경로에서 에셋을 불러오고, 초대·프로필·게임 링크를 새로고침해도 같은 화면이 열리도록 해시 라우팅을 사용합니다.

새 온라인 게임을 추가하거나 공용 방 프로토콜과 프로필 저장값을 바꿀 때는 `npm exec -- wrangler deploy`로 Worker부터 배포합니다. Pages 워크플로는 공개 Worker에 테스트 프로필을 만들어 저장과 조회가 성공하는지 확인한 다음 웹을 배포합니다. 방 프로토콜을 변경한 경우 반영 후 두 브라우저에서 방 생성, 참가 및 기존 방의 게임 변경을 확인합니다.

Worker와 Pages를 함께 자동 배포하려면 GitHub Actions에 Worker 편집 권한의 `CLOUDFLARE_API_TOKEN`을 저장소 시크릿으로, `CLOUDFLARE_ACCOUNT_ID`를 저장소 변수로 등록합니다. 두 값이 등록된 경우 워크플로가 현재 커밋의 Worker를 먼저 배포하고 공개 저장 검증을 실행합니다. 두 값을 비워 두면 기존의 Worker 수동 배포 흐름을 사용합니다. [Cloudflare GitHub Actions 안내](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

## 저작권

[놀이버스 저작권 안내](LICENSE)

체스 규칙에는 [chess.js의 BSD-2-Clause 라이선스](apps/web/public/licenses/chess.js.txt)가 적용됩니다.
