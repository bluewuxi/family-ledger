# Investment groups: authenticated local acceptance — 2026-11-06

## Scope and environment

The uncommitted implementation was served locally at `http://127.0.0.1:5181`, using real application sessions against the configured TEST dependencies. The user logged in, confirmed page readiness, and switched from administrator to an existing viewer. Authentication bypass remained disabled. This is local-client acceptance, not acceptance of a deployed application release.

Both themes were inspected at actual CSS viewport sizes `320x740`, `393x852`, `430x932`, `768x1024`, and `1440x1000`. The viewport override was reset afterward. Screenshots and DOM layout measurements remain in the ignored execution-evidence directory; financial values are not copied into this record.

## Results

| Surface | Light | Dark | Observations |
| --- | --- | --- | --- |
| Administrator dashboard | All five sizes | All five sizes | Securities/groups tabs work; management appears only in groups; explanation and right-aligned action share the footer row; no document horizontal overflow. |
| Administrator group drawer | All five sizes | All five sizes | Name input and member selection readable; cash excluded; internal scrolling and visible footer; keyboard focus containment and clean-close focus restoration observed. Local drafts were discarded without submission. |
| Viewer dashboard | All five sizes | All five sizes | Both distribution tabs available; management shortcut absent; no document horizontal overflow. |
| Viewer direct management URL | All five sizes | All five sizes | Only the read-only securities tab and viewer explanation appear; no group maintenance controls. Wide securities tables retain their internal scrolling boundary. |

The first viewer instrument-page resize loop sampled stale dimensions during two transitions. Those samples were not counted as distinct sizes: settled `768x1024` and `1440x1000` light observations were repeated, and dark observations used separate settled checks at every size.

The administrator manually verified dirty-drawer cancellation: after entering a temporary name, cancelling departure retained the name. The user explicitly confirmed this before switching to viewer. This result is user-confirmed; the automation could not reliably expose the native confirmation dialog.

## Correction found during acceptance

The drawer name input initially used unthemed native styling and measured approximately 27–30px high. The editor now reuses the maintained instrument-form controls with scoped one-column, fieldset and checkbox styles. Rendered input height was 44–46px across the five sizes; footer actions were 44px, with no document overflow. No submission, authorization or transport behavior changed. The editor was added explicitly to the reviewed client-verification fingerprints.

The user also reported a displaced native theme-select popup during viewport emulation. Its position returned to normal after the viewport override was reset, as confirmed by the user. No theme-selector code change was made. The user independently saved the administrator night-mode preference; the agent did not save preferences. Viewer dark acceptance used the user's temporary page-only theme change; subsequent full navigation restored the saved light theme.

## Coverage limits and validation

No group was created, saved, moved or deleted in shared TEST. Empty configuration, ungrouped securities and the combined cash row were observed. Existing-group edit/delete, transfers, stale-write conflicts, named-group long/zero/null rendering and failed-save recovery were verified with isolated fixtures, not claimed as live write acceptance. The group drawer was exercised with an unsaved draft, not an existing saved group.

After the styling correction, lint, typecheck, build and reviewed group-client, account-access-client and interface-workflow checks passed in the preceding execution turn. Earlier implementation evidence includes the 18-check core/group run, disposable group database tests and full backup restore. See the [execution plan](../plans/2026-11-06-investment-groups.md#execution-evidence--2026-11-06). Documentation consistency and diff checks were rerun for this acceptance record.

## Delivery status

Read-only authenticated acceptance is complete for the matrix above; shared write scenarios remain deliberately unperformed. The [separately authorized TEST schema application](2026-11-06-investment-groups-test-schema.md) resolved the missing-table/RPC blocker. Migration registration still awaits a clean committed migration. No issue, commit, push or application deployment occurred. Do not populate operational groups before compatible format-16 backup coverage is delivered or separately verified operator backup coverage exists.
