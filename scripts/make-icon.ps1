Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\build\icon.png'
$bmp = New-Object System.Drawing.Bitmap 512,512
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 110; $path.AddArc(16,16,$r,$r,180,90); $path.AddArc(512-16-$r,16,$r,$r,270,90); $path.AddArc(512-16-$r,512-16-$r,$r,$r,0,90); $path.AddArc(16,512-16-$r,$r,$r,90,90); $path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(239,68,59))), $path)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 26
$g.DrawRectangle($pen, 96, 120, 320, 214)
$g.FillRectangle([System.Drawing.Brushes]::White, 226, 340, 60, 40)
$g.FillRectangle([System.Drawing.Brushes]::White, 170, 380, 172, 26)
$g.Dispose(); $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
