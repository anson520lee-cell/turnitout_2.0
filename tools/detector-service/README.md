# Detector service

A small HTTP service around the open AI-text classifier `desklib/ai-text-detector-v1.01` (MIT licence). The
site calls it once when a report finishes (`lib/detector.ts`) and mixes its answer into the AI score
(`headlineScore` in `lib/auto-report/stitch.ts`). Design, numbers and caveats: `docs/HYBRID_DETECTOR.md`.

- `POST /score` with `{"text": "..."}` and `Authorization: Bearer $DETECTOR_TOKEN` returns `{"score": 0..1, "windows": n}`.
- `GET /health` for the host's health check.
- CPU only. The image downloads the model (about 1.7 GB) at build time; give the container at least 4 GB of RAM
  and 2 to 4 vCPUs.
- Set `DETECTOR_TOKEN` (the service refuses to start without it). Optional: `WIN_WORDS` (250), `MAX_WINDOWS` (12),
  `TORCH_THREADS` (4).

Run it locally:

    pip install -r requirements.txt
    DETECTOR_TOKEN=secret uvicorn app:app --port 8080

Host it anywhere that runs a Docker image (Modal, Render, Fly.io, Railway, a Hugging Face Space or Inference
Endpoint). It cannot run on Vercel (the model is too large). Then set `DETECTOR_URL`, `DETECTOR_TOKEN` and
`DETECTOR_ENABLED=true` in Vercel. Turning `DETECTOR_ENABLED` off, or the service being down, makes reports score
on the sentence share alone again (a failed call never fails a report).
