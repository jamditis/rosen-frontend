# CDX JSON fixtures

These byte fixtures follow the Internet Archive Wayback CDX Server README.
The documented JSON example supplies the header, capture values, empty
separator, and one-field resumption-key trailer. Small invalid fixtures change
one documented invariant so parser failures have a stable source-based oracle.
`truncated-capture.json` and `truncated-resume-trailer.json` end inside JSON
strings and test syntax-level truncation. `truncated-trailer.json` is valid JSON
with an incomplete continuation structure.

Source: <https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md#resumption-key>
