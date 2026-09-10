# BLOW MVP 결정 007 — 공식 Windows 지원 범위

> 확인일: 2026-09-10
> 상태: 사용자 승인 완료
> 확정안: Windows 10 22H2 x64와 Windows 11 x64 Home·Pro 모두 공식 지원
> 표시 정책: Windows 10에 별도의 제한 지원 표시를 하지 않음

## 1. 결정 대상

BLOW Windows 앱의 공식 지원 운영체제 버전, CPU 구조와 테스트 범위를 정한다.

Windows 10과 Windows 11은 고객 화면에서 같은 지원 대상으로 취급한다. 설치·실행·Chrome 연결·네이버 자동 입력·임시저장·제거까지 같은 핵심 기능을 검증하며 Windows 10에 “제한 지원” 문구를 표시하지 않는다.

## 2. 확정 지원 범위

최초 외부 베타와 정식 배포는 다음 환경을 공식 지원한다.

### Windows 10

- 버전: Windows 10 22H2
- 빌드 계열: 19045
- 에디션: Home, Pro
- CPU 구조: 64비트 x64

### Windows 11

- 버전: Windows 11 23H2 이상
- 최초 주 검증 버전: Windows 11 25H2
- 에디션: Home, Pro
- CPU 구조: 64비트 x64

### 공통 조건

- 사용자 PC에 설치된 최신 정식 Google Chrome 사용
- BLOW 최신 또는 지원 중인 앱 버전 사용
- 화면 배율 100%, 125%, 150%, 200%
- 최소 검증 해상도 1366×768
- 권장 검증 해상도 1920×1080 이상

## 3. 지원하지 않는 환경

- Windows 10 21H2 이하
- Windows 32비트
- Windows on ARM(ARM64)
- Windows Server
- 회사 정책으로 Chrome 자동화가 차단된 관리형 PC
- macOS와 Linux
- 수정된 Windows, 비공식 경량화판과 가상화 전용 환경

Windows 11의 새 기능 버전은 실제 x64 환경에서 핵심 회귀 테스트를 통과한 뒤 지원 목록에 추가한다.

## 4. Windows 10의 보안 위험

Windows 10 일반 지원은 2025년 10월 14일 종료됐다. 소비자용 ESU는 중요한 보안 업데이트만 임시로 제공하며 기술지원과 기능 개선을 포함하지 않고 2026년 10월 13일 끝난다.

이 사실은 BLOW가 Windows 10에서 작동하지 않는다는 뜻이 아니다. 현재 프로젝트의 Electron과 최신 Chrome은 Windows 10에서 실행되며, 현재 개발 PC에서도 핵심 POC를 통과했다.

다만 운영체제 보안 업데이트가 없으면 다음 위험이 Windows 11보다 커질 수 있다.

- 악성코드가 로컬 파일과 로그인 세션에 접근할 위험
- 사용자 OpenAI API 키와 브라우저 정보가 탈취될 위험
- 새 보안 취약점이 발견돼도 운영체제 수정이 제공되지 않을 위험
- 향후 Chrome 또는 Electron이 Windows 10 지원을 종료할 가능성

이 위험은 BLOW 코드만으로 완전히 제거할 수 없다.

## 5. 화면 표시 정책

- Windows 10과 Windows 11을 동일한 공식 지원 대상으로 표시한다.
- Windows 10에 “제한 지원”, “비권장” 또는 별도 경고 배지를 표시하지 않는다.
- 운영체제 차이만으로 기능을 줄이거나 이용권을 제한하지 않는다.
- 일반 시스템 요구사항에는 Windows 10 22H2 또는 Windows 11 x64라고 표시한다.
- Chrome 또는 Electron이 Windows 10 지원을 실제로 종료해 정상 작동을 보장할 수 없게 되면 별도 제품 결정과 사전 안내 후 지원 범위를 변경한다.

## 6. 보안 보완 기준

Windows 10 지원을 포함하더라도 기존 보안 기준을 낮추지 않는다.

- OpenAI API 키는 Windows DPAPI 또는 동등한 보안 저장소로 보호
- 네이버 비밀번호와 로그인 세션은 BLOW 서버에 저장하지 않음
- 사용자 글과 이미지는 서버로 전송하지 않음
- Electron 보안 업데이트를 지원 주기 안에 적용
- 최신 정식 Chrome 사용
- 코드 서명된 설치 파일만 외부 배포
- 로그에 API 키, 로그인 정보와 글 내용을 남기지 않음
- 보안상 위험한 BLOW 구버전은 필수 업데이트로 차단

## 7. 64비트 x64만 지원하는 이유

현재 프로젝트는 Electron 44 계열을 사용한다. Electron 44부터 Windows 32비트 빌드가 제공되지 않고 64비트 x64와 ARM64만 제공된다.

ARM64는 별도 빌드와 실제 ARM 장치 검증이 필요하므로 MVP에서는 x64만 지원한다. ARM64 사용자가 실제로 확인되고 테스트 장치가 준비되면 별도 결정으로 추가한다.

## 8. 테스트 환경

현재 Windows 10 빌드 19045 개발 PC는 공식 Windows 10 검증 환경으로 계속 사용한다.

외부 베타 전에는 다음 실제 PC 검증이 필요하다.

1. Windows 10 22H2 x64 실제 PC
2. Windows 11 25H2 x64 실제 PC
3. 각 PC의 최신 정식 Chrome
4. 설치·실행·Chrome 연결·네이버 로그인·자동 입력·임시저장·제거
5. 100%, 125%, 150%, 200% 화면 배율
6. 네트워크 단절, 사용자 개입과 편집기 변경 시 안전 중단

가상 머신은 설치와 화면 검사의 보조 수단으로 사용할 수 있지만 Chrome 로그인과 네이버 자동 입력 최종 검증은 실제 PC에서 수행한다.

## 9. 지원 범위 변경 규칙

1. 새 Windows 버전을 자동으로 지원 목록에 추가하지 않는다.
2. 핵심 회귀 테스트를 통과한 뒤 추가한다.
3. Chrome 또는 Electron이 특정 Windows 버전 지원을 종료하면 실제 영향과 대체 방법을 확인한다.
4. 정상 작동을 더 이상 보장할 수 없을 때만 지원 종료를 결정한다.
5. 지원 종료가 필요하면 적용일과 이유를 사전에 안내한다.
6. 운영체제 지원 여부를 오류 메시지로 임의 판단하지 않고 실제 버전과 실패 원인을 구분한다.

## 10. 완료 기준

- WIN-01: Windows 10 22H2 x64 실제 PC에서 설치·실행·제거가 완료된다.
- WIN-02: Windows 11 25H2 x64 실제 PC에서 설치·실행·제거가 완료된다.
- WIN-03: 두 운영체제의 최신 정식 Chrome에서 로그인·블로그 확인·글쓰기 진입이 완료된다.
- WIN-04: 제목·본문·이미지·구분선·스티커·인용구와 임시저장 회귀 테스트를 통과한다.
- WIN-05: 100%, 125%, 150%, 200% 배율에서 핵심 UI가 겹치거나 잘리지 않는다.
- WIN-06: 1366×768에서 주요 입력과 실행 버튼에 접근할 수 있다.
- WIN-07: Windows 10과 11에 같은 핵심 기능과 지원 문구를 제공한다.
- WIN-08: 운영체제 차이 때문에 작업이 무한 재시도되거나 잘못 성공 처리되지 않는다.
- WIN-09: 새 Windows 기능 버전은 같은 검증을 통과한 뒤 지원한다.
- WIN-10: QA 결과에 Windows 버전, 빌드, 에디션, CPU 구조, Chrome 버전과 화면 배율을 기록한다.

## 11. 비용과 사용자 준비 사항

- 지금 Windows 라이선스나 새 PC를 구매하지 않는다.
- 현재 PC는 Windows 10 테스트 장비로 계속 사용한다.
- 외부 베타 전 Windows 11 25H2 x64 실제 PC가 최소 한 대 필요하다.
- 현재 PC 업그레이드 또는 별도 장비가 필요하면 호환성, 가격과 데이터 백업 방법을 먼저 보고하고 사용자 승인 후 진행한다.

## 12. 지금 실행하지 않는 작업

- 현재 개발 PC의 Windows 업그레이드
- 새 Windows 테스트 PC 또는 라이선스 구매
- 운영체제별 기능 차등이나 제한 지원 표시
- Windows 10 실행 차단
- ARM64와 32비트 패키징
- Windows Server와 macOS·Linux 지원

## 13. 공식 자료

- [Microsoft — Windows 11 Home and Pro lifecycle](https://learn.microsoft.com/lifecycle/products/windows-11-home-and-pro)
- [Microsoft — Supported versions of Windows client](https://learn.microsoft.com/en-us/windows/release-health/supported-versions-windows-client)
- [Microsoft — Windows 10 Extended Security Updates](https://www.microsoft.com/en-us/windows/extended-security-updates)
- [Electron 44 release — 64-bit platforms](https://www.electronjs.org/blog/electron-44-0)
- [Electron — Windows 10 or later requirement](https://www.electronjs.org/docs/latest/breaking-changes)
- [Google Chrome system requirements](https://support.google.com/chrome/answer/95346)
