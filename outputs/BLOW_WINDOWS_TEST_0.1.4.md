# BLOW 0.1.4 — 분량 사후 보고와 실패 복구

## 변경 내용

- 본문 글자 수가 목표 ±10% 범위를 벗어나도 생성된 내용을 그대로 네이버에 임시저장합니다. 분량을 맞추기 위한 추가 AI 호출은 하지 않습니다.
- 완료된 작성 목록에 ‘분량 안내’를 표시하고, 작업 내역의 ‘상세 보기’에 목표·실제 본문 글자 수(공백 제외)를 표시합니다.
- 키워드 검사, 빈 본문, 로그인·블로그 불일치, 이미지 누락, 저장 확인 실패 등 다른 검사는 유지합니다. 최종 발행은 하지 않습니다.
- 실패·중단 항목에 ‘재생성’과 ‘설정 불러오기’를 추가했습니다. 재생성은 비용·중복 저장 안내에 동의한 뒤 선택한 글만 새로 실행합니다. 기존 실패 기록과 생성 내용은 보존합니다.
- 재생성 취소·목록 저장 실패 때는 AI 요청을 보내지 않습니다. 완료된 글과 다른 대기 글은 함께 재실행하지 않습니다.
- Windows 기본 확인창 대신 앱 내부 확인창을 사용하고, 취소 시 원래 버튼·삭제 시 주제 입력칸으로 초점을 돌립니다. 작성 목록, 작업 내역, API 키 삭제 및 새 편집기 전환에 같은 확인창을 적용했습니다.
- 기존 0.1.3의 네이버 글쓰기 진입 수정과 사용자 데이터·설정은 유지했습니다.

입력 불가 증상과 같은 계열의 기본 확인창 문제가 [Electron 이슈 #31917](https://github.com/electron/electron/issues/31917)에 보고되어 있습니다. 이번에는 해당 확인창 호출을 제거하고 실패·삭제 후 실제 클릭/키보드 입력을 Windows Electron 격리 환경에서 검증했습니다. 사용자 환경에서의 모든 원인이 동일하다고 단정하지는 않습니다.

## 주요 수정·생성 파일

- `apps/desktop/src/shared/writing-options.ts`: 분량 계산과 안내 공통화.
- `apps/desktop/src/main/openai-generation.ts`: 분량만 비차단 경고로 분리.
- `apps/desktop/src/renderer/automatic-writing.ts`, `writing-queue.ts`, `useWritingQueue.ts`: 경고 보관·실패 복구·확인 후 재생성.
- `apps/desktop/src/renderer/ConfirmationDialog.tsx`: 새 공통 내부 확인창.
- `apps/desktop/src/renderer/WritingQueuePanel.tsx`, `NewPostScreen.tsx`, `WorkHistoryScreen.tsx`: 복구 버튼, 설정 불러오기, 저장 후 분량 보고.
- `apps/desktop/src/renderer/OpenAiSettingsScreen.tsx`, `ConnectionScreen.tsx`: 기본 확인창을 공통 확인창으로 교체.
- `apps/desktop/src/main/openai-generation.test.ts`, `apps/desktop/src/renderer/automatic-writing.test.ts`: 회귀 테스트.
- `apps/desktop/scripts/check-writing-recovery.mjs`, `recovery-preview.cjs`: 실제 외부 서비스에 접근하지 않는 Chrome·Electron 복구 검사.
- `apps/desktop/package.json`, `package-lock.json`: 테스트 버전 0.1.4.

기존 상태 처리와 UI를 재사용하고, 새 의존성이나 데이터베이스 변경은 추가하지 않았습니다.

## 검증 결과

- 전체 자동 테스트: 30개 파일, **364개 통과**.
- 전체 워크스페이스 TypeScript 검사 통과.
- 복구 UI 검사: Chrome 8개 + Windows Electron 8개 통과.
  - 실패 직후 입력 가능, 재생성 취소·Escape·초점 복귀.
  - 원래 실패 내용과 설정 보존, 선택한 항목만 재실행, 중복 클릭 방지.
  - 분량 경고 표시와 재시작 후 보관, 완료 항목 자동 재실행 방지.
  - 반복 삭제/취소 후 재시작 없이 클릭·키보드 입력 및 새 글 등록.
  - 로컬 저장 오류와 목록 상한에서 무단 API 호출 방지.
  - API 키 삭제 취소 후 입력 가능. 실제 키를 삭제하지 않았습니다.
- 기존 자동 작성 UI 검사 11개 통과: 여러 글 순차 처리, 중단, 불확실한 저장 결과, 개별 글 설정, 비용 확인, 필수 입력 검증.
- 작은 화면, 200% 글자 크기에서 재생성 확인창 넘침 없음. 확인창 캡처 시각 검수 완료.
- 설치파일 NSIS 압축 무결성 검사 통과.
- 패키징된 메인·렌더러·네이버 어댑터가 빌드 결과와 일치하며 수정 포함 확인.
- `.env`, Chrome 프로필, `.local`, `Secure` 경로 제외 확인.

테스트는 별도 프로필과 가짜 응답을 사용했습니다. 실제 유료 AI 생성, 네이버 입력·임시저장·발행은 실행하지 않았으므로 설치 후 실사용 확인은 필요합니다.

## 설치 및 사용

1. 현재 실행 중인 BLOW와 BLOW 전용 Chrome을 닫습니다.
2. `apps/desktop/release/BLOW-Setup-0.1.4-x64.exe`를 실행해 업데이트합니다.
3. **기존 앱을 먼저 제거하지 마세요.** 제거 과정에서 로컬 설정·로그인 정보가 삭제될 수 있습니다.
4. 블로그 연결을 확인한 뒤 실패 항목의 ‘재생성’을 누릅니다. 비용 안내 확인 후 시작하면 기존 주제·모델·꾸미기·이미지 설정을 사용합니다.
5. 재생성 전 네이버 임시저장 목록에 이미 저장된 글이 있는지 확인하세요. 저장 결과가 불확실했던 항목은 중복될 수 있습니다. 기존 네이버 글은 자동 삭제하거나 덮어쓰지 않습니다.
6. 완료 후 작성 목록의 ‘분량 안내’ 또는 ‘작업 내역 → 상세 보기’를 확인합니다. 글자 수가 벗어났다는 이유만으로 멈추지 않습니다.

재생성은 새 API 호출이므로 글·이미지 사용료가 다시 발생합니다. 기존 실패 기록 보존 때문에 작성 목록의 20개 상한에 도달했다면 필요 없는 완료 기록을 먼저 정리해야 합니다.

내부 테스트용 미서명 설치파일이며 Windows 보안 경고가 나타날 수 있습니다. 코드 서명·외부 배포는 별도 작업입니다.

## 파일 및 Git 상태

- 설치파일: `apps/desktop/release/BLOW-Setup-0.1.4-x64.exe`
- 크기: 117,301,446바이트.
- SHA-256: `EBE26E24B5DC8C28572C379A564503E58A44E5E7BD983A11C312C5C42CE5BCE8`
- 브랜치: `codex/desktop-ux-simplification`.
- 기준 커밋: `e18e5fffb902454426369008149157bad9f01865`.
- 기존 미커밋 변경 보존. 이번 요청에서 커밋·푸시·PR·병합·외부 배포·자동 설치는 하지 않았습니다.
