Unicode True
RequestExecutionLevel user
SetCompressor /SOLID lzma

!include LogicLib.nsh
!include MUI2.nsh

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AvernicAI.AAi.CLI"
Name "AAi CLI"
OutFile "${CLI_SETUP}"
InstallDir "$LOCALAPPDATA\Programs\AAi CLI"
VIProductVersion "${CLI_FILE_VERSION}.0"
VIAddVersionKey "ProductName" "AAi CLI"
VIAddVersionKey "CompanyName" "AvernicAI"
VIAddVersionKey "FileDescription" "AAi CLI Setup"
VIAddVersionKey "FileVersion" "${CLI_VERSION}"
VIAddVersionKey "ProductVersion" "${CLI_VERSION}"

!define MUI_ICON "${__FILEDIR__}\..\packages\desktop\resources\icons\icon.ico"
!define MUI_FINISHPAGE_TEXT "AAi CLI ${CLI_VERSION} is installed. Open a new terminal and run aai --version."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!macro setupError MESSAGE
  SetErrorLevel 1
  MessageBox MB_OK|MB_ICONSTOP "${MESSAGE}" /SD IDOK
  Quit
!macroend

!macro updatePath MODE DIRECTORY
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=windows-cli-path.ps1 "${__FILEDIR__}\windows-cli-path.ps1"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\windows-cli-path.ps1" -Directory "${DIRECTORY}" -Mode ${MODE}'
  Pop $0
  ${If} $0 != 0
    !insertmacro setupError "Windows could not update your user PATH. See setup details and try again."
  ${EndIf}
  ; Notify Windows Explorer so new terminals see the updated user environment.
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i 0x1a, p 0, w "Environment", i 2, i 1500, *p .r0)'
!macroend

Function .onInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\AAi CLI"
FunctionEnd

Section "AAi CLI"
  ClearErrors
  SetOutPath "$INSTDIR"
  File /oname=aai.pending "${CLI_BINARY}"
  ${If} ${Errors}
    Delete "$INSTDIR\aai.pending"
    !insertmacro setupError "Windows could not write the AAi CLI files."
  ${EndIf}

  ; Replace the fully extracted binary with MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH.
  System::Call 'kernel32::MoveFileExW(w "$INSTDIR\aai.pending", w "$INSTDIR\aai.exe", i 9) i .r0'
  ${If} $0 == 0
    Delete "$INSTDIR\aai.pending"
    !insertmacro setupError "Windows could not replace aai.exe. Close any running AAi CLI sessions and run setup again."
  ${EndIf}

  ClearErrors
  WriteUninstaller "$INSTDIR\Uninstall AAi CLI.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "AAi CLI"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${CLI_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "AvernicAI"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall AAi CLI.exe$\"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  ${If} ${Errors}
    !insertmacro setupError "Windows could not register the AAi CLI installation. Run setup again."
  ${EndIf}
  !insertmacro updatePath install $INSTDIR
SectionEnd

Section "Uninstall"
  ClearErrors
  Delete "$INSTDIR\aai.exe"
  ${If} ${Errors}
    !insertmacro setupError "Windows could not remove aai.exe. Close any running AAi CLI sessions and try again."
  ${EndIf}
  ; Windows can resolve the uninstaller's path differently from the installed PATH entry.
  ReadRegStr $1 HKCU "${UNINSTALL_KEY}" "InstallLocation"
  ${If} $1 == ""
    StrCpy $1 $INSTDIR
  ${EndIf}
  !insertmacro updatePath uninstall $1
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  Delete "$INSTDIR\Uninstall AAi CLI.exe"
  RMDir "$INSTDIR"
SectionEnd
