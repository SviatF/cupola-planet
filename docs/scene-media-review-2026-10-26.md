# CUPOLA — visual/scientific review packet (26 October 2026)

This is an **unapproved** QA evidence handoff. Do not upload these media
to R2, register them in Atlas, or label them a real live whole-Earth photograph
until both independent reviews are complete.

## Source run

- [GitHub Actions #40392274388](https://github.com/SviatF/cupola-planet/actions/runs/40392274388)
- [Earth still artifact](https://github.com/SviatF/cupola-planet/actions/runs/40392274388/artifacts/12685731745)
- [Home 8-second WebM artifact](https://github.com/SviatF/cupola-planet/actions/runs/40392274388/artifacts/12685492383)
- [Review queue](../data/editorial/capture-review-candidates.json)

## Verified capture properties

The original files were downloaded and their JSON metadata inspected.
Both jobs succeeded, output valid 1600x900 WebP and 1200x630 OG images.
The Home job also emitted an eight-second 1600x900 WebM. Its frame
movement was verified across 0.5, 4 and 7 seconds (not a static-only encoding).

**Earth still** reports verified GPU Level-2 atlas
`20261026195023`, observational footprint 65.5799%, source observed at
2026-10-26 19:20 UTC, exact capture/deploy commit
`f12be90a69a04b6785149ae04f5442c900af70ad`.
Automated gate: **ELIGIBLE_FOR_HUMAN_REVIEW**, NOT PUBLISHED.

**Home video** records equally observed regional Cloud V3 but captures deployed
renderer `798694c6e974fcc056981627c7aaa0a3b0fe2ec7` while GitHub requested
`f12be90a69a04b6785149ae04f5442c900af70ad`.
Automated gate: **SCIENCE_BLOCKED**. Re-capture on matching production revision.

## Visual inspection (not approval)

The Earth still shows the actual limb, source-coloured blue atmosphere,
starfield, regional clouds and the white solar disc to the upper right.
A large part of the composition is dark Earth/space, consistent with the
sunrise-limb camera. Confirm at full size whether cloud seam artifacts
and composition are acceptable for the Atlas cover. This is a **render**,
with historical surface basemap and regional recent observation inputs.

## Human signoff required for the Earth candidate

- Verify actual full-resolution Earth visible and no star-only/blank frame
- Check cloud observation provenance, verified GPU atlas and source coverage
- Check source age, URL, regional footprint and physical solar geometry
- Check actual pixels for seams, stretch, wrong geography and visual noise
- Approve a precise ALT such as "CUPOLA simulated orbital sunrise showing
  Earth's atmosphere and regional satellite-observed clouds"
- Add a new signed entry to `data/editorial/scene-reviews.json` referencing
  the candidate's exact `renderedAt`, `heroSha256`, and `sceneRevision`,
  science and editorial reviewers, and completed visual checks through a
  separate reviewed PR

The workflow `CUPOLA Reviewed R2 Media Publish` must stay untriggered
until that record is committed and the CDP/cloud evidence verified.

## Release race prevention

CUPOLA 8.7 adds `wait-production-release.mjs` as a preflight to all scene
capture workflows. It refuses to record if the deployed `x-cupola-revision`
does not exactly match `GITHUB_SHA`; no revision is guessed. It also
quarantines original Playwright raw recordings instead of uploading
untrimmed duplicate videos in candidate ZIP archives.
