import { readFile, writeFile } from 'fs/promises';
import Ajv from 'ajv';

const ajv = new Ajv();

const OTIO_SCHEMA = {
  type: 'object',
  required: ['version', 'name', 'tracks'],
  properties: {
    version: { type: 'string' },
    name: { type: 'string' },
    created: { type: 'string' },
    tracks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'kind', 'clips'],
        properties: {
          name: { type: 'string' },
          kind: { enum: ['video', 'audio', 'subtitle'] },
          clips: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'source_url', 'source_range', 'record_range'],
              properties: {
                name: { type: 'string' },
                source_url: { type: 'string' },
                source_range: {
                  type: 'object',
                  required: ['start', 'duration'],
                  properties: {
                    start: { type: 'number', minimum: 0 },
                    duration: { type: 'number', minimum: 0 }
                  }
                },
                record_range: {
                  type: 'object',
                  required: ['start'],
                  properties: {
                    start: { type: 'number', minimum: 0 }
                  }
                },
                enabled: { type: 'boolean' },
                metadata: { type: 'object' }
              }
            }
          },
          enabled: { type: 'boolean' },
          metadata: { type: 'object' }
        }
      }
    },
    duration: { type: 'number', minimum: 0 },
    metadata: { type: 'object' }
  }
};

export class Timeline {
  constructor(data = {}) {
    this.version = data.version || '1.0.0';
    this.name = data.name || 'Untitled Timeline';
    this.created = data.created || new Date().toISOString();
    this.tracks = data.tracks || [];
    this.duration = data.duration;
    this.metadata = data.metadata || {};
  }

  static async fromFile(filepath) {
    const content = await readFile(filepath, 'utf-8');
    const data = JSON.parse(content);
    return new Timeline(data);
  }

  async toFile(filepath) {
    const content = JSON.stringify(this.toJSON(), null, 2);
    await writeFile(filepath, content, 'utf-8');
  }

  toJSON() {
    const json = {
      version: this.version,
      name: this.name,
      created: this.created,
      tracks: this.tracks
    };
    if (this.duration !== undefined) {
      json.duration = this.duration;
    }
    if (Object.keys(this.metadata).length > 0) {
      json.metadata = this.metadata;
    }
    return json;
  }

  validate() {
    const validate = ajv.compile(OTIO_SCHEMA);
    const valid = validate(this.toJSON());
    if (!valid) {
      return { valid: false, errors: validate.errors };
    }

    const errors = [];
    
    for (const track of this.tracks) {
      const clips = track.clips || [];
      for (let i = 0; i < clips.length - 1; i++) {
        const clip1 = clips[i];
        const clip2 = clips[i + 1];
        const end1 = clip1.record_range.start + clip1.source_range.duration;
        const start2 = clip2.record_range.start;
        
        if (end1 > start2) {
          errors.push({
            message: `Clips overlap on track ${track.name}: ${clip1.name} and ${clip2.name}`,
            track: track.name,
            clips: [clip1.name, clip2.name]
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : null
    };
  }

  calculateDuration() {
    let maxDuration = 0;
    
    for (const track of this.tracks) {
      for (const clip of track.clips || []) {
        const clipEnd = clip.record_range.start + clip.source_range.duration;
        maxDuration = Math.max(maxDuration, clipEnd);
      }
    }
    
    this.duration = maxDuration;
    return maxDuration;
  }

  sortClips() {
    for (const track of this.tracks) {
      if (track.clips) {
        track.clips.sort((a, b) => a.record_range.start - b.record_range.start);
      }
    }
  }

  getTrackByName(name) {
    return this.tracks.find(track => track.name === name);
  }

  getTracksByKind(kind) {
    return this.tracks.filter(track => track.kind === kind);
  }

  addTrack(track) {
    this.tracks.push(track);
    return this;
  }

  addClip(trackName, clip) {
    const track = this.getTrackByName(trackName);
    if (!track) {
      throw new Error(`Track ${trackName} not found`);
    }
    if (!track.clips) {
      track.clips = [];
    }
    track.clips.push(clip);
    this.sortClips();
    return this;
  }

  compile(sources) {
    const compiled = new Timeline({
      version: this.version,
      name: `Compiled: ${this.name}`,
      created: new Date().toISOString(),
      metadata: {
        ...this.metadata,
        compiled: true,
        sources: sources || []
      }
    });

    for (const track of this.tracks) {
      const compiledTrack = {
        ...track,
        clips: []
      };

      for (const clip of track.clips || []) {
        if (clip.enabled !== false) {
          compiledTrack.clips.push({
            ...clip,
            compiled: true
          });
        }
      }

      if (compiledTrack.clips.length > 0) {
        compiled.addTrack(compiledTrack);
      }
    }

    compiled.sortClips();
    compiled.calculateDuration();
    
    return compiled;
  }

  getFFmpegCommand(outputFile = 'output.mp4') {
    const filterGraphs = [];
    const inputs = [];
    const maps = [];
    
    const allClips = [];
    for (const track of this.tracks) {
      for (const clip of track.clips || []) {
        allClips.push({ ...clip, track });
      }
    }
    
    const uniqueInputs = [...new Set(allClips.map(c => c.source_url))];
    const inputMap = {};
    uniqueInputs.forEach((url, idx) => {
      inputMap[url] = idx;
      inputs.push(`-i "${url}"`);
    });

    const videoTracks = this.getTracksByKind('video');
    const audioTracks = this.getTracksByKind('audio');

    for (let i = 0; i < videoTracks.length; i++) {
      const track = videoTracks[i];
      const trackFilters = [];
      
      for (const clip of track.clips || []) {
        const inputIdx = inputMap[clip.source_url];
        const trim = `[${inputIdx}:v]trim=start=${clip.source_range.start}:duration=${clip.source_range.duration},setpts=PTS-STARTPTS[v${i}_${clip.name}]`;
        trackFilters.push(trim);
      }
      
      filterGraphs.push(...trackFilters);
    }

    for (let i = 0; i < audioTracks.length; i++) {
      const track = audioTracks[i];
      const trackFilters = [];
      
      for (const clip of track.clips || []) {
        const inputIdx = inputMap[clip.source_url];
        const volume = clip.metadata?.volume || 1.0;
        const trim = `[${inputIdx}:a]atrim=start=${clip.source_range.start}:duration=${clip.source_range.duration},asetpts=PTS-STARTPTS,volume=${volume}[a${i}_${clip.name}]`;
        trackFilters.push(trim);
      }
      
      filterGraphs.push(...trackFilters);
    }

    const filter = filterGraphs.length > 0 ? `-filter_complex "${filterGraphs.join('; ')}"` : '';
    
    return `ffmpeg ${inputs.join(' ')} ${filter} ${maps.join(' ')} -c:v libx264 -c:a aac "${outputFile}"`;
  }
}

export function createTimeline(options = {}) {
  return new Timeline(options);
}

export function createTrack(name, kind, clips = []) {
  return {
    name,
    kind,
    clips
  };
}

export function createClip(options) {
  const {
    name,
    source_url,
    sourceStart = 0,
    sourceDuration,
    recordStart,
    metadata = {}
  } = options;

  return {
    name,
    source_url,
    source_range: {
      start: sourceStart,
      duration: sourceDuration
    },
    record_range: {
      start: recordStart
    },
    metadata
  };
}

export async function loadTimeline(filepath) {
  return Timeline.fromFile(filepath);
}

export async function saveTimeline(timeline, filepath) {
  return timeline.toFile(filepath);
}

export function validateTimeline(timeline) {
  return timeline.validate();
}

export default {
  Timeline,
  createTimeline,
  createTrack,
  createClip,
  loadTimeline,
  saveTimeline,
  validateTimeline
};