Option Explicit

' Copy this file into the Windows Startup folder.
' Update ProjectDirectory if the project is moved to another location.
Const ProjectDirectory = "D:\0._Long\SEI\4M Report Management & Aggregation System"
Const StartupDelayMilliseconds = 15000

Dim shell, fileSystem, batchPath, command, launchError
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
batchPath = fileSystem.BuildPath(ProjectDirectory, "scripts\start-all.bat")

If Not fileSystem.FileExists(batchPath) Then
    MsgBox "Cannot find the 4M startup script:" & vbCrLf & batchPath, vbExclamation, "4M Report"
    WScript.Quit 1
End If

' Validate the target without starting services: cscript //nologo start-4m.vbs /check
If WScript.Arguments.Named.Exists("check") Then
    WScript.Echo "Startup target verified: " & batchPath
    WScript.Quit 0
End If

WScript.Sleep StartupDelayMilliseconds
shell.CurrentDirectory = ProjectDirectory
command = Quote(shell.ExpandEnvironmentStrings("%ComSpec%")) & " /d /s /c " & Quote(Quote(batchPath))

' Show the existing batch console, including any startup errors; do not wait for it.
On Error Resume Next
shell.Run command, 1, False
launchError = Err.Description
If Err.Number <> 0 Then
    On Error GoTo 0
    MsgBox "Cannot start 4M Report:" & vbCrLf & launchError, vbExclamation, "4M Report"
    WScript.Quit 1
End If
On Error GoTo 0

Function Quote(value)
    Quote = Chr(34) & value & Chr(34)
End Function
