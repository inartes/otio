#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        truncate: false,
        fade: false
    };
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--truncate' || args[i] === '-t') {
            options.truncate = true;
        } else if (args[i] === '--fade' || args[i] === '-f') {
            options.fade = true;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log('Usage: render-timeline.js [options]');
            console.log('');
            console.log('Options:');
            console.log('  -t, --truncate    Truncate to shortest duration');
            console.log('  -f, --fade        Fade final frame to black over 2s with music');
            console.log('  -h, --help        Show this help');
            process.exit(0);
        }
    }
    
    return options;
}

function loadTimeline() {
    const timelineFile = 'timeline-metadata.json';
    
    if (!fs.existsSync(timelineFile)) {
        console.error('timeline-metadata.json not found. Run compile-metadata.js first.');
        process.exit(1);
    }
    
    try {
        const data = fs.readFileSync(timelineFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading timeline: ${error.message}`);
        process.exit(1);
    }
}

function createConcatFile(videoFiles, tempDir) {
    const concatFile = path.join(tempDir, 'concat.txt');
    const content = videoFiles.map(video => `file '${path.resolve(video.source_url)}'`).join('\n');
    fs.writeFileSync(concatFile, content);
    return concatFile;
}

function calculateShortestDuration(timeline) {
    const trackDurations = [];
    
    // For video: sum all videos (they get concatenated)
    const totalVideoDuration = calculateVideoDuration(timeline);
    if (totalVideoDuration) {
        trackDurations.push(totalVideoDuration);
    }
    
    // For audio: use longest audio duration (they get mixed)
    const totalAudioDuration = calculateAudioDuration(timeline);
    if (totalAudioDuration) {
        trackDurations.push(totalAudioDuration);
    }
    
    return trackDurations.length > 0 ? Math.min(...trackDurations) : null;
}

function calculateVideoDuration(timeline) {
    let videoTracks = [];
    
    if (Array.isArray(timeline.tracks)) {
        const videoTrack = timeline.tracks.find(t => t.kind === 'video');
        if (videoTrack && videoTrack.clips) {
            videoTracks = videoTrack.clips;
        }
    } else {
        videoTracks = timeline.tracks.video || [];
    }
    
    if (videoTracks.length === 0) {
        return null;
    }
    
    return videoTracks.reduce((total, video) => {
        const duration = video.source_range ? video.source_range.duration : video.duration;
        return total + duration;
    }, 0);
}

function calculateAudioDuration(timeline) {
    let audioClips = [];
    
    if (Array.isArray(timeline.tracks)) {
        const audioTracksArray = timeline.tracks.filter(t => t.kind === 'audio');
        audioTracksArray.forEach(track => {
            if (track.clips) {
                audioClips.push(...track.clips);
            }
        });
    } else {
        audioClips = timeline.tracks.audio || [];
    }
    
    if (audioClips.length === 0) {
        return null;
    }
    
    // Find the maximum end time among all audio clips
    return Math.max(...audioClips.map(audio => {
        const start = audio.record_range?.start || 0;
        const duration = audio.source_range ? audio.source_range.duration : audio.duration;
        return start + duration;
    }));
}

function buildFFmpegCommand(timeline, options = {}) {
    // Handle both old format (tracks.video/tracks.audio) and new format (tracks array)
    let videoTracks = [];
    let audioTracks = [];
    
    if (Array.isArray(timeline.tracks)) {
        // New format - tracks is an array with 'kind' field
        const videoTrack = timeline.tracks.find(t => t.kind === 'video');
        const audioTracksArray = timeline.tracks.filter(t => t.kind === 'audio');
        
        if (videoTrack && videoTrack.clips) {
            videoTracks = videoTrack.clips;
        }
        // Collect all audio clips from all audio tracks
        audioTracksArray.forEach(track => {
            if (track.clips) {
                audioTracks.push(...track.clips);
            }
        });
    } else {
        // Old format
        videoTracks = timeline.tracks.video || [];
        audioTracks = timeline.tracks.audio || [];
    }
    
    if (videoTracks.length === 0 && audioTracks.length === 0) {
        console.error('No video or audio tracks found in timeline');
        process.exit(1);
    }
    
    let command = 'ffmpeg -y';
    let inputs = [];
    let filters = [];
    let outputMaps = [];
    
    const tempDir = fs.mkdtempSync('/tmp/render-');
    
    let outputDuration = null;
    let fadeStartTime = null;
    
    if (options.truncate) {
        outputDuration = calculateShortestDuration(timeline);
        if (outputDuration) {
            console.log(`Truncating to shortest duration: ${outputDuration}s`);
        }
    } else if (options.fade) {
        const videoDuration = calculateVideoDuration(timeline);
        const audioDuration = calculateAudioDuration(timeline);
        
        if (videoDuration && audioDuration && videoDuration < audioDuration) {
            outputDuration = videoDuration + 2; // video + 2s fade
            fadeStartTime = videoDuration;
            console.log(`Fade mode: video ends at ${videoDuration}s, fade to black over 2s, total ${outputDuration}s`);
        } else {
            console.log('Fade mode: video is not shorter than audio, using normal render');
        }
    }
    
    if (videoTracks.length > 0) {
        if (videoTracks.length === 1) {
            command += ` -i "${videoTracks[0].source_url}"`;
            inputs.push('video');
            
            if (fadeStartTime !== null) {
                // Freeze last frame and fade to black
                const videoFilters = [
                    `[0:v]trim=0:${fadeStartTime}[v1]`,
                    `[0:v]trim=${fadeStartTime}:${fadeStartTime},loop=loop=-1:size=1:start=0,fade=t=out:st=0:d=2:color=black[v2]`,
                    `[v1][v2]concat=n=2:v=1[vout]`
                ];
                filters.push(videoFilters.join(';'));
                outputMaps.push('-map [vout]');
            } else {
                outputMaps.push('-map 0:v');
            }
        } else {
            // Add all video inputs individually for normalization
            videoTracks.forEach((video, index) => {
                command += ` -i "${video.source_url}"`;
            });
            inputs.push('video_multiple');
            
            // Normalize all videos to consistent format
            const videoInputs = videoTracks.map((_, i) => `[${i}:v]`);
            const normalizedStreams = videoTracks.map((video, i) => {
                let filterChain = `${videoInputs[i]}scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p[v${i}]`;
                return filterChain;
            }).join(';');
            
            // Simple concatenation first
            const concatStreams = videoTracks.map((_, i) => `[v${i}]`).join('');
            let concatFilter = `${concatStreams}concat=n=${videoTracks.length}:v=1:a=0`;
            
            // Apply fade transitions after concatenation if specified
            if (timeline.transitions?.fade_in || timeline.transitions?.fade_out) {
                let fadeFilters = [];
                let cumulativeDuration = 0;
                
                // Calculate where to apply fades based on cumulative duration
                videoTracks.forEach((video, i) => {
                    if (i === 0 && timeline.transitions?.fade_in) {
                        // Fade in should overlap the end of black and start of content
                        // Start the fade halfway through the transition period
                        const fadeIn = timeline.transitions.fade_in;
                        if (fadeIn.apply_to === 'first' && fadeIn.duration) {
                            // Start fade a bit before the second video starts
                            const fadeStart = video.duration - (fadeIn.duration / 2);
                            fadeFilters.push(`fade=t=in:st=${fadeStart}:d=${fadeIn.duration}`);
                        }
                    }
                    
                    if (i === videoTracks.length - 2 && timeline.transitions?.fade_out) {
                        // Fade out during the transition from second-to-last to last (black) video
                        const fadeOut = timeline.transitions.fade_out;
                        if (fadeOut.apply_to === 'last' && fadeOut.duration) {
                            // Calculate fade start position
                            const fadeStart = cumulativeDuration + video.duration - fadeOut.duration;
                            fadeFilters.push(`fade=t=out:st=${fadeStart}:d=${fadeOut.duration}`);
                        }
                    }
                    
                    cumulativeDuration += video.duration;
                });
                
                if (fadeFilters.length > 0) {
                    concatFilter += `[vconcat];[vconcat]${fadeFilters.join(',')}[vout]`;
                } else {
                    concatFilter += `[vout]`;
                }
            } else {
                concatFilter += `[vout]`;
            }
            
            if (fadeStartTime !== null) {
                // Apply normalization and fade
                filters.push(`${normalizedStreams};${concatFilter};[vout]fade=t=out:st=${calculateVideoDuration(timeline) - 2}:d=2:color=black[vfinal]`);
                outputMaps.push('-map [vfinal]');
            } else {
                filters.push(`${normalizedStreams};${concatFilter}`);
                outputMaps.push('-map [vout]');
            }
        }
    }
    
    if (audioTracks.length > 0) {
        // Add all audio inputs
        audioTracks.forEach((audio, index) => {
            command += ` -i "${audio.source_url}"`;
        });
        
        const startIndex = videoTracks.length;
        
        if (audioTracks.length === 1) {
            inputs.push('audio');
            const audioIndex = startIndex;
            
            // Check if we need to apply delay/trim
            const audio = audioTracks[0];
            let audioFilter = `[${audioIndex}:a]`;
            
            if (audio.record_range && audio.record_range.start > 0) {
                // Add delay for proper timing
                audioFilter += `adelay=${Math.round(audio.record_range.start * 1000)}|${Math.round(audio.record_range.start * 1000)}`;
            }
            
            if (audio.metadata && audio.metadata.volume && audio.metadata.volume !== 1) {
                audioFilter += (audioFilter.endsWith(']') ? '' : ',') + `volume=${audio.metadata.volume}`;
            }
            
            if (fadeStartTime !== null) {
                audioFilter += (audioFilter.endsWith(']') ? '' : ',') + `afade=t=out:st=${outputDuration - 2}:d=2`;
            }
            
            if (audioFilter !== `[${audioIndex}:a]`) {
                filters.push(`${audioFilter}[aout]`);
                outputMaps.push('-map [aout]');
            } else {
                outputMaps.push(`-map ${audioIndex}:a`);
            }
        } else {
            inputs.push('audio_multiple');
            
            // Process each audio with delays and volume
            const processedAudios = [];
            audioTracks.forEach((audio, i) => {
                const inputIndex = startIndex + i;
                let audioFilter = `[${inputIndex}:a]`;
                
                // Apply trim if needed
                if (audio.source_range) {
                    const start = audio.source_range.start || 0;
                    const duration = audio.source_range.duration;
                    audioFilter += `atrim=${start}:${start + duration},asetpts=PTS-STARTPTS`;
                }
                
                // Apply delay for timing
                if (audio.record_range && audio.record_range.start > 0) {
                    audioFilter += (audioFilter.endsWith(']') ? '' : ',') + `adelay=${Math.round(audio.record_range.start * 1000)}|${Math.round(audio.record_range.start * 1000)}`;
                }
                
                // Apply volume
                if (audio.metadata && audio.metadata.volume && audio.metadata.volume !== 1) {
                    audioFilter += (audioFilter.endsWith(']') ? '' : ',') + `volume=${audio.metadata.volume}`;
                }
                
                const outputLabel = `[a${i}]`;
                filters.push(`${audioFilter}${outputLabel}`);
                processedAudios.push(outputLabel);
            });
            
            // Mix all audio streams
            const mixFilter = `${processedAudios.join('')}amix=inputs=${audioTracks.length}:duration=longest`;
            
            if (fadeStartTime !== null) {
                filters.push(`${mixFilter},afade=t=out:st=${outputDuration - 2}:d=2[aout]`);
            } else {
                filters.push(`${mixFilter}[aout]`);
            }
            
            outputMaps.push('-map [aout]');
        }
    }
    
    if (filters.length > 0) {
        command += ` -filter_complex "${filters.join(';')}"`;
    }
    
    command += ` ${outputMaps.join(' ')}`;
    
    if (outputDuration) {
        command += ` -t ${outputDuration}`;
    }
    
    if (videoTracks.length > 0) {
        command += ' -c:v libx264 -preset medium -crf 23';
    }
    
    if (audioTracks.length > 0) {
        command += ' -c:a aac -b:a 128k';
    }
    
    const outputFile = 'output.mp4';
    command += ` "${outputFile}"`;
    
    return { command, outputFile, tempDir };
}

function executeRender(command, outputFile, tempDir) {
    console.log('FFmpeg command:');
    console.log(command);
    console.log('\nRendering...');
    
    try {
        const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
        console.log('\nRender completed successfully!');
        console.log(`Output file: ${outputFile}`);
        
        if (fs.existsSync(outputFile)) {
            const stats = fs.statSync(outputFile);
            console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        }
    } catch (error) {
        console.error('\nRender failed:');
        console.error(error.message);
        if (error.stderr) {
            console.error('FFmpeg stderr:', error.stderr);
        }
        process.exit(1);
    } finally {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

function main() {
    const options = parseArgs();
    
    console.log('Loading timeline metadata...');
    const timeline = loadTimeline();
    
    console.log(`Timeline: ${timeline.name} (v${timeline.version})`);
    if (options.truncate) {
        console.log('Mode: Truncate to shortest duration');
    } else if (options.fade) {
        console.log('Mode: Fade final frame to black with music fade');
    }
    
    // Handle both old and new timeline formats
    let videoCount = 0;
    let audioCount = 0;
    let videoClips = [];
    let audioClips = [];
    
    if (Array.isArray(timeline.tracks)) {
        // New format
        const videoTrack = timeline.tracks.find(t => t.kind === 'video');
        const audioTracksArray = timeline.tracks.filter(t => t.kind === 'audio');
        
        if (videoTrack && videoTrack.clips) {
            videoClips = videoTrack.clips;
            videoCount = videoClips.length;
        }
        // Collect all audio clips from all audio tracks
        audioTracksArray.forEach(track => {
            if (track.clips) {
                audioClips.push(...track.clips);
            }
        });
        audioCount = audioClips.length;
    } else {
        // Old format
        videoCount = timeline.tracks.video ? timeline.tracks.video.length : 0;
        audioCount = timeline.tracks.audio ? timeline.tracks.audio.length : 0;
        videoClips = timeline.tracks.video || [];
        audioClips = timeline.tracks.audio || [];
    }
    
    console.log(`Video clips: ${videoCount}`);
    console.log(`Audio clips: ${audioCount}`);
    
    videoClips.forEach((video, i) => {
        const duration = video.source_range ? video.source_range.duration : video.duration;
        const width = video.metadata ? video.metadata.width : video.width;
        const height = video.metadata ? video.metadata.height : video.height;
        console.log(`  Video ${i + 1}: ${video.name} (${duration}s, ${width}x${height})`);
    });
    
    audioClips.forEach((audio, i) => {
        const duration = audio.source_range ? audio.source_range.duration : audio.duration;
        const channels = audio.metadata ? audio.metadata.channels : audio.channels;
        console.log(`  Audio ${i + 1}: ${audio.name} (${duration}s, ${channels}ch)`);
    });
    
    const { command, outputFile, tempDir } = buildFFmpegCommand(timeline, options);
    executeRender(command, outputFile, tempDir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}