// 7za.exe 包装器: 转发原始参数给真正的 7za_real.exe, 并追加 -xr!*.dylib
// 目的: electron-builder 解压 winCodeSign 时, 其中 2 个 macOS 符号链接(*.dylib)在
// 无管理员/无开发者模式的 Windows 上创建失败导致中止; 这 2 个文件 Windows 打包用不到,
// 排除后解压 exit=0 正常通过。对其它压缩包(无 .dylib)此排除无副作用。
using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class W {
  static string Q(string a){ return (a.IndexOf(' ') >= 0) ? "\"" + a + "\"" : a; }
  static int Main(string[] args){
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    string real = Path.Combine(dir, "7za_real.exe");
    StringBuilder sb = new StringBuilder();
    foreach (string a in args) { sb.Append(Q(a)); sb.Append(' '); }
    sb.Append("-xr!*.dylib");
    ProcessStartInfo psi = new ProcessStartInfo(real, sb.ToString());
    psi.UseShellExecute = false;
    Process p = Process.Start(psi);
    p.WaitForExit();
    return p.ExitCode;
  }
}
