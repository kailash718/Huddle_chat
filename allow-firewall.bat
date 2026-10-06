@echo off
REM Run this once as Administrator (right-click, Run as administrator).
netsh advfirewall firewall add rule name="Huddle chat" dir=in action=allow protocol=TCP localport=3000,3443 profile=any
echo.
echo Done. Other PCs can now reach Huddle on this computer.
pause
