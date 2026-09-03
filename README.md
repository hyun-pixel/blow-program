# BLOW

BLOW는 브랜드 블로그 실무자가 글과 이미지를 준비하고, 전용 Chrome에서 네이버 블로그 임시저장까지 진행하는 Windows 데스크톱 프로그램입니다.

현재 저장소는 자동 입력 핵심 기능을 검증하는 POC 단계입니다. 실제 네이버 연결 전에 로컬 가짜 편집기에서 다음 흐름을 검증합니다.

1. BLOW 전용 Chrome 프로필 실행
2. 제목과 본문 입력
3. 입력 결과 재확인
4. 임시저장 실행 및 상태 확인

최종 발행 기능은 구현하지 않습니다.

## 개발 명령

```powershell
npm install
npm run test
npm run build
npm run dev
```

Chrome이 설치된 개발 PC에서는 다음 명령으로 로컬 가짜 편집기 자동화를 직접 확인할 수 있습니다.

```powershell
npm run poc:mock
```

POC 실행 중 생성되는 Chrome 프로필과 로컬 데이터는 Git에 포함되지 않습니다. API 키, 네이버 로그인 정보, 글과 이미지를 코드나 로그에 기록하지 않습니다.
