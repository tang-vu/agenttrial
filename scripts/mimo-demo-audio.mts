import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const apiKey = process.env.MIMO_API_KEY?.trim();
if (!apiKey) throw new Error("MIMO_API_KEY is required.");
if (apiKey.startsWith("tp-")) {
  throw new Error(
    "Token Plan keys are restricted to coding tools. Use a rotated regular MiMo API key for demo narration.",
  );
}

const baseUrl = (process.env.MIMO_API_BASE_URL ?? "https://api.xiaomimimo.com/v1").replace(
  /\/$/,
  "",
);
const model = process.env.MIMO_TTS_MODEL ?? "mimo-v2.5-tts";
const voice = process.env.MIMO_TTS_VOICE ?? "Dean";
const sourcePath = resolve("docs", "demo-voiceover.txt");
const videoPath = resolve("docs", "demo", "agenttrial-live-demo.mp4");
const outputDirectory = resolve("test-results", "demo-audio");
const audioPath = resolve(outputDirectory, "mimo-voiceover.wav");
const transcriptPath = resolve(outputDirectory, "mimo-asr-transcript.txt");
const finalPath = resolve("docs", "demo", "agenttrial-live-demo-narrated.mp4");
const narration = (await readFile(sourcePath, "utf8")).trim();

await mkdir(outputDirectory, { recursive: true });

async function request(body: unknown) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string; audio?: { data?: string } } }>;
  };
  if (!response.ok) {
    throw new Error(`MiMo API ${response.status}: ${payload.error?.message ?? "request failed"}`);
  }
  return payload;
}

const tts = await request({
  model,
  messages: [
    {
      role: "user",
      content:
        "Premium documentary narrator. Restrained, forensic, confident, and human. Medium pace, crisp technical terms, deliberate pauses, no salesy excitement.",
    },
    { role: "assistant", content: narration },
  ],
  audio: { format: "wav", voice },
  stream: false,
});
const encodedAudio = tts.choices?.[0]?.message?.audio?.data;
if (!encodedAudio) throw new Error("MiMo TTS response did not include audio data.");
await writeFile(audioPath, Buffer.from(encodedAudio, "base64"));

const probe = spawnSync(
  "ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", audioPath],
  { encoding: "utf8" },
);
if (probe.status !== 0) throw new Error("ffprobe could not read the generated narration.");
const duration = Number.parseFloat(probe.stdout.trim());
if (!Number.isFinite(duration) || duration < 75 || duration > 114) {
  throw new Error(
    `Narration duration ${duration.toFixed(1)}s is outside the 75–114s quality gate.`,
  );
}

const asr = await request({
  model: "mimo-v2.5-asr",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "input_audio",
          input_audio: {
            data: Buffer.from(await readFile(audioPath)).toString("base64"),
            format: "wav",
          },
        },
      ],
    },
  ],
  asr_options: { language: "en" },
  stream: false,
});
const transcript = asr.choices?.[0]?.message?.content?.trim();
if (!transcript) throw new Error("MiMo ASR response did not include a transcript.");
await writeFile(transcriptPath, `${transcript}\n`, "utf8");

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
function wordErrorRate(expected: string[], actual: string[]) {
  const row = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 1; i <= expected.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= actual.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (expected[i - 1] === actual[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[actual.length] / Math.max(1, expected.length);
}
const wer = wordErrorRate(words(narration), words(transcript));
if (wer > 0.12) throw new Error(`MiMo ASR quality gate failed: WER ${(wer * 100).toFixed(1)}%.`);

const mux = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-filter_complex",
    "[1:a]loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:st=0:d=0.35,afade=t=out:st=112:d=2,apad=pad_dur=120[a]",
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    finalPath,
  ],
  { stdio: "inherit" },
);
if (mux.status !== 0) throw new Error(`ffmpeg mux failed with status ${mux.status}.`);
console.log(
  JSON.stringify(
    { finalPath, audioPath, transcriptPath, durationSeconds: duration, wordErrorRate: wer },
    null,
    2,
  ),
);
