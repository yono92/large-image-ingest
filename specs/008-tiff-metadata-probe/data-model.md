# Data Model: TIFF And BigTIFF Metadata Probe

## TIFF Probe Result

- `container`: `tiff` or `bigtiff`
- `byteOrder`: `little-endian` or `big-endian`
- `directoryCount`: accepted IFD count
- `directories`: ordered normalized directory metadata

## TIFF Directory Metadata

- `index`: zero-based IFD index
- `width`, `height`: positive safe integers
- `bitsPerSample`: positive safe integer array
- `samplesPerPixel`: positive safe integer
- optional numeric TIFF codes: compression, photometric interpretation, orientation, planar configuration, sample format
- `layout`: `tiled` or `stripped`
- optional tile width/height or rows per strip

Unknown or unavailable optional tags are omitted rather than invented.

## TIFF Probe Policy

- `maxDirectories`: positive safe integer, default 256
- `signal`: optional cancellation signal

## TIFF Probe Error

Codes:

- `tiff.invalid_header`
- `tiff.malformed`
- `tiff.directory_limit`
- `tiff.unsafe_offset`
- `tiff.unsupported`
- `tiff.aborted`
- `tiff.directory_not_found`

Errors contain stable code and safe directory/offset context only. They never include source bytes or full parser objects.
