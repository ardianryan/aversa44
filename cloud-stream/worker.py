import base64
import json
import os
import re
import signal
import subprocess
import threading
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import psycopg2
import zmq
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

DATA = Path(os.environ.get('CLOUD_STREAM_DATA_DIR', '/data'))
MASTER = os.environ.get('CLOUD_STREAM_ENCRYPTION_KEY', '')
INGEST_USER = os.environ.get('CLOUD_STREAM_INGEST_USER', 'aversa')
INGEST_PASSWORD = os.environ.get('CLOUD_STREAM_INGEST_PASSWORD', '')
WIDTH, HEIGHT = (1280, 720) if os.environ.get('CLOUD_STREAM_RESOLUTION') == '720p' else (1920, 1080)
FPS = 30
stop = False
last_progress = 0.0
last_frame = 0


def decode_secret(value):
    parts = value.split('.')
    if len(parts) != 3:
        raise ValueError('encrypted key format invalid')
    def b64(part):
        return base64.urlsafe_b64decode(part + '=' * (-len(part) % 4))
    iv, tag, ciphertext = map(b64, parts)
    return AESGCM(bytes.fromhex(MASTER)).decrypt(iv, ciphertext + tag, b'aversa44-cloud-stream-v1').decode()


def terminate(proc):
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=4)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=4)


def database():
    return psycopg2.connect(host=os.environ['PGHOST'], port=os.environ.get('PGPORT', '5432'), user=os.environ['PGUSER'], password=os.environ['PGPASSWORD'], dbname=os.environ['PGDATABASE'], connect_timeout=5)


def report(conn, state, obs):
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO site_settings (key, value_json) VALUES ('cloud_stream_status', %s::jsonb)
          ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()""", (json.dumps({'state': state, 'obs': obs}),))
    conn.commit()


def configuration(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT value_json FROM site_settings WHERE key = 'cloud_stream_config'")
        row = cur.fetchone()
    conn.commit()
    return row[0] if row else {}


def path_ready(name):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:9997/v3/paths/get/{name}', timeout=1) as response:
            return bool(json.load(response).get('ready'))
    except (OSError, ValueError, urllib.error.URLError):
        return False


def obs_connected():
    return path_ready('incoming')


def progress_reader(pipe):
    global last_progress, last_frame
    try:
        for line in iter(pipe.readline, b''):
            if line.startswith(b'frame='):
                try:
                    frame = int(line.split(b'=', 1)[1].strip())
                except ValueError:
                    continue
                if frame > last_frame:
                    last_frame = frame
                    last_progress = time.monotonic()
    except (OSError, ValueError):
        pass


def start_fallback_feeder():
    args = ['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-re', '-stream_loop', '-1', '-i', '/app/fallback-loop.mp4',
            '-c', 'copy', '-f', 'rtsp', '-rtsp_transport', 'tcp', 'rtsp://127.0.0.1:8554/fallback']
    return subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def start_output(key, audio, obs):
    global last_progress, last_frame
    last_progress = 0.0
    last_frame = 0
    # The destination is passed directly, without a shell, and never written to logs.
    testing = os.environ.get('CLOUD_STREAM_TEST_MODE') == '1' and os.environ.get('NODE_ENV') != 'production'
    destination = 'rtmp://127.0.0.1:1935/output' if testing else 'rtmp://127.0.0.1:19444/live2/' + key
    v_bitrate = 4000 if WIDTH == 1280 else 4800
    gst = ['gst-launch-1.0', '-q', 'fallbacksrc', 'name=s', 'uri=rtsp://127.0.0.1:8554/incoming', 'fallback-uri=rtsp://127.0.0.1:8554/fallback',
           'immediate-fallback=true', 'restart-on-eos=true', 'retry-timeout=18446744073709551614', 'timeout=2000000000',
           's.video_0', '!', 'queue', 'max-size-buffers=0', 'max-size-bytes=0', 'max-size-time=2000000000', '!',
           'videoconvert', '!', 'videoscale', 'add-borders=false', '!', 'videorate', '!',
           f'video/x-raw,format=I420,width={WIDTH},height={HEIGHT},framerate={FPS}/1,pixel-aspect-ratio=1/1', '!',
           'x264enc', 'tune=zerolatency', 'speed-preset=ultrafast', f'bitrate={v_bitrate}', 'vbv-buf-capacity=1000', 'bframes=0', f'key-int-max={FPS * 2}', '!',
           'h264parse', 'config-interval=-1', '!', 'mux.',
           's.audio_0', '!', 'queue', 'max-size-buffers=0', 'max-size-bytes=0', 'max-size-time=3000000000', '!',
           'audioconvert', '!', 'audioresample', '!', 'audiorate', 'tolerance=40000000', '!',
           'audio/x-raw,format=F32LE,rate=48000,channels=2', '!', 'avenc_aac', 'bitrate=192000', '!', 'aacparse', '!', 'mux.',
           'mpegtsmux', 'name=mux', '!', 'fdsink', 'fd=1']
    producer = subprocess.Popen(gst, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    args = ['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:2', '-fflags', '+genpts', '-avoid_negative_ts', 'make_zero', '-i', 'pipe:0']
    if audio:
        args += ['-stream_loop', '-1', '-i', str(DATA / 'fallback.wav')]
        gain = '0' if obs else '1'
        control = r'azmq=bind_address=tcp\\\://127.0.0.1\\\:19999'
        graph = (
            '[0:a]aresample=async=1000:min_hard_comp=0.100000:first_pts=0,'
            'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[live];'
            f'[1:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume@bed=volume={gain},{control}[bed];'
            '[live][bed]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[a]'
        )
        args += ['-filter_complex', graph, '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-bsf:v', r'setts=ts=if(eq(PREV_OUTDTS\,NOPTS)\,TS\,max(TS\,PREV_OUTDTS+90))', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '160k']
    else:
        args += ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-bsf:v', r'setts=ts=if(eq(PREV_OUTDTS\,NOPTS)\,TS\,max(TS\,PREV_OUTDTS+90))', '-c:a', 'copy', '-bsf:a', 'aac_adtstoasc']
    args += ['-f', 'flv'] + ([] if testing else ['-rtmp_tcurl', 'rtmps://a.rtmps.youtube.com:443/live2']) + [destination]
    try:
        consumer = subprocess.Popen(args, stdin=producer.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except OSError:
        producer.stdout.close()
        terminate(producer)
        raise
    producer.stdout.close()
    threading.Thread(target=progress_reader, args=(consumer.stderr,), daemon=True).start()
    return producer, consumer



def fade_bed(from_gain, to_gain):
    context = zmq.Context.instance()
    sock = context.socket(zmq.REQ)
    sock.setsockopt(zmq.LINGER, 0)
    sock.setsockopt(zmq.SNDTIMEO, 200)
    sock.setsockopt(zmq.RCVTIMEO, 500)
    sock.connect('tcp://127.0.0.1:19999')
    try:
        for step in range(1, 7):
            gain = from_gain + (to_gain - from_gain) * step / 6
            sock.send_string(f'volume@bed volume {gain:.3f}')
            if not sock.recv_string().startswith('0 '):
                return False
            time.sleep(0.08)
        return True
    except zmq.ZMQError:
        return False
    finally:
        sock.close()


def main():
    if not re.fullmatch(r'[0-9a-fA-F]{64}', MASTER):
        raise ValueError('CLOUD_STREAM_ENCRYPTION_KEY must contain 64 hexadecimal characters')
    if INGEST_USER == 'any' or not re.fullmatch(r'[A-Za-z0-9_-]{3,64}', INGEST_USER) or not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', INGEST_PASSWORD):
        raise ValueError('Cloud ingest credentials are missing or invalid')
    DATA.mkdir(parents=True, exist_ok=True)
    fd, config_path = tempfile.mkstemp(prefix='aversa-mediamtx-', suffix='.json')
    os.close(fd)
    config_file = Path(config_path)
    config_file.write_text(json.dumps({'logLevel': 'warn', 'api': True, 'apiAddress': '127.0.0.1:9997', 'rtspAddress': '127.0.0.1:8554', 'rtmpAddress': ':1935', 'srtAddress': ':8890', 'hls': False, 'webrtc': False, 'authInternalUsers': [{'user': 'any', 'pass': '', 'ips': ['127.0.0.1', '::1'], 'permissions': [{'action': 'read'}, {'action': 'publish'}, {'action': 'api'}]}, {'user': INGEST_USER, 'pass': INGEST_PASSWORD, 'permissions': [{'action': 'publish', 'path': 'incoming'}]}], 'paths': {'all_others': {}}}))
    config_file.chmod(0o600)
    tls_file = None
    tunnel = None
    testing = os.environ.get('CLOUD_STREAM_TEST_MODE') == '1' and os.environ.get('NODE_ENV') != 'production'
    if not testing:
        tls_fd, tls_path = tempfile.mkstemp(prefix='aversa-tls-', suffix='.conf')
        os.close(tls_fd)
        tls_file = Path(tls_path)
        tls_file.write_text('foreground=yes\npid=\nclient=yes\n[YouTube]\naccept=127.0.0.1:19444\nconnect=a.rtmps.youtube.com:443\nsni=a.rtmps.youtube.com\nverifyChain=yes\ncheckHost=a.rtmps.youtube.com\nCAfile=/etc/ssl/certs/ca-certificates.crt\n')
        tls_file.chmod(0o600)
        tunnel = subprocess.Popen(['stunnel', str(tls_file)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    mtx = subprocess.Popen(['mediamtx', str(config_file)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    fallback_feeder = start_fallback_feeder()
    for _ in range(20):
        if path_ready('fallback'):
            break
        time.sleep(0.25)
    producer = consumer = None
    running_revision = None
    retry_at = 0.0
    output_started_at = 0.0
    bed_gain = 1.0
    conn = None
    try:
        while not stop:
            if mtx.poll() is not None or (tunnel and tunnel.poll() is not None):
                raise RuntimeError('Media ingest or secure transport process stopped')
            if fallback_feeder.poll() is not None:
                fallback_feeder = start_fallback_feeder()
            try:
                if conn is None or conn.closed:
                    conn = database()
                config = configuration(conn)
                desired = config.get('desired') is True
                revision = (config.get('youtube_key_encrypted'), config.get('audio_revision'))
                audio = bool(config.get('audio_filename')) and (DATA / 'fallback.wav').is_file()
                if not desired:
                    terminate(consumer); terminate(producer)
                    consumer = producer = None
                    running_revision = None
                    report(conn, 'siap', obs_connected())
                elif not revision[0]:
                    terminate(consumer); terminate(producer)
                    consumer = producer = None
                    report(conn, 'kunci belum dikonfigurasi', obs_connected())
                else:
                    obs = obs_connected()
                    output_alive = all(p and p.poll() is None for p in (producer, consumer))
                    output_stalled = output_alive and time.monotonic() - output_started_at > 30 and (not last_progress or time.monotonic() - last_progress > 20)
                    if not output_alive or output_stalled or running_revision != revision:
                        if producer is not None or consumer is not None:
                            print(f'[cloud-stream] restarting pipeline (alive={output_alive}, stalled={output_stalled}, prod_rc={producer.poll() if producer else None}, cons_rc={consumer.poll() if consumer else None})', flush=True)
                        terminate(consumer); terminate(producer)
                        consumer = producer = None
                        if time.monotonic() >= retry_at:
                            try:
                                key = decode_secret(revision[0])
                            except (InvalidTag, ValueError):
                                report(conn, 'kunci tidak dapat dibuka', obs_connected())
                                retry_at = time.monotonic() + 10
                                time.sleep(1)
                                continue
                            if not re.fullmatch(r'[A-Za-z0-9_-]{1,256}', key):
                                raise ValueError('Invalid stream key')
                            producer, consumer = start_output(key, audio, obs)
                            bed_gain = 0.0 if obs else 1.0
                            output_started_at = time.monotonic()
                            del key
                            running_revision = revision
                            retry_at = time.monotonic() + 10
                    progress = bool(consumer and consumer.poll() is None and last_progress and time.monotonic() - last_progress < 15)
                    target_gain = 0.0 if obs else 1.0
                    if audio and progress and bed_gain != target_gain and fade_bed(bed_gain, target_gain):
                        bed_gain = target_gain
                    report(conn, 'keluaran tersambung' if progress else 'menyambungkan', obs)
            except (OSError, ValueError, psycopg2.Error):
                if conn:
                    conn.close()
                conn = None
            time.sleep(1)
    finally:
        terminate(consumer); terminate(producer); terminate(fallback_feeder); terminate(mtx); terminate(tunnel)
        config_file.unlink(missing_ok=True)
        if tls_file:
            tls_file.unlink(missing_ok=True)
        if conn:
            conn.close()


def shutdown(_sig, _frame):
    global stop
    stop = True


signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)
if __name__ == '__main__':
    main()
