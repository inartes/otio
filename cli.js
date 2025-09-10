#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { readFile, writeFile, access, readdir } from 'fs/promises';
import { constants } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { Timeline, loadTimeline, saveTimeline, validateTimeline, createTrack, createClip } from './index.js';

const execAsync = promisify(exec);

async function fileExists(filepath) {
  try {
    await access(filepath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function probeMedia(filepath) {
  try {
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filepath}"`;
    const { stdout } = await execAsync(command);
    const data = JSON.parse(stdout);
    
    const videoStream = data.streams?.find(s => s.codec_type === 'video');
    const audioStream = data.streams?.find(s => s.codec_type === 'audio');
    const duration = parseFloat(data.format?.duration || 0);
    
    return {
      duration,
      video: videoStream ? {
        width: videoStream.width,
        height: videoStream.height,
        frame_rate: eval(videoStream.r_frame_rate) || 30
      } : null,
      audio: audioStream ? {
        sample_rate: parseInt(audioStream.sample_rate),
        channels: audioStream.channels
      } : null
    };
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Could not probe ${filepath}: ${error.message}`));
    return null;
  }
}

async function createTimelineFromInputs(inputs, options) {
  const timeline = new Timeline({
    name: options.name || 'Compiled Media Timeline',
    version: '0.0.3',
    created: new Date().toISOString()
  });
  
  const videoTrack = createTrack('V1', 'video', []);
  const audioTrack = createTrack('A1', 'audio', []);
  
  let hasVideo = false;
  let hasAudio = false;
  let currentTime = 0;
  
  console.log(chalk.blue('🔍 Probing input files...'));
  
  for (const input of inputs) {
    const mediaInfo = await probeMedia(input);
    if (!mediaInfo) {
      console.warn(chalk.yellow(`⚠️  Skipping ${input} - could not probe`));
      continue;
    }
    
    console.log(chalk.gray(`  ${input}: ${mediaInfo.duration.toFixed(2)}s`));
    
    if (mediaInfo.video) {
      hasVideo = true;
      const clip = createClip({
        name: path.basename(input),
        source_url: input,
        sourceStart: 0,
        sourceDuration: mediaInfo.duration,
        recordStart: currentTime,
        metadata: {
          width: mediaInfo.video.width,
          height: mediaInfo.video.height,
          frame_rate: mediaInfo.video.frame_rate
        }
      });
      videoTrack.clips.push(clip);
    }
    
    if (mediaInfo.audio) {
      hasAudio = true;
      const clip = createClip({
        name: path.basename(input),
        source_url: input,
        sourceStart: 0,
        sourceDuration: mediaInfo.duration,
        recordStart: currentTime,
        metadata: {
          sample_rate: mediaInfo.audio.sample_rate,
          channels: mediaInfo.audio.channels
        }
      });
      audioTrack.clips.push(clip);
    }
    
    currentTime += mediaInfo.duration;
  }
  
  if (hasVideo) timeline.addTrack(videoTrack);
  if (hasAudio) timeline.addTrack(audioTrack);
  
  timeline.duration = currentTime;
  
  if (hasVideo && videoTrack.clips.length > 0) {
    const firstClip = videoTrack.clips[0];
    timeline.metadata = {
      render_settings: {
        width: firstClip.metadata.width,
        height: firstClip.metadata.height,
        frame_rate: firstClip.metadata.frame_rate,
        audio_sample_rate: hasAudio && audioTrack.clips.length > 0 
          ? audioTrack.clips[0].metadata.sample_rate 
          : 48000
      }
    };
  }
  
  return timeline;
}

async function compileCommand(inputs, options) {
  try {
    console.log(chalk.blue('📦 Compiling timeline...'));
    
    let timeline;
    
    // Check if input is a pattern like input1.mp4, input2.mp4, etc.
    if (options.auto) {
      const pattern = inputs;
      const dir = path.dirname(pattern) || '.';
      const basename = path.basename(pattern);
      
      // Extract pattern (e.g., "input" from "input1.mp4")
      const match = basename.match(/^([a-zA-Z]+)(\d+)(\..+)$/);
      if (match) {
        const [, prefix, startNum, ext] = match;
        const files = [];
        let num = parseInt(startNum);
        
        console.log(chalk.gray(`  Looking for files matching pattern: ${prefix}N${ext}`));
        
        while (true) {
          const filename = `${prefix}${num}${ext}`;
          const filepath = path.join(dir, filename);
          if (await fileExists(filepath)) {
            files.push(filepath);
            console.log(chalk.gray(`    Found: ${filename}`));
            num++;
          } else {
            break;
          }
        }
        
        if (files.length === 0) {
          console.error(chalk.red('❌ No files found matching pattern'));
          process.exit(1);
        }
        
        timeline = await createTimelineFromInputs(files, options);
      } else {
        console.error(chalk.red('❌ Invalid pattern. Use format like: input1.mp4'));
        process.exit(1);
      }
    } else if (Array.isArray(inputs)) {
      // Multiple input files provided
      timeline = await createTimelineFromInputs(inputs, options);
    } else if (typeof inputs === 'string') {
      // Single input - check if it's a JSON timeline or media file
      if (inputs.endsWith('.json')) {
        timeline = await loadTimeline(inputs);
        console.log(chalk.gray(`  Loaded: ${timeline.name}`));
        
        const validation = validateTimeline(timeline);
        if (!validation.valid) {
          console.error(chalk.red('❌ Timeline validation failed:'));
          if (validation.errors) {
            validation.errors.forEach(err => {
              console.error(chalk.red(`  - ${err.message || JSON.stringify(err)}`));
            });
          }
          process.exit(1);
        }
        
        const compiled = timeline.compile([inputs]);
        timeline = compiled;
      } else {
        // Single media file
        timeline = await createTimelineFromInputs([inputs], options);
      }
    }
    
    timeline.sortClips();
    timeline.calculateDuration();
    
    const outputFile = options.output || 'timeline.json';
    await saveTimeline(timeline, outputFile);
    
    console.log(chalk.green('✅ Timeline compiled successfully'));
    console.log(chalk.gray(`  Output: ${outputFile}`));
    console.log(chalk.gray(`  Duration: ${timeline.duration.toFixed(2)}s`));
    console.log(chalk.gray(`  Tracks: ${timeline.tracks.length}`));
    
    let totalClips = 0;
    for (const track of timeline.tracks) {
      const clipCount = track.clips?.length || 0;
      totalClips += clipCount;
      console.log(chalk.gray(`    - ${track.name} (${track.kind}): ${clipCount} clips`));
    }
    console.log(chalk.gray(`  Total clips: ${totalClips}`));
    
    if (options.validate) {
      console.log(chalk.blue('\n🔍 Validating media files...'));
      const missingFiles = [];
      
      for (const track of timeline.tracks) {
        for (const clip of track.clips || []) {
          if (!await fileExists(clip.source_url)) {
            missingFiles.push(clip.source_url);
          }
        }
      }
      
      if (missingFiles.length > 0) {
        console.warn(chalk.yellow('⚠️  Missing media files:'));
        missingFiles.forEach(file => {
          console.warn(chalk.yellow(`    - ${file}`));
        });
      } else {
        console.log(chalk.green('✅ All media files found'));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Compilation failed:'), error.message);
    process.exit(1);
  }
}

async function renderCommand(input, options) {
  try {
    console.log(chalk.blue('🎬 Rendering timeline...'));
    
    const timeline = await loadTimeline(input);
    console.log(chalk.gray(`  Loaded: ${timeline.name}`));
    
    const validation = validateTimeline(timeline);
    if (!validation.valid) {
      console.error(chalk.red('❌ Timeline validation failed:'));
      if (validation.errors) {
        validation.errors.forEach(err => {
          console.error(chalk.red(`  - ${err.message || JSON.stringify(err)}`));
        });
      }
      process.exit(1);
    }
    
    const outputFile = options.output || 'output.mp4';
    
    if (options.dryRun) {
      console.log(chalk.yellow('\n🔧 Dry run mode - FFmpeg command:'));
      const command = timeline.getFFmpegCommand(outputFile);
      console.log(chalk.gray(command));
      return;
    }
    
    console.log(chalk.gray(`  Output: ${outputFile}`));
    console.log(chalk.gray(`  Format: ${path.extname(outputFile).slice(1)}`));
    
    if (options.ffmpeg) {
      console.log(chalk.blue('\n🎥 Rendering with FFmpeg...'));
      
      const command = timeline.getFFmpegCommand(outputFile);
      
      if (options.verbose) {
        console.log(chalk.gray('FFmpeg command:'));
        console.log(chalk.gray(command));
      }
      
      try {
        const { stdout, stderr } = await execAsync(command);
        if (options.verbose && stderr) {
          console.log(chalk.gray(stderr));
        }
        console.log(chalk.green('✅ Render complete!'));
        console.log(chalk.gray(`  Output saved to: ${outputFile}`));
      } catch (error) {
        console.error(chalk.red('❌ FFmpeg render failed:'));
        console.error(chalk.red(error.message));
        if (error.stderr) {
          console.error(chalk.gray(error.stderr));
        }
        process.exit(1);
      }
    } else {
      console.log(chalk.blue('\n📝 Generating render instructions...'));
      
      const renderData = {
        timeline: timeline.toJSON(),
        output: outputFile,
        renderSettings: timeline.metadata?.render_settings || {
          width: 1920,
          height: 1080,
          frame_rate: 30,
          audio_sample_rate: 48000
        }
      };
      
      const renderFile = outputFile.replace(/\.[^.]+$/, '.render.json');
      await writeFile(renderFile, JSON.stringify(renderData, null, 2));
      
      console.log(chalk.green('✅ Render instructions generated'));
      console.log(chalk.gray(`  Instructions saved to: ${renderFile}`));
      console.log(chalk.gray('\n  To render with FFmpeg, use: otio render --ffmpeg'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Render failed:'), error.message);
    process.exit(1);
  }
}

async function validateCommand(input, options) {
  try {
    console.log(chalk.blue('🔍 Validating timeline...'));
    
    const timeline = await loadTimeline(input);
    console.log(chalk.gray(`  File: ${input}`));
    console.log(chalk.gray(`  Name: ${timeline.name}`));
    console.log(chalk.gray(`  Version: ${timeline.version}`));
    
    const validation = validateTimeline(timeline);
    
    if (validation.valid) {
      console.log(chalk.green('✅ Timeline is valid'));
      
      if (options.verbose) {
        console.log(chalk.gray('\n📊 Timeline statistics:'));
        console.log(chalk.gray(`  Duration: ${timeline.duration?.toFixed(2) || 'Not specified'}s`));
        console.log(chalk.gray(`  Tracks: ${timeline.tracks.length}`));
        
        for (const track of timeline.tracks) {
          const clipCount = track.clips?.length || 0;
          console.log(chalk.gray(`    - ${track.name} (${track.kind}): ${clipCount} clips`));
        }
      }
    } else {
      console.error(chalk.red('❌ Timeline validation failed:'));
      if (validation.errors) {
        validation.errors.forEach(err => {
          console.error(chalk.red(`  - ${err.message || JSON.stringify(err)}`));
        });
      }
      process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Validation failed:'), error.message);
    process.exit(1);
  }
}

async function infoCommand(input) {
  try {
    const timeline = await loadTimeline(input);
    
    console.log(chalk.blue('📋 Timeline Information'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white('Name:'), timeline.name);
    console.log(chalk.white('Version:'), timeline.version);
    console.log(chalk.white('Created:'), timeline.created || 'Not specified');
    console.log(chalk.white('Duration:'), timeline.duration ? `${timeline.duration.toFixed(2)}s` : 'Not specified');
    
    console.log(chalk.blue('\n📼 Tracks:'));
    for (const track of timeline.tracks) {
      console.log(chalk.white(`  ${track.name}`) + chalk.gray(` (${track.kind})`));
      
      if (track.clips && track.clips.length > 0) {
        for (const clip of track.clips) {
          const start = clip.record_range.start.toFixed(2);
          const end = (clip.record_range.start + clip.source_range.duration).toFixed(2);
          console.log(chalk.gray(`    - ${clip.name}: ${start}s - ${end}s`));
          console.log(chalk.gray(`      Source: ${clip.source_url}`));
        }
      } else {
        console.log(chalk.gray('    (no clips)'));
      }
    }
    
    if (timeline.metadata && Object.keys(timeline.metadata).length > 0) {
      console.log(chalk.blue('\n⚙️  Metadata:'));
      console.log(chalk.gray(JSON.stringify(timeline.metadata, null, 2)));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to read timeline:'), error.message);
    process.exit(1);
  }
}

program
  .name('otio')
  .description('OpenTimeline Lite CLI - Simple timeline editing tools')
  .version('0.0.3');

program
  .command('compile [inputs...]')
  .description('Compile timeline from JSON or media files (auto-probes and concatenates)')
  .option('-o, --output <file>', 'Output file path', 'timeline.json')
  .option('-a, --auto', 'Auto-detect numbered sequence (e.g., input1.mp4, input2.mp4...)')
  .option('-n, --name <name>', 'Timeline name')
  .option('-v, --validate', 'Validate that media files exist')
  .action(compileCommand);

program
  .command('render <input>')
  .description('Render a timeline to video')
  .option('-o, --output <file>', 'Output file path', 'output.mp4')
  .option('-f, --ffmpeg', 'Use FFmpeg to render (requires FFmpeg installed)')
  .option('-d, --dry-run', 'Show FFmpeg command without executing')
  .option('-v, --verbose', 'Show detailed output')
  .action(renderCommand);

program
  .command('validate <input>')
  .description('Validate a timeline file')
  .option('-v, --verbose', 'Show detailed statistics')
  .action(validateCommand);

program
  .command('info <input>')
  .description('Display timeline information')
  .action(infoCommand);

program.parse();