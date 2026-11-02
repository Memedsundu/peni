@echo off
title Penny Kopru - otomatik baslatma
chcp 65001 >nul

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%~dp0Penny Kopru.bat"
set "LINK=%STARTUP%\Penny Kopru.lnk"
set "VBS=%TEMP%\penny-kopru-kisayol.vbs"

echo Set s = WScript.CreateObject("WScript.Shell") > "%VBS%"
echo Set l = s.CreateShortcut("%LINK%") >> "%VBS%"
echo l.TargetPath = "%TARGET%" >> "%VBS%"
echo l.WorkingDirectory = "%~dp0" >> "%VBS%"
echo l.WindowStyle = 7 >> "%VBS%"
echo l.Description = "Penny Kopru: yazarkasayi Penny'ye baglar" >> "%VBS%"
echo l.Save >> "%VBS%"
cscript //nologo "%VBS%"
del "%VBS%"

if exist "%LINK%" (
    echo Tamam: Penny Kopru, Windows her acildiginda kendiliginden baslayacak.
    echo Kaldirmak icin bu dosyayi silin: %LINK%
) else (
    echo Kisayol olusturulamadi.
)
pause
