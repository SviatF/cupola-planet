#!/usr/bin/env python3
"""CUPOLA publisher freshness guard. Checks source expiry, not merely cron syntax.

This is infrastructure-only: it never edits satellite images or web shaders.
An assigned GitHub Issue stays open while a publisher is unhealthy.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ISSUE_TITLE = "[CUPOLA] Cloud data freshness alert"
SOURCES = (
    # (label, release tag, rolling pointer, max pointer age in hours, schema)
    ("Level-2", "cupola-scientific-v3", "latest.json", 3,
     "cupola-scientific-cloud-v3/v1"),
    ("NOAA IR", "cupola-gmgsi-visual-preview", "latest.json", 3,
     "cupola-gmgsi-ir-visual/v1"),
    ("GFS model", "cupola-scientific-v3", "gfs-latest.json", 9,
     "cupola-global-gfs-model-v1"),
)


def utc(iso: str) -> datetime:
    value = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("Timestamp has no UTC offset")
    return value.astimezone(timezone.utc)


def gh(*args: str) -> str:
    proc = subprocess.run(("gh", *args), text=True, capture_output=True,
                          check=False, timeout=90)
    if proc.returncode:
        raise RuntimeError("GitHub CLI failed: " + " ".join(args[:3]) +
                           " / " + (proc.stderr.strip() or str(proc.returncode))[:300])
    return proc.stdout


def validate(label: str, manifest: dict, release: dict,
             pointer: str, max_hours: int, schema: str,
             now: datetime) -> list[str]:
    errors: list[str] = []
    if manifest.get("schema") != schema:
        errors.append("wrong scientific product schema")
    version = str(manifest.get("version", ""))
    if not re.fullmatch(r"\d{14}", version):
        errors.append("invalid version")
    assets = {a["name"]: a for a in release.get("assets", [])}
    pointer_asset = assets.get(pointer)
    if not pointer_asset:
        errors.append("missing rolling manifest asset " + pointer)
    else:
        try:
            age = now - utc(pointer_asset["updated_at"])
            if age > timedelta(hours=max_hours):
                errors.append(f"latest published pointer is {age.total_seconds()/3600:.1f}h old")
            if age < timedelta(minutes=-15):
                errors.append("pointer updated in the future")
        except (ValueError, KeyError, TypeError) as exc:
            errors.append(f"invalid release asset timestamp: {exc}")
    try:
        expiry = utc(manifest["expires_at"])
        if expiry <= now:
            errors.append(f"source observation/model EXPIRED at {expiry.isoformat()}")
        if expiry > now + timedelta(hours=24):
            errors.append("implausibly far future source expiry")
        generated = utc(manifest["generated_at"])
        if generated > now + timedelta(minutes=15):
            errors.append("manifest generated in the future")
    except (ValueError, KeyError, TypeError) as exc:
        errors.append(f"missing/invalid observation expiry: {exc}")
    required = [manifest.get("atlas_file", "")]
    if label == "NOAA IR":
        required.append(manifest.get("grey_detail_file", ""))
        if manifest.get("grey_detail_visual_only") is not True:
            errors.append("NOAA grey detail is not marked visual-only")
    if label == "Level-2":
        if float(manifest.get("observed_coverage_fraction", 0)) < 0.05:
            errors.append("Level-2 real observation coverage < 5%")
    if label == "GFS model" and manifest.get("is_satellite_observation") is not False:
        errors.append("GFS is not labelled as a forecast model")
    required.append(("gfs-manifest-" if label == "GFS model" else "manifest-") + version + ".json")
    for name in required:
        asset = assets.get(name)
        if not name or not asset:
            errors.append("missing immutable release asset: " + (name or "(blank)"))
        elif name.endswith(".png") and asset.get("size", 0) < 10000:
            errors.append("suspiciously small PNG: " + name)
    return errors


def check_sources(repo: str, now: datetime) -> list[tuple[str, list[str]]]:
    results = []
    releases: dict[str, dict] = {}
    for label, tag, pointer, hours, schema in SOURCES:
        try:
            if tag not in releases:
                releases[tag] = json.loads(gh("api", f"repos/{repo}/releases/tags/{tag}"))
            with tempfile.TemporaryDirectory(prefix="cupola-health-") as temp:
                gh("release", "download", tag, "--repo", repo,
                   "--pattern", pointer, "--dir", temp, "--clobber")
                manifest = json.loads((Path(temp) / pointer).read_text(encoding="utf-8"))
            problems = validate(label, manifest, releases[tag], pointer, hours, schema, now)
        except (RuntimeError, OSError, ValueError, KeyError, TypeError) as exc:
            problems = [f"could not verify source: {exc}"]
        results.append((label, problems))
    return results


def issue_sync(repo: str, results: list[tuple[str, list[str]]], now: datetime) -> bool:
    unhealthy = any(errors for _, errors in results)
    lines = [
        "## CUPOLA V3 publisher health",
        f"Checked: {now.isoformat()}",
        "",
        "This monitor validates published manifest expiry, release age and immutable assets. "
        "A healthy GitHub build alone is not evidence of fresh cloud observations.",
        "",
    ]
    for label, errors in results:
        lines.append(f"### {label} — {'STALE / FAILED' if errors else 'OK'}")
        lines.extend("- " + error for error in errors)
        if not errors:
            lines.append("- Fresh pointer, unexpired source, complete versioned assets")
        lines.append("")
    lines.append("The first-paint static texture is only a placeholder and is never labelled live.")
    body = "\n".join(lines)
    opened = json.loads(gh("issue", "list", "--repo", repo, "--state", "open",
                           "--limit", "100", "--json", "number,title"))
    existing = next((i for i in opened if i["title"] == ISSUE_TITLE), None)
    if unhealthy:
        if existing:
            gh("issue", "edit", str(existing["number"]), "--repo", repo, "--body", body)
        else:
            owner = repo.split("/", 1)[0]
            gh("issue", "create", "--repo", repo, "--title", ISSUE_TITLE,
               "--body", body, "--assignee", owner)
    elif existing:
        gh("issue", "close", str(existing["number"]), "--repo", repo,
           "--comment", "All three independently verified cloud publishers are fresh again.")
    return unhealthy


def self_test() -> None:
    now = datetime(2026, 10, 13, 18, tzinfo=timezone.utc)
    v = "20261013175000"
    model = {
        "schema": "cupola-global-gfs-model-v1", "version": v,
        "generated_at": now.isoformat(), "expires_at": (now + timedelta(hours=2)).isoformat(),
        "atlas_file": "gfs-cloud-cover-" + v + ".png", "is_satellite_observation": False,
    }
    release = {"assets": [
        {"name": "gfs-latest.json", "updated_at": now.isoformat(), "size": 900},
        {"name": "gfs-manifest-" + v + ".json", "updated_at": now.isoformat(), "size": 900},
        {"name": model["atlas_file"], "updated_at": now.isoformat(), "size": 100000},
    ]}
    assert not validate("GFS model", model, release, "gfs-latest.json", 9,
                        "cupola-global-gfs-model-v1", now)
    assert validate("GFS model", model, release, "gfs-latest.json", 9,
                    "cupola-global-gfs-model-v1", now + timedelta(hours=10))
    assert any("EXPIRED" in p for p in validate(
        "GFS model", model, release, "gfs-latest.json", 9,
        "cupola-global-gfs-model-v1", now + timedelta(hours=3)))
    print("PASS: publisher freshness and expiry regression")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    repo = os.environ["GITHUB_REPOSITORY"]
    now = datetime.now(timezone.utc)
    results = check_sources(repo, now)
    for name, problems in results:
        print(f"{name}: {'; '.join(problems) if problems else 'OK'}")
    unhealthy = issue_sync(repo, results, now)
    return 1 if unhealthy else 0


if __name__ == "__main__":
    raise SystemExit(main())
