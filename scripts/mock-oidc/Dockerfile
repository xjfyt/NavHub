FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir cryptography
COPY server.py .
EXPOSE 8089
CMD ["python", "server.py"]
