FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/market-api/pyproject.toml ./pyproject.toml
COPY services/market-api/app ./app
RUN pip install --no-cache-dir . \
    && groupadd --gid 10001 weiwei \
    && useradd --uid 10001 --gid weiwei --no-create-home --shell /usr/sbin/nologin weiwei \
    && mkdir -p /var/lib/weiwei \
    && chown -R weiwei:weiwei /var/lib/weiwei

USER weiwei
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
