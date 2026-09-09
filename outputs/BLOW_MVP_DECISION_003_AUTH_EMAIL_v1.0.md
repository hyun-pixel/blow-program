# BLOW MVP 결정 003 — 인증 메일 발송

> 확인일: 2026-09-09
> 상태: 권장안 확정, 사용자 승인 대기
> 권장안: Amazon SES 서울 리전과 Supabase Auth 연동
> 예상 발송비: 1,000건당 0.10–0.16달러부터

## 1. 결정 대상

회원가입 이메일 인증, 비밀번호 재설정과 이메일 변경 확인 메일을 발송할 서비스를 정한다. 홍보·뉴스레터 메일은 이번 범위에 포함하지 않는다.

Supabase 기본 메일 서버는 테스트용이며 외부 사용자에게는 사실상 사용할 수 없다. 공식 문서상 허가된 팀 주소 외에는 보내지 못하고 현재 시간당 2건 제한이며 전달 보장도 없다. 따라서 출시에는 사용자 지정 SMTP가 필요하다.

## 2. 권장안

Amazon SES의 서울 리전 `ap-northeast-2`를 권장한다.

- Supabase가 지원하는 표준 SMTP로 연결할 수 있다.
- 서울 리전에서 API·SMTP를 모두 제공한다.
- 사용량 기반 발송은 요금 방식에 따라 1,000건당 0.10–0.16달러이며 초기 20명 규모에서는 발송 비용이 매우 작다.
- AWS는 별도 명시가 없는 지역 서비스의 고객 콘텐츠를 선택한 리전에서 처리·저장한다고 안내한다. 실제 메일 전달 과정에서는 수신자의 메일 사업자 네트워크로 데이터가 전송된다.
- Resend보다 설정은 복잡하지만 회원 이메일과 인증 메일을 미국에 30일 보관하는 문제를 피하기 쉽다.

신규 SES 계정은 Essentials 요금으로 시작할 수 있으며, 공식 가격 페이지에서 사용량 기반 À la carte 방식으로 전환할 수 있다고 안내한다. 가입 시 실제 적용 요금을 다시 확인한다.

AWS 계정 전체 권한을 가진 루트 키는 사용하지 않는다. SES 전용 SMTP 자격증명만 Supabase의 비밀 설정에 저장한다.

## 3. 후보 비교

| 후보 | 비용 | 데이터 위치·보관 | 설정 난이도 | 판단 |
|---|---:|---|---|---|
| Amazon SES 서울 | 사용량 기반 1,000건당 0.10–0.16달러 | 서울 리전 선택 가능 | AWS 계정, 발신 도메인 검증과 운영 전환 심사 필요 | 권장 |
| Resend | 월 3,000건·일 100건 무료, Pro 월 20달러 | 메일 내용·로그·계정 기록을 미국에 30일 보관 | Supabase 연동이 가장 간단함 | 개인정보 국외 처리 수용 시 차선 |
| Postmark | 개발용 월 100건 무료, 이후 10,000건 단위 유료 | 별도 개인정보·비용 검토 필요 | 안정적인 거래 메일 중심 서비스 | 초기 규모에는 과함 |
| Supabase 기본 SMTP | 무료 | Supabase 기본 처리 | 설정 불필요 | 외부 사용자 운영 불가 |

비용과 정책은 2026-09-09 공식 자료 기준이며 변경될 수 있다. 환율, 세금과 AWS의 다른 서비스를 함께 사용할 때 발생하는 비용은 별도다.

## 4. 필요한 발신 도메인

운영 전에 BLOW가 소유하고 DNS를 수정할 수 있는 도메인이 필요하다.

권장 구조:

- 인증 링크 도메인: `auth.사용도메인`
- 발신 주소: `no-reply@auth.사용도메인`
- 답장 주소: 실제 고객지원 메일
- 메일 종류: 회원가입 인증, 비밀번호 재설정, 이메일 변경

SPF, DKIM과 DMARC를 설정한다. 처음에는 DMARC를 모니터링 모드로 시작하고 정상 발송을 확인한 뒤 격리 또는 거부 정책으로 강화한다.

## 5. 개인정보와 보안 기준

- 이메일 주소와 인증 링크가 발송 사업자에게 전달된다는 사실을 개인정보처리방침에 적는다.
- 인증 메일에 이름, 브랜드명, 블로그 주소나 작성 내용을 넣지 않는다.
- SMTP 비밀번호는 Supabase Dashboard의 비밀 설정에만 저장하고 Git·데스크톱 앱·로그에 남기지 않는다.
- AWS 루트 계정에 MFA를 설정하고 일상 작업에는 최소 권한 IAM을 사용한다.
- SES 자격증명은 발송 기능만 허용하고 정기 교체한다.
- 반송·수신 거부 주소는 재발송하지 않도록 억제 목록을 처리한다.
- 인증 메일과 향후 마케팅 메일의 발신 체계·동의·목록을 분리한다.
- 링크 추적과 열람 추적은 사용하지 않는다.
- 메일의 단일 사용 링크가 보안 스캐너에 의해 먼저 열릴 수 있으므로, 자체 확인 페이지에서 사용자가 버튼을 누른 뒤 인증을 완료하도록 설계한다.

## 6. Amazon SES 제약

새 AWS 계정의 SES는 리전별 Sandbox에서 시작한다.

- 검증한 이메일 주소로만 발송할 수 있다.
- 24시간당 최대 200건, 초당 1건으로 제한된다.
- 실제 사용자에게 보내기 전에 서울 리전에서 Production access를 신청해야 한다.
- Production access 승인은 보장되지 않으며 사용 목적과 반송·불만 처리 방법을 설명해야 한다.

개발 중에는 Sandbox와 테스트 주소만 사용하고, 외부 베타 전에 운영 전환과 발송 도메인 검증을 완료한다.

## 7. Supabase 연결 설정

승인 후 설정 경로:

1. AWS Console에서 리전을 “Asia Pacific (Seoul)”로 선택한다.
2. SES에서 발신 도메인을 등록하고 DNS에 DKIM·SPF·DMARC 레코드를 추가한다.
3. SES 전용 SMTP 자격증명을 만든다.
4. Supabase Dashboard에서 `Authentication → Emails → SMTP Settings`를 연다.
5. 서울 SES SMTP 호스트, 포트, 사용자명과 비밀번호를 입력한다.
6. 발신자명은 “BLOW”, 발신 주소는 전용 `no-reply` 주소로 설정한다.
7. 인증·재설정·이메일 변경 템플릿을 한국어로 작성한다.
8. 링크·열람 추적을 끄고 Gmail, Naver Mail과 다음 메일에서 전달을 확인한다.
9. 개발 검증 후 SES Production access를 신청한다.

## 8. 완료 기준

- EML-01: 가입 인증, 비밀번호 재설정과 이메일 변경 메일이 세 시험 메일함에 도착한다.
- EML-02: SPF, DKIM과 DMARC 검사 결과가 통과한다.
- EML-03: 인증 링크가 만료·중복 사용·보안 스캔 상황에서 안전하게 실패한다.
- EML-04: 존재하지 않는 계정의 재설정 요청도 계정 존재 여부를 노출하지 않는다.
- EML-05: SMTP 비밀정보가 저장소, 데스크톱 앱과 로그에 없다.
- EML-06: 반송·불만 처리와 재발송 차단이 동작한다.
- EML-07: AWS 비용 알림과 월 지출 한도가 설정된다.
- EML-08: 개인정보처리방침에 메일 발송 위탁·처리 항목이 반영된다.

## 9. 승인 후 실행 순서

1. 사용할 제품 도메인과 DNS 관리 권한을 확인한다.
2. AWS 계정의 루트 MFA와 비용 알림을 설정한다.
3. 서울 리전 SES Sandbox에서 발신 도메인과 시험 주소를 검증한다.
4. Supabase 개발 프로젝트의 사용자 지정 SMTP에 연결한다.
5. 세 종류의 인증 메일과 오류 조건을 테스트한다.
6. 개인정보 고지와 반송 처리 절차를 확정한다.
7. 외부 베타 직전에 Production access를 신청한다.

## 10. 아직 실행하지 않는 작업

- AWS 계정 생성과 카드 등록
- 도메인 구매 또는 DNS 변경
- SES Production access 신청
- SMTP 비밀번호 생성·저장
- 실제 사용자 이메일 발송

이 작업은 사용자 승인과 도메인 확정 후 진행한다.

## 11. 공식 자료

- [Supabase 사용자 지정 SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase 운영 체크리스트](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Amazon SES 가격](https://aws.amazon.com/ses/pricing/)
- [Amazon SES 서울 엔드포인트](https://docs.aws.amazon.com/general/latest/gr/ses.html)
- [Amazon SES Sandbox와 운영 전환](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [Amazon SES SPF·DKIM·DMARC](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html)
- [Resend 가격](https://resend.com/pricing)
- [Resend 데이터 위치와 보관](https://www.resend.com/security/gdpr)
- [Resend와 Supabase 연동](https://resend.com/docs/send-with-supabase-smtp)
