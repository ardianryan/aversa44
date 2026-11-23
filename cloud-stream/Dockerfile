FROM alpine:3.24
RUN apk add --no-cache python3 py3-psycopg2 py3-cryptography py3-pyzmq gstreamer-tools gst-plugins-rs-fallbackswitch gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav ffmpeg stunnel curl ca-certificates \
 && curl -fsSL https://github.com/bluenviron/mediamtx/releases/download/v1.21.3/mediamtx_v1.21.3_linux_amd64.tar.gz | tar -xz -C /usr/local/bin mediamtx \
 && apk del curl
WORKDIR /app
COPY cloud-stream/worker.py /app/worker.py
COPY public/assets/backgrounds/bg-imperial-velvet-stardust.png /app/background.png
COPY public/assets/png/aversa-brand-combination.png /app/logo.png
RUN addgroup -S -g 1000 stream && adduser -S -u 1000 -G stream stream && mkdir -p /data && chown stream:stream /data
USER stream
EXPOSE 1935/tcp 8890/udp
CMD ["python3", "-u", "/app/worker.py"]
