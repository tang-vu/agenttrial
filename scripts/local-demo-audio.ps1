param(
  [string]$Voice = "Microsoft David Desktop",
  [ValidateRange(-10, 10)]
  [int]$Rate = 1
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repositoryRoot "docs\demo-voiceover.txt"
$videoPath = Join-Path $repositoryRoot "docs\demo\agenttrial-live-demo.mp4"
$outputDirectory = Join-Path $repositoryRoot "test-results\demo-audio"
$audioPath = Join-Path $outputDirectory "local-voiceover.wav"
$publicDemoDirectory = Join-Path $repositoryRoot "apps\web\public\demo"
$finalPath = Join-Path $publicDemoDirectory "agenttrial-live-demo-narrated.mp4"

foreach ($command in @("ffmpeg", "ffprobe")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command is required and was not found on PATH."
  }
}

if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Narration source not found: $sourcePath"
}
if (-not (Test-Path -LiteralPath $videoPath)) {
  throw "Silent demo video not found: $videoPath"
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $publicDemoDirectory | Out-Null
Add-Type -AssemblyName System.Speech

$narration = (Get-Content -Raw -Encoding UTF8 -LiteralPath $sourcePath).Trim()
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $availableVoices = @($synthesizer.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
  if ($Voice -notin $availableVoices) {
    throw "Voice '$Voice' is not installed. Available voices: $($availableVoices -join ', ')"
  }
  $synthesizer.SelectVoice($Voice)
  $synthesizer.Rate = $Rate
  $synthesizer.Volume = 100
  $synthesizer.SetOutputToWaveFile($audioPath)
  $synthesizer.Speak($narration)
}
finally {
  $synthesizer.Dispose()
}

$durationText = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $audioPath
if ($LASTEXITCODE -ne 0) {
  throw "ffprobe could not read the generated narration."
}
$duration = [double]::Parse($durationText.Trim(), [Globalization.CultureInfo]::InvariantCulture)
if ($duration -lt 75 -or $duration -gt 114) {
  throw "Narration duration $($duration.ToString('0.0'))s is outside the 75-114s quality gate. Adjust -Rate."
}

$delaySeconds = 0.5
$fadeDuration = 1.25
$fadeStart = [Math]::Max($delaySeconds, $duration + $delaySeconds - $fadeDuration)
$fadeStartText = $fadeStart.ToString("0.###", [Globalization.CultureInfo]::InvariantCulture)
$filter = "[1:a]adelay=500,highpass=f=70,lowpass=f=10500,acompressor=threshold=0.09:ratio=2.5:attack=8:release=120:makeup=1.4,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000,afade=t=in:st=0.5:d=0.35,afade=t=out:st=$fadeStartText`:d=$fadeDuration,apad=pad_dur=120[a]"

& ffmpeg -y -i $videoPath -i $audioPath -filter_complex $filter -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -metadata:s:a:0 language=eng -metadata:s:a:0 title="English narration" $finalPath
if ($LASTEXITCODE -ne 0) {
  throw "ffmpeg narration mux failed."
}

$probeJson = & ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name,sample_rate,channels -of json $finalPath
if ($LASTEXITCODE -ne 0) {
  throw "ffprobe could not validate the narrated video."
}
$probe = $probeJson | ConvertFrom-Json
$streamTypes = @($probe.streams | ForEach-Object { $_.codec_type })
if ("video" -notin $streamTypes -or "audio" -notin $streamTypes) {
  throw "Narrated output is missing a video or audio stream."
}

[pscustomobject]@{
  output = $finalPath
  voice = $Voice
  rate = $Rate
  narrationSeconds = [Math]::Round($duration, 2)
  videoSeconds = [Math]::Round([double]::Parse($probe.format.duration, [Globalization.CultureInfo]::InvariantCulture), 2)
  bytes = [long]$probe.format.size
} | ConvertTo-Json
