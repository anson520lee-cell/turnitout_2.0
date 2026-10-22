FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
# Download the model into the image so the service starts without reaching Hugging Face.
RUN python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download("desklib/ai-text-detector-v1.01")
PY
ENV HF_HUB_OFFLINE=1
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
