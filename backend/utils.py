import io
import queue
import time
import sys
import logging

class LogBuffer(io.StringIO):
    def __init__(self):
        super().__init__()
        self.queue = queue.Queue(maxsize=1000)
        self._original_stdout = sys.stdout

    def write(self, s):
        if s.strip():
            if self._original_stdout:
                self._original_stdout.write(s)
            timestamp = time.strftime("%H:%M:%S")
            self.queue.put(f"[{timestamp}] {s.strip()}")
            if self.queue.full():
                try:
                    self.queue.get_nowait()
                except queue.Empty:
                    pass

    def get_logs(self):
        logs = []
        while not self.queue.empty():
            logs.append(self.queue.get())
        return logs

log_buffer = LogBuffer()

def setup_log_interceptor():
    sys.stdout = log_buffer
    sys.stderr = log_buffer
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[logging.StreamHandler(sys.stdout)]
    )
