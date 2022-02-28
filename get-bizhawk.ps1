# The purpose of this script is to download a automatically configure a standalone installation of the
# BizHawk 2.7 emulator. This standalone version is intended to be used with the Archipelago implementation
# of The Legend of Zelda: Ocarina of Time randomizer. BizHawk will be installed to the working directory.
echo "BizHawk 2.7 Standalone Setup"

# Used for downloading files
Import-Module BitsTransfer
$workingDirectory = (Get-Location).Path

# Download BizHawk 2.7 Prerequisites
echo "Downloading BizHawk 2.7 Prerequisites..."
$url = "https://github.com/TASEmulators/BizHawk-Prereqs/releases/download/2.4.8_1/bizhawk_prereqs_v2.4.8_1.zip"
$fileName = "BizHawk-2.7-Prerequisites.zip"
Start-BitsTransfer -Source $url -Destination $fileName

# Decompress BizHawk 2.7 Prerequisites
$tempDir = "$workingDirectory\BizHawk-2.7-Prerequisites"
Expand-Archive -Path "$workingDirectory\$fileName" -DestinationPath $tempDir
Remove-Item $fileName

# Install the prerequisites, then delete the installer
echo "Installing the BizHawk 2.7 Prerequisites. This script will resume when the installer completes."
Start-Process "$tempDir\bizhawk_prereqs.exe" -Wait
Remove-Item $tempDir -Recurse

# Download BizHawk
echo "Downloading BizHawk 2.7..."
$url = "https://github.com/TASEmulators/BizHawk/releases/download/2.7/BizHawk-2.7-win-x64.zip"
$fileName = "BizHawk-2.7.zip"
Start-BitsTransfer -Source $url -Destination $fileName

# Decompress BizHawk
echo "Copying BizHawk 2.7 into local directory..."
$bizHawkDir = "$workingDirectory\BizHawk-2.7"
Expand-Archive -Path "$workingDirectory\$fileName" -DestinationPath $bizHawkDir
Remove-Item "$workingDirectory\$fileName"

# Briefly run BizHawk so it generates its config file
echo "Launching BizHawk 2.7 to create config.ini file. It will be closed automatically after ten seconds."
Start-Process "$bizHawkDir\EmuHawk.exe"
Start-Sleep -s 10
Get-Process EmuHawk | Foreach-Object { $_.CloseMainWindow() }

# Set some config options
echo "Updating BizHawk 2.7 configuration options..."
Start-Sleep 2 # Give time for BizHawk to write its config file
$config = Get-Content -Path "$bizHawkDir\config.ini" -Raw
$config = $config -replace '"UseNLua": true', '"UseNLua": false' # Disable NLua
$config = $config -replace '"BackupSaveram": false', '"BackupSaveram": true' # Enable SRAM backups
$config = $config -replace '"AutosaveSaveRAM": false', '"AutosaveSaveRAM": true' # Enable automatic backup of SRAM
$config = $config -replace '"Bindings": ".*"', '"Bindings": ""' # Disable all hotkeys
$config = $config -replace '"DefaultBinding": ".*"', '"DefaultBinding": ""' # Disable all default hotkeys
$config = $config -replace '"RunInBackground": false', '"RunInBackground": true' # Run in background
$config = $config -replace '"AcceptBackgroundInput": false', '"AcceptBackgroundInput": true' # Enable background input

# Disable some annoying default control settings
echo "Disabling annoying default control settings..."
$config = $config -replace '"P1 A Up": ".*"', '"P1 A Up": ""'
$config = $config -replace '"P1 A Down": ".*"', '"P1 A Down": ""'
$config = $config -replace '"P1 A Left": ".*"', '"P1 A Left": ""'
$config = $config -replace '"P1 A Right": ".*"', '"P1 A Right": ""'

# Write the updated config file
Out-File -FilePath "$bizHawkDir\config.ini" -InputObject $config

# Download LuaSocket
echo "Downloading LuaSocket..."
$url = "http://files.luaforge.net/releases/luasocket/luasocket/luasocket-2.0.2/luasocket-2.0.2-lua-5.1.2-Win32-vc8.zip"
$fileName = "luasocket.zip"
Start-BitsTransfer -Source $url -Destination $fileName

# Decompress LuaSocket
$tempDir = "$workingDirectory\luasocket"
Expand-Archive -Path "$workingDirectory\$fileName" -DestinationPath $tempDir
Remove-Item $fileName

# Copy LuaSocket into BizHawk
echo "Installing LuaSocket into BizHawk 2.7..."
Move-Item -Path "$tempDir\mime" -Destination $bizHawkDir
Move-Item -Path "$tempDir\socket" -Destination $bizHawkDir
Move-Item -Path "$tempDir\lua\*" -Destination "$bizHawkDir\Lua"
Move-Item -Path "$tempDir\lua5.1.dll" -Destination "$bizHawkDir\dll"
Remove-Item $tempDir -Recurse

# Notify the user the script is complete
Write-Host -NoNewLine "BizHawk 2.7 Standalone Setup complete! Press enter to close this script."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
