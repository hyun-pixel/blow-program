!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "BLOW 제거 및 로컬 데이터 삭제"
  !define MUI_WELCOMEPAGE_TEXT "계속하면 BLOW 프로그램과 BLOW가 만든 로컬 데이터가 모두 삭제됩니다.$\r$\n$\r$\n삭제 대상: 브랜드 프로필, 작업 내역과 본문, 생성 이미지, OpenAI API 키, 전용 Chrome 프로필과 네이버 로그인 세션$\r$\n$\r$\n삭제한 데이터는 복구할 수 없습니다. 사용자가 원래 위치에서 선택한 원본 첨부파일은 삭제하지 않습니다.$\r$\n$\r$\n제거하려면 [다음]을 누르세요."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    SetShellVarContext current
    RMDir /r "$LOCALAPPDATA\BLOW"
    RMDir /r "$APPDATA\BLOW"
  ${endIf}
!macroend
