# BLOW MVP 결정 006 — Windows 코드 서명

> 확인일: 2026-09-10
> 상태: 사용자 승인 완료 — 정식 외부 배포 전까지 실행 보류
> 확정안: Microsoft Azure Artifact Signing Basic, Korea Central, Public Trust
> 적용 시점: 네이버의 서면 허락과 판매 주체 확정 후, 첫 외부 베타 배포 전에 완료

## 1. 결정 대상

BLOW Windows 설치 파일을 외부 사용자에게 배포할 때 사용할 코드 서명 방식과 적용 조건을 정한다.

코드 서명은 파일을 만든 배포 주체와 서명 후 파일이 변조되지 않았음을 Windows가 확인하는 장치다. 악성코드가 없음을 보증하거나 새 프로그램의 Microsoft Defender SmartScreen 경고를 즉시 없애는 기능은 아니다.

## 2. 권장 방식

다음 방식을 기본안으로 권장한다.

- 공급자: Microsoft Azure Artifact Signing
- 요금제: Basic
- Azure 리소스 지역: Korea Central
- 인증서 프로필: Public Trust
- 서명 알고리즘: Windows가 신뢰하는 RSA 기반 서명
- 배포 방식: 서명된 Windows 설치 파일을 BLOW 공식 사이트에서 직접 제공
- Microsoft Store: MVP 기본 경로에서는 제외하고 추후 별도 검토

현재 공식 요금은 월 미화 9.99달러에 월 5,000회 서명이 포함된다. 환율, 세금과 Microsoft 가격 변경에 따라 실제 청구액은 달라질 수 있다.

## 3. 이 방식을 권장하는 이유

- Microsoft가 Store 밖에서 배포하는 Windows 앱의 권장 서명 서비스로 안내한다.
- Korea Central 리소스 지역을 지원한다.
- 공개 배포용 Public Trust 인증서를 사용할 수 있다.
- 인증서의 개인 키를 개발자 PC나 Git 저장소에 내려받아 보관하지 않는다.
- 월 5,000회는 BLOW MVP의 예상 서명 횟수보다 충분히 많다.
- 고가의 EV 인증서도 새 앱의 SmartScreen 평판을 즉시 만들어 주지 않으므로 EV 프리미엄을 우선 지출할 이유가 적다.

## 4. 반드시 알아야 할 제한

### 4.1 한국 사업자 확인

Microsoft의 현재 자격 기준상 한국은 조직(Organization) 공개 신뢰 인증을 지원하지만 개인 개발자 공개 신뢰 인증 대상 국가는 미국과 캐나다로 제한된다.

따라서 다음이 준비되어야 한다.

- 대한민국에 등록된 법인 또는 개인사업자 등 검증 가능한 판매 주체
- 사업자 법적 명칭과 등록 정보
- 해당 주체가 소유한 공식 웹사이트 도메인
- 해당 도메인의 대표 이메일과 보조 이메일
- 대표자 또는 권한 있는 담당자의 신원 확인

Windows에 표시되는 게시자 이름은 임의의 제품명보다 검증된 법적 사업자 명칭을 따를 수 있다. “BLOW”를 표시하려면 상호 또는 DBA 검증 가능 여부를 신청 전에 확인한다.

### 4.2 SmartScreen 경고

유효한 서명은 “알 수 없는 게시자” 문제를 줄이지만 새 파일과 새 게시자는 다운로드 평판이 쌓이기 전까지 SmartScreen 경고가 나타날 수 있다. Microsoft는 현재 EV 서명도 즉시 경고를 우회하지 않는다고 안내한다.

따라서 초기 베타에서는 다음을 함께 준비한다.

- 서명된 파일만 공식 다운로드 페이지에 게시
- 게시자 이름과 설치 파일 SHA-256 해시 공개
- 설치 경고가 나타날 때 사용자가 확인할 항목 안내
- 실제 Windows 10·11의 깨끗한 PC에서 경고 화면 기록
- 서명 후 파일을 다시 압축하거나 수정하지 않음

### 4.3 심사와 갱신

조직 확인은 즉시 끝난다고 가정하지 않는다. 신청 정보가 부족하면 며칠 이상 걸릴 수 있고, 신원 확인 갱신이 만료되면 새 릴리스 서명이 중단될 수 있다. Microsoft는 갱신 과정이 1~20영업일 걸릴 수 있다고 안내하므로 만료 전에 갱신 알림을 둔다.

## 5. 적용 범위

외부로 전달되는 다음 파일을 모두 서명한다.

- 최종 설치 프로그램(EXE 또는 MSI)
- Electron 실행 파일과 배포 패키지
- BLOW가 직접 빌드한 실행 파일과 DLL
- 자동 업데이트를 도입할 경우 업데이트 패키지

다른 회사가 이미 서명한 Electron, Chrome 또는 운영체제 파일의 서명을 다시 만들지 않는다. BLOW가 최종 패키징하면서 변경한 파일은 최종 상태에서 다시 검증한다.

## 6. 보안 운영 기준

- 서명 권한은 릴리스 전용 계정에 최소 권한으로 부여한다.
- 가능하면 장기 보관 비밀키 대신 짧게 유효한 연합 인증을 사용한다.
- Azure 비밀값과 계정 정보는 코드, Git, 설치 앱과 로그에 넣지 않는다.
- 개발자가 임의로 로컬 파일을 서명하지 못하도록 정식 릴리스 절차에서만 실행한다.
- 모든 서명은 RFC 3161 타임스탬프를 포함한다.
- 서명 작업과 권한 변경 기록을 보관한다.
- Azure 비용 예산과 알림을 설정한다.
- 서명 전 악성코드 검사와 빌드 재현성 확인을 수행한다.

## 7. 적용 순서

1. 네이버로부터 상용 자동 입력에 대한 서면 허락을 받는다.
2. BLOW의 실제 판매 주체와 법적 게시자 이름을 확정한다.
3. 공식 도메인, 도메인 이메일과 사업자 웹사이트를 준비한다.
4. Windows 설치 패키징과 릴리스 절차를 준비한다.
5. 사용자에게 Azure 계정, 월 비용과 검증 제출 정보를 다시 보고한다.
6. 정식 외부 배포 준비 시점에 실제 가격과 자격 조건을 다시 확인하고, 계정 생성·구독·사업자 자료 제출 범위를 사용자에게 보고한 뒤 Artifact Signing Basic을 신청한다.
7. Korea Central 리소스와 Public Trust 인증서 프로필을 만든다.
8. 릴리스 자동화에 서명과 타임스탬프를 연결한다.
9. 깨끗한 Windows 10·11 환경에서 설치, 게시자와 서명 무결성을 확인한다.
10. 첫 외부 베타 파일을 배포한다.

## 8. 대체안

Artifact Signing의 조직 검증을 통과하지 못하면 신뢰받는 인증기관의 OV RSA 코드 서명 인증서를 대체안으로 검토한다.

- 인증기관 2~3곳의 가격, 발급 주체와 보관 방식 비교
- 클라우드 HSM 또는 보안 토큰 요구 조건 확인
- 법적 게시자 이름과 갱신 비용 확인
- 업체·상품·금액을 사용자에게 보고하고 별도 승인 후 구매

SmartScreen 경고 제거만을 목적으로 EV 인증서를 구매하지 않는다. 자체 서명 인증서나 무서명 설치 파일은 내부 개발 PC에서만 허용하며 외부 사용자에게 배포하지 않는다.

## 9. 완료 기준

- SIGN-01: 설치 파일과 BLOW가 빌드한 실행 파일에 유효한 Authenticode 서명이 있다.
- SIGN-02: Windows 게시자 이름이 검증된 실제 판매 주체와 일치한다.
- SIGN-03: Public Trust RSA 서명과 RFC 3161 타임스탬프가 확인된다.
- SIGN-04: 서명 뒤 파일이 변경되면 검증이 실패한다.
- SIGN-05: 무서명 빌드는 외부 배포 단계에서 자동 차단된다.
- SIGN-06: 서명 권한은 최소 권한 계정으로 제한되고 감사 기록이 남는다.
- SIGN-07: 코드, Git, 앱과 로그에 Azure 비밀정보가 없다.
- SIGN-08: 깨끗한 Windows 10·11에서 설치와 게시자 표시를 확인한다.
- SIGN-09: 초기 SmartScreen 경고 가능성과 안전 확인 방법이 안내된다.
- SIGN-10: 공식 다운로드 페이지에 버전, 게시자와 SHA-256 해시가 표시된다.
- SIGN-11: 월 예산 알림과 신원 확인 갱신 알림이 설정된다.

## 10. 비용과 승인 기준

- 현재 Basic 요금: 월 미화 9.99달러, 월 5,000회 서명 포함
- 초과 요금: 현재 서명 1회당 미화 0.005달러
- Azure의 다른 유료 리소스는 이 결정에 포함하지 않는다.
- 계정 생성, 사업자 자료 제출, 구독과 결제는 사용자 별도 승인 후 수행한다.
- 가격과 자격 기준은 실제 신청 직전에 공식 페이지에서 다시 확인한다.
- 이번 승인은 도입 방식과 시점에 대한 승인이다. Azure 계정 생성, 사업자 자료 제출과 유료 구독 실행은 정식 배포 준비 시점에 별도로 확인한다.

## 11. 지금 실행하지 않는 작업

- Azure 계정 또는 유료 구독 생성
- Artifact Signing 신원 검증 신청
- 사업자 서류와 대표자 신원정보 외부 제출
- 인증서 프로필과 서명 권한 생성
- Electron 패키징 도구 또는 배포 파이프라인 변경
- 서명 인증서 구매와 외부 설치 파일 배포

네이버의 서면 허락과 판매 주체가 확정되기 전에는 코드 서명 비용을 지출하지 않는다.

## 12. 공식 자료

- [Electron — Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Microsoft — SmartScreen application reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [Microsoft — Smart App Control and code signing](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control)
- [Microsoft — Artifact Signing quickstart and eligibility](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [Microsoft — Artifact Signing pricing](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/)
- [Microsoft — Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)
- [Microsoft — Artifact Signing trust models](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-trust-models)
- [Microsoft — Artifact Signing roles](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-resources-roles)
- [Microsoft — Renew identity validation](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-renew-identity-validation)
