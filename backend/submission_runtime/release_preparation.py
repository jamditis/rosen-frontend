"""Use the same generated release contract as scheduled stewardship."""

import json
import os
import subprocess
import tempfile
from pathlib import PurePosixPath

from .config import PROJECT_ROOT


def prepare_release():
    """Refresh graph, vectors and cache versions on the hosted runner."""
    with tempfile.TemporaryDirectory(prefix="rosen-release-") as directory:
        report = os.path.join(directory, "paths.json")
        env = {**os.environ, "RUNNER_TEMP": directory}
        subprocess.run(
            [
                "node",
                str(PROJECT_ROOT / ".github/scripts/bluesky-stewardship-publisher.mjs"),
                "prepare-record-release",
                report,
            ],
            cwd=str(PROJECT_ROOT),
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
        with open(report, encoding="utf-8") as source:
            paths = json.load(source)["paths"]
        if not isinstance(paths, list) or not paths:
            raise ValueError("Release preparation returned no paths")
        for value in paths:
            if (
                not isinstance(value, str)
                or not value
                or "\\" in value
                or PurePosixPath(value).is_absolute()
                or ".." in PurePosixPath(value).parts
            ):
                raise ValueError("Release preparation returned an unsafe path")
        return paths
