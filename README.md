# Ocarina of Time (Z5) Client for Archipelago
## Files Included:
- `Z5Client-win32-x64-(version).exe`: This is the installer file. You'll need to download and run this to install
the client.
- `Z5Client-win32-x64-(version).zip`: This is a zip file which may be used as a stand-alone installation. It
is not recommended to use this.
- `get-bizhawk.ps1`: This is a Windows Powershell script which will download and configure BizHawk 2.7.
- `ootMulti.lua`: This is the LUA script you will need to load into BizHawk after loading the randomizer ROM.

## How to Install
**Note: The Z5Client requires either Windows 8.1 or greater, or Linux.**

### Z5Client
Simply double-click on the `Z5Client-win32-x64-(version).exe` file, and the program will automatically install
and launch. You may delete the setup file after installation.

### BizHawk 2.7
Right-click on the `get-bizhawk.ps1` file and choose "Run with PowerShell." The script will open a PowerShell
window and download and install the BizHawk prerequisites, BizHawk itself, and automatically configure some
options for you. You will still need to configure your controls upon first launching BizHawk.

## How to Play:
1. Receive a `.apz5` file from Archipelago.
2. Double-click the `.apz5` file.
3. The client will ask you to select a base rom file. This should be the english version of Ocarina of Time.
4. The client will automatically patch your base rom and place your new rom in the same location as your patch file.
5. You may need to select a default program to launch N64 roms. If this is any emulator other than the BizHawk 
downloaded during the installation process, you will need to close it and open the BizHawk 2.7 acquired using the
`get-bizhawk.ps1` file.
6. Open the `ootMulti.lua` script in the BizHawk LUA console. If the client is not running, the script will
terminate and ask you to run the Z5Client before trying to run it again.
7. Type the server address into the Z5Client "Server" box and press enter.
8. Have fun.

## Where to Acquire a Base ROM:
You must dump your base ROM file from your physical cartridge of the English version of Ocarina of Time.
There are several methods of doing so, which are outside the scope of this guide.

## Run it from Source:
```shell
git clone https://github.com/ArchipelagoMW/Z5Client.git
cd Z5Client
npm install
npm run electron-rebuild
npm run start [patchFile]
```

## Notes for Linux Users
- To patch your ROM automatically, `wine` must be installed and available in either `/usr/bin/` or `/usr/sbin`.
- Ensure the default wine configuration uses Windows 8 or greater, or the patching process will hang indefinitely