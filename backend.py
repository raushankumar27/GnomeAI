#!/usr/bin/env python3
import os
os.environ["VF_HF_ATTN_IMPL"] = "sdpa"

from gnomeai_backend.api.server import run_server

if __name__ == '__main__':
    run_server()
