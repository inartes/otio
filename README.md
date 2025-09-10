# OpenTimeline Lite (OTIO Lite)

<p align="center">
  <strong>A lightweight, developer-friendly timeline format for modern video workflows</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#api">API</a> •
  <a href="#spec">Specification</a>
</p>

---

## Why OTIO Lite?

OpenTimeline Lite bridges the gap between complex professional editing formats and simple concatenation scripts. It provides a clean, JSON-based timeline format that's both human-readable and powerful enough for real production workflows.

**Perfect for:**
- 🎬 Automating video compilation workflows
- 🔄 Converting between editing formats
- 📹 Building custom video pipelines
- 🎯 Programmatic video editing
- ⚡ Quick prototyping of edit sequences

## Features

### ✨ Core Capabilities
- **Smart Auto-Compilation** - Automatically probe and sequence numbered media files
- **Multi-Track Support** - Separate video, audio, and subtitle tracks
- **FFmpeg Integration** - Generate optimized FFmpeg commands automatically
- **Validation** - Comprehensive timeline validation with overlap detection
- **Extensible Format** - JSON-based, easy to generate and parse

### 🚀 Developer Experience
- **Zero Configuration** - Works out of the box with sensible defaults
- **CLI First** - Powerful command-line interface for automation
- **JavaScript API** - Full programmatic access for custom workflows
- **Modern ES Modules** - Clean, maintainable codebase

## Quick Start

### The Simplest Workflow

```bash
# Automatically compile numbered sequences (input1.mp4, input2.mp4, ...)
otio compile input1.mp4 --auto

# Render with FFmpeg
otio render timeline.json --ffmpeg -o final.mp4
```

That's it! Two commands to go from clips to compiled video.

## Installation

### Prerequisites
- Node.js 18+ 
- FFmpeg & FFprobe (for media operations)

### Install

```bash
# Clone the repository
git clone https://github.com/inartes/otio.git
cd otio

# Install dependencies
npm install

# Make 'otio' command available globally
npm link
```

### Verify Installation

```bash
otio --version
```

## Usage

### Command Line Interface

#### `compile` - Create Timelines

The compile command is your entry point for creating timelines from media files.

```bash
# AUTO MODE: Detect numbered sequences
otio compile input1.mp4 --auto
# Finds: input1.mp4, input2.mp4, input3.mp4... and creates timeline

# EXPLICIT MODE: Specify exact files
otio compile intro.mp4 main.mp4 outro.mp4 -o project.json

# FROM JSON: Process existing timeline
otio compile raw-timeline.json -o compiled.json

# WITH VALIDATION: Ensure media files exist
otio compile media/*.mp4 --validate
```

**Options:**
- `-o, --output <file>` - Output timeline file (default: `timeline.json`)
- `-a, --auto` - Auto-detect numbered sequences
- `-n, --name <name>` - Set timeline name
- `-v, --validate` - Validate media file existence

#### `render` - Generate Video

Transform timelines into rendered video files.

```bash
# RENDER: Using FFmpeg
otio render timeline.json --ffmpeg -o output.mp4

# DRY RUN: Preview FFmpeg command
otio render timeline.json --dry-run

# CUSTOM FORMAT: Specify output format
otio render timeline.json --ffmpeg -o final.webm
```

**Options:**
- `-o, --output <file>` - Output video file
- `-f, --ffmpeg` - Execute FFmpeg render
- `-d, --dry-run` - Preview command without executing
- `-v, --verbose` - Show detailed output

#### `validate` - Check Timeline Integrity

```bash
# Basic validation
otio validate timeline.json

# With statistics
otio validate timeline.json --verbose
```

#### `info` - Inspect Timeline

```bash
otio info timeline.json
```

### JavaScript API

```javascript
import { Timeline, createClip, createTrack } from 'otio-lite';

// Create a timeline programmatically
const timeline = new Timeline({
  name: 'My Project',
  version: '1.0.0'
});

// Add a video track with clips
const videoTrack = createTrack('V1', 'video', [
  createClip({
    name: 'intro',
    source_url: 'intro.mp4',
    sourceStart: 0,
    sourceDuration: 5,
    recordStart: 0
  }),
  createClip({
    name: 'main',
    source_url: 'main.mp4',
    sourceStart: 10,
    sourceDuration: 20,
    recordStart: 5
  })
]);

timeline.addTrack(videoTrack);

// Calculate duration and validate
timeline.calculateDuration();
const validation = timeline.validate();

if (validation.valid) {
  await timeline.toFile('output.json');
}

// Generate FFmpeg command
const ffmpegCmd = timeline.getFFmpegCommand('output.mp4');
```

## Real-World Examples

### Example 1: Daily Compilation Workflow

```bash
#!/bin/bash
# Compile today's renders into a review video

DATE=$(date +%Y%m%d)
otio compile render_${DATE}_001.mp4 --auto -o daily_${DATE}.json
otio render daily_${DATE}.json --ffmpeg -o review_${DATE}.mp4
```

### Example 2: Multi-Track Project

```json
{
  "version": "1.0.0",
  "name": "Corporate Video",
  "tracks": [
    {
      "name": "V1",
      "kind": "video",
      "clips": [
        {
          "name": "logo",
          "source_url": "assets/logo.mp4",
          "source_range": { "start": 0, "duration": 3 },
          "record_range": { "start": 0 }
        }
      ]
    },
    {
      "name": "A1",
      "kind": "audio",
      "clips": [
        {
          "name": "voiceover",
          "source_url": "audio/narration.wav",
          "source_range": { "start": 0, "duration": 30 },
          "record_range": { "start": 0 },
          "metadata": { "role": "dialogue", "volume": 1.0 }
        }
      ]
    },
    {
      "name": "A2",
      "kind": "audio",
      "clips": [
        {
          "name": "music",
          "source_url": "audio/background.mp3",
          "source_range": { "start": 0, "duration": 30 },
          "record_range": { "start": 0 },
          "metadata": { "role": "music", "volume": 0.3 }
        }
      ]
    }
  ]
}
```

### Example 3: Batch Processing

```javascript
// Process multiple projects
import { loadTimeline, saveTimeline } from 'otio-lite';
import { glob } from 'glob';

const projects = await glob('projects/*.json');

for (const project of projects) {
  const timeline = await loadTimeline(project);
  timeline.compile();
  timeline.calculateDuration();
  
  const outputName = project.replace('.json', '.compiled.json');
  await saveTimeline(timeline, outputName);
  
  console.log(`✓ Processed ${timeline.name} - ${timeline.duration}s`);
}
```

## Timeline Format Specification

OTIO Lite uses a minimal JSON schema optimized for clarity and ease of use.

### Core Structure

```json
{
  "version": "1.0.0",
  "name": "Timeline Name",
  "created": "2025-01-10T12:00:00Z",
  "tracks": [...],
  "duration": 120.5,
  "metadata": {...}
}
```

### Key Concepts

- **Time Values**: All in seconds (floating point)
- **Tracks**: Containers for clips of the same type
- **Clips**: References to media with timing information
- **Metadata**: Extensible properties for custom workflows

[Full Specification →](./otio-lite-spec.md)

## Advanced Features

### Custom Metadata

Extend timelines with your own metadata:

```json
{
  "metadata": {
    "project_id": "PROJ-001",
    "client": "ACME Corp",
    "render_farm": "farm-01",
    "custom_data": {...}
  }
}
```

### Validation Rules

- No overlapping clips on the same track
- All time values must be positive
- Source ranges must not exceed media duration
- Tracks must contain clips of matching type

### FFmpeg Command Generation

The tool generates optimized FFmpeg commands with:
- Proper trim filters for accurate cutting
- Multi-track audio mixing
- Metadata preservation
- Hardware acceleration support (when available)

## Contributing

We welcome contributions! Areas of interest:

- [ ] Transition support (cuts, dissolves, wipes)
- [ ] Effect definitions
- [ ] Additional export formats
- [ ] GUI timeline viewer
- [ ] WebAssembly version
- [ ] Python bindings

## Comparison with Alternatives

| Feature | OTIO Lite | Full OpenTimelineIO | EDL | FCPXML |
|---------|-----------|-------------------|-----|--------|
| Human Readable | ✅ JSON | ✅ JSON | ⚠️ Text | ❌ XML |
| Learning Curve | Easy | Moderate | Hard | Hard |
| Multi-track | ✅ | ✅ | Limited | ✅ |
| Effects | Planned | ✅ | ❌ | ✅ |
| File Size | Small | Large | Tiny | Large |
| Ecosystem | Growing | Mature | Legacy | Apple |

## FAQ

**Q: How does this relate to OpenTimelineIO?**  
A: OTIO Lite is inspired by OpenTimelineIO but focuses on simplicity. It's perfect when you need basic timeline functionality without the full complexity.

**Q: Can I convert to/from other formats?**  
A: Export to FFmpeg is built-in. Import/export for EDL, FCPXML, and full OTIO is on the roadmap.

**Q: Does it support effects and transitions?**  
A: Not yet, but it's planned. Currently focuses on cuts-only editing.

**Q: Can I use this in production?**  
A: Yes! The core functionality is stable and used in production pipelines.

## License

MIT © OpenTimeline Lite Contributors

## Acknowledgments

- Inspired by [OpenTimelineIO](https://github.com/PixarAnimationStudios/OpenTimelineIO)
- Built with Node.js and FFmpeg
- Special thanks to the video engineering community

---

<p align="center">
  <strong>Built with ❤️ for video engineers and creative developers</strong>
</p>

<p align="center">
  <a href="https://github.com/inartes/otio/issues">Report Bug</a> •
  <a href="https://github.com/inartes/otio/issues">Request Feature</a> •
  <a href="./otio-lite-spec.md">Read Spec</a>
</p>