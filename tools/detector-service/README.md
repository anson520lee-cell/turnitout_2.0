# Detector service

A small HTTP service around the open AI-text classifier `desklib/ai-text-detector-v1.01` (MIT licence). The
site calls it once when a report finishes (`lib/detector.ts`) and mixes its answer into the AI score
(`headlineScore` in `lib/auto-report/stitch.ts`). Design, numbers and caveats: `docs/HYBRID_DETECTOR.md`.

- `POST /score` with `{"text": "..."}` and `Authorization: Bearer $DETECTOR_TOKEN` returns `{"score": 0..1, "windows": n}`.
- `POST /sentences` with `{"sentences": [...]}` returns `{"scores": [...], "windows": n}`, one score per sentence (used by `DETECTOR_MODE=primary`).
- `GET /health` for the host's health check.
- CPU only. The image downloads the model (about 1.7 GB) at build time; give the container at least 4 GB of RAM
  and 2 to 4 vCPUs.
- Set `DETECTOR_TOKEN` (the service refuses to start without it). Optional: `WIN_WORDS` (250), `MAX_WINDOWS` (12),
  `TORCH_THREADS` (4).

Run it locally:

    pip install -r requirements.txt
    DETECTOR_TOKEN=secret uvicorn app:app --port 8080

Recommended host: Google Cloud Run (scales to zero; the monthly free tier of 180,000 vCPU-s and 360,000 GiB-s covers
about 45,000 s of a 4 vCPU / 8 GiB instance, roughly 4,000 reports a month; beyond that about US$0.00012 per second).
From this folder, with the `gcloud` CLI signed in and billing enabled on the project:

    gcloud run deploy detector --source . --region us-central1 --cpu 4 --memory 8Gi --concurrency 1 \
      --min-instances 0 --max-instances 2 --timeout 120 --allow-unauthenticated \
      --set-env-vars DETECTOR_TOKEN=<a long random secret>

(`--allow-unauthenticated` only opens the URL; every request still needs the bearer token.) The first request after
idle takes about 30 to 40 s while the model loads; the site wakes the service when a report starts. It cannot run on
Vercel (the model is too large); any other Docker host works too (Modal, Render, Fly.io). Then set `DETECTOR_URL`, `DETECTOR_TOKEN` and
`DETECTOR_ENABLED=true` in Vercel. Turning `DETECTOR_ENABLED` off, or the service being down, makes reports score
on the sentence share alone again (a failed call never fails a report).
