param([Parameter(Mandatory=$true)][string]$PayloadFile)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class AAiInput {
  public static string CancelPath;
  public static long ExpectedWindow;
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Mouse { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort VK, Scan; public uint Flags, Time; public UIntPtr Extra; }
  [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Mouse Mouse; [FieldOffset(0)] public Keyboard Keyboard; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public Union Data; }
  public class Window { public string id, title; public uint pid; public Rect bounds; }
  delegate bool WindowCallback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint map);
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, Input[] inputs, int size);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static void Send(Input input) {
    if (SendInput(1, new Input[] { input }, Marshal.SizeOf(typeof(Input))) != 1)
      throw new Exception("Windows refused input. Elevated applications and secure desktops cannot be controlled from AAi.");
  }
  public static Point Cursor() { Point point; GetCursorPos(out point); return point; }
  public static void CheckStop() {
    if (CancelPath != null && System.IO.File.Exists(CancelPath)) throw new Exception("Desktop control cancelled by AAi Stop.");
    if (ExpectedWindow != 0 && GetForegroundWindow().ToInt64() != ExpectedWindow) throw new Exception("The foreground window changed; desktop input stopped.");
    Point point = Cursor();
    if ((GetAsyncKeyState(27) & 0x8000) != 0 || (point.X == 0 && point.Y == 0))
      throw new Exception("Desktop control stopped: Escape held or pointer at the primary screen's top-left corner.");
  }
  public static void Wait(int milliseconds) {
    for (int elapsed = 0; elapsed < milliseconds; elapsed += 10) {
      CheckStop(); Thread.Sleep(Math.Min(10, milliseconds - elapsed));
    }
  }
  public static void Key(ushort key, bool up) {
    uint flags = 8u | (up ? 2u : 0u);
    if ((key >= 33 && key <= 46) || key == 91 || key == 92) flags |= 1;
    Send(new Input { Type = 1, Data = new Union { Keyboard = new Keyboard { Scan = (ushort)MapVirtualKey(key, 0), Flags = flags } } });
  }
  public static void Type(string text) {
    foreach (char character in text) {
      CheckStop();
      Send(new Input { Type = 1, Data = new Union { Keyboard = new Keyboard { Scan = character, Flags = 4 } } });
      Send(new Input { Type = 1, Data = new Union { Keyboard = new Keyboard { Scan = character, Flags = 6 } } });
    }
  }
  public static void MouseButton(string button, bool up) {
    uint flags = button == "right" ? (up ? 16u : 8u) : button == "middle" ? (up ? 64u : 32u) : (up ? 4u : 2u);
    Send(new Input { Data = new Union { Mouse = new Mouse { Flags = flags } } });
  }
  public static void Scroll(int amount, bool horizontal) {
    Send(new Input { Data = new Union { Mouse = new Mouse { Flags = horizontal ? 4096u : 2048u, Data = unchecked((uint)(amount * 120)) } } });
  }
  public static Window Describe(IntPtr handle) {
    StringBuilder text = new StringBuilder(2048); GetWindowText(handle, text, text.Capacity);
    uint pid; GetWindowThreadProcessId(handle, out pid); Rect rect; GetWindowRect(handle, out rect);
    return new Window { id = handle.ToInt64().ToString(), title = text.ToString(), pid = pid, bounds = rect };
  }
  public static Window[] Windows() {
    var windows = new List<Window>();
    EnumWindows((handle, data) => { if (IsWindowVisible(handle)) { var window = Describe(handle); if (window.title.Length > 0) windows.Add(window); } return windows.Count < 100; }, IntPtr.Zero);
    return windows.ToArray();
  }
  public static void Focus(long id) {
    var handle = new IntPtr(id); ShowWindow(handle, 9);
    if (!SetForegroundWindow(handle) && GetForegroundWindow() != handle)
      throw new Exception("Windows did not grant focus. Ask the user to focus the target application.");
  }
}
'@
[void][AAiInput]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$request = [IO.File]::ReadAllText($PayloadFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
[AAiInput]::CancelPath = $request.cancelPath
$results = [Collections.Generic.List[object]]::new()
$images = [Collections.Generic.List[object]]::new()
$keys = @{ CTRL=17; CONTROL=17; SHIFT=16; ALT=18; META=91; WIN=91; ENTER=13; RETURN=13; TAB=9; ESC=27; ESCAPE=27; SPACE=32; BACKSPACE=8; DELETE=46; INSERT=45; HOME=36; END=35; PAGEUP=33; PAGEDOWN=34; LEFT=37; UP=38; RIGHT=39; DOWN=40; CAPSLOCK=20 }
function KeyCode([string]$name) {
  $name = $name.ToUpperInvariant()
  if ($keys.ContainsKey($name)) { return [uint16]$keys[$name] }
  if ($name -match '^[A-Z0-9]$') { return [uint16][char]$name }
  if ($name -match '^F([1-9]|1[0-9]|2[0-4])$') { return [uint16](111 + [int]$Matches[1]) }
  throw "Unsupported key '$name'. Use letters, digits, F1-F24, or a documented key name."
}
try {
  if (![Environment]::UserInteractive) { throw 'No interactive Windows desktop is available.' }
  foreach ($action in $request.actions) {
    [AAiInput]::ExpectedWindow = 0
    if ($action.type -notin @('status','screenshot')) {
      if ($request.windowID -and $action.type -ne 'focus') { [AAiInput]::ExpectedWindow = [long]$request.windowID }
      [AAiInput]::CheckStop()
    }
    $data = @{ completed = $true }
    switch ($action.type) {
      'status' {
        $data = @{ platform='windows'; foreground=[AAiInput]::Describe([AAiInput]::GetForegroundWindow()); cursor=[AAiInput]::Cursor(); windows=@([AAiInput]::Windows()); screens=@([Windows.Forms.Screen]::AllScreens | ForEach-Object { @{ name=$_.DeviceName; primary=$_.Primary; bounds=@{ x=$_.Bounds.X; y=$_.Bounds.Y; width=$_.Bounds.Width; height=$_.Bounds.Height } } }); stop='Hold Escape or move the pointer to primary-screen coordinates 0,0; AAi Stop cancels further tool calls.' }
      }
      'focus' {
        if (!$request.windowID) { throw 'focus requires windowID from status.' }
        [AAiInput]::Focus([long]$request.windowID)
      }
      'move' { [void][AAiInput]::SetCursorPos($action.x, $action.y) }
      'click' {
        if ($null -ne $action.x) { [void][AAiInput]::SetCursorPos($action.x, $action.y) }
        $button = if ($action.button) { $action.button } else { 'left' }
        $count = if ($action.count) { $action.count } else { 1 }
        for ($i=0; $i -lt $count; $i++) {
          try { [AAiInput]::MouseButton($button, $false); [AAiInput]::Wait(30) }
          finally { [AAiInput]::MouseButton($button, $true) }
        }
      }
      'drag' {
        [void][AAiInput]::SetCursorPos($action.x, $action.y)
        try {
          [AAiInput]::MouseButton('left', $false)
          for ($i=1; $i -le 20; $i++) {
            [AAiInput]::Wait(20)
            [void][AAiInput]::SetCursorPos([int]($action.x + ($action.toX-$action.x)*$i/20), [int]($action.y + ($action.toY-$action.y)*$i/20))
          }
        } finally { [AAiInput]::MouseButton('left', $true) }
      }
      'scroll' { [AAiInput]::Scroll($action.amount, [bool]$action.horizontal) }
      'type' { [AAiInput]::Type($action.text) }
      'press' {
        $codes = @($action.key.Split('+') | ForEach-Object { KeyCode $_ })
        $pressed = [Collections.Generic.List[uint16]]::new()
        try {
          foreach ($code in $codes) { [AAiInput]::Key($code, $false); $pressed.Add($code) }
          [AAiInput]::Wait($(if ($action.durationMs) { $action.durationMs } else { 30 }))
        } finally { for ($i=$pressed.Count-1; $i -ge 0; $i--) { [AAiInput]::Key($pressed[$i], $true) } }
      }
      'screenshot' {
        $bounds = [Windows.Forms.SystemInformation]::VirtualScreen
        if ($request.windowID) {
          $window = [AAiInput]::Describe([IntPtr]::new([long]$request.windowID))
          $bounds = [Drawing.Rectangle]::new($window.bounds.Left, $window.bounds.Top, $window.bounds.Right-$window.bounds.Left, $window.bounds.Bottom-$window.bounds.Top)
        }
        if ($action.region) { $bounds = [Drawing.Rectangle]::new($action.region.x, $action.region.y, $action.region.width, $action.region.height) }
        $bounds = [Drawing.Rectangle]::Intersect($bounds, [Windows.Forms.SystemInformation]::VirtualScreen)
        if ($bounds.Width -le 0 -or $bounds.Height -le 0) { throw 'Screenshot region is outside the desktop.' }
        $bitmap = [Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $stream = [IO.MemoryStream]::new()
        $scaled = $null
        try {
          $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
          $ratio = [Math]::Min(1, 1600.0 / [Math]::Max($bounds.Width, $bounds.Height))
          $scaled = [Drawing.Bitmap]::new($bitmap, [int]($bounds.Width*$ratio), [int]($bounds.Height*$ratio))
          $scaled.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
          $images.Add(@{ name='desktop.png'; data=[Convert]::ToBase64String($stream.ToArray()) })
          $data = @{ origin=@{x=$bounds.X;y=$bounds.Y}; desktopWidth=$bounds.Width; desktopHeight=$bounds.Height; imageWidth=$scaled.Width; imageHeight=$scaled.Height; note='Coordinates use physical desktop pixels. Scale image positions by desktopWidth/imageWidth and add origin.' }
        } finally { if ($scaled) { $scaled.Dispose() }; $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
      }
    }
    $results.Add(@{ type=$action.type; data=$data })
  }
  @{ results=@($results.ToArray()); images=@($images.ToArray()) } | ConvertTo-Json -Depth 12 -Compress
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
