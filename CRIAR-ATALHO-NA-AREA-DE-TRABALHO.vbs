Set oFS = CreateObject("Scripting.FileSystemObject")
strScriptDir = oFS.GetParentFolderName(WScript.ScriptFullName)

Set oWS = WScript.CreateObject("WScript.Shell")
strDesktop = oWS.SpecialFolders("Desktop")
sLinkFile = strDesktop & "\Sistema da Clinica.lnk"

Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = strScriptDir & "\INSTALAR-E-RODAR.bat"
oLink.WorkingDirectory = strScriptDir
oLink.IconLocation = strScriptDir & "\clinica.ico"
oLink.Description = "Sistema da Clinica Odontologica"
oLink.Save

MsgBox "Pronto! Foi criado um atalho ""Sistema da Clinica"" na sua Area de Trabalho." & vbCrLf & vbCrLf & "Pode fechar esta janela e usar o atalho a partir de agora.", 64, "Atalho criado"
