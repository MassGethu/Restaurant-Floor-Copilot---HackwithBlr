"""Media positions must survive slow consumption and freeze on pause."""
import time

import pytest

from app.sources import FrameSource
from conftest import write_video


def test_packet_timestamp_follows_file_not_consumer_wall_time(tmp_path):
    video = write_video(tmp_path / 'clock.avi', frames=60, fps=20)
    source = FrameSource(str(video), loop_files=False)
    try:
        first = source.read_packet(timeout=2)
        assert first[0] and first[2] < .15
        time.sleep(.3)
        latest = source.read_packet(timeout=1)
        assert latest[2] >= .25
        assert latest[3] == first[3] == 0
    finally:
        source.release()


def test_pause_freezes_media_position_and_resume_preserves_session(tmp_path):
    video = write_video(tmp_path / 'pause.avi', frames=60, fps=20)
    source = FrameSource(str(video), loop_files=False)
    try:
        assert source.read_packet(timeout=2)[0]
        source.pause(True)
        time.sleep(.1)  # allow the single in-flight frame to finish
        source.read_packet(timeout=.1)
        position = source._frame_time
        time.sleep(.15)
        assert source.read_packet(timeout=.05)[0] is False
        assert source._frame_time == position
        source.pause(False)
        resumed = source.read_packet(timeout=1)
        assert resumed[0] and resumed[2] == pytest.approx(position + .05, abs=.01)
        assert resumed[3] == 0
    finally:
        source.release()


def test_loop_exposes_new_epoch_instead_of_merging_sessions(tmp_path):
    video = write_video(tmp_path / 'loop.avi', frames=3, fps=20)
    source = FrameSource(str(video), loop_files=True)
    try:
        assert source.read_packet(timeout=2)[3] == 0
        time.sleep(.2)
        packet = source.read_packet(timeout=1)
        assert packet[3] >= 1
        assert packet[2] < .2
    finally:
        source.release()
