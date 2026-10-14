# CDX JSON fixtures

These byte fixtures follow the Internet Archive Wayback CDX Server README.
The documented JSON example supplies the header, capture values, empty
separator, and one-field resumption-key trailer. Small invalid fixtures change
one documented invariant so parser failures have a stable source-based oracle.
`truncated-capture.json` and `truncated-resume-trailer.json` end inside JSON
strings and test syntax-level truncation. `truncated-trailer.json` is valid JSON
with an incomplete continuation structure.

`zero-upstream.json` is the zero-result shape derived from the upstream Java
writer: `begin()` opens the outer array, the header is written only with the
first result in `writeLine()`, and `end()` closes the array. `zero.json` retains
the earlier header-only empty shape as a compatibility fixture; it is not the
current upstream writer's zero-result output.

Source: <https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md#resumption-key>
Writer source: <https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/src/main/java/org/archive/cdxserver/writer/JsonWriter.java>
