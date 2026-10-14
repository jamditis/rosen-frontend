# Source-discovery health watcher

The watcher reads only the public source-discovery health endpoint. It reports
one JSON object and stores local alert state. A healthy check exits `0`, a
degraded response exits `1`, an outage exits `2`, and a watcher or notification
error exits `3`.

Run a check without notifications:

```sh
python3 backend/scripts/check_archive_health.py --state /tmp/rosen-health-state.json
```

Add `--notify` to send one outage message after two consecutive failures and
one recovery message. Notifications use the installed `jawn-ops telegram
notify` command. A failed send remains pending and is retried by the next
check.

The user unit templates are in `automation/systemd/`. They use the stable
checkout at `/home/jamditis/projects/rosen-frontend`. If the active checkout
differs, change the absolute path in the service before root installs it. After
installation, the operator can enable and inspect the timer with:

```sh
systemctl --user enable --now rosen-source-discovery-health.timer
systemctl --user list-timers rosen-source-discovery-health.timer
journalctl --user -u rosen-source-discovery-health.service
```
