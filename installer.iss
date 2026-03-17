#define MyAppName "Second Brain AI"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Second Brain AI"
#define MyAppExeName "SecondBrainAI.exe"

#ifndef SourceDir
  #define SourceDir "C:\AI\SecondBrainAI"
#endif

#ifndef OutputDirValue
  #define OutputDirValue "C:\AI"
#endif

[Setup]
AppId={{C1A4D555-7D7F-4A77-A149-2C1D727A31A7}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\Second Brain AI
DefaultGroupName=Second Brain AI
DisableProgramGroupPage=yes
OutputDir={#OutputDirValue}
OutputBaseFilename=Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Second Brain AI"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Second Brain AI"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Second Brain AI"; Flags: nowait postinstall skipifsilent
