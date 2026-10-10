#!/usr/bin/env python3
"""Optional EUMDAC-scoped product-entry inventory; never download bulk imagery.

Credentials are read ONLY from the GitHub Actions secret environment.
No credential/token values are printed, embedded in artifacts or added to Git.
Metadata-only access is not asserted to prove the contents of cloud pixels.
"""
import argparse
import itertools
import json
import os
from pathlib import Path


def inventory(path, output):
    report = {
        "client": "official-eumdac", "credentials_configured": False,
        "authenticated_product_metadata_verified": 0,
        "downloaded_bytes": 0,
        "ready_for_cinema": False,
        "sources": [],
    }
    credentials = (os.environ.get("EUMETSAT_CONSUMER_KEY", ""),
                   os.environ.get("EUMETSAT_CONSUMER_SECRET", ""))
    report["credentials_configured"] = all(credentials)
    previous = json.loads(path.read_text(encoding="utf-8"))
    if not report["credentials_configured"]:
        report["status"] = "skipped_no_github_secrets"
    else:
        import eumdac  # Not installed at all unless credentials are provided.
        # Only the official EUMETSAT client manages the access token.
        try:
            store = eumdac.DataStore(eumdac.AccessToken(credentials))
        except Exception as exc:
            report["status"] = "failed_to_authenticate"
            report["error_type"] = type(exc).__name__
            store = None
        if store is not None:
            for source in previous["collections"]:
                result = {"key": source["key"],
                          "collection_id": source["collection_id"],
                          "authenticated_metadata": False,
                          "science_file_payload_verified": False}
                recent = source.get("latest_observation")
                if not source.get("recent_granule_found") or not recent:
                    result["status"] = "no_recent_product"
                else:
                    try:
                        product = store.get_product(
                            source["collection_id"], recent["product_id"]
                        )
                        # Reading package entry names is metadata-only.
                        entries = list(itertools.islice(product.entries, 128))
                        names = [str(x)[:240] for x in entries]
                        scientific = [name for name in names if
                                      name.lower().endswith((".nc", ".nc4",
                                                             ".grb", ".grb2",
                                                             ".grib", ".grib2"))]
                        result["entry_count_sampled"] = len(names)
                        result["scientific_entries"] = scientific[:20]
                        result["authenticated_metadata"] = True
                        result["status"] = "authorized_metadata_only"
                        report["authenticated_product_metadata_verified"] += 1
                    except Exception as exc:
                        result["status"] = "entry_inventory_failed"
                        # Deliberately do not stringify auth exceptions: headers
                        # and URLs may include credentials or bearer tokens.
                        result["error_type"] = type(exc).__name__
                report["sources"].append(result)
            report["status"] = "metadata_inventory_completed"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--freshness", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    inventory(args.freshness, args.output)
