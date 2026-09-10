# BLOW MVP 결정 007 — 공식 Windows 지원 범위

> 확인일: 2026-09-10
> 상태: 권장안 확정, 사용자 승인 대기
> 권장안: 최초 외부 배포는 Windows 11 25H2 64비트(x64) Home·Pro 지원
> 현재 개발 PC: Windows 10은 내부 개발·호환성 확인에만 사용하고 공식 고객지원 대상에서는 제외

## 1. 결정 대상

BLOW Windows 앱의 공식 지원 운영체제 버전, CPU 구조와 테스트 범위를 정한다.

“실행될 수 있음”과 “공식 지원”은 다르다. 공식 지원은 설치·실행·Chrome 연결·네이버 자동 입력·임시저장·제거까지 재현하고, 문제가 생겼을 때 BLOW가 수정과 고객지원을 책임지는 범위를 뜻한다.

## 2. 권장 지원 범위

최초 외부 베타와 정식 배포는 다음 환경만 공식 지원한다.

- 운영체제: Windows 11
- 최초 기준 버전: Windows 11 25H2
- 에디션: Home, Pro
- CPU 구조: 64비트 x64
- 업데이트 상태: Microsoft 월간 보안 업데이트가 적용된 상태
- 브라우저: 최신 정식 Google Chrome
- 화면 배율: 100%, 125%, 150%, 200%
- 최소 검증 해상도: 1366×768
- 권장 검증 해상도: 1920×1080 이상

새로운 일반 배포용 Windows 11 x64 기능 버전은 핵심 회귀 테스트를 통과한 뒤 지원 범위에 추가한다. Microsoft 지원이 종료된 버전은 BLOW 공식 지원에서도 제외한다.

## 3. 최초 지원에서 제외하는 환경

- Windows 10 전체
- Windows 11 24H2 이하 Home·Pro
- Windows 32비트
- Windows on ARM(ARM64)
- Windows Server
- Windows 11 Enterprise·Education의 회사 관리 환경
- macOS와 Linux
- 수정된 Windows, 비공식 경량화판과 가상화 전용 환경

제외 환경에서 앱이 우연히 실행되더라도 정상 동작을 보장하거나 전용 오류 수정을 약속하지 않는다.

## 4. Windows 10을 제외하는 이유

Windows 10 일반 지원은 2025년 10월 14일 종료됐다. 소비자용 ESU는 중요한 보안 업데이트만 임시로 제공하며 기술지원과 기능 개선을 포함하지 않고 2026년 10월 13일 끝난다.

결정일 기준 종료까지 약 한 달밖에 남지 않은 환경을 새 유료 제품의 공식 대상으로 추가하면 다음 문제가 생긴다.

- 보안 취약 운영체제에서 로그인 세션과 사용자 API 키를 처리하게 된다.
- Windows 10 전용 설치·화면·Chrome 오류를 별도로 유지해야 한다.
- 출시 직후 다시 지원 종료와 업그레이드 안내를 해야 한다.
- 적합한 Windows 11 PC가 없는 사용자의 문제를 앱 오류와 구분하기 어렵다.

따라서 Windows 10 지원 코드는 새로 만들지 않는다.

## 5. Windows 11 24H2 이하를 제외하는 이유

Windows 11 Home·Pro 24H2는 2026년 10월 13일 지원 종료 예정이며, 23H2 이하는 이미 지원이 끝났다. 24H2를 최초 지원에 넣으면 출시 준비 직후 다시 제거해야 하므로 Windows 11 25H2부터 시작한다.

Windows 11 26H1은 일부 신형 장치에 사전 설치되는 하드웨어 최적화 버전이며 기존 PC용 일반 기능 업데이트가 아니다. MVP에서는 자동으로 지원한다고 표시하지 않고 실제 x64 장치와 Chrome 자동화를 검증한 뒤 추가한다.

## 6. 64비트 x64만 지원하는 이유

현재 프로젝트는 Electron 44 계열을 사용한다. Electron 44부터 Windows 32비트 빌드가 제공되지 않고 64비트 x64와 ARM64만 제공된다.

ARM64는 별도 빌드와 실제 ARM 장치 검증이 필요하다. 초기 고객 범위가 확인되지 않은 상태에서 빌드와 QA를 두 배로 늘리지 않고 x64만 지원한다. ARM64 사용자가 실제로 확인되고 테스트 장치가 준비되면 별도 결정으로 추가한다.

## 7. 현재 Windows 10 개발 PC 처리

현재 개발·POC PC는 Windows 10 빌드 19045로 기록돼 있다. 이 PC에서는 당분간 다음 작업을 계속할 수 있다.

- 기존 POC 기능 회귀 확인
- 네이버 편집기 요소 탐지와 안전 중단 검증
- 문서·UI 개발과 단위 테스트
- Windows 10에서 우연히 발생하는 호환성 문제 참고

그러나 이 결과만으로 정식 배포 검증을 통과한 것으로 처리하지 않는다. 외부 베타 전에 Windows 11 25H2 x64 실제 PC가 최소 한 대 필요하다. 가상 머신은 설치·화면 검사의 보조 수단으로만 사용하고, Chrome 로그인과 네이버 자동 입력 최종 검증은 실제 PC에서 수행한다.

## 8. 버전 운영 규칙

1. 공식 지원 버전은 Microsoft가 Home·Pro 보안 업데이트를 제공하는 동안만 유지한다.
2. 새 일반 배포용 Windows 11 x64 버전은 출시 즉시 자동 지원하지 않는다.
3. 설치·실행·Chrome 연결·자동 입력·임시저장·제거 회귀 테스트를 통과한 뒤 추가한다.
4. 지원 종료 90일 전부터 앱과 도움말에 업그레이드 안내를 표시한다.
5. Microsoft 지원 종료일 이후에는 해당 버전의 새 자동 입력 작업을 지원하지 않는다.
6. 긴급 보안 문제나 Electron·Chrome 지원 중단이 더 빠르면 BLOW 지원도 앞당겨 종료할 수 있다.
7. 지원 범위 변경일, 마지막 지원 앱 버전과 사용자 안내를 기록한다.

현재 POC에는 운영체제 차단 로직을 추가하지 않는다. 이 규칙은 제품용 설치·업데이트 흐름을 구현할 때 적용한다.

## 9. 검증 기준

- WIN-01: Windows 11 25H2 x64 실제 PC에서 설치·실행·제거가 완료된다.
- WIN-02: Home과 Pro 중 최소 하나의 실제 PC, 다른 하나의 깨끗한 테스트 환경에서 검증한다.
- WIN-03: 최신 정식 Chrome에서 로그인·블로그 확인·글쓰기 진입이 완료된다.
- WIN-04: 제목·본문·이미지·구분선·스티커·인용구와 임시저장 회귀 테스트를 통과한다.
- WIN-05: 100%, 125%, 150%, 200% 배율에서 핵심 UI가 겹치거나 잘리지 않는다.
- WIN-06: 1366×768에서 주요 입력과 실행 버튼에 접근할 수 있다.
- WIN-07: 지원하지 않는 Windows에는 정확한 버전과 업그레이드 안내를 표시한다.
- WIN-08: 지원하지 않는 환경을 성공으로 오인하거나 무한 재시도하지 않는다.
- WIN-09: 새 Windows 기능 버전은 같은 검증을 통과하기 전 지원 목록에 노출하지 않는다.
- WIN-10: QA 결과에 Windows 버전, 빌드, 에디션, CPU 구조, Chrome 버전과 화면 배율을 기록한다.

## 10. 비용과 사용자 준비 사항

- 지금 Windows 라이선스나 새 PC를 구매하지 않는다.
- 외부 베타 전 Windows 11 25H2 x64 실제 PC를 준비해야 한다.
- 현재 PC가 Windows 11 요구사항을 충족하면 업그레이드할 수 있다.
- 현재 PC가 요구사항을 충족하지 않으면 별도 테스트 PC 비용이 생길 수 있다.
- 업그레이드 또는 장비 구매 전에 호환성, 가격과 데이터 백업 방법을 사용자에게 보고하고 승인을 받는다.

## 11. 지금 실행하지 않는 작업

- 현재 개발 PC의 Windows 업그레이드
- 새 Windows 테스트 PC 또는 라이선스 구매
- Windows 10 실행 차단
- ARM64와 32비트 패키징
- Windows Server·Enterprise 관리 환경 대응
- 운영체제별 고객지원 화면 구현

## 12. 공식 자료

- [Microsoft — Windows 11 Home and Pro lifecycle](https://learn.microsoft.com/lifecycle/products/windows-11-home-and-pro)
- [Microsoft — Supported versions of Windows client](https://learn.microsoft.com/en-us/windows/release-health/supported-versions-windows-client)
- [Microsoft — Windows 11 26H1 release status](https://learn.microsoft.com/en-us/windows/release-health/status-windows-11-26H1)
- [Microsoft — Windows 10 Extended Security Updates](https://www.microsoft.com/en-us/windows/extended-security-updates)
- [Electron 44 release — 64-bit platforms](https://www.electronjs.org/blog/electron-44-0)
- [Google Chrome system requirements](https://support.google.com/chrome/answer/95346)
