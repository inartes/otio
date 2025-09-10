# OTIO Lite Version Changelog

## Version 0.0.3 (Current)
**Released:** 2025-01-10  
**Status:** Experimental

### New Features
- **Subtitle track support** - Added `subtitle` as a valid track kind
- **Enabled/disabled states** - Tracks and clips can now be enabled/disabled
- **Extended metadata**:
  - `pixel_aspect_ratio` for video clips
  - `field_order` for interlaced video support
  - `pan` for audio positioning (-1.0 to 1.0)
  - `opacity` for video overlay layers
  - `format` hint in render settings
- **Project metadata** - Added `project` object for studio/editor/notes
- **Compilation tracking** - `compiled` flag and `sources` array

### Schema Changes
```json
// New in v0.0.3
{
  "tracks": [{
    "kind": "video|audio|subtitle",  // subtitle added
    "enabled": true                  // new field
  }],
  "clips": [{
    "enabled": true,                 // new field
    "compiled": true,                // new field
    "metadata": {
      "pixel_aspect_ratio": 1.0,    // new field
      "field_order": "progressive",  // new field
      "pan": 0,                      // new field
      "opacity": 0.8                 // new field
    }
  }]
}
```

---

## Version 0.0.2
**Released:** 2025-09-09  
**Status:** Experimental

### Features
- Basic timeline structure with tracks and clips
- Video and audio track support
- Source and record ranges for clips
- Basic metadata for video (width, height, frame_rate)
- Basic metadata for audio (sample_rate, channels, role, volume)
- Render settings in global metadata

### Schema Structure
```json
{
  "version": "0.0.2",
  "name": "Timeline Name",
  "created": "ISO 8601 timestamp",
  "tracks": [
    {
      "name": "V1",
      "kind": "video|audio",
      "clips": [
        {
          "name": "clip name",
          "source_url": "path/to/media",
          "source_range": {
            "start": 0,
            "duration": 10
          },
          "record_range": {
            "start": 0
          },
          "metadata": {}
        }
      ]
    }
  ],
  "duration": 30,
  "metadata": {
    "render_settings": {}
  }
}
```

---

## Migration Guide

### Upgrading from 0.0.2 to 0.0.3

1. **Version field**: Change `"version": "0.0.2"` to `"version": "0.0.3"`

2. **Optional additions** (backwards compatible):
   - Add `enabled` fields to tracks/clips if needed
   - Add subtitle tracks with `"kind": "subtitle"`
   - Extend metadata with new fields

3. **Validation**: v0.0.3 parsers should handle v0.0.2 files by:
   - Defaulting `enabled` to `true` when missing
   - Treating missing metadata fields as undefined

### Example Upgrade Script

```javascript
function upgradeV002ToV003(timeline) {
  // Update version
  timeline.version = "0.0.3";
  
  // Add default enabled states
  for (const track of timeline.tracks) {
    if (track.enabled === undefined) {
      track.enabled = true;
    }
    for (const clip of track.clips || []) {
      if (clip.enabled === undefined) {
        clip.enabled = true;
      }
    }
  }
  
  return timeline;
}
```

---

## Version Compatibility Matrix

| Reader Version | Can Read | Notes |
|---------------|----------|-------|
| v0.0.3 | v0.0.2, v0.0.3 | Full backwards compatibility |
| v0.0.2 | v0.0.2 only | Cannot parse subtitle tracks or new fields |

---

## Future Versions (Planned)

### Version 0.1.0 (Planned)
- Transitions between clips
- Basic effects definitions
- Nested timelines
- Markers and annotations

### Version 1.0.0 (Future)
- Stable API
- Full effect chain support
- Color grading metadata
- Advanced compositing