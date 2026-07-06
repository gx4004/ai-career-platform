FROM python:3.12-slim

WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# bust cache v3 — added google-genai
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /ms-playwright

COPY --chown=appuser:appuser . .

EXPOSE 8000
USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
