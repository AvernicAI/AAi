param(
  [Parameter(Mandatory)][string]$Directory,
  [Parameter(Mandatory)][ValidateSet('install', 'uninstall')][string]$Mode
)

$ErrorActionPreference = 'Stop'
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
try {
  $current = $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $entries = @(if ($current) { $current.Split(';') })
  $remaining = @($entries | Where-Object {
    [Environment]::ExpandEnvironmentVariables($_.Trim().Trim('"')).TrimEnd('\', '/') -ine $Directory
  })
  $updated = if ($Mode -eq 'install') { (@($Directory) + $remaining) -join ';' } else { $remaining -join ';' }

  if ($updated -ceq $current) { return }
  if ($updated) {
    $kind = if ($null -ne $current) { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
    $key.SetValue('Path', $updated, $kind)
  } else {
    $key.DeleteValue('Path', $false)
  }
} finally {
  $key.Close()
}
