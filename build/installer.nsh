; Cloudglass setup wizard (included by electron-builder's NSIS template).
;
; Installer: Welcome -> License agreement -> Setup type (Express / Custom)
;            -> [Custom only: install folder -> shortcuts] -> Install -> Finish
; Uninstaller: asks whether to also erase the user's Cloudglass data.
;
; Installs are always per-user: no administrator rights are needed.

!include nsDialogs.nsh

; "I accept / I do not accept" instead of a bare "I Agree" button.
!define MUI_LICENSEPAGE_RADIOBUTTONS

!ifndef BUILD_UNINSTALLER

Var cgCustom      ; "1" when the user picked Custom setup
Var cgDesktop     ; "1" = keep the desktop shortcut
Var cgStartMenu   ; "1" = keep the Start menu shortcut
Var cgExpressRadio
Var cgCustomRadio
Var cgDesktopCheck
Var cgStartMenuCheck

!macro customInit
  StrCpy $cgCustom "0"
  StrCpy $cgDesktop "1"
  StrCpy $cgStartMenu "1"
!macroend

; Always install for the current Windows account only (skips the
; "only for me / anyone" page and never asks for elevation).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Cloudglass Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard installs Cloudglass ${VERSION}, a privacy-focused desktop app for SoundCloud with a liquid-glass design.$\r$\n$\r$\nCloudglass is an unofficial, independent project. It is not affiliated with, endorsed by or sponsored by SoundCloud.$\r$\n$\r$\nCloudglass has no telemetry and installs only for your Windows account, so no administrator rights are needed.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  !include StrContains.nsh

  ; ---------------------------------------------------------- setup type
  Function cgSetButtonText
    GetDlgItem $1 $HWNDPARENT 1
    ${NSD_GetState} $cgExpressRadio $0
    ${if} $0 == ${BST_CHECKED}
      SendMessage $1 ${WM_SETTEXT} 0 "STR:&Install"
    ${else}
      SendMessage $1 ${WM_SETTEXT} 0 "STR:&Next >"
    ${endif}
  FunctionEnd

  Function cgOnSetupTypeClick
    Pop $0
    Call cgSetButtonText
  FunctionEnd

  Function cgSetupTypeShow
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "Choose Setup Type" "Choose how you want to install Cloudglass."
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateRadioButton} 0 4u 100% 12u "&Express (recommended)"
    Pop $cgExpressRadio
    ${NSD_AddStyle} $cgExpressRadio ${WS_GROUP}
    ${NSD_OnClick} $cgExpressRadio cgOnSetupTypeClick
    ${NSD_CreateLabel} 13u 18u -13u 26u "Installs Cloudglass in the standard location for your account, with a Start menu and a desktop shortcut."
    Pop $0

    ${NSD_CreateRadioButton} 0 52u 100% 12u "&Custom"
    Pop $cgCustomRadio
    ${NSD_OnClick} $cgCustomRadio cgOnSetupTypeClick
    ${NSD_CreateLabel} 13u 66u -13u 26u "Choose the install folder and which shortcuts to create."
    Pop $0

    ${if} $cgCustom == "1"
      ${NSD_Check} $cgCustomRadio
    ${else}
      ${NSD_Check} $cgExpressRadio
    ${endif}
    Call cgSetButtonText
    nsDialogs::Show
  FunctionEnd

  Function cgSetupTypeLeave
    ${NSD_GetState} $cgCustomRadio $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $cgCustom "1"
    ${else}
      StrCpy $cgCustom "0"
      StrCpy $cgDesktop "1"
      StrCpy $cgStartMenu "1"
    ${endif}
  FunctionEnd

  Page custom cgSetupTypeShow cgSetupTypeLeave

  ; ------------------------------------------------- install folder (Custom)
  Function cgDirectoryPre
    ${if} ${isUpdated}
    ${orIf} $cgCustom != "1"
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE cgDirectoryPre
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Setup will install Cloudglass in the following folder. To install in a different folder, click Browse and select another folder. Choose a folder your Windows account can write to."
  !insertmacro MUI_PAGE_DIRECTORY

  ; ------------------------------------------------------ shortcuts (Custom)
  Function cgOptionsShow
    ${if} ${isUpdated}
    ${orIf} $cgCustom != "1"
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "Choose Shortcuts" "Choose where Cloudglass should appear."
    nsDialogs::Create 1018
    Pop $0

    ${NSD_CreateCheckbox} 0 4u 100% 12u "Create a &Start menu shortcut"
    Pop $cgStartMenuCheck
    ${NSD_CreateCheckbox} 0 22u 100% 12u "Create a &desktop shortcut"
    Pop $cgDesktopCheck

    ${if} $cgStartMenu == "1"
      ${NSD_Check} $cgStartMenuCheck
    ${endif}
    ${if} $cgDesktop == "1"
      ${NSD_Check} $cgDesktopCheck
    ${endif}
    nsDialogs::Show
  FunctionEnd

  Function cgOptionsLeave
    ${NSD_GetState} $cgStartMenuCheck $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $cgStartMenu "1"
    ${else}
      StrCpy $cgStartMenu "0"
    ${endif}
    ${NSD_GetState} $cgDesktopCheck $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $cgDesktop "1"
    ${else}
      StrCpy $cgDesktop "0"
    ${endif}
  FunctionEnd

  Page custom cgOptionsShow cgOptionsLeave

  ; Make sure a custom folder always ends in its own "cloudglass" sub-folder.
  Function cgInstFilesPre
    ${if} $cgCustom == "1"
      ${StrContains} $0 "${APP_FILENAME}" $INSTDIR
      ${if} $0 == ""
        StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
      ${endif}
    ${endif}
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_PRE cgInstFilesPre
!macroend

; electron-builder creates both shortcuts; drop the ones the user unticked.
!macro customInstall
  ${ifNot} ${isUpdated}
    ${if} $cgDesktop != "1"
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
    ${endif}
    ${if} $cgStartMenu != "1"
      WinShell::UninstShortcut "$newStartMenuLink"
      Delete "$newStartMenuLink"
      StrCpy $launchLink "$appExe"
    ${endif}
  ${endif}
!macroend

!else

; Uninstall: offer to remove the user's data too (never during updates or
; silent uninstalls, where the answer defaults to "No").
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also remove your Cloudglass data from this PC?$\r$\n$\r$\nThis deletes your settings and your SoundCloud sign-in (cookies, cache and site storage) stored by Cloudglass. Your SoundCloud account itself is not affected." /SD IDNO IDNO cgKeepUserData
      SetShellVarContext current
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
    cgKeepUserData:
  ${endif}
!macroend

!endif
