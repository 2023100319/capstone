# Rebuilds the Ericahlicious logo assets from the client's 600x600 PNG.
#
#   powershell -File scripts/make-logo-assets.ps1 -Source <path>
#
# The source's background was removed to full transparency, so the crop is
# flattened onto white — the logo's own plate colour — before resizing, keeping
# the round avatars and the favicon working on both light and dark surfaces.
# Outputs (written straight over the files every screen reads):
#   public/logo-customer.png    512x512
#   public/logo-staff.png       256x256
#   src/app/icon.png            512x512
#   src/app/apple-icon.png      180x180
#   public/logo-full-lockup.png the untouched original (monogram + text)

param(
  [Parameter(Mandatory = $true)]
  [string]$Source
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root "public"
$app = Join-Path $root "src/app"

$src = New-Object System.Drawing.Bitmap($Source)

# Monogram bounds measured by an alpha scan (scripts comments in docs/): the inked
# circle sits at x 156..443, y 122..411 on the 600x600 source. Crop a square
# centred on it with a few px of headroom so the ring's antialiased edge survives.
$cx = 299.5
$cy = 266.5
$side = 298
$x0 = [int][Math]::Round($cx - $side / 2)
$y0 = [int][Math]::Round($cy - $side / 2)

function Save-Asset([int]$size, [string]$file) {
  # Crop at full resolution, flattened onto white (the logo's own plate colour —
  # the avatar is clipped to a circle anyway, and on the dark sidebar a
  # transparent plate would leave the mark floating with no badge behind it).
  $flat = New-Object System.Drawing.Bitmap($side, $side)
  $flat.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($flat)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $srcRect = New-Object System.Drawing.Rectangle($x0, $y0, $side, $side)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $side, $side)), $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  # Resize to the requested square, same quality settings.
  $scaled = New-Object System.Drawing.Bitmap($size, $size)
  $g2 = [System.Drawing.Graphics]::FromImage($scaled)
  $g2.Clear([System.Drawing.Color]::White)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g2.DrawImage($flat, 0, 0, $size, $size)
  $g2.Dispose()

  $scaled.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $scaled.Dispose()
  $flat.Dispose()
  Write-Host "wrote $file ($([System.IO.File]::ReadAllBytes($file).Length) bytes)"
}

Save-Asset 512 (Join-Path $public "logo-customer.png")
Save-Asset 256 (Join-Path $public "logo-staff.png")
Save-Asset 512 (Join-Path $app "icon.png")
Save-Asset 180 (Join-Path $app "apple-icon.png")

Copy-Item $Source (Join-Path $public "logo-full-lockup.png") -Force
Write-Host "copied full lockup to public/logo-full-lockup.png"

$src.Dispose()

