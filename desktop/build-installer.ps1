# 打 NSIS 安装包 (无需管理员 / 无需开发者模式)
# 用 pwsh 运行:  & .\build-installer.ps1
# 原理见 _7za_wrap.cs: 临时把 builder 调用的 7za.exe 换成"排除 *.dylib"的包装器, 打完自动还原。
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bin  = Join-Path $root 'node_modules\7zip-bin\win\x64'
$real = Join-Path $bin '7za.exe'
$realRenamed = Join-Path $bin '7za_real.exe'
$csFile = Join-Path $root '_7za_wrap.cs'
if (-not (Test-Path $csFile)) { throw "_7za_wrap.cs 缺失" }
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { $csc = "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe" }
if (-not (Test-Path $csc)) { throw "csc.exe 未找到; 请改用开启 Windows 开发者模式后打包" }

# 应用包装器
if (-not (Test-Path $realRenamed)) { Rename-Item $real $realRenamed }
if (Test-Path $real) { Remove-Item $real -Force }
& $csc /nologo /target:exe "/out:$real" $csFile | Out-Null
if (-not (Test-Path $real)) { throw "包装器编译失败" }

$code = 1
try {
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  & npx electron-builder --win nsis
  $code = $LASTEXITCODE
} finally {
  # 还原真正的 7za.exe (无论成败)
  if (Test-Path $realRenamed) {
    if (Test-Path $real) { Remove-Item $real -Force -ErrorAction SilentlyContinue }
    Rename-Item $realRenamed $real
  }
}
"BUILD EXIT: $code"
