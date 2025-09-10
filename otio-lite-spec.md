# OpenTimeline Lite (OTIO Lite) Specification

## Version: 0.0.3

## Overview

OpenTimeline Lite is a simplified JSON-based format for describing media timelines, designed for straightforward video and audio editing workflows. It provides a minimal yet complete representation of timeline structures without the complexity of full OpenTimelineIO.

## Core Concepts

### Timeline
The root container that holds all tracks and global metadata.

### Track
A container for clips of the same media type (video, audio, etc.).

### Clip
A reference to a portion of source media placed at a specific time on a track.

### Time Representation
All time values are in seconds (floating point).

## Schema Definition

### Root Object

```json
{
  "version": "string",        // Required: Format version (e.g., "0.0.3")
  "name": "string",           // Required: Timeline name
  "created": "ISO 8601",      // Optional: Creation timestamp
  "tracks": [Track],          // Required: Array of tracks
  "duration": "number",       // Optional: Total timeline duration in seconds
  "metadata": {}             // Optional: Global metadata
}
```

### Track Object

```json
{
  "name": "string",          // Required: Track name (e.g., "V1", "A1")
  "kind": "string",          // Required: "video" | "audio" | "subtitle"
  "clips": [Clip],           // Required: Array of clips
  "enabled": "boolean",      // Optional: Default true
  "metadata": {}            // Optional: Track-specific metadata
}
```

### Clip Object

```json
{
  "name": "string",          // Required: Clip name/identifier
  "source_url": "string",    // Required: Path/URL to source media
  "source_range": {          // Required: What part of source to use
    "start": "number",       // Required: Start time in source (seconds)
    "duration": "number"     // Required: Duration to use (seconds)
  },
  "record_range": {          // Required: Where to place on timeline
    "start": "number"        // Required: Start time on timeline (seconds)
  },
  "enabled": "boolean",      // Optional: Default true
  "metadata": {}            // Optional: Clip-specific metadata
}
```

## Metadata Specifications

### Video Clip Metadata

```json
{
  "width": "integer",        // Frame width in pixels
  "height": "integer",       // Frame height in pixels
  "frame_rate": "number",    // Frames per second
  "pixel_aspect_ratio": "number", // Optional: Default 1.0
  "field_order": "string"    // Optional: "progressive" | "interlaced_upper" | "interlaced_lower"
}
```

### Audio Clip Metadata

```json
{
  "sample_rate": "integer",  // Samples per second (e.g., 44100, 48000)
  "channels": "integer",     // Number of audio channels
  "role": "string",         // Optional: "main" | "music" | "effect" | "dialogue"
  "volume": "number",       // Optional: Volume multiplier (1.0 = 100%)
  "pan": "number"          // Optional: -1.0 (left) to 1.0 (right)
}
```

### Global Metadata

```json
{
  "render_settings": {
    "width": "integer",
    "height": "integer",
    "frame_rate": "number",
    "audio_sample_rate": "integer",
    "format": "string"      // Optional: Output format hint
  },
  "project": {              // Optional: Project information
    "studio": "string",
    "editor": "string",
    "notes": "string"
  }
}
```

## Rules and Constraints

### Timing Rules

1. **No Overlaps**: Clips on the same track must not overlap in time
2. **Positive Values**: All time values must be >= 0
3. **Source Bounds**: source_range must not exceed actual media duration
4. **Timeline Order**: Clips should be sorted by record_range.start

### Track Rules

1. **Unique Names**: Track names should be unique within a timeline
2. **Homogeneous Content**: All clips in a track must be of the same kind
3. **Track Naming Convention**: 
   - Video tracks: V1, V2, V3...
   - Audio tracks: A1, A2, A3...

### Validation Requirements

1. **Required Fields**: All required fields must be present
2. **Type Checking**: Values must match specified types
3. **URL Validation**: source_url must be a valid path or URL
4. **Time Consistency**: clip.record_range.start + clip.source_range.duration must not exceed timeline duration (if specified)

## Example: Simple Cut

```json
{
  "version": "0.0.3",
  "name": "Simple Edit",
  "tracks": [
    {
      "name": "V1",
      "kind": "video",
      "clips": [
        {
          "name": "shot1",
          "source_url": "media/clip1.mp4",
          "source_range": {
            "start": 5.0,
            "duration": 10.0
          },
          "record_range": {
            "start": 0.0
          }
        },
        {
          "name": "shot2",
          "source_url": "media/clip2.mp4",
          "source_range": {
            "start": 0.0,
            "duration": 8.5
          },
          "record_range": {
            "start": 10.0
          }
        }
      ]
    }
  ],
  "duration": 18.5
}
```

## Example: Multi-track with Audio

```json
{
  "version": "0.0.3",
  "name": "Multi-track Timeline",
  "created": "2025-01-01T12:00:00Z",
  "tracks": [
    {
      "name": "V1",
      "kind": "video",
      "clips": [
        {
          "name": "main_video",
          "source_url": "video.mp4",
          "source_range": {
            "start": 0,
            "duration": 30
          },
          "record_range": {
            "start": 0
          },
          "metadata": {
            "width": 1920,
            "height": 1080,
            "frame_rate": 30
          }
        }
      ]
    },
    {
      "name": "A1",
      "kind": "audio",
      "clips": [
        {
          "name": "dialogue",
          "source_url": "dialogue.wav",
          "source_range": {
            "start": 0,
            "duration": 30
          },
          "record_range": {
            "start": 0
          },
          "metadata": {
            "role": "dialogue",
            "sample_rate": 48000,
            "channels": 2
          }
        }
      ]
    },
    {
      "name": "A2",
      "kind": "audio",
      "clips": [
        {
          "name": "music",
          "source_url": "background_music.mp3",
          "source_range": {
            "start": 10,
            "duration": 25
          },
          "record_range": {
            "start": 5
          },
          "metadata": {
            "role": "music",
            "volume": 0.3,
            "sample_rate": 44100,
            "channels": 2
          }
        }
      ]
    }
  ],
  "duration": 30,
  "metadata": {
    "render_settings": {
      "width": 1920,
      "height": 1080,
      "frame_rate": 30,
      "audio_sample_rate": 48000
    }
  }
}
```

## Extensions and Future Considerations

### Planned Features
- **Transitions**: Dissolves, wipes, and other transitions between clips
- **Effects**: Filter and effect references
- **Nested Timelines**: Support for sequences within sequences
- **Markers**: Time-based annotations and markers
- **Speed Changes**: Variable speed/time remapping

### Compatibility Notes
- Designed to be convertible to/from full OpenTimelineIO
- Can be extended with custom metadata fields
- Supports common NLE export/import workflows

## Implementation Guidelines

### Parser Requirements
1. Must validate against schema
2. Should provide clear error messages for validation failures
3. Should handle missing optional fields gracefully
4. Should preserve unknown metadata fields (forward compatibility)

### Writer Requirements
1. Must produce valid JSON
2. Should maintain clip ordering by record_range.start
3. Should calculate timeline duration if not specified
4. Should validate time ranges before writing

## Version History

- **0.0.3** - Experimental specification with auto-compilation support
- **0.0.2** - Added metadata specifications
- **0.0.1** - Initial specification based on common editing patterns